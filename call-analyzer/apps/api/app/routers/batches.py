from __future__ import annotations

import asyncio
import shutil
import re
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import SessionLocal, get_db
from app.deps import csrf_guard
from app.models import (
    AnalysisResult,
    AnalysisRun,
    AuditLog,
    Call,
    CallFile,
    CallMetadata,
    CallObjection,
    Comment,
    CriterionScore,
    LLMUsage,
    ManualReview,
    ManagerProfile,
    NextAction,
    PhraseInsight,
    ProcessingJob,
    Transcript,
    TranscriptSegment,
    UploadBatch,
    User,
)
from app.schemas import BatchOut, JobOut
from app.services.pipeline import enqueue_batch_jobs, recover_interrupted_batch_jobs, refresh_batch_status, run_batch_jobs_until_idle
from app.services.uploads import extract_zip_safely, is_audio, is_metadata, read_metadata, safe_filename, save_upload, sha256_file

router = APIRouter(prefix="/batches", tags=["batches"])


def batch_out(batch: UploadBatch) -> BatchOut:
    progress = 0 if batch.total_files == 0 else round((batch.completed_files + batch.failed_files + batch.warning_files) / batch.total_files * 100)
    return BatchOut(
        id=batch.id,
        title=batch.title,
        period_start=batch.period_start,
        period_end=batch.period_end,
        department=batch.department,
        comment=batch.comment,
        status=batch.status,
        total_files=batch.total_files,
        completed_files=batch.completed_files,
        warning_files=batch.warning_files,
        failed_files=batch.failed_files,
        progress=progress,
    )


@router.get("", response_model=list[BatchOut])
def list_batches(user: User = Depends(csrf_guard), db: Session = Depends(get_db)) -> list[BatchOut]:
    rows = db.scalars(select(UploadBatch).where(UploadBatch.organization_id == user.organization_id).order_by(UploadBatch.created_at.desc())).all()
    return [batch_out(row) for row in rows]


@router.get("/{batch_id}", response_model=BatchOut)
def get_batch(batch_id: str, user: User = Depends(csrf_guard), db: Session = Depends(get_db)) -> BatchOut:
    batch = db.get(UploadBatch, batch_id)
    if not batch or batch.organization_id != user.organization_id:
        raise HTTPException(status_code=404, detail="Batch not found")
    refresh_batch_status(db, batch.id)
    return batch_out(batch)


@router.post("", response_model=BatchOut)
async def create_batch(
    background: BackgroundTasks,
    title: str = Form(...),
    period_start: str | None = Form(default=None),
    period_end: str | None = Form(default=None),
    department: str | None = Form(default=None),
    comment: str | None = Form(default=None),
    manager_id: str | None = Form(default=None),
    metadata_file: UploadFile | None = File(default=None),
    files: list[UploadFile] = File(default=[]),
    user: User = Depends(csrf_guard),
    db: Session = Depends(get_db),
) -> BatchOut:
    if not files:
        raise HTTPException(status_code=400, detail="Upload at least one file")
    batch = UploadBatch(
        organization_id=user.organization_id,
        created_by=user.id,
        title=title,
        period_start=period_start,
        period_end=period_end,
        department=department,
        comment=comment,
    )
    db.add(batch)
    db.flush()

    batch_dir = get_settings().storage_dir / user.organization_id / "batches" / batch.id
    metadata: dict[str, dict[str, str]] = {}
    if metadata_file and metadata_file.filename:
        meta_path = batch_dir / "metadata" / safe_filename(metadata_file.filename)
        save_upload(metadata_file, meta_path)
        metadata = read_metadata(meta_path)

    stored_paths: list[Path] = []
    for upload in files:
        if not upload.filename:
            continue
        filename = safe_filename(upload.filename)
        raw_path = batch_dir / "incoming" / filename
        save_upload(upload, raw_path)
        if raw_path.suffix.lower() == ".zip":
            stored_paths.extend(extract_zip_safely(raw_path, batch_dir / "extracted" / raw_path.stem))
        else:
            stored_paths.append(raw_path)

    audio_paths = [path for path in stored_paths if is_audio(path)]
    for path in stored_paths:
        if is_metadata(path):
            metadata.update(read_metadata(path))
    if not audio_paths:
        raise HTTPException(status_code=400, detail="No supported audio files found")

    for path in audio_paths:
        file_hash = sha256_file(path)
        existing_file = db.scalar(select(CallFile).where(CallFile.organization_id == user.organization_id, CallFile.sha256 == file_hash))
        row_meta = metadata.get(path.name, {})
        call = Call(
            organization_id=user.organization_id,
            batch_id=batch.id,
            manager_id=resolve_manager_id(db, user.organization_id, manager_id, row_meta, path.name),
            client_phone=row_meta.get("client_phone") or parse_phone(path.name),
            client_company=row_meta.get("client_company") or None,
            call_date=row_meta.get("call_date") or parse_date(path.name),
            duration_seconds=_int_or_none(row_meta.get("duration")),
            external_call_id=row_meta.get("external_call_id") or None,
            status="completed_with_warning" if existing_file else "uploaded",
        )
        db.add(call)
        db.flush()
        db.add(
            CallFile(
                organization_id=user.organization_id,
                call_id=call.id,
                original_filename=path.name,
                stored_path=str(path),
                mime_type=None,
                size_bytes=path.stat().st_size,
                sha256=file_hash,
            )
        )
        db.add(CallMetadata(organization_id=user.organization_id, call_id=call.id, data=row_meta))
        if existing_file:
            call.outcome = "duplicate"
    db.commit()
    jobs = enqueue_batch_jobs(db, batch.id)
    refresh_batch_status(db, batch.id)
    batch.status = "processing"
    db.commit()
    background.add_task(process_batch_background, batch.id)
    return batch_out(batch)


