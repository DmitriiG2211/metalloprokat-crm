import json
from json import JSONDecodeError

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_roles
from app.models import ImportError, ImportJob, Role, User
from app.schemas import ImportPreview, ImportResult
from app.services.importer import import_dataframe, preview_dataframe, read_upload

router = APIRouter(tags=["Import"])


@router.post("/import/preview", response_model=ImportPreview)
async def preview(file: UploadFile = File(...), _: User = Depends(require_roles(Role.admin, Role.director)), db: Session = Depends(get_db)):
    df = await read_upload(file)
    return preview_dataframe(df, file.filename or "file")


@router.post("/import/confirm", response_model=ImportResult)
async def confirm(
    file: UploadFile = File(...),
    assigned_manager_id: int = Form(...),
    mapping_json: str | None = Form(default=None),
    user: User = Depends(require_roles(Role.admin, Role.director)),
    db: Session = Depends(get_db),
):
    if not db.get(User, assigned_manager_id):
        raise HTTPException(404, "Менеджер не найден")
    df = await read_upload(file)
    try:
        mapping = json.loads(mapping_json) if mapping_json else None
    except JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Некорректное сопоставление колонок") from exc
    job = import_dataframe(db, df, file.filename or "file", user, assigned_manager_id, mapping)
    db.commit()
    return ImportResult(
        import_id=job.id,
        total_rows=job.total_rows,
        created_count=job.created_count,
        updated_count=job.updated_count,
        skipped_count=job.skipped_count,
        duplicate_count=job.duplicate_count,
        error_count=job.error_count,
    )


@router.get("/imports")
def list_imports(db: Session = Depends(get_db), _: User = Depends(require_roles(Role.admin, Role.director))):
    return db.scalars(select(ImportJob).order_by(ImportJob.created_at.desc())).all()


@router.get("/imports/{import_id}")
def get_import(import_id: int, db: Session = Depends(get_db), _: User = Depends(require_roles(Role.admin, Role.director))):
    job = db.get(ImportJob, import_id)
    if not job:
        raise HTTPException(404, "Импорт не найден")
    return job


@router.get("/imports/{import_id}/errors")
def import_errors(import_id: int, db: Session = Depends(get_db), _: User = Depends(require_roles(Role.admin, Role.director))):
    return db.scalars(select(ImportError).where(ImportError.import_id == import_id).order_by(ImportError.row_number)).all()
