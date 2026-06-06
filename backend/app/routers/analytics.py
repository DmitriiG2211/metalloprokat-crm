from __future__ import annotations

from datetime import date, datetime, time, timezone

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import can_view_all, get_current_user, require_roles, request_meta
from app.models import Client, ClientComment, DailyReport, ImportJob, Role, Status, Task, TaskStatus, User
from app.routers.daily_reports import report_totals
from app.services.audit import write_audit
from app.utils.normalization import normalize_email, normalize_phone, normalize_website

router = APIRouter(prefix="/analytics", tags=["Analytics"])


def _month_start() -> date:
    today = date.today()
    return today.replace(day=1)


def _date_range(date_from: date | None, date_to: date | None) -> tuple[date, date]:
    start = date_from or _month_start()
    end = date_to or date.today()
    if start > end:
        return end, start
    return start, end


def _range_datetimes(start: date, end: date) -> tuple[datetime, datetime]:
    return datetime.combine(start, time.min), datetime.combine(end, time.max)


def _managers(db: Session, user: User, manager_id: int | None = None) -> list[User]:
    if not can_view_all(user):
        return [user]
    stmt = select(User).where(User.role == Role.manager.value, User.is_active.is_(True)).order_by(User.manager_number, User.full_name)
    if manager_id:
        stmt = stmt.where(User.id == manager_id)
    return db.scalars(stmt).all()


def _dead_status_condition():
    return or_(Status.name.ilike("Мертв%"), Status.name.ilike("Мёртв%"))


def _client_scope(user: User):
    stmt = select(Client).where(Client.deleted_at.is_(None))
    if not can_view_all(user):
        stmt = stmt.where(Client.manager_id == user.id)
    return stmt


COMMENT_REASON_RULES = [
    (
        "no_answer",
        "Автоответчик / не отвечают / недоступен",
        [
            "автоответ",
            "н.о",
            "н/о",
            "не отвечает",
            "не отвечают",
            "не ответил",
            "не ответили",
            "нет ответа",
            "не доступ",
            "недоступ",
            "абонент",
            "не дозвон",
            "не дозвони",
            "не берет",
            "не берут",
            "трубку не",
            "занято",
            "сбрасы",
            "тишина",
        ],
    ),
    (
        "not_buying",
        "Не закупают / нет потребности",
        [
            "не закуп",
            "не покуп",
            "нет потреб",
            "потребности нет",
            "не интересно",
            "не интерес",
            "не нужно",
            "не требуется",
            "не нуж",
            "нет заяв",
            "нет заказ",
        ],
    ),
    (
        "sells_metal",
        "Сами продают металл",
        [
            "сами прода",
            "сам прода",
            "продают металл",
            "продает металл",
            "продажа метал",
            "продаём металл",
            "продаем металл",
            "металлобаза",
            "конкурент",
        ],
    ),
    (
        "not_metal",
        "Не работают с металлом",
        [
            "не работ с метал",
            "не работают с метал",
            "не работает с метал",
            "не металл",
            "другой профиль",
            "не занимаются метал",
            "не занимается метал",
        ],
    ),
    (
        "email_only",
        "Слили в почту",
        [
            "в почту",
            "на почту",
            "скинуть почт",
            "скинуть на поч",
            "отправить на поч",
            "пишите на поч",
            "только почт",
        ],
    ),
]


def _comment_reason(text: str) -> tuple[str, str]:
    normalized = " ".join(text.casefold().replace("ё", "е").split())
    for key, label, patterns in COMMENT_REASON_RULES:
        if any(pattern.replace("ё", "е") in normalized for pattern in patterns):
            return key, label
    return "other", "Прочее"


