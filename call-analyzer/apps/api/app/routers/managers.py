from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import csrf_guard
from app.models import Call, ManagerProfile, User
from app.schemas import ManagerIn, ManagerOut

router = APIRouter(prefix="/managers", tags=["managers"])


def out(manager: ManagerProfile) -> ManagerOut:
    return ManagerOut(
        id=manager.id,
        name=manager.name,
        phone_extension=manager.phone_extension,
        department=manager.department,
        is_active=manager.is_active,
    )


@router.get("", response_model=list[ManagerOut])
def list_managers(user: User = Depends(csrf_guard), db: Session = Depends(get_db)) -> list[ManagerOut]:
    managers = db.scalars(select(ManagerProfile).where(ManagerProfile.organization_id == user.organization_id).order_by(ManagerProfile.name)).all()
    return [out(manager) for manager in managers]


@router.post("", response_model=ManagerOut)
def create_manager(payload: ManagerIn, user: User = Depends(csrf_guard), db: Session = Depends(get_db)) -> ManagerOut:
    manager = ManagerProfile(organization_id=user.organization_id, **payload.model_dump())
    db.add(manager)
    db.commit()
    db.refresh(manager)
    return out(manager)


@router.put("/{manager_id}", response_model=ManagerOut)
def update_manager(manager_id: str, payload: ManagerIn, user: User = Depends(csrf_guard), db: Session = Depends(get_db)) -> ManagerOut:
    manager = db.get(ManagerProfile, manager_id)
    if not manager or manager.organization_id != user.organization_id:
        raise HTTPException(status_code=404, detail="Manager not found")
    for key, value in payload.model_dump().items():
        setattr(manager, key, value)
    db.commit()
    return out(manager)


@router.delete("/{manager_id}")
def delete_manager(manager_id: str, user: User = Depends(csrf_guard), db: Session = Depends(get_db)) -> dict[str, str]:
    manager = db.get(ManagerProfile, manager_id)
    if not manager or manager.organization_id != user.organization_id:
        raise HTTPException(status_code=404, detail="Manager not found")
    db.query(Call).filter(Call.manager_id == manager.id, Call.organization_id == user.organization_id).update({"manager_id": None})
    db.delete(manager)
    db.commit()
    return {"status": "deleted"}
