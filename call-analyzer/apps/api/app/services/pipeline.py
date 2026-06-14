from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    AnalysisResult,
    AnalysisRun,
    Call,
    Criterion,
    CriterionScore,
    LLMUsage,
    ProcessingJob,
    Transcript,
    TranscriptSegment,
    UploadBatch,
)
from app.services.providers import analysis_cache_key, get_llm_provider, get_transcription_provider

logger = logging.getLogger(__name__)


BUSINESS_CONTEXT = (
    "Компания продает трубы, листы, круги, балки, швеллеры, уголки, арматуру, "
    "нержавеющий и цветной металл, металлоизделия, резку и изготовление по чертежам. "
    "Цель холодного звонка: выйти на закупщика или ЛПР, выявить потребность, получить контакт, "
    "разрешение отправить прайс или КП и договориться о следующем действии."
)


async def process_job(db: Session, job_id: str) -> None:
    job = db.get(ProcessingJob, job_id)
    if not job or job.status in {"completed", "running"}:
        return
    job.status = "running"
    job.attempts += 1
    job.error = None
    db.commit()
    try:
        if job.job_type == "process_call" and job.call_id:
            await process_call(db, job.call_id, job)
        job.status = "completed"
        job.progress = 100
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        job = db.get(ProcessingJob, job_id)
        if not job:
            return
        logger.exception("Job failed", extra={"job_id": job.id})
        job.error = str(exc)
        job.status = "queued" if job.attempts < job.max_attempts else "failed"
        if job.call_id:
            call = db.get(Call, job.call_id)
            if call:
                call.status = "failed"
    finally:
        db.commit()
        if job.batch_id:
            refresh_batch_status(db, job.batch_id)


async def process_call(db: Session, call_id: str, job: ProcessingJob) -> None:
    call = db.get(Call, call_id)
    if not call or not call.file:
        raise RuntimeError("Call or audio file not found")
    call.status = "preprocessing"
    job.progress = 10
    db.commit()

    provider = get_transcription_provider()
    call.status = "transcribing"
    job.progress = 30
    db.commit()
    transcript_data = provider.transcribe(Path(call.file.stored_path), call.file.original_filename)

    transcript = call.transcript
    if transcript is None:
        transcript = Transcript(
            organization_id=call.organization_id,
            call_id=call.id,
            provider=transcript_data.provider,
            language=transcript_data.language,
            text=transcript_data.text,
            confidence=transcript_data.confidence,
            technical_info=transcript_data.technical_info or {},
        )
        db.add(transcript)
        db.flush()
    else:
        transcript.provider = transcript_data.provider
        transcript.text = transcript_data.text
        transcript.confidence = transcript_data.confidence
        transcript.technical_info = transcript_data.technical_info or {}
        db.query(TranscriptSegment).filter(TranscriptSegment.transcript_id == transcript.id).delete()
        db.flush()
    for segment in transcript_data.segments:
        db.add(TranscriptSegment(organization_id=call.organization_id, transcript_id=transcript.id, **segment))
    if is_no_speech_transcript(transcript):
        apply_no_answer_result(db, call, transcript, job)
        return
    call.status = "awaiting_analysis"
    job.progress = 55
    db.commit()

    criteria = [
        {"id": c.id, "name": c.name, "description": c.description, "weight": c.weight}
        for c in db.scalars(select(Criterion).where(Criterion.organization_id == call.organization_id, Criterion.is_active == True)).all()  # noqa: E712
    ]
    key = analysis_cache_key(transcript.text, criteria)
    if call.analysis_hash == key and call.analysis:
        call.status = "completed"
        call.overall_score = call.analysis.overall_score
        call.outcome = call.analysis.outcome
        return

    call.status = "analyzing"
    job.progress = 75
    run = AnalysisRun(organization_id=call.organization_id, call_id=call.id, provider="configured", status="running")
    db.add(run)
    db.commit()

    llm = get_llm_provider()
    result = await llm.analyze_call(
        {
            "business_context": BUSINESS_CONTEXT,
            "metadata": {
                "client_phone": call.client_phone,
                "client_company": call.client_company,
                "call_date": call.call_date,
                "duration_seconds": call.duration_seconds,
            },
            "criteria": criteria,
            "transcript": transcript.text,
        }
    )
    validate_analysis(result)
    if call.analysis is None:
        analysis = AnalysisResult(
            organization_id=call.organization_id,
            call_id=call.id,
            analysis_run_id=run.id,
            summary=result["summary"],
            outcome=result["outcome"],
            overall_score=float(result["overall_score"]),
            strengths=result.get("strengths", []),
            weaknesses=result.get("weaknesses", []),
            recommendations=result.get("recommendations", []),
            evidence=normalize_evidence(result.get("evidence", [])),
            raw_json=result,
        )
        db.add(analysis)
        db.flush()
    else:
        analysis = call.analysis
        analysis.analysis_run_id = run.id
        analysis.summary = result["summary"]
        analysis.outcome = result["outcome"]
        analysis.overall_score = float(result["overall_score"])
        analysis.strengths = result.get("strengths", [])
        analysis.weaknesses = result.get("weaknesses", [])
        analysis.recommendations = result.get("recommendations", [])
        analysis.evidence = normalize_evidence(result.get("evidence", []))
        analysis.raw_json = result
        db.query(CriterionScore).filter(CriterionScore.analysis_result_id == analysis.id).delete()
        db.flush()

    for item in result.get("criteria", []):
        db.add(
            CriterionScore(
                organization_id=call.organization_id,
                analysis_result_id=analysis.id,
                name=item["name"],
                score=float(item["score"]),
                weight=float(item.get("weight", 1)),
                comment=item.get("comment", ""),
                evidence=normalize_evidence(item.get("evidence", [])),
            )
        )
    usage = result.get("usage", {})
    db.add(
        LLMUsage(
            organization_id=call.organization_id,
            call_id=call.id,
            provider=run.provider,
            prompt_tokens=int(usage.get("prompt_tokens", 0)),
            completion_tokens=int(usage.get("completion_tokens", 0)),
            cost_rub=float(usage.get("cost_rub", 0)),
        )
    )
    call.status = "completed"
    call.outcome = result["outcome"]
    call.overall_score = float(result["overall_score"])
    call.analysis_hash = key
    run.status = "completed"
    job.progress = 95
    db.commit()


