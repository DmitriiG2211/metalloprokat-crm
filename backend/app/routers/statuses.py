from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_roles
from app.models import Role, Status, User
from app.schemas import StatusCreate, StatusRead, StatusUpdate
from app.services.audit import write_audit

router = APIRouter(prefix="/statuses", tags=["Statuses"])


@router.get("", response_model=list[StatusRead])
def list_statuses(db: Session = Depends(get_db)):
    return db.scalars(select(Status).order_by(Status.sort_order, Status.id)).all()


@router.post("", response_model=StatusRead)
def create_status(payload: StatusCreate, db: Session = Depends(get_db), user: User = Depends(require_roles(Role.admin, Role.director))):
    status = Status(**payload.model_dump())
    db.add(status)
    db.flush()
    write_audit(db, user, "create_status", "status", status.id, new_value=payload.model_dump())
    db.commit()
    return status


@router.patch("/{status_id}", response_model=StatusRead)
def update_status(status_id: int, payload: StatusUpdate, db: Session = Depends(get_db), user: User = Depends(require_roles(Role.admin, Role.director))):
    status = db.get(Status, status_id)
    if not status:
        raise HTTPException(404, "Статус не найден")
    data = payload.model_dump(exclude_unset=True)
    old = {"name": status.name, "color": status.color, "sort_order": status.sort_order}
    for key, value in data.items():
        setattr(status, key, value)
    write_audit(db, user, "update_status", "status", status.id, old_value=old, new_value=data)
    db.commit()
    return status


@router.delete("/{status_id}")
def delete_status(status_id: int, db: Session = Depends(get_db), user: User = Depends(require_roles(Role.admin, Role.director))):
    status = db.get(Status, status_id)
    if not status:
        raise HTTPException(404, "Статус не найден")
    status.is_active = False
    write_audit(db, user, "disable_status", "status", status.id)
    db.commit()
    return {"ok": True}
