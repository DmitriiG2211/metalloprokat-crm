from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def uid() -> str:
    return str(uuid.uuid4())


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Organization(TimestampMixin, Base):
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    legal_notice_acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)


class Role(TimestampMixin, Base):
    __tablename__ = "roles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    name: Mapped[str] = mapped_column(String(64), nullable=False)


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(64), default="manager")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class ManagerProfile(TimestampMixin, Base):
    __tablename__ = "manager_profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    phone_extension: Mapped[str | None] = mapped_column(String(64), nullable=True)
    department: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class UploadBatch(TimestampMixin, Base):
    __tablename__ = "upload_batches"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String(255))
    period_start: Mapped[str | None] = mapped_column(String(32), nullable=True)
    period_end: Mapped[str | None] = mapped_column(String(32), nullable=True)
    department: Mapped[str | None] = mapped_column(String(255), nullable=True)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(64), default="uploaded", index=True)
    total_files: Mapped[int] = mapped_column(Integer, default=0)
    completed_files: Mapped[int] = mapped_column(Integer, default=0)
    warning_files: Mapped[int] = mapped_column(Integer, default=0)
    failed_files: Mapped[int] = mapped_column(Integer, default=0)

    calls: Mapped[list["Call"]] = relationship(back_populates="batch")


class Call(TimestampMixin, Base):
    __tablename__ = "calls"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    batch_id: Mapped[str] = mapped_column(ForeignKey("upload_batches.id"), index=True)
    manager_id: Mapped[str | None] = mapped_column(ForeignKey("manager_profiles.id"), nullable=True, index=True)
    client_phone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    client_company: Mapped[str | None] = mapped_column(String(255), nullable=True)
    call_date: Mapped[str | None] = mapped_column(String(64), nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    external_call_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(64), default="uploaded", index=True)
    outcome: Mapped[str | None] = mapped_column(String(128), nullable=True)
    overall_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    transcript_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    analysis_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)

    batch: Mapped[UploadBatch] = relationship(back_populates="calls")
    file: Mapped["CallFile"] = relationship(back_populates="call", uselist=False)
    transcript: Mapped["Transcript"] = relationship(back_populates="call", uselist=False)
    analysis: Mapped["AnalysisResult"] = relationship(back_populates="call", uselist=False)


class CallFile(TimestampMixin, Base):
    __tablename__ = "call_files"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    call_id: Mapped[str] = mapped_column(ForeignKey("calls.id"), index=True)
    original_filename: Mapped[str] = mapped_column(String(512))
    stored_path: Mapped[str] = mapped_column(Text)
    mime_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    sha256: Mapped[str] = mapped_column(String(64), index=True)

    call: Mapped[Call] = relationship(back_populates="file")


class CallMetadata(TimestampMixin, Base):
    __tablename__ = "call_metadata"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    call_id: Mapped[str] = mapped_column(ForeignKey("calls.id"), index=True)
    data: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class Transcript(TimestampMixin, Base):
    __tablename__ = "transcripts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    call_id: Mapped[str] = mapped_column(ForeignKey("calls.id"), index=True)
    provider: Mapped[str] = mapped_column(String(128))
    language: Mapped[str] = mapped_column(String(16), default="ru")
    text: Mapped[str] = mapped_column(Text)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    technical_info: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    call: Mapped[Call] = relationship(back_populates="transcript")
    segments: Mapped[list["TranscriptSegment"]] = relationship(back_populates="transcript")


class TranscriptSegment(TimestampMixin, Base):
    __tablename__ = "transcript_segments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    transcript_id: Mapped[str] = mapped_column(ForeignKey("transcripts.id"), index=True)
    speaker: Mapped[str] = mapped_column(String(64), default="Speaker 1")
    role: Mapped[str | None] = mapped_column(String(64), nullable=True)
    start_ms: Mapped[int] = mapped_column(Integer, default=0)
    end_ms: Mapped[int] = mapped_column(Integer, default=0)
    text: Mapped[str] = mapped_column(Text)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)

    transcript: Mapped[Transcript] = relationship(back_populates="segments")


class AnalysisRun(TimestampMixin, Base):
    __tablename__ = "analysis_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    call_id: Mapped[str] = mapped_column(ForeignKey("calls.id"), index=True)
    provider: Mapped[str] = mapped_column(String(128))
    prompt_version: Mapped[str] = mapped_column(String(64), default="v1")
    status: Mapped[str] = mapped_column(String(64), default="queued")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)


