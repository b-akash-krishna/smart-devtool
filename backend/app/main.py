from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import traceback

from app.core.config import settings
from app.core.database import Base, engine
from app.api.v1 import projects

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Convert any API documentation URL into a ready-to-use SDK.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    from app.models.project import Project, APIEndpoint
    from sqlalchemy import text
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
        # Add new columns if the table was created before these fields were added.
        try:
            await conn.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS use_case TEXT"))
            await conn.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS integration_suggestions JSONB"))
        except Exception as e:
            print("Migration skip:", e)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import traceback
    return JSONResponse(
        status_code=500,
        content={"message": "Internal Server Error", "error": str(exc), "trace": traceback.format_exc()}
    )



@app.get("/")
async def root():
    return {
        "message": f"Welcome to {settings.app_name} API!",
        "version": settings.app_version,
    }

@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "app": settings.app_name,
        "version": settings.app_version,
    }


app.include_router(projects.router, prefix="/api/v1")