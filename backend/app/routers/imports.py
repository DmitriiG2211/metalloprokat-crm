import json
from json import JSONDecodeError
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_roles
from app.models import Client, ClientComment, ImportClientChange, ImportError, ImportJob, Role, User
from app.schemas import ImportPreview, ImportResult
from app.services.audit import write_audit
from app.services.importer import import_dataframe, preview_dataframe, read_upload_with_row_statuses

router = APIRouter(tags=["Import"])


@router.post("/import/preview", response_model=ImportPreview)
async def preview(file: UploadFile = File(...), _: User = Depends(require_roles(Role.admin, Role.director)), db: Session = Depends(get_db)):
    df, _, _ = await read_upload_with_row_statuses(file)
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
    df, row_statuses, cell_hyperlinks = await read_upload_with_row_statuses(file)
    try:
        mapping = json.loads(mapping_json) if mapping_json else None
    except JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Некорректное сопоставление колонок") from exc
    job = import_dataframe(db, df, file.filename or "file", user, assigned_manager_id, mapping, row_statuses=row_statuses, cell_hyperlinks=cell_hyperlinks)
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


@router.post("/imports/{import_id}/rollback")
def rollback_import(import_id: int, user: User = Depends(require_roles(Role.admin, Role.director)), db: Session = Depends(get_db)):
    job = db.get(ImportJob, import_id)
    if not job:
        raise HTTPException(404, "Импорт не найден")
    if job.rolled_back_at:
        raise HTTPException(409, "Импорт уже был откатан")

    changes = db.scalars(
        select(ImportClientChange).where(ImportClientChange.import_id == import_id, ImportClientChange.action == "created")
    ).all()
    client_ids = {change.client_id for change in changes if change.client_id}
    if client_ids:
        clients = db.scalars(select(Client).where(Client.id.in_(client_ids), Client.deleted_at.is_(None))).all()
    else:
        clients = db.scalars(select(Client).where(Client.source_import_id == import_id, Client.deleted_at.is_(None))).all()

    now = datetime.now(timezone.utc)
    for client in clients:
        client.deleted_at = now
    if clients:
        db.query(ClientComment).filter(ClientComment.client_id.in_([client.id for client in clients]), ClientComment.deleted_at.is_(None)).update(
            {ClientComment.deleted_at: now},
            synchronize_session=False,
        )

    job.rolled_back_at = now
    job.rolled_back_by = user.id
    job.rollback_note = f"Откатано клиентов: {len(clients)}"
    job.status = "rolled_back"
    write_audit(
        db,
        user,
        "rollback_import",
        "import",
        job.id,
        new_value={"filename": job.filename, "rolled_back_clients": len(clients)},
    )
    db.commit()
    return {"ok": True, "import_id": job.id, "rolled_back_clients": len(clients), "rolled_back_at": job.rolled_back_at}
