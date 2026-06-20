from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import exists, func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import can_view_all, ensure_client_access, get_current_user, request_meta
from app.models import AuditLog, Client, ClientComment, ImportClientChange, Role, Status, Task, Transfer, User
from app.schemas import BulkDeleteRequest, ClientCreate, ClientRead, ClientUpdate, CommentCreate, CommentRead, Page, TaskRead, TransferCreate
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
    client_id: int | None = None,
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
    if client_id:
        stmt = stmt.where(Client.id == client_id)
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
    if sort_dir == "asc":
        stmt = stmt.order_by(sort_column.asc(), Client.id.asc())
    else:
        stmt = stmt.order_by(sort_column.desc(), Client.id.desc())
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


@router.post("/bulk-delete")
def bulk_delete_clients(payload: BulkDeleteRequest, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not can_view_all(user):
        raise HTTPException(403, "Удаление клиентов доступно только руководителю")
    if not payload.delete_all and not payload.ids:
        raise HTTPException(422, "Выберите клиентов для удаления")

    if payload.delete_all:
        ids = [row[0] for row in db.execute(client_query(user).with_only_columns(Client.id)).all()]
    else:
        ids = [row[0] for row in db.execute(client_query(user).where(Client.id.in_(payload.ids)).with_only_columns(Client.id)).all()]
    if not ids:
        return {"ok": True, "deleted": 0}

    db.query(ClientComment).filter(ClientComment.client_id.in_(ids)).delete(synchronize_session=False)
    db.query(Task).filter(Task.client_id.in_(ids)).delete(synchronize_session=False)
    db.query(Transfer).filter(Transfer.client_id.in_(ids)).delete(synchronize_session=False)
    db.query(ImportClientChange).filter(ImportClientChange.client_id.in_(ids)).delete(synchronize_session=False)
    db.query(AuditLog).filter(AuditLog.entity_type == "client", AuditLog.entity_id.in_(ids)).delete(synchronize_session=False)
    deleted = db.query(Client).filter(Client.id.in_(ids)).delete(synchronize_session=False)
    ip, agent = request_meta(request)
    write_audit(db, user, "bulk_delete_clients", "client", None, new_value={"count": deleted, "delete_all": payload.delete_all}, ip_address=ip, user_agent=agent)
    db.commit()
    return {"ok": True, "deleted": deleted}


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
    comments = db.scalars(
        select(ClientComment)
        .options(joinedload(ClientComment.author))
        .where(ClientComment.client_id == client_id, ClientComment.deleted_at.is_(None))
        .order_by(ClientComment.created_at.desc())
    ).all()
    tasks = db.scalars(
        select(Task)
        .options(joinedload(Task.creator), joinedload(Task.manager))
        .where(Task.client_id == client_id)
        .order_by(Task.created_at.desc())
    ).all()
    audit = db.scalars(
        select(AuditLog)
        .where(AuditLog.entity_type == "client", AuditLog.entity_id == client_id)
        .order_by(AuditLog.created_at.desc())
    ).all()
    transfers = db.scalars(select(Transfer).where(Transfer.client_id == client_id).order_by(Transfer.created_at.desc())).all()
    user_ids = {item.user_id for item in audit if item.user_id}
    for transfer in transfers:
        user_ids.update([transfer.old_manager_id, transfer.new_manager_id, transfer.transferred_by])
    users_by_id = {item.id: item for item in db.scalars(select(User).where(User.id.in_(user_ids))).all()} if user_ids else {}

    def user_label(item: User | None) -> str | None:
        if not item:
            return None
        return item.manager_number and f"Менеджер {item.manager_number}" or item.full_name or item.login

    field_labels = {
        "manager_id": "менеджер",
        "company_name": "компания",
        "contact_person": "контактное лицо",
        "phone": "телефон",
        "email": "почта",
        "website": "сайт",
        "status_id": "статус",
        "last_call_date": "дата звонка",
        "next_call_date": "дата перезвона",
    }
    task_status = {"new": "Новая", "in_progress": "В работе", "done": "Выполнена", "canceled": "Отменена"}
    events = []
    for comment in comments:
        events.append(
            {
                "id": f"comment-{comment.id}",
                "type": "comment",
                "title": "Комментарий",
                "description": comment.comment_text,
                "actor": user_label(comment.author),
                "created_at": comment.created_at,
            }
        )
    for task in tasks:
        details = []
        if task.description:
            details.append(task.description)
        if task.deadline:
            details.append(f"Срок: {task.deadline}")
        if task.manager_comment:
            details.append(f"Комментарий менеджера: {task.manager_comment}")
        events.append(
            {
                "id": f"task-{task.id}",
                "type": "task",
                "title": f"Задача: {task.title}",
                "description": " · ".join(details),
                "actor": user_label(task.creator),
                "status": task_status.get(task.status, task.status),
                "created_at": task.created_at,
            }
        )
    for transfer in transfers:
        old_manager = users_by_id.get(transfer.old_manager_id)
        new_manager = users_by_id.get(transfer.new_manager_id)
        actor = users_by_id.get(transfer.transferred_by)
        events.append(
            {
                "id": f"transfer-{transfer.id}",
                "type": "transfer",
                "title": "Передача клиента",
                "description": f"{user_label(old_manager) or 'Без менеджера'} → {user_label(new_manager) or 'Без менеджера'}. {transfer.reason}",
                "actor": user_label(actor),
                "created_at": transfer.created_at,
            }
        )
    for item in audit:
        if item.action in {"add_comment", "transfer_client"}:
            continue
        changed = list((item.new_value or {}).keys())
        description = ", ".join(field_labels.get(key, key) for key in changed) if changed else None
        title = {
            "create_client": "Клиент создан",
            "update_client": "Изменение клиента",
            "delete_client": "Клиент отправлен в архив",
        }.get(item.action, item.action)
        events.append(
            {
                "id": f"audit-{item.id}",
                "type": "audit",
                "title": title,
                "description": description,
                "actor": user_label(users_by_id.get(item.user_id)) if item.user_id else None,
                "created_at": item.created_at,
            }
        )
    events.sort(key=lambda item: item["created_at"], reverse=True)
    return {
        "client_id": client_id,
        "events": events,
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
