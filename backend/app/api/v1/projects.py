import logging
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.project import APIEndpoint, Project, ProjectStatus
from app.schemas.project import ProjectCreate, ProjectResponse, ScrapeStatusResponse
from app.services.scraper import scrape_docs
from app.services.llm_parser import parse_documentation

import io
from fastapi.responses import StreamingResponse
from app.services.codegen import generate_sdk

from fastapi.responses import JSONResponse, StreamingResponse, Response

from app.core.log_store import append_log

from app.services.llm_parser import parse_documentation, suggest_integration_paths

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/projects", tags=["projects"])


async def run_scrape_and_parse_job(project_id: UUID, url: str, use_case: str = ""):
    from app.core.database import AsyncSessionLocal
    from app.core.log_store import append_log

    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(select(Project).where(Project.id == project_id))
            project = result.scalar_one()

            append_log(str(project_id), "🔍 Starting documentation scrape...")
            project.status = ProjectStatus.SCRAPING
            await db.commit()

            scrape_results = await scrape_docs(url, max_pages=5)
            append_log(str(project_id), f"✅ Scraped {len(scrape_results)} page(s) successfully")

            combined_markdown = "\n\n---\n\n".join(
                [f"# Source: {r.url}\n\n{r.markdown}" for r in scrape_results]
            )
            project.raw_content = combined_markdown[:50000]
            await db.commit()

            append_log(str(project_id), "🧠 Analyzing documentation with AI...")
            project.status = ProjectStatus.PARSING
            await db.commit()

            # Pass use_case to parser
            api_schema = await parse_documentation(
                combined_markdown, base_url=url, use_case=use_case
            )
            append_log(str(project_id), f"📋 Discovered {len(api_schema.endpoints)} endpoint(s)")

            # Generate integration suggestions
            append_log(str(project_id), "💡 Generating integration path suggestions...")
            suggestions = await suggest_integration_paths(api_schema, use_case)
            project.integration_suggestions = suggestions
            await db.commit()

            append_log(str(project_id), "💾 Saving results to database...")
            project.api_name = api_schema.api_name
            project.api_description = api_schema.description
            project.auth_scheme = api_schema.auth.model_dump()
            project.use_case = use_case

            for ep in api_schema.endpoints:
                endpoint = APIEndpoint(
                    project_id=project.id,
                    path=ep.path,
                    method=ep.method.upper(),
                    summary=ep.summary,
                    description=ep.description,
                    parameters=[p.model_dump() for p in ep.parameters],
                    request_body=ep.request_body,
                    response_schema=ep.response_schema,
                    tags=ep.tags,
                )
                db.add(endpoint)

            project.status = ProjectStatus.COMPLETED
            await db.commit()
            append_log(str(project_id), "🎉 Done! SDK ready for download.")
            append_log(str(project_id), "DONE")

        except Exception as e:
            logger.error(f"Pipeline failed for {project_id}: {e}", exc_info=True)
            append_log(str(project_id), f"❌ Error: {str(e)}")
            append_log(str(project_id), "FAILED")
            result = await db.execute(select(Project).where(Project.id == project_id))
            project = result.scalar_one_or_none()
            if project:
                project.status = ProjectStatus.FAILED
                await db.commit()


