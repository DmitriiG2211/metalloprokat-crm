from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_roles
from app.models import AuditLog, Role, User
from app.schemas import AuditRead

router = APIRouter(prefix="/audit-log", tags=["Audit"])


@router.get("", response_model=list[AuditRead])
def list_audit(limit: int = Query(100, le=500), db: Session = Depends(get_db), _: User = Depends(require_roles(Role.admin, Role.director))):
    return db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)).all()
