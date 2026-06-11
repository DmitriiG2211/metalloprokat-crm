from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import can_view_all, get_current_user, request_meta
from app.models import KanbanRequest, KanbanStatus, SupplierBlacklist, User
from app.schemas import (
    KanbanRequestCreate,
    KanbanRequestRead,
    KanbanRequestUpdate,
    SupplierBlacklistCreate,
    SupplierBlacklistRead,
    SupplierBlacklistUpdate,
)
from app.services.audit import write_audit

router = APIRouter(prefix="/kanban", tags=["Kanban"])


def normalize_domain(value: str | None) -> str | None:
    cleaned = (value or "").strip().lower()
    if not cleaned:
        return None
    cleaned = cleaned.removeprefix("http://").removeprefix("https://").removeprefix("www.")
    return cleaned.split("/")[0]


def request_stmt(user: User, include_archived: bool = False):
    stmt = select(KanbanRequest).options(joinedload(KanbanRequest.manager), joinedload(KanbanRequest.creator))
    if not include_archived:
        stmt = stmt.where(KanbanRequest.archived_at.is_(None))
    if not can_view_all(user):
        stmt = stmt.where(or_(KanbanRequest.manager_id == user.id, KanbanRequest.creator_id == user.id))
    return stmt


def get_accessible_request(db: Session, request_id: int, user: User) -> KanbanRequest:
    item = db.get(KanbanRequest, request_id)
    if not item or (not can_view_all(user) and item.manager_id != user.id and item.creator_id != user.id):
        raise HTTPException(404, "Заявка не найдена")
    return item


@router.get("/requests", response_model=list[KanbanRequestRead])
def list_requests(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    stmt = request_stmt(user).order_by(KanbanRequest.updated_at.desc(), KanbanRequest.id.desc())
    return db.scalars(stmt).unique().all()


@router.get("/archive", response_model=list[KanbanRequestRead])
def list_archive(search: str | None = Query(default=None), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    stmt = request_stmt(user, include_archived=True).where(KanbanRequest.archived_at.is_not(None))
    if search:
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                KanbanRequest.company_name.ilike(pattern),
                KanbanRequest.email.ilike(pattern),
                KanbanRequest.phone.ilike(pattern),
                KanbanRequest.comment.ilike(pattern),
                KanbanRequest.nomenclature.ilike(pattern),
            )
        )
    return db.scalars(stmt.order_by(KanbanRequest.archived_at.desc(), KanbanRequest.updated_at.desc())).unique().all()


@router.post("/requests", response_model=KanbanRequestRead)
def create_request(payload: KanbanRequestCreate, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    manager_id = payload.manager_id if can_view_all(user) and payload.manager_id else user.id
    item = KanbanRequest(**payload.model_dump(exclude={"manager_id"}), manager_id=manager_id, creator_id=user.id, status=KanbanStatus.new.value)
    db.add(item)
    db.flush()
    ip, agent = request_meta(request)
    write_audit(db, user, "create_kanban_request", "kanban_request", item.id, new_value=payload.model_dump(mode="json"), ip_address=ip, user_agent=agent)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/requests/{request_id}", response_model=KanbanRequestRead)
def update_request(request_id: int, payload: KanbanRequestUpdate, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    item = get_accessible_request(db, request_id, user)
    data = payload.model_dump(exclude_unset=True)
    if "manager_id" in data and not can_view_all(user):
        data.pop("manager_id")
    if "status" in data and data["status"] not in {status.value for status in KanbanStatus}:
        raise HTTPException(422, "Неизвестный статус kanban")
    old = {key: getattr(item, key) for key in data.keys() if hasattr(item, key)}
    for key, value in data.items():
        setattr(item, key, value)
    if item.status == KanbanStatus.invoiced.value and not item.archived_at:
        item.archived_at = datetime.now(timezone.utc)
    elif item.status != KanbanStatus.invoiced.value:
        item.archived_at = None
    ip, agent = request_meta(request)
    write_audit(db, user, "update_kanban_request", "kanban_request", item.id, old_value=old, new_value=data, ip_address=ip, user_agent=agent)
    db.commit()
    db.refresh(item)
    return item


@router.get("/blacklist", response_model=list[SupplierBlacklistRead])
def list_blacklist(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return db.scalars(select(SupplierBlacklist).order_by(SupplierBlacklist.supplier_name.asc())).all()


@router.post("/blacklist", response_model=SupplierBlacklistRead)
def create_blacklist_item(payload: SupplierBlacklistCreate, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    item = SupplierBlacklist(**payload.model_dump(), domain=normalize_domain(payload.domain))
    db.add(item)
    db.flush()
    ip, agent = request_meta(request)
    write_audit(db, user, "create_supplier_blacklist", "supplier_blacklist", item.id, new_value=payload.model_dump(mode="json"), ip_address=ip, user_agent=agent)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/blacklist/{item_id}", response_model=SupplierBlacklistRead)
def update_blacklist_item(item_id: int, payload: SupplierBlacklistUpdate, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    item = db.get(SupplierBlacklist, item_id)
    if not item:
        raise HTTPException(404, "Запись черного списка не найдена")
    data = payload.model_dump(exclude_unset=True)
    if "domain" in data:
        data["domain"] = normalize_domain(data["domain"])
    old = {key: getattr(item, key) for key in data.keys()}
    for key, value in data.items():
        setattr(item, key, value)
    ip, agent = request_meta(request)
    write_audit(db, user, "update_supplier_blacklist", "supplier_blacklist", item.id, old_value=old, new_value=data, ip_address=ip, user_agent=agent)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/blacklist/{item_id}")
def delete_blacklist_item(item_id: int, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    item = db.get(SupplierBlacklist, item_id)
    if not item:
        raise HTTPException(404, "Запись черного списка не найдена")
    db.delete(item)
    ip, agent = request_meta(request)
    write_audit(db, user, "delete_supplier_blacklist", "supplier_blacklist", item_id, ip_address=ip, user_agent=agent)
    db.commit()
    return {"ok": True}
