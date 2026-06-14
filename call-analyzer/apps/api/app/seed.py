from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Criterion, ManagerProfile, Organization, Role, SalesScript, SalesScriptVersion, User
from app.security import hash_password


DEFAULT_CRITERIA = [
    ("Приветствие", "Менеджер поздоровался и начал разговор профессионально.", 1.0),
    ("Представление", "Менеджер назвал себя и компанию.", 1.0),
    ("Выход на ЛПР", "Менеджер выяснил закупщика или лицо принятия решения.", 1.2),
    ("Выявление потребности", "Менеджер задал вопросы о текущих потребностях.", 1.5),
    ("Ценностное предложение", "Менеджер объяснил пользу и ассортимент.", 1.2),
    ("Работа с возражениями", "Менеджер корректно обработал отказ или сомнение.", 1.3),
    ("Следующий шаг", "Разговор завершился конкретным следующим действием.", 1.5),
]


def seed_database(db: Session) -> None:
    org = db.scalar(select(Organization).limit(1))
    if not org:
        org = Organization(name="Мегаполис", legal_notice_acknowledged=False)
        db.add(org)
        db.flush()
    for role in ["admin", "director"]:
        exists = db.scalar(select(Role).where(Role.organization_id == org.id, Role.name == role))
        if not exists:
            db.add(Role(organization_id=org.id, name=role))
    admin = db.scalar(select(User).where(User.email == "admin@example.com"))
    if not admin:
        db.add(
            User(
                organization_id=org.id,
                email="admin@example.com",
                name="Администратор",
                password_hash=hash_password("admin123"),
                role="admin",
            )
        )
    for name in ["Менеджер 103", "Менеджер 107", "Менеджер 108", "Менеджер 109", "Менеджер 110"]:
        exists = db.scalar(select(ManagerProfile).where(ManagerProfile.organization_id == org.id, ManagerProfile.name == name))
        if not exists:
            db.add(ManagerProfile(organization_id=org.id, name=name, department="Продажи"))
    for name, description, weight in DEFAULT_CRITERIA:
        exists = db.scalar(select(Criterion).where(Criterion.organization_id == org.id, Criterion.name == name))
        if not exists:
            db.add(Criterion(organization_id=org.id, name=name, description=description, weight=weight))
    script = db.scalar(select(SalesScript).where(SalesScript.organization_id == org.id, SalesScript.name == "Базовый холодный звонок"))
    if not script:
        script = SalesScript(organization_id=org.id, name="Базовый холодный звонок")
        db.add(script)
        db.flush()
        db.add(
            SalesScriptVersion(
                organization_id=org.id,
                script_id=script.id,
                version=1,
                content=(
                    "1. Поздороваться и представиться.\n"
                    "2. Уточнить ответственного за закупки металлопроката.\n"
                    "3. Кратко назвать ассортимент и услуги.\n"
                    "4. Выявить ближайшую потребность.\n"
                    "5. Договориться о КП, прайсе или следующем созвоне."
                ),
            )
        )
    db.commit()
