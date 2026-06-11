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
    ollama_base_url: str = ""
    ollama_api_key: str = ""
    ollama_model: str = "gpt-oss:20b"
    yandex_mail_enabled: bool = False
    yandex_mail_host: str = "imap.yandex.ru"
    yandex_mail_port: int = 993
    yandex_mail_user: str = ""
    yandex_mail_password: str = ""
    yandex_mail_folder: str = "INBOX"
    yandex_mail_search: str = "UNSEEN"
    yandex_mail_seen_limit: int = 30
    yandex_mail_interval_seconds: int = 60

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
