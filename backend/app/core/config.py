from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Smart DevTool"
    app_version: str = "1.0.0"
    debug: bool = True

    database_url: str = "sqlite+aiosqlite:///./test.db"
    redis_url: str = "redis://redis:6379"
    gemini_api_key: str | None = None
    groq_api_key: str | None = None

    class Config:
        env_file = ".env"


settings = Settings()