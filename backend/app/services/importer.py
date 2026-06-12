from __future__ import annotations

from io import BytesIO
from typing import Any

import pandas as pd
from fastapi import HTTPException, UploadFile
from openpyxl import load_workbook
from openpyxl.styles.colors import COLOR_INDEX
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import Client, ClientComment, ImportClientChange, ImportError, ImportJob, Status, User
from app.services.audit import write_audit
from app.utils.normalization import normalize_company, normalize_email, normalize_phone, normalize_website, parse_date


FIELD_ALIASES = {
    "company_name": [
        "компания",
        "название компании",
        "организация",
        "наименование",
        "клиент",
        "наименование организации",
        "company",
        "company name",
        "organization",
        "client",
    ],
    "contact_person": ["фио", "контактное лицо", "представитель", "имя", "фио клиента"],
    "phone": ["телефон", "номер телефона", "мобильный", "контактный телефон", "phone"],
    "email": ["почта", "email", "e-mail", "электронная почта", "mail"],
    "website": ["сайт", "website", "url", "ссылка", "ссылка на сайт"],
    "comment": ["комментарий", "итог звонка", "примечание", "заметка", "результат", "comment", "note", "result"],
    "last_call_date": ["дата звонка", "последний звонок", "когда звонили", "дата первичного звонка", "дата повторного звонка"],
    "next_call_date": ["дата перезвона", "перезвонить", "следующий звонок", "дата следующего звонка"],
}


def _read_dataframe(raw: bytes, name: str) -> pd.DataFrame:
    try:
        if name.endswith(".csv"):
            try:
                return pd.read_csv(BytesIO(raw), dtype=object)
            except UnicodeDecodeError:
                return pd.read_csv(BytesIO(raw), dtype=object, encoding="cp1251")
        if name.endswith((".xlsx", ".xls")):
            return pd.read_excel(BytesIO(raw), dtype=object)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Не удалось прочитать файл: {exc}") from exc
    raise HTTPException(status_code=400, detail="Поддерживаются только .xlsx, .xls и .csv")


def _cell_rgb(cell) -> str | None:
    fill = cell.fill
    color = fill.fgColor if fill and fill.fill_type else None
    if not color:
        return None
    if color.type == "rgb" and color.rgb:
        rgb = str(color.rgb)[-6:].upper()
    elif color.type == "indexed" and color.indexed is not None and color.indexed < len(COLOR_INDEX):
        rgb = str(COLOR_INDEX[color.indexed])[-6:].upper()
    else:
        return None
    if rgb in {"000000", "FFFFFF"}:
        return None
    return rgb


def _status_from_rgb(rgb: str | None) -> str | None:
    if not rgb or len(rgb) != 6:
        return None
    red = int(rgb[0:2], 16)
    green = int(rgb[2:4], 16)
    blue = int(rgb[4:6], 16)
    if red >= 220 and green <= 215 and blue <= 220:
        return "Мертвый"
    if red >= 220 and green >= 180 and blue <= 210:
        return "50/50"
    if green >= 150 and green >= red + 15 and green >= blue + 15:
        return "Контактный"
    return None


def _detect_row_statuses(raw: bytes, name: str) -> dict[int, str]:
    if not name.endswith((".xlsx", ".xlsm")):
        return {}
    statuses: dict[int, str] = {}
    try:
        workbook = load_workbook(BytesIO(raw), data_only=True, read_only=False)
    except Exception:
        return statuses
    sheet = workbook.active
    priority = {"Мертвый": 3, "50/50": 2, "Контактный": 1}
    for row in sheet.iter_rows(min_row=2):
        row_scores: dict[str, int] = {}
        for cell in row:
            status = _status_from_rgb(_cell_rgb(cell))
            if status:
                row_scores[status] = row_scores.get(status, 0) + 1
        if row_scores:
            statuses[row[0].row] = max(row_scores, key=lambda status: (row_scores[status], priority[status]))
    return statuses


async def read_upload(file: UploadFile) -> pd.DataFrame:
    raw = await file.read()
    name = (file.filename or "").lower()
    return _read_dataframe(raw, name)


async def read_upload_with_row_statuses(file: UploadFile) -> tuple[pd.DataFrame, dict[int, str]]:
    raw = await file.read()
    name = (file.filename or "").lower()
    return _read_dataframe(raw, name), _detect_row_statuses(raw, name)


def detect_mapping(columns: list[str]) -> dict[str, str | None]:
    normalized_columns = {str(column).strip().lower(): column for column in columns}
    mapping: dict[str, str | None] = {}
    for field, aliases in FIELD_ALIASES.items():
        found = None
        for alias in aliases:
            if alias in normalized_columns:
                found = normalized_columns[alias]
                break
        if not found:
            for normalized, original in normalized_columns.items():
                if any(alias in normalized for alias in aliases):
                    found = original
                    break
        mapping[field] = found
    return mapping


def preview_dataframe(df: pd.DataFrame, filename: str) -> dict[str, Any]:
    df = df.dropna(how="all")
    return {
        "filename": filename,
        "columns": [str(column) for column in df.columns],
        "mapping": detect_mapping([str(column) for column in df.columns]),
        "preview_rows": df.head(20).where(pd.notnull(df), None).to_dict(orient="records"),
        "total_rows": int(len(df)),
    }


def _get_value(row: pd.Series, mapping: dict[str, str | None], field: str):
    column = mapping.get(field)
    if not column or column not in row:
        return None
    value = row[column]
    if pd.isna(value):
        return None
    return value


