from fastapi import APIRouter, Depends

from app.config import get_settings
from app.deps import csrf_guard
from app.models import User
from app.schemas import SettingsOut

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=SettingsOut)
def settings(_: User = Depends(csrf_guard)) -> SettingsOut:
    cfg = get_settings()
    return SettingsOut(
        llm_provider=cfg.llm_provider,
        transcription_provider=cfg.transcription_provider,
        whisper_model=cfg.whisper_model,
        enable_diarization=cfg.enable_diarization,
        daily_token_limit=cfg.llm_daily_token_limit,
        monthly_budget_rub=cfg.llm_monthly_budget_rub,
        legal_notice=(
            "Используйте сервис только для законно полученных записей. Проверьте основания записи, "
            "хранения, анализа разговоров и требования к персональным данным."
        ),
    )
