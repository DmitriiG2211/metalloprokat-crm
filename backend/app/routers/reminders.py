from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import can_view_all, get_current_user
from app.models import Client, User
from app.routers.clients import serialize_client

router = APIRouter(prefix="/reminders", tags=["Reminders"])


def reminders_query(user: User):
    stmt = select(Client).options(joinedload(Client.manager), joinedload(Client.status), joinedload(Client.comments)).where(Client.deleted_at.is_(None), Client.next_call_date.is_not(None))
    if not can_view_all(user):
        stmt = stmt.where(Client.manager_id == user.id)
    return stmt


@router.get("/today")
def today(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    items = db.scalars(reminders_query(user).where(Client.next_call_date == date.today()).order_by(Client.company_name)).unique().all()
    return [serialize_client(item).model_dump(mode="json") for item in items]


@router.get("/overdue")
def overdue(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    items = db.scalars(reminders_query(user).where(Client.next_call_date < date.today()).order_by(Client.next_call_date)).unique().all()
    return [serialize_client(item).model_dump(mode="json") for item in items]


@router.get("/upcoming")
def upcoming(days: int = 14, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    end = date.today() + timedelta(days=days)
    items = db.scalars(reminders_query(user).where(Client.next_call_date > date.today(), Client.next_call_date <= end).order_by(Client.next_call_date)).unique().all()
    return [serialize_client(item).model_dump(mode="json") for item in items]
