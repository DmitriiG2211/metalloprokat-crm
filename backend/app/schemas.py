from __future__ import annotations

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class QuickLoginRequest(BaseModel):
    login: str


class UserBase(BaseModel):
    login: str
    full_name: str
    role: str
    manager_number: str | None = None
    is_active: bool = True


class UserCreate(UserBase):
    password: str = Field(min_length=4)


class UserUpdate(BaseModel):
    full_name: str | None = None
    role: str | None = None
    manager_number: str | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=4)


class UserRead(UserBase):
    id: int
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class StatusBase(BaseModel):
    name: str
    color: str = "#E9ECEF"
    sort_order: int = 100
    is_active: bool = True


class StatusCreate(StatusBase):
    pass


class StatusUpdate(BaseModel):
    name: str | None = None
    color: str | None = None
    sort_order: int | None = None
    is_active: bool | None = None


class StatusRead(StatusBase):
    id: int
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class ClientBase(BaseModel):
    company_name: str
    contact_person: str | None = None
    phone: str | None = None
    email: str | None = None
    website: str | None = None
    status_id: int | None = None
    last_call_date: date | None = None
    next_call_date: date | None = None


class ClientCreate(ClientBase):
    manager_id: int | None = None
    comment: str | None = None


class ClientUpdate(BaseModel):
    manager_id: int | None = None
    company_name: str | None = None
    contact_person: str | None = None
    phone: str | None = None
    email: str | None = None
    website: str | None = None
    status_id: int | None = None
    last_call_date: date | None = None
    next_call_date: date | None = None


class UserTiny(BaseModel):
    id: int
    login: str
    full_name: str
    manager_number: str | None = None
    model_config = ConfigDict(from_attributes=True)


class StatusTiny(BaseModel):
    id: int
    name: str
    color: str
    model_config = ConfigDict(from_attributes=True)


class ClientRead(ClientBase):
    id: int
    manager_id: int
    normalized_phone: str | None = None
    website_domain: str | None = None
    manager: UserTiny | None = None
    status: StatusTiny | None = None
    last_comment: str | None = None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel):
    items: list[Any]
    total: int
    page: int
    page_size: int


class CommentCreate(BaseModel):
    comment_text: str = Field(min_length=1)


class CommentRead(BaseModel):
    id: int
    client_id: int
    author_id: int
    comment_text: str
    created_at: datetime
    author: UserTiny | None = None
    model_config = ConfigDict(from_attributes=True)


class TaskBase(BaseModel):
    client_id: int | None = None
    manager_id: int
    title: str
    description: str | None = None
    deadline: date | None = None
    priority: str = "normal"
    status: str = "new"
    manager_comment: str | None = None


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    client_id: int | None = None
    manager_id: int | None = None
    title: str | None = None
    description: str | None = None
    deadline: date | None = None
    priority: str | None = None
    status: str | None = None
    manager_comment: str | None = None


class TaskRead(TaskBase):
    id: int
    creator_id: int
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    client: ClientRead | None = None
    manager: UserTiny | None = None
    creator: UserTiny | None = None
    model_config = ConfigDict(from_attributes=True)


class DailyReportBase(BaseModel):
    report_date: date
    advertising_city_phone_count: int = Field(default=0, ge=0)
    advertising_city_phone_comment: str | None = None
    advertising_avito_count: int = Field(default=0, ge=0)
    advertising_avito_comment: str | None = None
    calls_existing_count: int = Field(default=0, ge=0)
    calls_existing_no_answer_count: int = Field(default=0, ge=0)
    calls_existing_refusal_count: int = Field(default=0, ge=0)
    calls_existing_email_count: int = Field(default=0, ge=0)
    calls_existing_not_metal_count: int = Field(default=0, ge=0)
    calls_new_count: int = Field(default=0, ge=0)
    calls_new_no_answer_count: int = Field(default=0, ge=0)
    calls_new_refusal_count: int = Field(default=0, ge=0)
    calls_new_email_count: int = Field(default=0, ge=0)
    calls_new_not_metal_count: int = Field(default=0, ge=0)
    calls_regular_count: int = Field(default=0, ge=0)
    invoice_count: int = Field(default=0, ge=0)
    invoice_numbers: str | None = None
    paid_invoice_count: int = Field(default=0, ge=0)
    paid_invoice_numbers: str | None = None
    requests_received_count: int = Field(default=0, ge=0)
    request_numbers: str | None = None
    invoices_pending_payment_count: int = Field(default=0, ge=0)
    invoices_pending_payment_numbers: str | None = None
    unpaid_invoice_count: int = Field(default=0, ge=0)
    unpaid_invoice_numbers: str | None = None
    invoices_in_work_count: int = Field(default=0, ge=0)
    invoices_in_work_numbers: str | None = None
    note: str | None = None


class DailyReportUpsert(DailyReportBase):
    pass


class DailyReportRead(DailyReportBase):
    id: int
    manager_id: int
    manager: UserTiny | None = None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class DailyReportSummaryRow(BaseModel):
    manager_id: int
    login: str
    full_name: str
    manager_number: str | None = None
    reports_count: int
    total_calls: int
    calls_existing: int
    calls_new: int
    calls_regular: int
    total_no_answer: int
    total_refusals: int
    total_email_followups: int
    total_not_metal: int
    advertising_total: int
    accounts_total: int
    invoice_count: int
    paid_invoice_count: int
    requests_received_count: int
    invoices_pending_payment_count: int
    unpaid_invoice_count: int
    invoices_in_work_count: int


class TransferCreate(BaseModel):
    new_manager_id: int
    reason: str


class ImportPreview(BaseModel):
    filename: str
    columns: list[str]
    mapping: dict[str, str | None]
    preview_rows: list[dict[str, Any]]
    total_rows: int


class ImportResult(BaseModel):
    import_id: int
    total_rows: int
    created_count: int
    updated_count: int
    skipped_count: int
    duplicate_count: int
    error_count: int


class AuditRead(BaseModel):
    id: int
    user_id: int | None
    action: str
    entity_type: str
    entity_id: int | None
    old_value: dict | None
    new_value: dict | None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
