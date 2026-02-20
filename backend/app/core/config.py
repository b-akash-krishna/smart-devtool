from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Smart DevTool"
    app_version: str = "1.0.0"
    debug: bool = True

    database_url: str
    redis_url: str
    gemini_api_key: str

    class Config:
        env_file = ".env"


settings = Settings()