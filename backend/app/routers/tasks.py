from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import can_view_all, get_current_user, request_meta
from app.models import Role, Task, TaskStatus, User
from app.schemas import TaskCreate, TaskRead, TaskUpdate
from app.services.audit import write_audit

router = APIRouter(prefix="/tasks", tags=["Tasks"])


@router.get("", response_model=list[TaskRead])
def list_tasks(db: Session = Depends(get_db), user: User = Depends(get_current_user), status: str | None = None):
    stmt = select(Task).options(joinedload(Task.client), joinedload(Task.manager), joinedload(Task.creator)).order_by(Task.deadline.asc().nullslast(), Task.created_at.desc())
    if not can_view_all(user):
        stmt = stmt.where(Task.manager_id == user.id)
    if status:
        stmt = stmt.where(Task.status == status)
    return db.scalars(stmt).unique().all()


@router.post("", response_model=TaskRead)
def create_task(payload: TaskCreate, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role == Role.manager.value and payload.manager_id != user.id:
        raise HTTPException(403, "Менеджер может создавать задачи только себе")
    task = Task(**payload.model_dump(), creator_id=user.id)
    db.add(task)
    db.flush()
    ip, agent = request_meta(request)
    write_audit(db, user, "create_task", "task", task.id, new_value=payload.model_dump(mode="json"), ip_address=ip, user_agent=agent)
    db.commit()
    return task


@router.get("/{task_id}", response_model=TaskRead)
def get_task(task_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    task = db.get(Task, task_id)
    if not task or (not can_view_all(user) and task.manager_id != user.id):
        raise HTTPException(404, "Задача не найдена")
    return task


@router.patch("/{task_id}", response_model=TaskRead)
def update_task(task_id: int, payload: TaskUpdate, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    task = db.get(Task, task_id)
    if not task or (not can_view_all(user) and task.manager_id != user.id):
        raise HTTPException(404, "Задача не найдена")
    data = payload.model_dump(exclude_unset=True)
    if not can_view_all(user):
        data = {key: value for key, value in data.items() if key in {"status", "manager_comment"}}
    old = {key: getattr(task, key) for key in data}
    for key, value in data.items():
        setattr(task, key, value)
    if task.status == TaskStatus.done.value and not task.completed_at:
        task.completed_at = datetime.now(timezone.utc)
    ip, agent = request_meta(request)
    write_audit(db, user, "update_task", "task", task.id, old_value=old, new_value=data, ip_address=ip, user_agent=agent)
    db.commit()
    return task


@router.post("/{task_id}/complete", response_model=TaskRead)
def complete_task(task_id: int, request: Request, manager_comment: str | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    task = db.get(Task, task_id)
    if not task or (not can_view_all(user) and task.manager_id != user.id):
        raise HTTPException(404, "Задача не найдена")
    task.status = TaskStatus.done.value
    task.manager_comment = manager_comment or task.manager_comment
    task.completed_at = datetime.now(timezone.utc)
    ip, agent = request_meta(request)
    write_audit(db, user, "complete_task", "task", task.id, ip_address=ip, user_agent=agent)
    db.commit()
    return task
