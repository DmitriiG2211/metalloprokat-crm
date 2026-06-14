from typing import Any

from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: str
    organization_id: str


class AuthOut(BaseModel):
    user: UserOut
    access_token: str
    csrf_token: str


class ManagerIn(BaseModel):
    name: str = Field(min_length=2)
    phone_extension: str | None = None
    department: str | None = None
    is_active: bool = True


class ManagerOut(ManagerIn):
    id: str


class BatchOut(BaseModel):
    id: str
    title: str
    period_start: str | None
    period_end: str | None
    department: str | None
    comment: str | None
    status: str
    total_files: int
    completed_files: int
    warning_files: int
    failed_files: int
    progress: int


class CallOut(BaseModel):
    id: str
    batch_id: str
    manager_id: str | None
    manager_name: str | None = None
    client_phone: str | None
    client_company: str | None
    call_date: str | None
    duration_seconds: int | None
    status: str
    outcome: str | None
    overall_score: float | None
    filename: str | None = None


class TranscriptSegmentOut(BaseModel):
    id: str
    speaker: str
    role: str | None
    start_ms: int
    end_ms: int
    text: str
    confidence: float | None


class TranscriptOut(BaseModel):
    id: str
    provider: str
    language: str
    text: str
    confidence: float | None
    technical_info: dict[str, Any]
    segments: list[TranscriptSegmentOut]


class CriterionScoreOut(BaseModel):
    name: str
    score: float
    weight: float
    comment: str
    evidence: list[dict[str, Any]]


class AnalysisOut(BaseModel):
    id: str
    summary: str
    outcome: str
    overall_score: float
    strengths: list[str]
    weaknesses: list[str]
    recommendations: list[str]
    evidence: list[dict[str, Any]]
    raw_json: dict[str, Any]
    is_manually_corrected: bool
    criteria: list[CriterionScoreOut] = []


class CallDetailOut(CallOut):
    transcript: TranscriptOut | None = None
    analysis: AnalysisOut | None = None


class ManualCorrectionIn(BaseModel):
    summary: str | None = None
    outcome: str | None = None
    overall_score: float | None = Field(default=None, ge=0, le=100)
    strengths: list[str] | None = None
    weaknesses: list[str] | None = None
    recommendations: list[str] | None = None


class CriterionIn(BaseModel):
    name: str
    description: str = ""
    weight: float = Field(default=1, ge=0)
    is_active: bool = True


class CriterionOut(CriterionIn):
    id: str


class JobOut(BaseModel):
    id: str
    batch_id: str | None
    call_id: str | None
    job_type: str
    status: str
    attempts: int
    progress: int
    error: str | None


class DashboardOut(BaseModel):
    calls_total: int
    calls_completed: int
    average_score: float
    managers: list[dict[str, Any]]
    outcomes: list[dict[str, Any]]
    token_usage: dict[str, Any]


class ReportOut(BaseModel):
    period: str
    managers: list[dict[str, Any]]
    weak_points: list[str]
    recommendations: list[str]
    calls: int


class SettingsOut(BaseModel):
    llm_provider: str
    transcription_provider: str
    whisper_model: str
    enable_diarization: bool
    daily_token_limit: int
    monthly_budget_rub: float
    legal_notice: str