@router.post("/", response_model=ProjectResponse, status_code=201)
async def create_project(
    payload: ProjectCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    from urllib.parse import urlparse
    parsed = urlparse(str(payload.url))
    api_base_url = f"{parsed.scheme}://{parsed.netloc}"
    
    project = Project(
        name=payload.name,
        base_url=api_base_url,
        use_case=payload.use_case
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    background_tasks.add_task(
        run_scrape_and_parse_job, project.id, str(payload.url), payload.use_case
    )
    return project


@router.get("/{project_id}", response_model=ScrapeStatusResponse)
async def get_project(project_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Project).where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("/{project_id}/endpoints")
async def get_endpoints(project_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Project).where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    ep_result = await db.execute(
        select(APIEndpoint).where(APIEndpoint.project_id == project_id)
    )
    endpoints = ep_result.scalars().all()
    
    return {
        "project_id": project_id,
        "api_name": project.api_name,
        "auth": project.auth_scheme,
        "endpoint_count": len(endpoints),
        "endpoints": [
            {
                "id": str(ep.id),
                "method": ep.method,
                "path": ep.path,
                "summary": ep.summary,
                "parameters": ep.parameters,
                "tags": ep.tags,
            }
            for ep in endpoints
        ],
    }

import json
from fastapi.responses import StreamingResponse
import io
from app.services.codegen import generate_sdk


@router.post("/{project_id}/generate")
async def generate_code(
    project_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
):
    language = payload.get("language", "python")
    if language not in ["python", "typescript"]:
        raise HTTPException(status_code=400, detail="Language must be 'python' or 'typescript'")

    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.status != ProjectStatus.COMPLETED:
        raise HTTPException(status_code=400, detail=f"Project is not ready (status: {project.status})")

    ep_result = await db.execute(
        select(APIEndpoint).where(APIEndpoint.project_id == project_id)
    )
    endpoints = ep_result.scalars().all()

    schema = {
        "api_name": project.api_name or "MyAPI",
        "version": "1.0.0",
        "base_url": project.base_url,
        "auth_scheme": project.auth_scheme,
        "endpoints": [
            {
                "method": ep.method,
                "path": ep.path,
                "summary": ep.summary or "",
                "description": ep.description or "",
                "parameters": ep.parameters or [],
                "request_body": ep.request_body or {},
                "response_schema": ep.response_schema or {},
                "tags": ep.tags or [],
            }
            for ep in endpoints
        ],
    }

    zip_bytes = generate_sdk(schema, language)
    filename = f"{project.api_name or 'sdk'}_{language}_sdk.zip".replace(" ", "_").lower()

    return StreamingResponse(
        io.BytesIO(zip_bytes),
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )

@router.get("/", response_model=list[ProjectResponse])
async def list_projects(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Project).order_by(Project.created_at.desc()).limit(20)
    )
    return result.scalars().all()

from fastapi.responses import JSONResponse
import yaml

@router.get("/{project_id}/export")
async def export_openapi(
    project_id: str,
    format: str = "json",
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    ep_result = await db.execute(
        select(APIEndpoint).where(APIEndpoint.project_id == project_id)
    )
    endpoints = ep_result.scalars().all()

    # Build OpenAPI 3.0 spec
    paths = {}
    for ep in endpoints:
        parameters = []
        for p in (ep.parameters or []):
            parameters.append({
                "name": p["name"],
                "in": p["location"],
                "required": p.get("required", False),
                "description": p.get("description", ""),
                "schema": {"type": p.get("type", "string")}
            })
        
        paths[ep.path] = {
            ep.method.lower(): {
                "summary": ep.summary or "",
                "description": ep.description or "",
                "parameters": parameters,
                "tags": ep.tags or [],
                "responses": {"200": {"description": "Successful response"}}
            }
        }

    spec = {
        "openapi": "3.0.0",
        "info": {
            "title": project.api_name or project.name,
            "version": "1.0.0",
            "description": project.api_description or ""
        },
        "paths": paths
    }

    if format == "yaml":
        import yaml
        content = yaml.dump(spec, default_flow_style=False, sort_keys=False)
        return Response(
            content=content,
            media_type="application/yaml",
            headers={"Content-Disposition": f"attachment; filename=openapi.yaml"}
        )
    
    return JSONResponse(
        content=spec,
        headers={"Content-Disposition": f"attachment; filename=openapi.json"}
    )

from fastapi.responses import StreamingResponse
from app.core.log_store import subscribe, get_logs

@router.get("/{project_id}/logs")
async def stream_logs(project_id: str):
    return StreamingResponse(
        subscribe(project_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )

@router.get("/{project_id}/suggestions")
async def get_suggestions(project_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return {
        "project_id": project_id,
        "use_case": project.use_case,
        "suggestions": project.integration_suggestions or []
    }

@router.post("/", response_model=ProjectResponse, status_code=201)
async def create_project(
    payload: ProjectCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    from urllib.parse import urlparse
    parsed = urlparse(str(payload.url))
    api_base_url = f"{parsed.scheme}://{parsed.netloc}"

    # Check cache — if same URL was already completed, return it
    from datetime import datetime, timezone, timedelta

    existing = await db.execute(
        select(Project).where(
            Project.base_url == api_base_url,
            Project.status == ProjectStatus.COMPLETED,
            Project.created_at >= datetime.now(timezone.utc) - timedelta(hours=24),
        ).order_by(Project.created_at.desc())
    )
    cached = existing.scalar_one_or_none()

    if cached:
        # Update name to what user typed, keep everything else
        cached.name = payload.name
        cached.use_case = payload.use_case
        await db.commit()
        await db.refresh(cached)
        return cached

    # No cache hit — create new project and start pipeline
    project = Project(
        name=payload.name,
        base_url=api_base_url,
        use_case=payload.use_case,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    background_tasks.add_task(
        run_scrape_and_parse_job,
        project.id,
        str(payload.url),
        payload.use_case,
    )
    return project