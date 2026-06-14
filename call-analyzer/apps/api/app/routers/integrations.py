from fastapi import APIRouter, Depends

from app.config import get_settings
from app.deps import csrf_guard
from app.models import User
from app.services.providers import TimewebAgentProvider

router = APIRouter(prefix="/integrations", tags=["integrations"])


@router.get("/timeweb/status")
def timeweb_status(_: User = Depends(csrf_guard)) -> dict[str, str | bool]:
    settings = get_settings()
    configured = bool(settings.timeweb_ai_api_key and settings.timeweb_ai_agent_id)
    provider = TimewebAgentProvider()
    endpoint = ""
    if settings.timeweb_ai_agent_id or settings.timeweb_ai_chat_completions_path:
        try:
            endpoint = provider.endpoint()
        except RuntimeError:
            endpoint = ""
    return {
        "provider_enabled": settings.llm_provider == "timeweb_agent",
        "configured": configured,
        "base_url": provider.base_url,
        "agent_id_present": bool(settings.timeweb_ai_agent_id),
        "api_key_present": bool(settings.timeweb_ai_api_key),
        "endpoint": endpoint,
    }