def _dead_client_comment_reasons(db: Session, user: User, manager_id: int | None = None) -> dict:
    stmt = (
        select(Client)
        .options(joinedload(Client.comments), joinedload(Client.status), joinedload(Client.manager))
        .join(Status, Status.id == Client.status_id)
        .where(Client.deleted_at.is_(None), _dead_status_condition())
    )
    if can_view_all(user) and manager_id:
        stmt = stmt.where(Client.manager_id == manager_id)
    elif not can_view_all(user):
        stmt = stmt.where(Client.manager_id == user.id)
    clients = db.scalars(stmt).unique().all()
    buckets = {
        key: {"key": key, "label": label, "count": 0, "examples": []}
        for key, label, _ in COMMENT_REASON_RULES
    }
    buckets["other"] = {"key": "other", "label": "Прочее", "count": 0, "examples": []}
    clients_with_comments = 0

    for client in clients:
        comments = [comment.comment_text.strip() for comment in client.comments if comment.deleted_at is None and comment.comment_text.strip()]
        if not comments:
            continue
        clients_with_comments += 1
        combined_comment = " // ".join(comments[-3:])
        key, _ = _comment_reason(combined_comment)
        bucket = buckets[key]
        bucket["count"] += 1
        if len(bucket["examples"]) < 5:
            bucket["examples"].append({"company": client.company_name, "comment": combined_comment[:240]})

    reasons = sorted(buckets.values(), key=lambda item: item["count"], reverse=True)
    return {
        "total_dead_clients": len(clients),
        "clients_with_comments": clients_with_comments,
        "reasons": reasons,
    }


def _reports_by_manager(db: Session, manager_ids: list[int], start: date, end: date) -> dict[int, list[DailyReport]]:
    if not manager_ids:
        return {}
    reports = db.scalars(
        select(DailyReport).where(DailyReport.manager_id.in_(manager_ids), DailyReport.report_date >= start, DailyReport.report_date <= end)
    ).all()
    grouped: dict[int, list[DailyReport]] = {manager_id: [] for manager_id in manager_ids}
    for report in reports:
        grouped.setdefault(report.manager_id, []).append(report)
    return grouped


