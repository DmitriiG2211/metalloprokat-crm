from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import csrf_guard
from app.models import ManagerProfile, User
from app.schemas import DashboardOut
from app.services.pipeline import dashboard_data

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardOut)
def get_dashboard(user: User = Depends(csrf_guard), db: Session = Depends(get_db)) -> DashboardOut:
    data = dashboard_data(db, user.organization_id)
    names = {m.id: m.name for m in db.query(ManagerProfile).filter(ManagerProfile.organization_id == user.organization_id).all()}
    for item in data["managers"]:
        item["manager_name"] = names.get(item["manager_id"], "Не назначен")
    return DashboardOut(**data)
