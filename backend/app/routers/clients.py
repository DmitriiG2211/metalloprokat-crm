from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import exists, func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import can_view_all, ensure_client_access, get_current_user, request_meta
from app.models import AuditLog, Client, ClientComment, Role, Status, Task, Transfer, User
from app.schemas import ClientCreate, ClientRead, ClientUpdate, CommentCreate, CommentRead, Page, TaskRead, TransferCreate
from app.services.audit import write_audit
from app.services.importer import find_duplicate
from app.utils.normalization import normalize_company, normalize_email, normalize_phone, normalize_website

router = APIRouter(prefix="/clients", tags=["Clients"])


def is_dead_status():
    return Client.status.has(Status.name.ilike("Мертв%"))


def serialize_client(client: Client) -> ClientRead:
    last_comment = None
    visible_comments = [comment for comment in client.comments if comment.deleted_at is None]
    if visible_comments:
        last_comment = sorted(visible_comments, key=lambda comment: comment.created_at)[-1].comment_text
    return ClientRead.model_validate(client, from_attributes=True).model_copy(update={"last_comment": last_comment})


def client_query(user: User):
    stmt = select(Client).where(Client.deleted_at.is_(None))
    if not can_view_all(user):
        stmt = stmt.where(Client.manager_id == user.id)
    return stmt


@router.get("", response_model=Page)
def list_clients(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
    search: str | None = None,
    status_id: int | None = None,
    manager_id: int | None = None,
    overdue: bool = False,
    next_call_from: date | None = None,
    next_call_to: date | None = None,
    no_phone: bool = False,
    no_comment: bool = False,
    sort_by: str = "updated_at",
    sort_dir: str = "desc",
):
    stmt = client_query(user)
    if status_id:
        stmt = stmt.where(Client.status_id == status_id)
    else:
        stmt = stmt.where(or_(Client.status_id.is_(None), ~is_dead_status()))
    if manager_id and can_view_all(user):
        stmt = stmt.where(Client.manager_id == manager_id)
    if overdue:
        stmt = stmt.where(Client.next_call_date < date.today())
    if next_call_from:
        stmt = stmt.where(Client.next_call_date >= next_call_from)
    if next_call_to:
        stmt = stmt.where(Client.next_call_date <= next_call_to)
    if no_phone:
        stmt = stmt.where(or_(Client.phone.is_(None), Client.phone == ""))
    if no_comment:
        stmt = stmt.where(~exists().where(ClientComment.client_id == Client.id, ClientComment.deleted_at.is_(None)))
    if search:
        pattern = f"%{search.strip()}%"
        phone = normalize_phone(search)
        conditions = [
            Client.company_name.ilike(pattern),
            Client.normalized_company_name.ilike(f"%{normalize_company(search)}%"),
            Client.contact_person.ilike(pattern),
            Client.email.ilike(pattern),
            Client.website.ilike(pattern),
            exists().where(ClientComment.client_id == Client.id, ClientComment.comment_text.ilike(pattern)),
        ]
        if phone:
            conditions.append(Client.normalized_phone.ilike(f"%{phone}%"))
            conditions.append(Client.phone.ilike(pattern))
        stmt = stmt.where(or_(*conditions))

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = db.scalar(count_stmt) or 0
    sort_column = getattr(Client, sort_by, Client.updated_at)
    stmt = stmt.options(joinedload(Client.manager), joinedload(Client.status), joinedload(Client.comments))
    stmt = stmt.order_by(sort_column.asc() if sort_dir == "asc" else sort_column.desc())
    clients = db.scalars(stmt.offset((page - 1) * page_size).limit(page_size)).unique().all()
    return {"items": [serialize_client(client).model_dump(mode="json") for client in clients], "total": total, "page": page, "page_size": page_size}


