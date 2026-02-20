import logging
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.project import Project, ProjectStatus
from app.schemas.project import ProjectCreate, ProjectResponse, ScrapeStatusResponse
from app.services.scraper import scrape_docs

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/projects", tags=["projects"])


async def run_scrape_job(project_id: UUID, url: str):
    """Background task: scrape docs and update project status."""
    from app.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        try:
            # Mark as scraping
            result = await db.execute(select(Project).where(Project.id == project_id))
            project = result.scalar_one()
            project.status = ProjectStatus.SCRAPING
            await db.commit()

            # Run the scraper
            scrape_results = await scrape_docs(url, max_pages=5)

            # Combine all markdown
            combined_markdown = "\n\n---\n\n".join(
                [f"# Source: {r.url}\n\n{r.markdown}" for r in scrape_results]
            )

            # Store in project (we'll add a proper field for this soon)
            project.status = ProjectStatus.COMPLETED
            project.raw_content = combined_markdown[:50000]  # safety limit
            await db.commit()

            logger.info(f"Scrape job complete for project {project_id}")

        except Exception as e:
            logger.error(f"Scrape job failed for {project_id}: {e}")
            async with AsyncSessionLocal() as db2:
                result = await db2.execute(select(Project).where(Project.id == project_id))
                project = result.scalar_one_or_none()
                if project:
                    project.status = ProjectStatus.FAILED
                    await db2.commit()


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

    # Kick off scraping in the background immediately
    background_tasks.add_task(run_scrape_job, project.id, str(payload.url))

    return project


@router.get("/{project_id}", response_model=ScrapeStatusResponse)
async def get_project(project_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project