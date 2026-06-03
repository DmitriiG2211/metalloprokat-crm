from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import get_password_hash
from app.models import Setting, Status, User


DEFAULT_STATUSES = [
    ("Новый", "#D0EBFF", 10),
    ("Контактный", "#D8F3DC", 20),
    ("50/50", "#FFF3BF", 30),
    ("Мертвый", "#FFD6D6", 40),
    ("Не дозвонился", "#E9ECEF", 50),
]

DEFAULT_USERS = [
    ("admin", "admin123", "Администратор", "admin", None),
    ("director", "director123", "Руководитель отдела продаж", "director", None),
    ("manager103", "103123", "Менеджер 103", "manager", "103"),
    ("manager107", "107123", "Менеджер 107", "manager", "107"),
    ("manager108", "108123", "Менеджер 108", "manager", "108"),
    ("manager109", "109123", "Менеджер 109", "manager", "109"),
    ("manager110", "110123", "Менеджер 110", "manager", "110"),
]


def seed(db: Session) -> None:
    for name, color, order in DEFAULT_STATUSES:
        status = db.scalars(select(Status).where(Status.name == name)).first()
        if not status:
            db.add(Status(name=name, color=color, sort_order=order, is_active=True))

    for login, password, full_name, role, manager_number in DEFAULT_USERS:
        user = db.scalars(select(User).where(User.login == login)).first()
        if not user:
            db.add(
                User(
                    login=login,
                    password_hash=get_password_hash(password),
                    full_name=full_name,
                    role=role,
                    manager_number=manager_number,
                    is_active=True,
                )
            )

    settings = {
        "manager_can_import": ("false", "Может ли менеджер импортировать Excel"),
        "manager_can_export": ("true", "Может ли менеджер экспортировать своих клиентов"),
    }
    for key, (value, description) in settings.items():
        if not db.scalars(select(Setting).where(Setting.key == key)).first():
            db.add(Setting(key=key, value=value, description=description))
    db.commit()


if __name__ == "__main__":
    from app.database import Base, SessionLocal, engine

    Base.metadata.create_all(bind=engine)
    with SessionLocal() as session:
        seed(session)
    print("Seed данные созданы")
