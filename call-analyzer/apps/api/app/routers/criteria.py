from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import csrf_guard
from app.models import Criterion, User
from app.schemas import CriterionIn, CriterionOut

router = APIRouter(prefix="/criteria", tags=["criteria"])


def out(item: Criterion) -> CriterionOut:
    return CriterionOut(id=item.id, name=item.name, description=item.description, weight=item.weight, is_active=item.is_active)


@router.get("", response_model=list[CriterionOut])
def list_criteria(user: User = Depends(csrf_guard), db: Session = Depends(get_db)) -> list[CriterionOut]:
    rows = db.scalars(select(Criterion).where(Criterion.organization_id == user.organization_id).order_by(Criterion.created_at)).all()
    return [out(row) for row in rows]


@router.post("", response_model=CriterionOut)
def create_criterion(payload: CriterionIn, user: User = Depends(csrf_guard), db: Session = Depends(get_db)) -> CriterionOut:
    row = Criterion(organization_id=user.organization_id, **payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return out(row)


@router.put("/{criterion_id}", response_model=CriterionOut)
def update_criterion(criterion_id: str, payload: CriterionIn, user: User = Depends(csrf_guard), db: Session = Depends(get_db)) -> CriterionOut:
    row = db.get(Criterion, criterion_id)
    if not row or row.organization_id != user.organization_id:
        raise HTTPException(status_code=404, detail="Criterion not found")
    for key, value in payload.model_dump().items():
        setattr(row, key, value)
    db.commit()
    return out(row)