class AnalysisResult(TimestampMixin, Base):
    __tablename__ = "analysis_results"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    call_id: Mapped[str] = mapped_column(ForeignKey("calls.id"), index=True)
    analysis_run_id: Mapped[str | None] = mapped_column(ForeignKey("analysis_runs.id"), nullable=True)
    summary: Mapped[str] = mapped_column(Text)
    outcome: Mapped[str] = mapped_column(String(128))
    overall_score: Mapped[float] = mapped_column(Float)
    strengths: Mapped[list[str]] = mapped_column(JSON, default=list)
    weaknesses: Mapped[list[str]] = mapped_column(JSON, default=list)
    recommendations: Mapped[list[str]] = mapped_column(JSON, default=list)
    evidence: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    raw_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    is_manually_corrected: Mapped[bool] = mapped_column(Boolean, default=False)

    call: Mapped[Call] = relationship(back_populates="analysis")


class Criterion(TimestampMixin, Base):
    __tablename__ = "criteria"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, default="")
    weight: Mapped[float] = mapped_column(Float, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class CriterionVersion(TimestampMixin, Base):
    __tablename__ = "criterion_versions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    criterion_id: Mapped[str] = mapped_column(ForeignKey("criteria.id"), index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    data: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class CriterionScore(TimestampMixin, Base):
    __tablename__ = "criterion_scores"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    analysis_result_id: Mapped[str] = mapped_column(ForeignKey("analysis_results.id"), index=True)
    criterion_id: Mapped[str | None] = mapped_column(ForeignKey("criteria.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(255))
    score: Mapped[float] = mapped_column(Float)
    weight: Mapped[float] = mapped_column(Float, default=1)
    comment: Mapped[str] = mapped_column(Text, default="")
    evidence: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)


class SalesScript(TimestampMixin, Base):
    __tablename__ = "sales_scripts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class SalesScriptVersion(TimestampMixin, Base):
    __tablename__ = "sales_script_versions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    script_id: Mapped[str] = mapped_column(ForeignKey("sales_scripts.id"), index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    content: Mapped[str] = mapped_column(Text)


class Objection(TimestampMixin, Base):
    __tablename__ = "objections"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, default="")


class CallObjection(TimestampMixin, Base):
    __tablename__ = "call_objections"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    call_id: Mapped[str] = mapped_column(ForeignKey("calls.id"), index=True)
    objection_id: Mapped[str | None] = mapped_column(ForeignKey("objections.id"), nullable=True)
    text: Mapped[str] = mapped_column(Text)


class CallOutcome(TimestampMixin, Base):
    __tablename__ = "call_outcomes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    name: Mapped[str] = mapped_column(String(128))


class NextAction(TimestampMixin, Base):
    __tablename__ = "next_actions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    call_id: Mapped[str] = mapped_column(ForeignKey("calls.id"), index=True)
    title: Mapped[str] = mapped_column(String(255))
    due_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_done: Mapped[bool] = mapped_column(Boolean, default=False)


class PhraseInsight(TimestampMixin, Base):
    __tablename__ = "phrase_insights"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    call_id: Mapped[str | None] = mapped_column(ForeignKey("calls.id"), nullable=True)
    phrase: Mapped[str] = mapped_column(String(512))
    kind: Mapped[str] = mapped_column(String(64))
    count: Mapped[int] = mapped_column(Integer, default=1)


class AggregateReport(TimestampMixin, Base):
    __tablename__ = "aggregate_reports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    period: Mapped[str] = mapped_column(String(64))
    scope: Mapped[str] = mapped_column(String(64))
    data: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class ManualReview(TimestampMixin, Base):
    __tablename__ = "manual_reviews"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    call_id: Mapped[str] = mapped_column(ForeignKey("calls.id"), index=True)
    reviewer_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    data: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class Comment(TimestampMixin, Base):
    __tablename__ = "comments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    call_id: Mapped[str | None] = mapped_column(ForeignKey("calls.id"), nullable=True)
    author_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    body: Mapped[str] = mapped_column(Text)


class LLMUsage(TimestampMixin, Base):
    __tablename__ = "llm_usage"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    call_id: Mapped[str | None] = mapped_column(ForeignKey("calls.id"), nullable=True)
    provider: Mapped[str] = mapped_column(String(128))
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost_rub: Mapped[float] = mapped_column(Float, default=0)


class ProcessingJob(TimestampMixin, Base):
    __tablename__ = "processing_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    batch_id: Mapped[str | None] = mapped_column(ForeignKey("upload_batches.id"), nullable=True, index=True)
    call_id: Mapped[str | None] = mapped_column(ForeignKey("calls.id"), nullable=True, index=True)
    job_type: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(64), default="queued", index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)


class AuditLog(TimestampMixin, Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(128))
    entity_type: Mapped[str] = mapped_column(String(128))
    entity_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    data: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class Integration(TimestampMixin, Base):
    __tablename__ = "integrations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    kind: Mapped[str] = mapped_column(String(128))
    name: Mapped[str] = mapped_column(String(255))
    config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)


class AppSetting(TimestampMixin, Base):
    __tablename__ = "app_settings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    key: Mapped[str] = mapped_column(String(255), index=True)
    value: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
