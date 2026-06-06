import os
from pathlib import Path

os.environ["DATABASE_URL"] = "sqlite:///./test_crm.db"
os.environ["SECRET_KEY"] = "test"

from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.routers.analytics import _comment_reason  # noqa: E402
from app.seed import seed  # noqa: E402


def setup_module():
    db_file = Path("test_crm.db")
    if db_file.exists():
        db_file.unlink()
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed(db)


client = TestClient(app)


def token(login: str, password: str) -> str:
    res = client.post("/api/auth/login", data={"username": login, "password": password})
    assert res.status_code == 200, res.text
    return res.json()["access_token"]


def test_login_and_role_access():
    admin = token("admin", "admin123")
    manager = token("manager103", "103123")
    assert client.get("/api/users", headers={"Authorization": f"Bearer {admin}"}).status_code == 200
    assert client.get("/api/users", headers={"Authorization": f"Bearer {manager}"}).status_code == 403
    options = client.get("/api/auth/login-options")
    assert options.status_code == 200
    assert any(user["login"] == "manager103" for user in options.json())
    quick = client.post("/api/auth/quick-login", json={"login": "manager103"})
    assert quick.status_code == 200
    quick_me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {quick.json()['access_token']}"})
    assert quick_me.status_code == 200
    assert quick_me.json()["login"] == "manager103"


def test_manager_cannot_see_other_manager_client():
    admin = token("admin", "admin123")
    users = client.get("/api/users", headers={"Authorization": f"Bearer {admin}"}).json()
    manager107 = next(user for user in users if user["login"] == "manager107")
    res = client.post(
        "/api/clients",
        json={"company_name": "ООО Проверка", "phone": "+7 999 111-22-33", "manager_id": manager107["id"]},
        headers={"Authorization": f"Bearer {admin}"},
    )
    assert res.status_code == 200, res.text
    client_id = res.json()["id"]
    manager103 = token("manager103", "103123")
    assert client.get(f"/api/clients/{client_id}", headers={"Authorization": f"Bearer {manager103}"}).status_code == 403


def test_search_and_task_flow():
    admin = token("admin", "admin123")
    users = client.get("/api/users", headers={"Authorization": f"Bearer {admin}"}).json()
    manager103 = next(user for user in users if user["login"] == "manager103")
    created = client.post(
        "/api/clients",
        json={"company_name": "ООО Поиск", "contact_person": "Иван Петров", "phone": "+7 (916) 000-00-01", "manager_id": manager103["id"]},
        headers={"Authorization": f"Bearer {admin}"},
    ).json()
    found = client.get("/api/clients?search=Петров", headers={"Authorization": f"Bearer {admin}"}).json()
    assert found["total"] >= 1
    task = client.post(
        "/api/tasks",
        json={"client_id": created["id"], "manager_id": manager103["id"], "title": "Позвонить клиенту", "priority": "high"},
        headers={"Authorization": f"Bearer {admin}"},
    )
    assert task.status_code == 200, task.text
    manager_token = token("manager103", "103123")
    done = client.post(f"/api/tasks/{task.json()['id']}/complete", headers={"Authorization": f"Bearer {manager_token}"})
    assert done.status_code == 200
    assert done.json()["status"] == "done"


def test_daily_report_flow_and_summary():
    manager_token = token("manager103", "103123")
    report_payload = {
        "report_date": "2026-06-03",
        "advertising_city_phone_count": 2,
        "advertising_city_phone_comment": "Мечта шефа, станки",
        "advertising_avito_count": 1,
        "advertising_avito_comment": "Пупин №882",
        "calls_existing_count": 5,
        "calls_existing_no_answer_count": 2,
        "calls_existing_refusal_count": 2,
        "calls_existing_email_count": 1,
        "calls_new_count": 10,
        "calls_new_no_answer_count": 3,
        "calls_new_refusal_count": 4,
        "calls_new_email_count": 2,
        "calls_new_not_metal_count": 1,
        "calls_regular_count": 15,
        "invoice_count": 4,
        "invoice_numbers": "№115, №156, №645, №666",
        "paid_invoice_count": 2,
        "paid_invoice_numbers": "№541, №700",
        "requests_received_count": 3,
        "request_numbers": "№111, №123, №912",
        "unpaid_invoice_count": 2,
        "unpaid_invoice_numbers": "№100, №200",
        "invoices_in_work_count": 4,
        "invoices_in_work_numbers": "№178, №223, №335, №478",
    }
    created = client.put("/api/daily-reports/my", json=report_payload, headers={"Authorization": f"Bearer {manager_token}"})
    assert created.status_code == 200, created.text
    assert created.json()["manager"]["login"] == "manager103"
    assert created.json()["invoice_count"] == 4

    other_manager = token("manager107", "107123")
    other_list = client.get("/api/daily-reports", headers={"Authorization": f"Bearer {other_manager}"}).json()
    assert all(item["manager"]["login"] != "manager103" for item in other_list)

    admin = token("admin", "admin123")
    summary = client.get("/api/daily-reports/summary?date_from=2026-06-01&date_to=2026-06-30", headers={"Authorization": f"Bearer {admin}"}).json()
    manager103 = next(row for row in summary if row["login"] == "manager103")
    assert manager103["total_calls"] == (
        report_payload["calls_new_count"]
        - report_payload["calls_new_no_answer_count"]
    )
    assert manager103["invoice_count"] == 4


def test_analytics_control_endpoints():
    admin = token("admin", "admin123")
    endpoints = [
        "/api/analytics/manager-quality?date_from=2026-06-01&date_to=2026-06-30",
        "/api/analytics/refusals?date_from=2026-06-01&date_to=2026-06-30",
        "/api/analytics/base-cleanup",
        "/api/analytics/motivation?date_from=2026-06-01&date_to=2026-06-30",
    ]
    for endpoint in endpoints:
        response = client.get(endpoint, headers={"Authorization": f"Bearer {admin}"})
        assert response.status_code == 200, response.text

    quality = client.get(endpoints[0], headers={"Authorization": f"Bearer {admin}"}).json()
    assert any(row["login"] == "manager103" for row in quality)
    manager109 = next(row for row in quality if row["login"] == "manager109")
    assert manager109["quality_score"] == 0

    refusals = client.get(endpoints[1], headers={"Authorization": f"Bearer {admin}"}).json()
    assert {"total", "reasons", "by_manager", "comment_reasons"} <= set(refusals.keys())
    assert {"total_dead_clients", "clients_with_comments", "reasons"} <= set(refusals["comment_reasons"].keys())

    cleanup = client.get(endpoints[2], headers={"Authorization": f"Bearer {admin}"}).json()
    assert {"total_clients", "duplicate_groups", "recent_imports"} <= set(cleanup.keys())


def test_comment_reason_normalizes_no_answer_variants():
    for comment in ["неберут. Недозвон", "не берут трубку", "Н.О.", "недоступен", "не-дозвон"]:
        key, _ = _comment_reason(comment)
        assert key == "no_answer"