def find_duplicate(db: Session, company_name: str, phone: str | None, email: str | None, domain: str | None) -> Client | None:
    normalized_company = normalize_company(company_name)
    conditions = [Client.normalized_company_name == normalized_company]
    if phone:
        conditions.append(Client.normalized_phone == phone)
    if email:
        first_email = email.splitlines()[0].lower()
        conditions.append(Client.email.ilike(f"%{first_email}%"))
    if domain:
        conditions.append(Client.website_domain == domain)
    return db.scalars(select(Client).where(Client.deleted_at.is_(None), or_(*conditions))).first()


def _safe_raw_data(row: pd.Series) -> dict[str, str | None]:
    raw_data: dict[str, str | None] = {}
    for key, value in row.to_dict().items():
        raw_data[str(key)] = None if pd.isna(value) else str(value)
    return raw_data


def _existing_client_keys(db: Session) -> tuple[set[str], set[str], set[str], set[str]]:
    rows = db.execute(
        select(Client.normalized_company_name, Client.normalized_phone, Client.email, Client.website_domain).where(Client.deleted_at.is_(None))
    ).all()
    companies: set[str] = set()
    phones: set[str] = set()
    emails: set[str] = set()
    domains: set[str] = set()
    for company, phone, email, domain in rows:
        if company:
            companies.add(company)
        if phone:
            phones.add(phone)
        if email:
            first_email = str(email).splitlines()[0].lower()
            if first_email:
                emails.add(first_email)
        if domain:
            domains.add(domain)
    return companies, phones, emails, domains


def import_dataframe(
    db: Session,
    df: pd.DataFrame,
    filename: str,
    uploaded_by: User,
    assigned_manager_id: int,
    mapping: dict[str, str | None] | None = None,
    row_statuses: dict[int, str] | None = None,
) -> ImportJob:
    mapping = mapping or detect_mapping([str(column) for column in df.columns])
    default_status = db.scalars(select(Status).where(Status.is_active.is_(True)).order_by(Status.sort_order)).first()
    status_ids = {status.name.casefold(): status.id for status in db.scalars(select(Status).where(Status.is_active.is_(True))).all()}
    row_statuses = row_statuses or {}
    job = ImportJob(filename=filename, uploaded_by=uploaded_by.id, assigned_manager_id=assigned_manager_id, status="running")
    db.add(job)
    db.flush()

    df = df.dropna(how="all")
    job.total_rows = int(len(df))
    existing_companies, existing_phones, existing_emails, existing_domains = _existing_client_keys(db)
    pending_companies: set[str] = set()
    pending_phones: set[str] = set()
    pending_emails: set[str] = set()
    pending_domains: set[str] = set()

    for index, row in df.iterrows():
        row_number = int(index) + 2
        company = _get_value(row, mapping, "company_name")
        phone_raw = _get_value(row, mapping, "phone")
        if not company and not phone_raw:
            job.skipped_count += 1
            db.add(ImportError(import_id=job.id, row_number=row_number, error_text="Нет названия компании и телефона", raw_data=_safe_raw_data(row)))
            continue

        company_name = str(company or "Без названия").strip()
        normalized_company = normalize_company(company_name)
        phone = str(phone_raw).strip() if phone_raw else None
        normalized_phone = normalize_phone(phone)
        email = normalize_email(_get_value(row, mapping, "email"))
        first_email = email.splitlines()[0].lower() if email else None
        website, domain = normalize_website(_get_value(row, mapping, "website"))
        duplicate = (
            normalized_company in existing_companies
            or normalized_company in pending_companies
            or (normalized_phone and (normalized_phone in existing_phones or normalized_phone in pending_phones))
            or (first_email and (first_email in existing_emails or first_email in pending_emails))
            or (domain and (domain in existing_domains or domain in pending_domains))
        )
        if duplicate:
            job.duplicate_count += 1
            job.skipped_count += 1
            continue
        row_status_name = row_statuses.get(row_number)
        row_status_id = status_ids.get(row_status_name.casefold()) if row_status_name else None

        client = Client(
            manager_id=assigned_manager_id,
            company_name=company_name,
            normalized_company_name=normalized_company,
            contact_person=str(_get_value(row, mapping, "contact_person") or "").strip() or None,
            phone=phone,
            normalized_phone=normalized_phone,
            email=email,
            website=website,
            website_domain=domain,
            status_id=row_status_id or (default_status.id if default_status else None),
            last_call_date=parse_date(_get_value(row, mapping, "last_call_date")),
            next_call_date=parse_date(_get_value(row, mapping, "next_call_date")),
            source_import_id=job.id,
        )
        db.add(client)
        db.flush()
        db.add(
            ImportClientChange(
                import_id=job.id,
                client_id=client.id,
                action="created",
                new_data={
                    "company_name": client.company_name,
                    "phone": client.phone,
                    "email": client.email,
                    "website": client.website,
                    "status_id": client.status_id,
                },
            )
        )
        pending_companies.add(normalized_company)
        if normalized_phone:
            pending_phones.add(normalized_phone)
        if first_email:
            pending_emails.add(first_email)
        if domain:
            pending_domains.add(domain)

        comment = _get_value(row, mapping, "comment")
        if comment:
            db.add(ClientComment(client=client, author_id=uploaded_by.id, comment_text=str(comment).strip()))
        job.created_count += 1

    job.status = "done"
    job.error_count = len(db.scalars(select(ImportError).where(ImportError.import_id == job.id)).all())
    write_audit(db, uploaded_by, "import_excel", "import", job.id, new_value={"filename": filename, "created": job.created_count})
    return job
