from __future__ import annotations

import asyncio

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.deps import csrf_guard
from app.models import AnalysisResult, Call, CriterionScore, ManagerProfile, ProcessingJob, Transcript, User
from app.schemas import AnalysisOut, CallDetailOut, CallOut, ManualCorrectionIn, TranscriptOut, TranscriptSegmentOut
from app.services.pipeline import process_job

router = APIRouter(prefix="/calls", tags=["calls"])


def call_out(db: Session, call: Call) -> CallOut:
    manager_name = None
    if call.manager_id:
        manager = db.get(ManagerProfile, call.manager_id)
        manager_name = manager.name if manager else None
    return CallOut(
        id=call.id,
        batch_id=call.batch_id,
        manager_id=call.manager_id,
        manager_name=manager_name,
        client_phone=mask_phone(call.client_phone),
        client_company=call.client_company,
        call_date=call.call_date,
        duration_seconds=call.duration_seconds,
        status=call.status,
        outcome=call.outcome,
        overall_score=call.overall_score,
        filename=call.file.original_filename if call.file else None,
    )


@router.get("", response_model=list[CallOut])
def list_calls(
    batch_id: str | None = None,
    manager_id: str | None = None,
    status: str | None = None,
    q: str | None = None,
    limit: int = 1000,
    offset: int = 0,
    user: User = Depends(csrf_guard),
    db: Session = Depends(get_db),
) -> list[CallOut]:
    limit = max(1, min(limit, 1000))
    offset = max(0, offset)
    stmt = select(Call).where(Call.organization_id == user.organization_id)
    if batch_id:
        stmt = stmt.where(Call.batch_id == batch_id)
    if manager_id:
        stmt = stmt.where(Call.manager_id == manager_id)
    if status:
        stmt = stmt.where(Call.status == status)
    rows = db.scalars(stmt.order_by(Call.created_at.desc()).offset(offset).limit(limit)).all()
    if q:
        rows = [row for row in rows if q.lower() in ((row.client_company or "") + (row.client_phone or "") + (row.file.original_filename if row.file else "")).lower()]
    return [call_out(db, row) for row in rows]


@router.get("/{call_id}", response_model=CallDetailOut)
def get_call(call_id: str, user: User = Depends(csrf_guard), db: Session = Depends(get_db)) -> CallDetailOut:
    call = db.get(Call, call_id)
    if not call or call.organization_id != user.organization_id:
        raise HTTPException(status_code=404, detail="Call not found")
    base = call_out(db, call).model_dump()
    return CallDetailOut(**base, transcript=transcript_out(call.transcript) if call.transcript else None, analysis=analysis_out(db, call.analysis) if call.analysis else None)


@router.get("/{call_id}/transcript", response_model=TranscriptOut)
def get_transcript(call_id: str, user: User = Depends(csrf_guard), db: Session = Depends(get_db)) -> TranscriptOut:
    transcript = db.scalar(select(Transcript).where(Transcript.call_id == call_id, Transcript.organization_id == user.organization_id))
    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript not found")
    return transcript_out(transcript)


@router.get("/{call_id}/analysis", response_model=AnalysisOut)
def get_analysis(call_id: str, user: User = Depends(csrf_guard), db: Session = Depends(get_db)) -> AnalysisOut:
    analysis = db.scalar(select(AnalysisResult).where(AnalysisResult.call_id == call_id, AnalysisResult.organization_id == user.organization_id))
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return analysis_out(db, analysis)


@router.post("/{call_id}/reanalyze")
def reanalyze_call(call_id: str, background: BackgroundTasks, user: User = Depends(csrf_guard), db: Session = Depends(get_db)) -> dict[str, str]:
    call = db.get(Call, call_id)
    if not call or call.organization_id != user.organization_id:
        raise HTTPException(status_code=404, detail="Call not found")
    call.analysis_hash = None
    job = ProcessingJob(organization_id=user.organization_id, batch_id=call.batch_id, call_id=call.id, job_type="process_call")
    db.add(job)
    db.commit()
    background.add_task(process_job_background, job.id)
    return {"job_id": job.id}


@router.patch("/{call_id}/review", response_model=AnalysisOut)
def correct_analysis(call_id: str, payload: ManualCorrectionIn, user: User = Depends(csrf_guard), db: Session = Depends(get_db)) -> AnalysisOut:
    call = db.get(Call, call_id)
    if not call or call.organization_id != user.organization_id or not call.analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    analysis = call.analysis
    for key, value in payload.model_dump(exclude_none=True).items():
        setattr(analysis, key, value)
    analysis.is_manually_corrected = True
    call.overall_score = analysis.overall_score
    call.outcome = analysis.outcome
    db.commit()
    return analysis_out(db, analysis)


def process_job_background(job_id: str) -> None:
    with SessionLocal() as db:
        asyncio.run(process_job(db, job_id))


def transcript_out(transcript: Transcript) -> TranscriptOut:
    return TranscriptOut(
        id=transcript.id,
        provider=transcript.provider,
        language=transcript.language,
        text=transcript.text,
        confidence=transcript.confidence,
        technical_info=transcript.technical_info,
        segments=[
            TranscriptSegmentOut(
                id=s.id,
                speaker=s.speaker,
                role=s.role,
                start_ms=s.start_ms,
                end_ms=s.end_ms,
                text=s.text,
                confidence=s.confidence,
            )
            for s in transcript.segments
        ],
    )


def analysis_out(db: Session, analysis: AnalysisResult) -> AnalysisOut:
    criteria = db.scalars(select(CriterionScore).where(CriterionScore.analysis_result_id == analysis.id)).all()
    return AnalysisOut(
        id=analysis.id,
        summary=analysis.summary,
        outcome=analysis.outcome,
        overall_score=analysis.overall_score,
        strengths=analysis.strengths,
        weaknesses=analysis.weaknesses,
        recommendations=analysis.recommendations,
        evidence=evidence_out(analysis.evidence),
        raw_json=analysis.raw_json,
        is_manually_corrected=analysis.is_manually_corrected,
        criteria=[
            {
                "name": c.name,
                "score": c.score,
                "weight": c.weight,
                "comment": c.comment,
                "evidence": evidence_out(c.evidence),
            }
            for c in criteria
        ],
    )


def evidence_out(value: object) -> list[dict[str, object]]:
    if not isinstance(value, list):
        return []
    items: list[dict[str, object]] = []
    for item in value:
        if isinstance(item, dict):
            items.append(item)
        elif isinstance(item, str):
            items.append({"quote": item})
    return items


def mask_phone(phone: str | None) -> str | None:
    if not phone or len(phone) < 6:
        return phone
    return f"{phone[:2]}***{phone[-4:]}"
