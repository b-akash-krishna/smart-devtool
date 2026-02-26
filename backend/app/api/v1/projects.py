import logging
from uuid import UUID
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import io
import yaml

from app.core.database import get_db
from app.models.project import APIEndpoint, Project, ProjectStatus
from app.schemas.project import ProjectCreate, ProjectResponse, ScrapeStatusResponse
from app.services.scraper import scrape_docs
from app.services.llm_parser import parse_documentation, suggest_integration_paths
from app.services.codegen import generate_sdk
from app.core.log_store import append_log, subscribe, get_logs

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

            scrape_results = await scrape_docs(url, max_pages=3)
            append_log(str(project_id), f"✅ Scraped {len(scrape_results)} page(s) successfully")

            combined_markdown = "\n\n---\n\n".join(
                [f"# Source: {r.url}\n\n{r.markdown}" for r in scrape_results]
            )
            project.raw_content = combined_markdown[:50000]
            await db.commit()

            append_log(str(project_id), "🧠 Analyzing documentation with AI...")
            project.status = ProjectStatus.PARSING
            await db.commit()

            api_schema = await parse_documentation(
                combined_markdown, base_url=url, use_case=use_case
            )
            append_log(str(project_id), f"📋 Discovered {len(api_schema.endpoints)} endpoint(s)")

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


@router.get("/", response_model=list[ProjectResponse])
async def list_projects(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Project).order_by(Project.created_at.desc()).limit(20)
    )
    return result.scalars().all()

from fastapi import Request
from app.core.rate_limiter import check_rate_limit

@router.post("/", response_model=ProjectResponse, status_code=201)
async def create_project(
    payload: ProjectCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    request: Request = None,
):
    # Rate limiting
    ip = request.client.host if request else "unknown"
    allowed, retry_after = await check_rate_limit(ip, limit=10, window_seconds=3600)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Try again in {retry_after // 60} minutes.",
            headers={"Retry-After": str(retry_after)},
        )

    from urllib.parse import urlparse
    parsed = urlparse(str(payload.url))
    api_base_url = f"{parsed.scheme}://{parsed.netloc}"
    
    if not payload.force_refresh:
        # Cache check — return existing completed project if same URL scraped in last 24h
        existing = await db.execute(
            select(Project).where(
                Project.base_url == api_base_url,
                Project.status == ProjectStatus.COMPLETED,
                Project.created_at >= datetime.now(timezone.utc) - timedelta(hours=24),
            ).order_by(Project.created_at.desc()).limit(1)
        )
        cached = existing.scalar_one_or_none()

        if cached:
            cached.name = payload.name
            cached.use_case = payload.use_case
            await db.commit()
            await db.refresh(cached)
            logger.info(f"Cache hit for {api_base_url} — returning project {cached.id}")
            return cached

    # No cache hit — create new project and run pipeline
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


@router.get("/{project_id}", response_model=ScrapeStatusResponse)
async def get_project(project_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("/{project_id}/endpoints")
async def get_endpoints(project_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).where(Project.id == project_id))
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

    # Allow client to override endpoints (for edit-before-generate)
    if "endpoints" in payload and payload["endpoints"]:
        schema["endpoints"] = [
            {
                "method": ep["method"],
                "path": ep["path"],
                "summary": ep.get("summary", ""),
                "description": ep.get("description", ""),
                "parameters": ep.get("parameters", []),
                "request_body": ep.get("request_body", {}),
                "response_schema": ep.get("response_schema", {}),
                "tags": ep.get("tags", []),
            }
            for ep in payload["endpoints"]
        ]

    zip_bytes = generate_sdk(schema, language)
    filename = f"{project.api_name or 'sdk'}_{language}_sdk.zip".replace(" ", "_").lower()

    return StreamingResponse(
        io.BytesIO(zip_bytes),
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )

@router.get("/{project_id}/export")
async def export_openapi(
    project_id: str,
    format: str = "json",
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    ep_result = await db.execute(
        select(APIEndpoint).where(APIEndpoint.project_id == project_id)
    )
    endpoints = ep_result.scalars().all()

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
        "paths": paths,
    }

    if format == "yaml":
        content = yaml.dump(spec, default_flow_style=False, sort_keys=False)
        return Response(
            content=content,
            media_type="application/yaml",
            headers={"Content-Disposition": "attachment; filename=openapi.yaml"}
        )

    return JSONResponse(
        content=spec,
        headers={"Content-Disposition": "attachment; filename=openapi.json"}
    )


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

@router.delete("/{project_id}")
async def delete_project(project_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Delete endpoints first (foreign key)
    await db.execute(
        APIEndpoint.__table__.delete().where(APIEndpoint.project_id == project_id)
    )
    await db.delete(project)
    await db.commit()
    return {"deleted": project_id}