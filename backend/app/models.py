from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.database import Base


class Role(StrEnum):
    admin = "admin"
    director = "director"
    senior_manager = "senior_manager"
    manager = "manager"


class TaskStatus(StrEnum):
    new = "new"
    in_progress = "in_progress"
    done = "done"
    canceled = "canceled"


class TaskPriority(StrEnum):
    low = "low"
    normal = "normal"
    high = "high"
    urgent = "urgent"


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    login: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(40), index=True)
    manager_number: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    clients: Mapped[list[Client]] = relationship(back_populates="manager", foreign_keys="Client.manager_id")


class Status(Base, TimestampMixin):
    __tablename__ = "statuses"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    color: Mapped[str] = mapped_column(String(20), default="#E9ECEF")
    sort_order: Mapped[int] = mapped_column(Integer, default=100)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Client(Base, TimestampMixin):
    __tablename__ = "clients"

    id: Mapped[int] = mapped_column(primary_key=True)
    manager_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    company_name: Mapped[str] = mapped_column(String(500), index=True)
    normalized_company_name: Mapped[str] = mapped_column(String(500), index=True)
    contact_person: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(Text, nullable=True)
    normalized_phone: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    email: Mapped[str | None] = mapped_column(Text, nullable=True, index=True)
    website: Mapped[str | None] = mapped_column(Text, nullable=True)
    website_domain: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    status_id: Mapped[int | None] = mapped_column(ForeignKey("statuses.id"), nullable=True, index=True)
    last_call_date: Mapped[datetime | None] = mapped_column(Date, nullable=True, index=True)
    next_call_date: Mapped[datetime | None] = mapped_column(Date, nullable=True, index=True)
    source_import_id: Mapped[int | None] = mapped_column(ForeignKey("imports.id"), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    manager: Mapped[User] = relationship(foreign_keys=[manager_id], back_populates="clients")
    status: Mapped[Status | None] = relationship()
    comments: Mapped[list[ClientComment]] = relationship(back_populates="client", cascade="all, delete-orphan")


class ClientComment(Base):
    __tablename__ = "client_comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"), index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    comment_text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    client: Mapped[Client] = relationship(back_populates="comments")
    author: Mapped[User] = relationship()


class Task(Base, TimestampMixin):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int | None] = mapped_column(ForeignKey("clients.id"), nullable=True)
    manager_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    creator_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    deadline: Mapped[datetime | None] = mapped_column(Date, nullable=True, index=True)
    priority: Mapped[str] = mapped_column(String(30), default=TaskPriority.normal.value)
    status: Mapped[str] = mapped_column(String(30), default=TaskStatus.new.value, index=True)
    manager_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    client: Mapped[Client | None] = relationship()
    manager: Mapped[User] = relationship(foreign_keys=[manager_id])
    creator: Mapped[User] = relationship(foreign_keys=[creator_id])


class DailyReport(Base, TimestampMixin):
    __tablename__ = "daily_reports"
    __table_args__ = (UniqueConstraint("manager_id", "report_date", name="uq_daily_reports_manager_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    manager_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    report_date: Mapped[date] = mapped_column(Date, index=True)

    advertising_city_phone_count: Mapped[int] = mapped_column(Integer, default=0)
    advertising_city_phone_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    advertising_avito_count: Mapped[int] = mapped_column(Integer, default=0)
    advertising_avito_comment: Mapped[str | None] = mapped_column(Text, nullable=True)

    calls_existing_count: Mapped[int] = mapped_column(Integer, default=0)
    calls_existing_no_answer_count: Mapped[int] = mapped_column(Integer, default=0)
    calls_existing_refusal_count: Mapped[int] = mapped_column(Integer, default=0)
    calls_existing_email_count: Mapped[int] = mapped_column(Integer, default=0)
    calls_existing_not_metal_count: Mapped[int] = mapped_column(Integer, default=0)

    calls_new_count: Mapped[int] = mapped_column(Integer, default=0)
    calls_new_no_answer_count: Mapped[int] = mapped_column(Integer, default=0)
    calls_new_refusal_count: Mapped[int] = mapped_column(Integer, default=0)
    calls_new_email_count: Mapped[int] = mapped_column(Integer, default=0)
    calls_new_not_metal_count: Mapped[int] = mapped_column(Integer, default=0)
    calls_regular_count: Mapped[int] = mapped_column(Integer, default=0)

    invoice_count: Mapped[int] = mapped_column(Integer, default=0)
    invoice_numbers: Mapped[str | None] = mapped_column(Text, nullable=True)
    paid_invoice_count: Mapped[int] = mapped_column(Integer, default=0)
    paid_invoice_numbers: Mapped[str | None] = mapped_column(Text, nullable=True)
    requests_received_count: Mapped[int] = mapped_column(Integer, default=0)
    request_numbers: Mapped[str | None] = mapped_column(Text, nullable=True)
    invoices_pending_payment_count: Mapped[int] = mapped_column(Integer, default=0)
    invoices_pending_payment_numbers: Mapped[str | None] = mapped_column(Text, nullable=True)
    unpaid_invoice_count: Mapped[int] = mapped_column(Integer, default=0)
    unpaid_invoice_numbers: Mapped[str | None] = mapped_column(Text, nullable=True)
    invoices_in_work_count: Mapped[int] = mapped_column(Integer, default=0)
    invoices_in_work_numbers: Mapped[str | None] = mapped_column(Text, nullable=True)

    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    manager: Mapped[User] = relationship(foreign_keys=[manager_id])


class ImportJob(Base):
    __tablename__ = "imports"

    id: Mapped[int] = mapped_column(primary_key=True)
    filename: Mapped[str] = mapped_column(String(255))
    uploaded_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    assigned_manager_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    total_rows: Mapped[int] = mapped_column(Integer, default=0)
    created_count: Mapped[int] = mapped_column(Integer, default=0)
    updated_count: Mapped[int] = mapped_column(Integer, default=0)
    skipped_count: Mapped[int] = mapped_column(Integer, default=0)
    duplicate_count: Mapped[int] = mapped_column(Integer, default=0)
    error_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(40), default="done")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ImportError(Base):
    __tablename__ = "import_errors"

    id: Mapped[int] = mapped_column(primary_key=True)
    import_id: Mapped[int] = mapped_column(ForeignKey("imports.id"), index=True)
    row_number: Mapped[int] = mapped_column(Integer)
    error_text: Mapped[str] = mapped_column(Text)
    raw_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Transfer(Base):
    __tablename__ = "transfers"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"), index=True)
    old_manager_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    new_manager_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    transferred_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    reason: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(120), index=True)
    entity_type: Mapped[str] = mapped_column(String(80))
    entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    old_value: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    new_value: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(80), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class Setting(Base):
    __tablename__ = "settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(120), unique=True)
    value: Mapped[str] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


Index("ix_clients_manager_status_next_call", Client.manager_id, Client.status_id, Client.next_call_date)
Index("ix_tasks_manager_status_deadline", Task.manager_id, Task.status, Task.deadline)
Index("ix_daily_reports_manager_date", DailyReport.manager_id, DailyReport.report_date)
