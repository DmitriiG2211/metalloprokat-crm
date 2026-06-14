from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import SessionLocal, init_db
from app.routers import auth, batches, calls, criteria, dashboard, exports, health, integrations, jobs, managers, reports, settings
from app.seed import seed_database


def create_app() -> FastAPI:
    cfg = get_settings()
    app = FastAPI(title=cfg.app_name, version="0.1.0", openapi_url="/openapi.json")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[cfg.frontend_origin, "http://localhost:3000", "http://127.0.0.1:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(managers.router)
    app.include_router(criteria.router)
    app.include_router(batches.router)
    app.include_router(calls.router)
    app.include_router(dashboard.router)
    app.include_router(reports.router)
    app.include_router(exports.router)
    app.include_router(jobs.router)
    app.include_router(settings.router)
    app.include_router(integrations.router)

    @app.on_event("startup")
    def startup() -> None:
        init_db()
        with SessionLocal() as db:
            seed_database(db)

    return app


app = create_app()