def validate_analysis(result: dict[str, Any]) -> None:
    required = ["summary", "outcome", "overall_score", "strengths", "weaknesses", "recommendations", "evidence", "criteria"]
    missing = [key for key in required if key not in result]
    if missing:
        raise RuntimeError(f"LLM response missing keys: {', '.join(missing)}")
    score = float(result["overall_score"])
    if score < 0 or score > 100:
        raise RuntimeError("LLM score out of range")


def normalize_evidence(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    normalized = []
    for item in value:
        if isinstance(item, dict):
            normalized.append(item)
        elif isinstance(item, str):
            normalized.append({"quote": item})
    return normalized


def is_no_speech_transcript(transcript: Transcript) -> bool:
    technical_info = transcript.technical_info or {}
    text = (transcript.text or "").casefold()
    return bool(technical_info.get("no_speech")) or (not transcript.segments and ("речь не распознана" in text or not text.strip()))


def apply_no_answer_result(db: Session, call: Call, transcript: Transcript, job: ProcessingJob) -> None:
    if call.analysis is None:
        analysis = AnalysisResult(
            organization_id=call.organization_id,
            call_id=call.id,
            summary="Менеджер не дозвонился: в записи не распознана речь, диалог отсутствует.",
            outcome="no_answer",
            overall_score=0,
            strengths=[],
            weaknesses=["Нет контакта с клиентом", "Диалог отсутствует"],
            recommendations=["Не оценивать по скрипту как разговор. Повторить звонок или проверить запись."],
            evidence=[{"quote": transcript.text, "timecode": "00:00"}],
            raw_json={
                "summary": "Менеджер не дозвонился: в записи не распознана речь, диалог отсутствует.",
                "outcome": "no_answer",
                "overall_score": 0,
                "reason": transcript.technical_info,
            },
        )
        db.add(analysis)
        db.flush()
    else:
        analysis = call.analysis
        analysis.summary = "Менеджер не дозвонился: в записи не распознана речь, диалог отсутствует."
        analysis.outcome = "no_answer"
        analysis.overall_score = 0
        analysis.strengths = []
        analysis.weaknesses = ["Нет контакта с клиентом", "Диалог отсутствует"]
        analysis.recommendations = ["Не оценивать по скрипту как разговор. Повторить звонок или проверить запись."]
        analysis.evidence = [{"quote": transcript.text, "timecode": "00:00"}]
        analysis.raw_json = {"outcome": "no_answer", "overall_score": 0, "reason": transcript.technical_info}
        db.query(CriterionScore).filter(CriterionScore.analysis_result_id == analysis.id).delete()
    call.status = "completed"
    call.outcome = "no_answer"
    call.overall_score = 0
    job.progress = 100
    db.commit()


def refresh_batch_status(db: Session, batch_id: str) -> None:
    batch = db.get(UploadBatch, batch_id)
    if not batch:
        return
    calls = db.scalars(select(Call).where(Call.batch_id == batch_id)).all()
    batch.total_files = len(calls)
    batch.completed_files = sum(1 for call in calls if call.status == "completed")
    batch.failed_files = sum(1 for call in calls if call.status == "failed")
    batch.warning_files = sum(1 for call in calls if call.status == "completed_with_warning")
    if batch.failed_files and batch.completed_files + batch.failed_files == len(calls):
        batch.status = "completed_with_warning"
    elif calls and batch.completed_files == len(calls):
        batch.status = "completed"
    elif any(call.status in {"transcribing", "analyzing", "preprocessing", "awaiting_analysis"} for call in calls):
        batch.status = "processing"
    else:
        batch.status = "uploaded"
    db.commit()


def enqueue_batch_jobs(db: Session, batch_id: str) -> list[ProcessingJob]:
    calls = db.scalars(select(Call).where(Call.batch_id == batch_id)).all()
    jobs = []
    for call in calls:
        exists = db.scalar(select(ProcessingJob).where(ProcessingJob.call_id == call.id, ProcessingJob.job_type == "process_call"))
        if exists:
            jobs.append(exists)
            continue
        job = ProcessingJob(organization_id=call.organization_id, batch_id=batch_id, call_id=call.id, job_type="process_call")
        db.add(job)
        jobs.append(job)
    db.commit()
    return jobs


async def run_batch_jobs_until_idle(db: Session, batch_id: str) -> int:
    processed = 0
    while True:
        job = db.scalar(
            select(ProcessingJob)
            .where(
                ProcessingJob.batch_id == batch_id,
                ProcessingJob.status == "queued",
                ProcessingJob.attempts < ProcessingJob.max_attempts,
            )
            .order_by(ProcessingJob.created_at)
        )
        if not job:
            break
        await process_job(db, job.id)
        processed += 1
    return processed


def recover_interrupted_batch_jobs(db: Session, batch_id: str) -> int:
    active_statuses = ["preprocessing", "transcribing", "awaiting_analysis", "analyzing"]
    running_jobs = db.scalars(select(ProcessingJob).where(ProcessingJob.batch_id == batch_id, ProcessingJob.status == "running")).all()
    recovered = 0
    for job in running_jobs:
        job.status = "queued"
        job.error = "Recovered interrupted job"
        job.progress = 0
        recovered += 1
    if running_jobs:
        call_ids = [job.call_id for job in running_jobs if job.call_id]
        if call_ids:
            db.query(Call).filter(Call.id.in_(call_ids), Call.status.in_(active_statuses)).update({"status": "uploaded"}, synchronize_session=False)
    db.commit()
    return recovered


async def run_due_jobs_once(db: Session, limit: int = 5) -> int:
    jobs = db.scalars(
        select(ProcessingJob)
        .where(ProcessingJob.status == "queued", ProcessingJob.attempts < ProcessingJob.max_attempts)
        .order_by(ProcessingJob.created_at)
        .limit(limit)
    ).all()
    for job in jobs:
        await process_job(db, job.id)
    return len(jobs)


def cleanup_stale_running_jobs(db: Session) -> int:
    threshold = datetime.utcnow() - timedelta(hours=2)
    count = (
        db.query(ProcessingJob)
        .filter(ProcessingJob.status == "running", ProcessingJob.updated_at < threshold)
        .update({"status": "queued", "error": "Recovered stale running job"})
    )
    db.commit()
    return count


def dashboard_data(db: Session, organization_id: str) -> dict[str, Any]:
    calls_total = db.scalar(select(func.count(Call.id)).where(Call.organization_id == organization_id)) or 0
    calls_completed = db.scalar(select(func.count(Call.id)).where(Call.organization_id == organization_id, Call.status == "completed")) or 0
    avg_score = db.scalar(select(func.avg(Call.overall_score)).where(Call.organization_id == organization_id, Call.overall_score.is_not(None))) or 0
    manager_rows = db.execute(
        select(Call.manager_id, func.count(Call.id), func.avg(Call.overall_score))
        .where(Call.organization_id == organization_id)
        .group_by(Call.manager_id)
    ).all()
    outcome_rows = db.execute(
        select(Call.outcome, func.count(Call.id)).where(Call.organization_id == organization_id).group_by(Call.outcome)
    ).all()
    usage = db.execute(
        select(func.sum(LLMUsage.prompt_tokens), func.sum(LLMUsage.completion_tokens), func.sum(LLMUsage.cost_rub)).where(
            LLMUsage.organization_id == organization_id
        )
    ).one()
    return {
        "calls_total": calls_total,
        "calls_completed": calls_completed,
        "average_score": round(float(avg_score), 1),
        "managers": [
            {"manager_id": row[0], "calls": row[1], "average_score": round(float(row[2] or 0), 1)} for row in manager_rows
        ],
        "outcomes": [{"outcome": row[0] or "unknown", "count": row[1]} for row in outcome_rows],
        "token_usage": {
            "prompt_tokens": int(usage[0] or 0),
            "completion_tokens": int(usage[1] or 0),
            "cost_rub": float(usage[2] or 0),
        },
    }


def run_sync(coro: Any) -> Any:
    return asyncio.run(coro)
