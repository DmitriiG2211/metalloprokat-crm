# CRM Металлопрокат

Внутренняя CRM для обзвона клиентов компании по продаже металла и металлопроката. Проект заменяет Excel-файлы обзвона: хранит клиентов в базе, закрепляет их за менеджерами, сохраняет комментарии, задачи, напоминания, импорт, экспорт и аудит действий.

## Стек

- Backend: Python, FastAPI, SQLAlchemy 2.0, Alembic, PostgreSQL, JWT, passlib/bcrypt, pandas/openpyxl.
- Frontend: React, Vite, TypeScript, MUI, TanStack Query, Axios.
- DevOps: Docker Compose, PostgreSQL volume, Nginx, backup/restore scripts.

## Быстрый запуск через Docker

1. Создайте `.env` из примера:

```bash
cp .env.example .env
```

2. Запустите проект:

```bash
docker compose up --build
```

3. Откройте CRM:

[http://localhost](http://localhost)

API документация доступна здесь:

[http://localhost/api/docs](http://localhost/api/docs)

## Логины по умолчанию

- `admin` / `admin123` — администратор.
- `director` / `director123` — руководитель отдела продаж.
- `manager103` / `103123`
- `manager107` / `107123`
- `manager108` / `108123`
- `manager109` / `109123`
- `manager110` / `110123`

## Миграции и seed

В Docker приложение само создает таблицы и seed-данные при старте. Для ручного применения Alembic:

```bash
docker compose exec backend alembic upgrade head
```

Создать новую миграцию:

```bash
docker compose exec backend alembic revision --autogenerate -m "change"
```

Повторно запустить seed:

```bash
docker compose exec backend python -m app.seed
```

## Импорт Excel

Раздел `Импорт Excel` доступен администратору и руководителю. Поддерживаются `.xlsx`, `.xls`, `.csv`.

1. Выберите файл.
2. Выберите менеджера.
3. Нажмите `Предпросмотр`.
4. Проверьте найденные колонки.
5. Нажмите `Импортировать`.

Система автоматически распознает варианты колонок: `Наименование`, `Название компании`, `Номер телефона`, `Электронная почта`, `Ссылка на сайт`, `Комментарий`, даты звонков и перезвонов.

## Экспорт

На странице клиентов нажмите `Excel`. API также поддерживает:

- `GET /api/export/clients.xlsx`
- `GET /api/export/clients.csv`

Экспорт учитывает права: менеджер получает только своих клиентов.

## Backup

Создать резервную копию:

```bash
sh scripts/backup.sh
```

Файл появится в папке `backups`.

Восстановить:

```bash
sh scripts/restore.sh backups/crm_YYYYMMDD_HHMMSS.sql
```

## Локальная разработка

Backend:

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Frontend будет доступен на [http://localhost:5173](http://localhost:5173), запросы `/api` проксируются на backend.

## Тесты

```bash
cd backend
pytest
```

## Что реализовано в MVP

- JWT-авторизация.
- Роли: админ, руководитель, старший менеджер, менеджер.
- Backend-проверка прав менеджеров на клиентов и задачи.
- Клиенты с серверной пагинацией, поиском и фильтрами.
- Импорт Excel/CSV с preview, авто-сопоставлением колонок и проверкой дублей.
- Статусы клиентов.
- Комментарии с историей.
- Напоминания на сегодня, просроченные и будущие.
- Задачи и выполнение задач менеджером.
- Передача клиента между менеджерами.
- Аудит действий.
- Отчеты по менеджерам и статусам.
- Экспорт в Excel/CSV.
- Docker Compose, Nginx, backup/restore.

## Roadmap

- Telegram-бот для напоминаний.
- Интеграция с телефонией и записью звонков.
- Автораспределение больших баз.
- Kanban по статусам.
- Интеграции с email, WhatsApp и Telegram.
