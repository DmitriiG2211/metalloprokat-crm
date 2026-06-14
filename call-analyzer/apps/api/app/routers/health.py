from fastapi import APIRouter
from sqlalchemy import text

from app.database import SessionLocal

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/ready")
def ready() -> dict[str, str]:
    with SessionLocal() as db:
        db.execute(text("select 1"))
    return {"status": "ready"}