@router.post("", response_model=ClientRead)
def create_client(payload: ClientCreate, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    manager_id = payload.manager_id if can_view_all(user) and payload.manager_id else user.id
    website, domain = normalize_website(payload.website)
    email = normalize_email(payload.email)
    normalized_phone = normalize_phone(payload.phone)
    duplicate = find_duplicate(db, payload.company_name, normalized_phone, email, domain)
    if duplicate:
        raise HTTPException(409, f"Похожий клиент уже есть: #{duplicate.id} {duplicate.company_name}")
    client = Client(
        manager_id=manager_id,
        company_name=payload.company_name.strip(),
        normalized_company_name=normalize_company(payload.company_name),
        contact_person=payload.contact_person,
        phone=payload.phone,
        normalized_phone=normalized_phone,
        email=email,
        website=website,
        website_domain=domain,
        status_id=payload.status_id,
        last_call_date=payload.last_call_date,
        next_call_date=payload.next_call_date,
    )
    db.add(client)
    db.flush()
    if payload.comment:
        db.add(ClientComment(client_id=client.id, author_id=user.id, comment_text=payload.comment))
    ip, agent = request_meta(request)
    write_audit(db, user, "create_client", "client", client.id, new_value=payload.model_dump(mode="json"), ip_address=ip, user_agent=agent)
    db.commit()
    db.refresh(client)
    return serialize_client(client)


@router.get("/{client_id}", response_model=ClientRead)
def get_client(client_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    client = ensure_client_access(db, client_id, user)
    db.refresh(client)
    return serialize_client(client)


@router.patch("/{client_id}", response_model=ClientRead)
def update_client(client_id: int, payload: ClientUpdate, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    client = ensure_client_access(db, client_id, user)
    data = payload.model_dump(exclude_unset=True)
    if "manager_id" in data and not can_view_all(user):
        data.pop("manager_id")
    old = {key: getattr(client, key) for key in data.keys() if hasattr(client, key)}
    for key, value in data.items():
        if key == "company_name" and value:
            client.company_name = value.strip()
            client.normalized_company_name = normalize_company(value)
        elif key == "phone":
            client.phone = value
            client.normalized_phone = normalize_phone(value)
        elif key == "email":
            client.email = normalize_email(value)
        elif key == "website":
            client.website, client.website_domain = normalize_website(value)
        else:
            setattr(client, key, value)
    ip, agent = request_meta(request)
    write_audit(db, user, "update_client", "client", client.id, old_value=old, new_value=data, ip_address=ip, user_agent=agent)
    db.commit()
    return serialize_client(client)


@router.delete("/{client_id}")
def delete_client(client_id: int, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role not in {Role.admin.value, Role.director.value}:
        raise HTTPException(403, "Удалять клиентов может только руководитель или администратор")
    client = ensure_client_access(db, client_id, user)
    client.deleted_at = datetime.now(timezone.utc)
    ip, agent = request_meta(request)
    write_audit(db, user, "delete_client", "client", client.id, ip_address=ip, user_agent=agent)
    db.commit()
    return {"ok": True}


@router.get("/{client_id}/comments", response_model=list[CommentRead])
def list_comments(client_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ensure_client_access(db, client_id, user)
    return db.scalars(
        select(ClientComment).options(joinedload(ClientComment.author)).where(ClientComment.client_id == client_id, ClientComment.deleted_at.is_(None)).order_by(ClientComment.created_at.desc())
    ).all()


@router.post("/{client_id}/comments", response_model=CommentRead)
def add_comment(client_id: int, payload: CommentCreate, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ensure_client_access(db, client_id, user)
    comment = ClientComment(client_id=client_id, author_id=user.id, comment_text=payload.comment_text)
    db.add(comment)
    db.flush()
    ip, agent = request_meta(request)
    write_audit(db, user, "add_comment", "client", client_id, new_value={"comment": payload.comment_text}, ip_address=ip, user_agent=agent)
    db.commit()
    db.refresh(comment)
    return comment


@router.get("/{client_id}/history")
def history(client_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ensure_client_access(db, client_id, user)
    audit = db.scalars(select(AuditLog).where(AuditLog.entity_type == "client", AuditLog.entity_id == client_id).order_by(AuditLog.created_at.desc())).all()
    transfers = db.scalars(select(Transfer).where(Transfer.client_id == client_id).order_by(Transfer.created_at.desc())).all()
    return {
        "audit": [
            {"id": item.id, "action": item.action, "old_value": item.old_value, "new_value": item.new_value, "created_at": item.created_at}
            for item in audit
        ],
        "transfers": [
            {
                "id": item.id,
                "old_manager_id": item.old_manager_id,
                "new_manager_id": item.new_manager_id,
                "transferred_by": item.transferred_by,
                "reason": item.reason,
                "created_at": item.created_at,
            }
            for item in transfers
        ],
    }


@router.get("/{client_id}/tasks", response_model=list[TaskRead])
def client_tasks(client_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ensure_client_access(db, client_id, user)
    return db.scalars(select(Task).where(Task.client_id == client_id).order_by(Task.created_at.desc())).all()


@router.post("/{client_id}/transfer")
def transfer_client(client_id: int, payload: TransferCreate, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not can_view_all(user):
        raise HTTPException(403, "Передача клиентов доступна руководителю")
    client = ensure_client_access(db, client_id, user)
    if not db.get(User, payload.new_manager_id):
        raise HTTPException(404, "Новый менеджер не найден")
    old_manager_id = client.manager_id
    client.manager_id = payload.new_manager_id
    transfer = Transfer(client_id=client.id, old_manager_id=old_manager_id, new_manager_id=payload.new_manager_id, transferred_by=user.id, reason=payload.reason)
    db.add(transfer)
    ip, agent = request_meta(request)
    write_audit(db, user, "transfer_client", "client", client.id, old_value={"manager_id": old_manager_id}, new_value=payload.model_dump(), ip_address=ip, user_agent=agent)
    db.commit()
    return {"ok": True}
