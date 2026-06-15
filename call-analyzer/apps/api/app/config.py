from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "AI Call Analytics"
    env: str = "local"
    database_url: str = "sqlite:///./storage/app.db"
    storage_dir: Path = Path("./storage")
    frontend_origin: str = "http://localhost:5173"

    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 480

    llm_provider: str = "mock"
    llm_max_concurrency: int = 3
    llm_daily_token_limit: int = 250_000
    llm_monthly_budget_rub: float = 0
    timeweb_ai_base_url: str = ""
    timeweb_ai_api_key: str = ""
    timeweb_ai_agent_id: str = ""
    timeweb_ai_model: str = ""
    timeweb_ai_chat_completions_path: str = ""
    llm_max_completion_tokens: int = 1800
    openai_compatible_base_url: str = ""
    openai_compatible_api_key: str = ""
    openai_compatible_model: str = ""

    transcription_provider: str = "mock"
    whisper_model: str = "medium"
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"
    normalize_audio_before_transcription: bool = True
    enable_diarization: bool = False

    max_upload_mb: int = 500
    max_zip_files: int = 2000
    max_zip_uncompressed_mb: int = 5000

    model_config = SettingsConfigDict(env_file=("../../.env", ".env"), env_file_encoding="utf-8", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    return settings