@router.get("/manager-quality")
def manager_quality(
    date_from: date | None = None,
    date_to: date | None = None,
    manager_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    start, end = _date_range(date_from, date_to)
    start_dt, end_dt = _range_datetimes(start, end)
    days = max(1, (end - start).days + 1)
    managers = _managers(db, user, manager_id)
    manager_ids = [manager.id for manager in managers]
    reports = _reports_by_manager(db, manager_ids, start, end)

    rows = []
    for manager in managers:
        client_stmt = select(Client).where(Client.deleted_at.is_(None), Client.manager_id == manager.id)
        clients_total = db.scalar(select(func.count()).select_from(client_stmt.subquery())) or 0
        overdue_clients = (
            db.scalar(select(func.count()).select_from(client_stmt.where(Client.next_call_date < date.today()).subquery())) or 0
        )
        without_comment = (
            db.scalar(
                select(func.count())
                .select_from(
                    client_stmt.where(
                        ~select(ClientComment.id)
                        .where(ClientComment.client_id == Client.id, ClientComment.deleted_at.is_(None))
                        .exists()
                    ).subquery()
                )
            )
            or 0
        )
        comments_count = (
            db.scalar(
                select(func.count(ClientComment.id))
                .join(Client, Client.id == ClientComment.client_id)
                .where(
                    Client.manager_id == manager.id,
                    Client.deleted_at.is_(None),
                    ClientComment.deleted_at.is_(None),
                    ClientComment.created_at >= start_dt,
                    ClientComment.created_at <= end_dt,
                )
            )
            or 0
        )
        task_total = db.scalar(select(func.count(Task.id)).where(Task.manager_id == manager.id)) or 0
        task_done = db.scalar(select(func.count(Task.id)).where(Task.manager_id == manager.id, Task.status == TaskStatus.done.value)) or 0
        task_overdue = (
            db.scalar(
                select(func.count(Task.id)).where(
                    Task.manager_id == manager.id,
                    Task.deadline < date.today(),
                    Task.status.notin_([TaskStatus.done.value, TaskStatus.canceled.value]),
                )
            )
            or 0
        )
        manager_reports = reports.get(manager.id, [])
        calls_total = sum(report_totals(report)["total_calls"] for report in manager_reports)
        reports_submitted = len({report.report_date for report in manager_reports})
        report_score = min(25, round((reports_submitted / days) * 25))
        task_score = 25 if task_total == 0 else round((task_done / task_total) * 25)
        calls_score = min(25, round((calls_total / max(1, days * 30)) * 25))
        cleanup_score = max(0, 25 - min(25, overdue_clients + task_overdue * 2))
        quality_score = max(0, min(100, report_score + task_score + calls_score + cleanup_score))
        rows.append(
            {
                "manager_id": manager.id,
                "login": manager.login,
                "full_name": manager.full_name,
                "manager_number": manager.manager_number,
                "quality_score": quality_score,
                "reports_submitted": reports_submitted,
                "period_days": days,
                "calls_total": calls_total,
                "comments_count": comments_count,
                "clients_total": clients_total,
                "without_comment": without_comment,
                "overdue_clients": overdue_clients,
                "task_total": task_total,
                "task_done": task_done,
                "task_overdue": task_overdue,
            }
        )
    return sorted(rows, key=lambda row: row["quality_score"], reverse=True)


@router.get("/refusals")
def refusal_analytics(
    date_from: date | None = None,
    date_to: date | None = None,
    manager_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    start, end = _date_range(date_from, date_to)
    managers = _managers(db, user, manager_id)
    manager_ids = [manager.id for manager in managers]
    reports = _reports_by_manager(db, manager_ids, start, end)
    reason_keys = [
        ("no_answer", "Не дозвон"),
        ("refusal", "Отказ / потрачено"),
        ("email", "Слили в почту"),
        ("not_metal", "Не работают с металлом"),
    ]
    totals = {key: 0 for key, _ in reason_keys}
    by_manager = []
    for manager in managers:
        manager_totals = {key: 0 for key, _ in reason_keys}
        for report in reports.get(manager.id, []):
            manager_totals["no_answer"] += report.calls_existing_no_answer_count + report.calls_new_no_answer_count
            manager_totals["refusal"] += report.calls_existing_refusal_count + report.calls_new_refusal_count
            manager_totals["email"] += report.calls_existing_email_count + report.calls_new_email_count
            manager_totals["not_metal"] += report.calls_existing_not_metal_count + report.calls_new_not_metal_count
        for key in totals:
            totals[key] += manager_totals[key]
        by_manager.append(
            {
                "manager_id": manager.id,
                "manager": manager.manager_number or manager.login,
                "full_name": manager.full_name,
                **manager_totals,
            }
        )
    total = sum(totals.values())
    reasons = [
        {"key": key, "label": label, "count": totals[key], "share": round((totals[key] / total) * 100, 1) if total else 0}
        for key, label in reason_keys
    ]
    return {
        "total": total,
        "reasons": reasons,
        "by_manager": by_manager,
        "comment_reasons": _dead_client_comment_reasons(db, user, manager_id),
    }


@router.get("/base-cleanup")
def base_cleanup(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    scope = _client_scope(user)
    total = db.scalar(select(func.count()).select_from(scope.subquery())) or 0
    no_phone = db.scalar(select(func.count()).select_from(scope.where(or_(Client.phone.is_(None), Client.phone == "")).subquery())) or 0
    no_email = db.scalar(select(func.count()).select_from(scope.where(or_(Client.email.is_(None), Client.email == "")).subquery())) or 0
    no_comment = (
        db.scalar(
            select(func.count())
            .select_from(
                scope.where(
                    ~select(ClientComment.id).where(ClientComment.client_id == Client.id, ClientComment.deleted_at.is_(None)).exists()
                ).subquery()
            )
        )
        or 0
    )
    dead_clients = (
        db.scalar(
            select(func.count(Client.id))
            .join(Status, Status.id == Client.status_id)
            .where(Client.deleted_at.is_(None), _dead_status_condition())
        )
        or 0
    )
    if not can_view_all(user):
        dead_clients = (
            db.scalar(
                select(func.count(Client.id))
                .join(Status, Status.id == Client.status_id)
                .where(Client.deleted_at.is_(None), Client.manager_id == user.id, _dead_status_condition())
            )
            or 0
        )

    def duplicates(column, label: str):
        conditions = [Client.deleted_at.is_(None), column.is_not(None), column != ""]
        if not can_view_all(user):
            conditions.append(Client.manager_id == user.id)
        rows = db.execute(
            select(column, func.count(Client.id))
            .where(and_(*conditions))
            .group_by(column)
            .having(func.count(Client.id) > 1)
            .order_by(func.count(Client.id).desc())
            .limit(12)
        ).all()
        return [{"type": label, "value": str(value), "count": count} for value, count in rows]

    duplicate_groups = [
        *duplicates(Client.normalized_company_name, "Компания"),
        *duplicates(Client.normalized_phone, "Телефон"),
        *duplicates(Client.email, "Почта"),
        *duplicates(Client.website_domain, "Сайт"),
    ][:30]
    imports = db.scalars(select(ImportJob).order_by(ImportJob.created_at.desc()).limit(8)).all() if can_view_all(user) else []
    return {
        "total_clients": total,
        "no_phone": no_phone,
        "no_email": no_email,
        "no_comment": no_comment,
        "dead_clients": dead_clients,
        "duplicate_groups_count": len(duplicate_groups),
        "duplicate_groups": duplicate_groups,
        "recent_imports": [
            {
                "id": item.id,
                "filename": item.filename,
                "total_rows": item.total_rows,
                "created_count": item.created_count,
                "duplicate_count": item.duplicate_count,
                "skipped_count": item.skipped_count,
                "error_count": item.error_count,
                "created_at": item.created_at,
            }
            for item in imports
        ],
    }


@router.post("/base-cleanup/normalize")
def normalize_contacts(
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(Role.admin, Role.director)),
):
    clients = db.scalars(select(Client).where(Client.deleted_at.is_(None))).all()
    changed = 0
    for client in clients:
        before = (client.normalized_phone, client.email, client.website, client.website_domain)
        client.normalized_phone = normalize_phone(client.phone)
        client.email = normalize_email(client.email)
        client.website, client.website_domain = normalize_website(client.website)
        after = (client.normalized_phone, client.email, client.website, client.website_domain)
        if before != after:
            changed += 1
    ip, agent = request_meta(request)
    write_audit(db, user, "normalize_base_contacts", "client", None, new_value={"changed": changed}, ip_address=ip, user_agent=agent)
    db.commit()
    return {"ok": True, "changed": changed}


@router.post("/base-cleanup/archive-dead")
def archive_dead_clients(
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(Role.admin, Role.director)),
):
    clients = db.scalars(
        select(Client).join(Status, Status.id == Client.status_id).where(Client.deleted_at.is_(None), _dead_status_condition())
    ).all()
    now = datetime.now(timezone.utc)
    for client in clients:
        client.deleted_at = now
    ip, agent = request_meta(request)
    write_audit(db, user, "archive_dead_clients", "client", None, new_value={"archived": len(clients)}, ip_address=ip, user_agent=agent)
    db.commit()
    return {"ok": True, "archived": len(clients)}


@router.get("/motivation")
def motivation(
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    start, end = _date_range(date_from, date_to)
    managers = _managers(db, user)
    manager_ids = [manager.id for manager in managers]
    reports = _reports_by_manager(db, manager_ids, start, end)
    quality_rows = {row["manager_id"]: row for row in manager_quality(start, end, None, db, user)}
    rows = []
    for manager in managers:
        manager_reports = reports.get(manager.id, [])
        calls = sum(report_totals(report)["total_calls"] for report in manager_reports)
        advertising = sum(report_totals(report)["advertising_total"] for report in manager_reports)
        invoices = sum(report.invoice_count for report in manager_reports)
        paid = sum(report.paid_invoice_count for report in manager_reports)
        reports_count = len({report.report_date for report in manager_reports})
        quality_score = quality_rows.get(manager.id, {}).get("quality_score", 0)
        points = calls + advertising * 2 + invoices * 8 + paid * 12 + reports_count * 5 + round(quality_score / 2)
        badges = []
        if calls:
            badges.append("Самый активный обзвон")
        if invoices:
            badges.append("Работа со счетами")
        if paid:
            badges.append("Довел до оплаты")
        if quality_score >= 80:
            badges.append("Качество 80+")
        rows.append(
            {
                "manager_id": manager.id,
                "login": manager.login,
                "full_name": manager.full_name,
                "manager_number": manager.manager_number,
                "points": points,
                "calls": calls,
                "advertising": advertising,
                "invoices": invoices,
                "paid": paid,
                "reports_count": reports_count,
                "quality_score": quality_score,
                "badges": badges[:3],
            }
        )
    rows = sorted(rows, key=lambda row: row["points"], reverse=True)
    for index, row in enumerate(rows, start=1):
        row["place"] = index
    return rows
