import uuid
from datetime import datetime
from pydantic import BaseModel, HttpUrl
from app.models.project import ProjectStatus


class ProjectCreate(BaseModel):
    name: str
    url: HttpUrl
    use_case: str = ""
    force_refresh: bool = False


class ProjectResponse(BaseModel):
    id: uuid.UUID
    name: str
    base_url: str
    status: ProjectStatus
    created_at: datetime
    model_config = {"from_attributes": True}


class ScrapeStatusResponse(ProjectResponse):
    raw_content: str | None = None
    api_name: str | None = None
    api_description: str | None = None
    auth_scheme: dict | None = None
    use_case: str | None = None
    model_config = {"from_attributes": True}
    integration_suggestions: list | None = None