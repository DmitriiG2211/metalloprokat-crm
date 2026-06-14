# AI Call Analytics

Рабочий MVP закрытого веб-сервиса для загрузки записей холодных звонков, расшифровки, AI-оценки менеджеров по критериям и выгрузки отчетов.

## Что реализовано

- Авторизация, роли `admin` и `director`, HttpOnly cookie и bearer token.
- CRUD менеджеров и критериев оценки.
- Массовая загрузка аудио и ZIP, импорт CSV/XLSX метаданных, безопасная распаковка ZIP.
- Фоновая обработка через таблицу `processing_jobs` и отдельный worker.
- `TranscriptionProvider`: `mock`, `local_faster_whisper`, заглушка внешнего Speech-to-Text API.
- `LLMProvider`: `mock`, `openai_compatible`, `timeweb_agent` через настраиваемый chat-completions endpoint.
- Строгая JSON-валидация результата анализа, сохранение transcript, segments, scores, evidence и token usage.
- Дашборд, таблица звонков, карточка звонка, рейтинги менеджеров, отчеты и XLSX-экспорт.
- Docker Compose, документация с Mermaid-диаграммами, тестовые данные и pytest.

## Структура

```text
apps/api        FastAPI backend, worker, SQLAlchemy models, tests
apps/web        React/Vite frontend
docs            Architecture and ER diagrams
testdata        Example metadata
docker-compose.yml
.env.example
```

## Локальный запуск без Docker

```bash
cd apps/api
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy ..\..\.env.example .env
python run.py
```

Во втором терминале:

```bash
cd apps/web
npm install
npm run dev
```

Откройте `http://localhost:5173`. Тестовый вход: `admin@example.com` / `admin123`.

## Docker Compose

```bash
copy .env.example .env
docker compose up --build
```

API будет на `http://localhost:8000`, OpenAPI на `http://localhost:8000/docs`, web на `http://localhost:5173`.

## Timeweb AI Agent

Секреты не хранятся во frontend и не зашиты в Git. Для Timeweb укажите значения из панели агента и официальной документации:

```env
LLM_PROVIDER=timeweb_agent
TIMEWEB_AI_BASE_URL=https://agent.timeweb.cloud
TIMEWEB_AI_API_KEY=
TIMEWEB_AI_AGENT_ID=
TIMEWEB_AI_MODEL=
TIMEWEB_AI_CHAT_COMPLETIONS_PATH=
LLM_MAX_COMPLETION_TOKENS=1800
```

По документации Timeweb OpenAI-совместимый Chat Completions endpoint имеет вид
`/api/v1/cloud-ai/agents/{agent_id}/v1/chat/completions`, поэтому при пустом
`TIMEWEB_AI_CHAT_COMPLETIONS_PATH` приложение собирает URL автоматически из `TIMEWEB_AI_BASE_URL`
и `TIMEWEB_AI_AGENT_ID`. Если в панели агента показан другой базовый URL или путь, их можно
переопределить через env.

## Расшифровка

По умолчанию включен `TRANSCRIPTION_PROVIDER=mock`, чтобы проверить весь сценарий без GPU и моделей. Для локального Whisper:

```env
TRANSCRIPTION_PROVIDER=local_faster_whisper
WHISPER_MODEL=medium
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8
```

Для GPU обычно меняют `WHISPER_DEVICE=cuda` и compute type под конкретную видеокарту. FFmpeg включен в Dockerfile API.

## Обязательные env

- `DATABASE_URL`
- `JWT_SECRET`
- `FRONTEND_ORIGIN`
- `LLM_PROVIDER`
- `TRANSCRIPTION_PROVIDER`
- `TIMEWEB_AI_*` при использовании Timeweb

## Тесты

```bash
cd apps/api
pytest
```

Покрыты вход, запрет без auth, загрузка аудио, безопасная ZIP-распаковка, pipeline mock-расшифровки/анализа и XLSX-экспорт.

## Ограничения MVP

- Диаризация подготовлена архитектурно, но не включена по умолчанию.
- Аудиоплеер в UI показывает приватное хранение; endpoint потоковой выдачи аудио стоит включать после утверждения политики доступа.
- Нет полноценной телефонии/webhook-интеграции без конкретного API провайдера.
- `mock` провайдеры нужны для тестов и локального запуска, не заменяют реальный анализ.

## Защита данных и экономия токенов

- API ключи только через env.
- Телефоны в списках маскируются.
- ZIP проверяется на размер, количество файлов и небезопасные пути.
- Результаты анализа кешируются по хешу transcript + criteria + prompt version.
- Сохраняется token usage, предусмотрены дневной лимит и лимит параллельности.
- Внешнему LLM отправляется текст и минимальные метаданные; перед production стоит включить дополнительную маскировку ФИО/email/телефонов.
