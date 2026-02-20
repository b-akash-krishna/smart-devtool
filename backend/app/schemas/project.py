import uuid
from datetime import datetime

from pydantic import BaseModel, HttpUrl

from app.models.project import ProjectStatus


class ProjectCreate(BaseModel):
    name: str
    url: HttpUrl


class ProjectResponse(BaseModel):
    id: uuid.UUID
    name: str
    base_url: str
    status: ProjectStatus
    created_at: datetime

    model_config = {"from_attributes": True}