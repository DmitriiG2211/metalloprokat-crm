from io import BytesIO, StringIO
from datetime import date

import pandas as pd
from fastapi import APIRouter, Depends
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import can_view_all, get_current_user
from app.models import Client, User
from app.services.audit import write_audit

router = APIRouter(prefix="/export", tags=["Export"])


def export_clients(
    db: Session,
    user: User,
    status_id: int | None = None,
    manager_id: int | None = None,
    next_call_from: date | None = None,
    next_call_to: date | None = None,
):
    stmt = select(Client).options(joinedload(Client.manager), joinedload(Client.status)).where(Client.deleted_at.is_(None))
    if not can_view_all(user):
        stmt = stmt.where(Client.manager_id == user.id)
    elif manager_id:
        stmt = stmt.where(Client.manager_id == manager_id)
    if status_id:
        stmt = stmt.where(Client.status_id == status_id)
    if next_call_from:
        stmt = stmt.where(Client.next_call_date >= next_call_from)
    if next_call_to:
        stmt = stmt.where(Client.next_call_date <= next_call_to)
    clients = db.scalars(stmt.order_by(Client.company_name)).all()
    rows = [
        {
            "Компания": c.company_name,
            "ФИО": c.contact_person,
            "Телефон": c.phone,
            "Email": c.email,
            "Сайт": c.website,
            "Статус": c.status.name if c.status else "",
            "Дата звонка": c.last_call_date,
            "Дата перезвона": c.next_call_date,
            "Менеджер": c.manager.login if c.manager else "",
        }
        for c in clients
    ]
    return pd.DataFrame(rows)


@router.get("/clients.xlsx")
def clients_xlsx(
    status_id: int | None = None,
    manager_id: int | None = None,
    next_call_from: date | None = None,
    next_call_to: date | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    df = export_clients(db, user, status_id, manager_id, next_call_from, next_call_to)
    output = BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Клиенты")
    write_audit(db, user, "export_xlsx", "client", None)
    db.commit()
    output.seek(0)
    return StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": "attachment; filename=clients.xlsx"})


@router.get("/clients.csv")
def clients_csv(
    status_id: int | None = None,
    manager_id: int | None = None,
    next_call_from: date | None = None,
    next_call_to: date | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    df = export_clients(db, user, status_id, manager_id, next_call_from, next_call_to)
    output = StringIO()
    df.to_csv(output, index=False)
    write_audit(db, user, "export_csv", "client", None)
    db.commit()
    return Response(output.getvalue(), media_type="text/csv; charset=utf-8", headers={"Content-Disposition": "attachment; filename=clients.csv"})
