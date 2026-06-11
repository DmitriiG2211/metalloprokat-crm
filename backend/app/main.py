from pathlib import Path

from fastapi import FastAPI
from fastapi import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text

from app.config import get_settings
from app.database import Base, SessionLocal, engine
from app.routers import analytics, audit, auth, clients, daily_reports, export, imports, kanban, reminders, reports, statuses, tasks, users
from app.seed import seed
from app.services.yandex_mail import start_yandex_mail_worker

settings = get_settings()

app = FastAPI(title=settings.app_name, version="1.0.0", openapi_url="/api/openapi.json", docs_url="/api/docs")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def ensure_lightweight_schema_updates() -> None:
    inspector = inspect(engine)
    if "daily_reports" not in inspector.get_table_names():
        return
    existing_columns = {column["name"] for column in inspector.get_columns("daily_reports")}
    columns_to_add = {
        "invoices_pending_payment_count": "INTEGER NOT NULL DEFAULT 0",
        "invoices_pending_payment_numbers": "TEXT",
    }
    with engine.begin() as connection:
        for column_name, column_sql in columns_to_add.items():
            if column_name not in existing_columns:
                connection.execute(text(f"ALTER TABLE daily_reports ADD COLUMN {column_name} {column_sql}"))


@app.on_event("startup")
def startup() -> None:
    if settings.database_schema:
        with engine.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{settings.database_schema}"'))
    Base.metadata.create_all(bind=engine)
    ensure_lightweight_schema_updates()
    with SessionLocal() as db:
        seed(db)
    start_yandex_mail_worker()


@app.get("/api/health")
def health():
    return {"status": "ok"}


for router in [
    auth.router,
    users.router,
    clients.router,
    statuses.router,
    tasks.router,
    kanban.router,
    reminders.router,
    imports.router,
    daily_reports.router,
    analytics.router,
    reports.router,
    export.router,
    audit.router,
]:
    app.include_router(router, prefix="/api")


frontend_dist = Path(settings.frontend_dist_path) if settings.frontend_dist_path else None
if frontend_dist and frontend_dist.exists():
    assets_dir = frontend_dist / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="frontend-assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_frontend(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404)

        requested_path = frontend_dist / full_path
        if requested_path.is_file():
            return FileResponse(requested_path)
        return FileResponse(frontend_dist / "index.html")
