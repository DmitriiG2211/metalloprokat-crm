from sqlalchemy import inspect, text

from app.database import engine


def main() -> None:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    if "alembic_version" in tables or "users" not in tables:
        return
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE IF NOT EXISTS alembic_version (version_num VARCHAR(32) NOT NULL PRIMARY KEY)"))
        existing = connection.execute(text("SELECT version_num FROM alembic_version")).first()
        if not existing:
            connection.execute(text("INSERT INTO alembic_version (version_num) VALUES ('0001_initial')"))


if __name__ == "__main__":
    main()
