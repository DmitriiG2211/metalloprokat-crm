import asyncio

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.deps import csrf_guard
from app.models import ProcessingJob, User
from app.schemas import JobOut
from app.services.pipeline import process_job

router = APIRouter(prefix="/jobs", tags=["jobs"])


def out(job: ProcessingJob) -> JobOut:
    return JobOut(id=job.id, batch_id=job.batch_id, call_id=job.call_id, job_type=job.job_type, status=job.status, attempts=job.attempts, progress=job.progress, error=job.error)


@router.get("", response_model=list[JobOut])
def list_jobs(user: User = Depends(csrf_guard), db: Session = Depends(get_db)) -> list[JobOut]:
    rows = db.scalars(select(ProcessingJob).where(ProcessingJob.organization_id == user.organization_id).order_by(ProcessingJob.created_at.desc()).limit(200)).all()
    return [out(row) for row in rows]


@router.post("/{job_id}/retry", response_model=JobOut)
def retry_job(job_id: str, background: BackgroundTasks, user: User = Depends(csrf_guard), db: Session = Depends(get_db)) -> JobOut:
    job = db.get(ProcessingJob, job_id)
    if not job or job.organization_id != user.organization_id:
        raise HTTPException(status_code=404, detail="Job not found")
    job.status = "queued"
    job.error = None
    db.commit()
    background.add_task(process_job_background, job.id)
    return out(job)


def process_job_background(job_id: str) -> None:
    with SessionLocal() as db:
        asyncio.run(process_job(db, job_id))
