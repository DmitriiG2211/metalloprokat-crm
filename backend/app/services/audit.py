from sqlalchemy.orm import Session
from fastapi.encoders import jsonable_encoder

from app.models import AuditLog, User


def write_audit(
    db: Session,
    user: User | None,
    action: str,
    entity_type: str,
    entity_id: int | None = None,
    old_value: dict | None = None,
    new_value: dict | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> None:
    db.add(
        AuditLog(
            user_id=user.id if user else None,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            old_value=jsonable_encoder(old_value) if old_value is not None else None,
            new_value=jsonable_encoder(new_value) if new_value is not None else None,
            ip_address=ip_address,
            user_agent=user_agent,
        )
    )
