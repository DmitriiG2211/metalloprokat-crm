from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import can_view_all, get_current_user
from app.models import Client, Status, Task, TaskStatus, User

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    base = select(Client).where(Client.deleted_at.is_(None))
    if not can_view_all(user):
        base = base.where(Client.manager_id == user.id)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    today_calls = db.scalar(select(func.count()).select_from(base.where(Client.next_call_date == date.today()).subquery())) or 0
    overdue = db.scalar(select(func.count()).select_from(base.where(Client.next_call_date < date.today()).subquery())) or 0
    task_stmt = select(Task)
    if not can_view_all(user):
        task_stmt = task_stmt.where(Task.manager_id == user.id)
    active_tasks = db.scalar(select(func.count()).select_from(task_stmt.where(Task.status != TaskStatus.done.value).subquery())) or 0
    return {"clients_total": total, "calls_today": today_calls, "overdue_calls": overdue, "active_tasks": active_tasks}


@router.get("/managers")
def managers(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not can_view_all(user):
        return []
    rows = db.execute(
        select(User.id, User.login, User.full_name, User.manager_number, func.count(Client.id)).join(Client, Client.manager_id == User.id, isouter=True).where(User.role == "manager").group_by(User.id)
    ).all()
    return [{"id": row[0], "login": row[1], "full_name": row[2], "manager_number": row[3], "clients_total": row[4]} for row in rows]


@router.get("/statuses")
def statuses(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    stmt = select(Status.name, Status.color, func.count(Client.id)).join(Client, Client.status_id == Status.id, isouter=True).where(Client.deleted_at.is_(None) | (Client.id.is_(None))).group_by(Status.id)
    if not can_view_all(user):
        stmt = stmt.where((Client.manager_id == user.id) | (Client.id.is_(None)))
    return [{"name": row[0], "color": row[1], "count": row[2]} for row in db.execute(stmt).all()]


@router.get("/kpi")
def kpi(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return dashboard(db, user)
