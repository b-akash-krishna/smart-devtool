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

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/projects", tags=["projects"])


async def run_scrape_and_parse_job(project_id: UUID, url: str):
    """Full pipeline: scrape → parse → store."""
    from app.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(select(Project).where(Project.id == project_id))
            project = result.scalar_one()

            # --- Stage 1: Scrape ---
            project.status = ProjectStatus.SCRAPING
            await db.commit()

            scrape_results = await scrape_docs(url, max_pages=5)
            combined_markdown = "\n\n---\n\n".join(
                [f"# Source: {r.url}\n\n{r.markdown}" for r in scrape_results]
            )
            project.raw_content = combined_markdown[:50000]
            await db.commit()

            # --- Stage 2: Parse with LLM ---
            project.status = ProjectStatus.PARSING
            await db.commit()

            api_schema = await parse_documentation(combined_markdown, base_url=url)

            # --- Stage 3: Store results ---
            project.api_name = api_schema.api_name
            project.api_description = api_schema.description
            project.auth_scheme = api_schema.auth.model_dump()

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
            logger.info(f"Pipeline complete for project {project_id}: {len(api_schema.endpoints)} endpoints")

        except Exception as e:
            logger.error(f"Pipeline failed for {project_id}: {e}", exc_info=True)
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
    project = Project(name=payload.name, base_url=str(payload.url))
    db.add(project)
    await db.commit()
    await db.refresh(project)
    background_tasks.add_task(run_scrape_and_parse_job, project.id, str(payload.url))
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