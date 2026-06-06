from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "CRM Мегаполис"
    database_url: str = "sqlite:///./crm_local.db"
    database_schema: str = ""
    secret_key: str = "change-me-in-production"
    access_token_expire_minutes: int = 60 * 12
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost"
    frontend_dist_path: str = ""
    upload_max_mb: int = 25

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
