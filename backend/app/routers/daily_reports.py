from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import can_view_all, get_current_user
from app.models import DailyReport, Role, User
from app.schemas import DailyReportRead, DailyReportSummaryRow, DailyReportUpsert
from app.services.audit import write_audit

router = APIRouter(prefix="/daily-reports", tags=["Daily reports"])


def report_query(user: User):
    stmt = select(DailyReport).options(joinedload(DailyReport.manager))
    if not can_view_all(user):
        stmt = stmt.where(DailyReport.manager_id == user.id)
    return stmt


def report_totals(report: DailyReport) -> dict[str, int]:
    return {
        "total_calls": report.calls_existing_count + report.calls_new_count + report.calls_regular_count,
        "total_no_answer": report.calls_existing_no_answer_count + report.calls_new_no_answer_count,
        "total_refusals": report.calls_existing_refusal_count + report.calls_new_refusal_count,
        "total_email_followups": report.calls_existing_email_count + report.calls_new_email_count,
        "total_not_metal": report.calls_existing_not_metal_count + report.calls_new_not_metal_count,
        "advertising_total": report.advertising_city_phone_count + report.advertising_avito_count,
        "accounts_total": report.invoice_count
        + report.paid_invoice_count
        + report.requests_received_count
        + report.invoices_pending_payment_count
        + report.unpaid_invoice_count
        + report.invoices_in_work_count,
    }


@router.get("", response_model=list[DailyReportRead])
def list_daily_reports(
    date_from: date | None = None,
    date_to: date | None = None,
    manager_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = report_query(user)
    if manager_id and can_view_all(user):
        stmt = stmt.where(DailyReport.manager_id == manager_id)
    if date_from:
        stmt = stmt.where(DailyReport.report_date >= date_from)
    if date_to:
        stmt = stmt.where(DailyReport.report_date <= date_to)
    return db.scalars(stmt.order_by(DailyReport.report_date.desc(), DailyReport.updated_at.desc())).all()


@router.get("/my", response_model=DailyReportRead | None)
def my_daily_report(report_date: date = Query(default_factory=date.today), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.scalars(select(DailyReport).options(joinedload(DailyReport.manager)).where(DailyReport.manager_id == user.id, DailyReport.report_date == report_date)).first()


@router.put("/my", response_model=DailyReportRead)
def upsert_my_daily_report(payload: DailyReportUpsert, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role != Role.manager.value:
        raise HTTPException(status_code=403, detail="Only managers can submit daily reports")

    report = db.scalars(select(DailyReport).where(DailyReport.manager_id == user.id, DailyReport.report_date == payload.report_date)).first()
    data = payload.model_dump()
    ip = request.client.host if request.client else None
    agent = request.headers.get("user-agent")
    if report:
        old_value = DailyReportRead.model_validate(report, from_attributes=True).model_dump(mode="json")
        for key, value in data.items():
            setattr(report, key, value)
        action = "update_daily_report"
        entity_id = report.id
        old_payload = old_value
    else:
        report = DailyReport(manager_id=user.id, **data)
        db.add(report)
        db.flush()
        action = "create_daily_report"
        entity_id = report.id
        old_payload = None

    db.flush()
    write_audit(db, user, action, "daily_report", entity_id, old_value=old_payload, new_value=data, ip_address=ip, user_agent=agent)
    db.commit()
    db.refresh(report)
    return report


@router.get("/summary", response_model=list[DailyReportSummaryRow])
def daily_reports_summary(
    date_from: date | None = None,
    date_to: date | None = None,
    manager_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if can_view_all(user):
        managers_stmt = select(User).where(User.role == Role.manager.value, User.is_active.is_(True)).order_by(User.manager_number, User.full_name)
        if manager_id:
            managers_stmt = managers_stmt.where(User.id == manager_id)
        managers = db.scalars(managers_stmt).all()
    else:
        managers = [user]

    manager_ids = [manager.id for manager in managers]
    if not manager_ids:
        return []

    reports_stmt = select(DailyReport).where(DailyReport.manager_id.in_(manager_ids))
    if date_from:
        reports_stmt = reports_stmt.where(DailyReport.report_date >= date_from)
    if date_to:
        reports_stmt = reports_stmt.where(DailyReport.report_date <= date_to)
    reports = db.scalars(reports_stmt).all()

    grouped: dict[int, list[DailyReport]] = {manager.id: [] for manager in managers}
    for report in reports:
        grouped.setdefault(report.manager_id, []).append(report)

    rows: list[DailyReportSummaryRow] = []
    for manager in managers:
        items = grouped.get(manager.id, [])
        total_calls = sum(report_totals(item)["total_calls"] for item in items)
        total_no_answer = sum(report_totals(item)["total_no_answer"] for item in items)
        total_refusals = sum(report_totals(item)["total_refusals"] for item in items)
        total_email_followups = sum(report_totals(item)["total_email_followups"] for item in items)
        total_not_metal = sum(report_totals(item)["total_not_metal"] for item in items)
        advertising_total = sum(report_totals(item)["advertising_total"] for item in items)
        accounts_total = sum(report_totals(item)["accounts_total"] for item in items)
        rows.append(
            DailyReportSummaryRow(
                manager_id=manager.id,
                login=manager.login,
                full_name=manager.full_name,
                manager_number=manager.manager_number,
                reports_count=len(items),
                total_calls=total_calls,
                calls_existing=sum(item.calls_existing_count for item in items),
                calls_new=sum(item.calls_new_count for item in items),
                calls_regular=sum(item.calls_regular_count for item in items),
                total_no_answer=total_no_answer,
                total_refusals=total_refusals,
                total_email_followups=total_email_followups,
                total_not_metal=total_not_metal,
                advertising_total=advertising_total,
                accounts_total=accounts_total,
                invoice_count=sum(item.invoice_count for item in items),
                paid_invoice_count=sum(item.paid_invoice_count for item in items),
                requests_received_count=sum(item.requests_received_count for item in items),
                invoices_pending_payment_count=sum(item.invoices_pending_payment_count for item in items),
                unpaid_invoice_count=sum(item.unpaid_invoice_count for item in items),
                invoices_in_work_count=sum(item.invoices_in_work_count for item in items),
            )
        )
    return rows