@router.post("/{batch_id}/process", response_model=list[JobOut])
def process_batch(batch_id: str, background: BackgroundTasks, user: User = Depends(csrf_guard), db: Session = Depends(get_db)) -> list[JobOut]:
    batch = db.get(UploadBatch, batch_id)
    if not batch or batch.organization_id != user.organization_id:
        raise HTTPException(status_code=404, detail="Batch not found")
    recover_interrupted_batch_jobs(db, batch.id)
    jobs = enqueue_batch_jobs(db, batch.id)
    batch.status = "processing"
    db.commit()
    background.add_task(process_batch_background, batch.id)
    return [JobOut(id=j.id, batch_id=j.batch_id, call_id=j.call_id, job_type=j.job_type, status=j.status, attempts=j.attempts, progress=j.progress, error=j.error) for j in jobs]


@router.post("/{batch_id}/cancel")
def cancel_batch(batch_id: str, user: User = Depends(csrf_guard), db: Session = Depends(get_db)) -> dict[str, str]:
    batch = db.get(UploadBatch, batch_id)
    if not batch or batch.organization_id != user.organization_id:
        raise HTTPException(status_code=404, detail="Batch not found")
    db.query(ProcessingJob).filter(ProcessingJob.batch_id == batch.id, ProcessingJob.status.in_(["queued", "running"])).update({"status": "cancelled"})
    batch.status = "cancelled"
    db.commit()
    return {"status": "cancelled"}


