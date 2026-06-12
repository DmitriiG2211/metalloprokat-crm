"""post MVP schema and import rollback

Revision ID: 0002_import_rollback
Revises: 0001_initial
Create Date: 2026-06-12
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "0002_import_rollback"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _has_table(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _has_column(table: str, column: str) -> bool:
    if not _has_table(table):
        return False
    return column in {item["name"] for item in inspect(op.get_bind()).get_columns(table)}


def _add_column_if_missing(table: str, column: sa.Column) -> None:
    if not _has_column(table, column.name):
        op.add_column(table, column)


def _create_index_if_missing(name: str, table: str, columns: list[str]) -> None:
    if not _has_table(table):
        return
    indexes = {item["name"] for item in inspect(op.get_bind()).get_indexes(table)}
    if name not in indexes:
        op.create_index(name, table, columns)


def upgrade() -> None:
    if _has_table("imports"):
        _add_column_if_missing("imports", sa.Column("rolled_back_at", sa.DateTime(timezone=True), nullable=True))
        _add_column_if_missing("imports", sa.Column("rolled_back_by", sa.Integer(), nullable=True))
        _add_column_if_missing("imports", sa.Column("rollback_note", sa.Text(), nullable=True))

    if not _has_table("daily_reports"):
        op.create_table(
            "daily_reports",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("manager_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("report_date", sa.Date(), nullable=False),
            sa.Column("advertising_city_phone_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("advertising_city_phone_comment", sa.Text(), nullable=True),
            sa.Column("advertising_avito_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("advertising_avito_comment", sa.Text(), nullable=True),
            sa.Column("calls_existing_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("calls_existing_no_answer_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("calls_existing_refusal_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("calls_existing_email_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("calls_existing_not_metal_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("calls_new_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("calls_new_no_answer_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("calls_new_refusal_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("calls_new_email_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("calls_new_not_metal_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("calls_regular_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("invoice_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("invoice_numbers", sa.Text(), nullable=True),
            sa.Column("paid_invoice_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("paid_invoice_numbers", sa.Text(), nullable=True),
            sa.Column("requests_received_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("request_numbers", sa.Text(), nullable=True),
            sa.Column("invoices_pending_payment_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("invoices_pending_payment_numbers", sa.Text(), nullable=True),
            sa.Column("unpaid_invoice_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("unpaid_invoice_numbers", sa.Text(), nullable=True),
            sa.Column("invoices_in_work_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("invoices_in_work_numbers", sa.Text(), nullable=True),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.UniqueConstraint("manager_id", "report_date", name="uq_daily_reports_manager_date"),
        )
    else:
        _add_column_if_missing("daily_reports", sa.Column("invoices_pending_payment_count", sa.Integer(), nullable=False, server_default="0"))
        _add_column_if_missing("daily_reports", sa.Column("invoices_pending_payment_numbers", sa.Text(), nullable=True))
        _add_column_if_missing("daily_reports", sa.Column("unpaid_invoice_count", sa.Integer(), nullable=False, server_default="0"))
        _add_column_if_missing("daily_reports", sa.Column("unpaid_invoice_numbers", sa.Text(), nullable=True))
        _add_column_if_missing("daily_reports", sa.Column("invoices_in_work_count", sa.Integer(), nullable=False, server_default="0"))
        _add_column_if_missing("daily_reports", sa.Column("invoices_in_work_numbers", sa.Text(), nullable=True))
    _create_index_if_missing("ix_daily_reports_manager_date", "daily_reports", ["manager_id", "report_date"])

    if not _has_table("kanban_requests"):
        op.create_table(
            "kanban_requests",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("company_name", sa.String(500), nullable=False),
            sa.Column("contact_person", sa.String(255), nullable=True),
            sa.Column("phone", sa.Text(), nullable=True),
            sa.Column("email", sa.Text(), nullable=True),
            sa.Column("subject", sa.String(500), nullable=True),
            sa.Column("comment", sa.Text(), nullable=True),
            sa.Column("nomenclature", sa.Text(), nullable=True),
            sa.Column("source", sa.String(40), nullable=False, server_default="phone"),
            sa.Column("status", sa.String(40), nullable=False, server_default="new"),
            sa.Column("manager_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("creator_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("message_id", sa.String(500), nullable=True, unique=True),
            sa.Column("received_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    _create_index_if_missing("ix_kanban_requests_company_name", "kanban_requests", ["company_name"])
    _create_index_if_missing("ix_kanban_requests_email", "kanban_requests", ["email"])
    _create_index_if_missing("ix_kanban_requests_source", "kanban_requests", ["source"])
    _create_index_if_missing("ix_kanban_requests_status", "kanban_requests", ["status"])
    _create_index_if_missing("ix_kanban_requests_manager_id", "kanban_requests", ["manager_id"])
    _create_index_if_missing("ix_kanban_requests_received_at", "kanban_requests", ["received_at"])
    _create_index_if_missing("ix_kanban_requests_archived_at", "kanban_requests", ["archived_at"])
    _create_index_if_missing("ix_kanban_status_archived", "kanban_requests", ["status", "archived_at"])

    if not _has_table("supplier_blacklist"):
        op.create_table(
            "supplier_blacklist",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("supplier_name", sa.String(500), nullable=False),
            sa.Column("email", sa.String(255), nullable=True),
            sa.Column("domain", sa.String(255), nullable=True),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    _create_index_if_missing("ix_supplier_blacklist_supplier_name", "supplier_blacklist", ["supplier_name"])
    _create_index_if_missing("ix_supplier_blacklist_email", "supplier_blacklist", ["email"])
    _create_index_if_missing("ix_supplier_blacklist_domain", "supplier_blacklist", ["domain"])

    if not _has_table("import_client_changes"):
        op.create_table(
            "import_client_changes",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("import_id", sa.Integer(), sa.ForeignKey("imports.id"), nullable=False),
            sa.Column("client_id", sa.Integer(), sa.ForeignKey("clients.id"), nullable=True),
            sa.Column("action", sa.String(40), nullable=False),
            sa.Column("old_data", sa.JSON(), nullable=True),
            sa.Column("new_data", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    _create_index_if_missing("ix_import_client_changes_import_id", "import_client_changes", ["import_id"])
    _create_index_if_missing("ix_import_client_changes_client_id", "import_client_changes", ["client_id"])
    _create_index_if_missing("ix_import_client_changes_action", "import_client_changes", ["action"])
    _create_index_if_missing("ix_import_client_changes_import_action", "import_client_changes", ["import_id", "action"])


def downgrade() -> None:
    if _has_table("import_client_changes"):
        op.drop_table("import_client_changes")
    if _has_column("imports", "rollback_note"):
        op.drop_column("imports", "rollback_note")
    if _has_column("imports", "rolled_back_by"):
        op.drop_column("imports", "rolled_back_by")
    if _has_column("imports", "rolled_back_at"):
        op.drop_column("imports", "rolled_back_at")