@router.delete("/{batch_id}")
def delete_batch(batch_id: str, user: User = Depends(csrf_guard), db: Session = Depends(get_db)) -> dict[str, int | str]:
    batch = db.get(UploadBatch, batch_id)
    if not batch or batch.organization_id != user.organization_id:
        raise HTTPException(status_code=404, detail="Batch not found")

    settings = get_settings()
    batch_dir = settings.storage_dir / user.organization_id / "batches" / batch.id
    storage_root = settings.storage_dir.resolve()
    try:
        resolved_batch_dir = batch_dir.resolve()
    except FileNotFoundError:
        resolved_batch_dir = batch_dir.absolute()
    if storage_root not in resolved_batch_dir.parents and resolved_batch_dir != storage_root:
        raise HTTPException(status_code=500, detail="Unsafe storage path")

    call_ids = list(db.scalars(select(Call.id).where(Call.batch_id == batch.id, Call.organization_id == user.organization_id)).all())
    transcript_ids = []
    analysis_ids = []
    if call_ids:
        transcript_ids = list(db.scalars(select(Transcript.id).where(Transcript.call_id.in_(call_ids))).all())
        analysis_ids = list(db.scalars(select(AnalysisResult.id).where(AnalysisResult.call_id.in_(call_ids))).all())

    db.query(ProcessingJob).filter(ProcessingJob.batch_id == batch.id).delete(synchronize_session=False)
    if call_ids:
        db.query(ProcessingJob).filter(ProcessingJob.call_id.in_(call_ids)).delete(synchronize_session=False)
        db.query(CallMetadata).filter(CallMetadata.call_id.in_(call_ids)).delete(synchronize_session=False)
        db.query(CallFile).filter(CallFile.call_id.in_(call_ids)).delete(synchronize_session=False)
        db.query(CallObjection).filter(CallObjection.call_id.in_(call_ids)).delete(synchronize_session=False)
        db.query(NextAction).filter(NextAction.call_id.in_(call_ids)).delete(synchronize_session=False)
        db.query(PhraseInsight).filter(PhraseInsight.call_id.in_(call_ids)).delete(synchronize_session=False)
        db.query(ManualReview).filter(ManualReview.call_id.in_(call_ids)).delete(synchronize_session=False)
        db.query(Comment).filter(Comment.call_id.in_(call_ids)).delete(synchronize_session=False)
        db.query(LLMUsage).filter(LLMUsage.call_id.in_(call_ids)).delete(synchronize_session=False)
        if transcript_ids:
            db.query(TranscriptSegment).filter(TranscriptSegment.transcript_id.in_(transcript_ids)).delete(synchronize_session=False)
            db.query(Transcript).filter(Transcript.id.in_(transcript_ids)).delete(synchronize_session=False)
        if analysis_ids:
            db.query(CriterionScore).filter(CriterionScore.analysis_result_id.in_(analysis_ids)).delete(synchronize_session=False)
            db.query(AnalysisResult).filter(AnalysisResult.id.in_(analysis_ids)).delete(synchronize_session=False)
        db.query(AnalysisRun).filter(AnalysisRun.call_id.in_(call_ids)).delete(synchronize_session=False)
        db.query(Call).filter(Call.id.in_(call_ids)).delete(synchronize_session=False)

    db.delete(batch)
    db.add(
        AuditLog(
            organization_id=user.organization_id,
            user_id=user.id,
            action="delete",
            entity_type="upload_batch",
            entity_id=batch.id,
            data={"title": batch.title, "calls_deleted": len(call_ids)},
        )
    )
    db.commit()

    if resolved_batch_dir.exists():
        shutil.rmtree(resolved_batch_dir)
    return {"status": "deleted", "calls_deleted": len(call_ids)}


def process_batch_background(batch_id: str) -> None:
    with SessionLocal() as db:
        asyncio.run(run_batch_jobs_until_idle(db, batch_id))


def resolve_manager_id(db: Session, organization_id: str, explicit_id: str | None, metadata: dict[str, str], filename: str) -> str | None:
    if explicit_id:
        return explicit_id
    name = metadata.get("manager") or parse_manager_name(filename)
    if not name:
        return None
    manager = db.scalar(select(ManagerProfile).where(ManagerProfile.organization_id == organization_id, ManagerProfile.name.ilike(f"%{name}%")))
    if manager:
        return manager.id
    manager = ManagerProfile(organization_id=organization_id, name=name, department=metadata.get("department"))
    db.add(manager)
    db.flush()
    return manager.id


def parse_phone(filename: str) -> str | None:
    match = re.search(r"(?:\+?7|8)?\d{10}", filename)
    return match.group(0) if match else None


def parse_date(filename: str) -> str | None:
    match = re.search(r"(20\d{2}[-_.]\d{2}[-_.]\d{2})", filename)
    return match.group(1).replace("_", "-").replace(".", "-") if match else None


def parse_manager_name(filename: str) -> str | None:
    stem = Path(filename).stem
    parts = re.split(r"[_\- ]+", stem)
    cyrillic = [part for part in parts if re.search(r"[А-Яа-яЁё]", part)]
    return " ".join(cyrillic[:2]) if cyrillic else None


def _int_or_none(value: str | None) -> int | None:
    try:
        return int(float(value)) if value else None
    except ValueError:
        return None
