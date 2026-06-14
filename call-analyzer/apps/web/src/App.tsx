import {
  BarChart3,
  Download,
  FileAudio,
  Filter,
  Gauge,
  ListChecks,
  LogOut,
  PlayCircle,
  RefreshCw,
  Settings,
  ShieldCheck,
  Trash2,
  UploadCloud,
  UserPlus,
  Users,
} from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import "./App.css";
import {
  api,
  clearAuth,
  exportUrl,
  setAuth,
} from "./api";
import type { Batch, Call, CallDetail, Criterion, Dashboard, Job, Manager, ManagerComparisonReport, SettingsInfo, User } from "./api";

type View = "dashboard" | "calls" | "uploads" | "managers" | "reports" | "criteria" | "jobs" | "settings";

const nav: Array<{ id: View; label: string; icon: typeof Gauge }> = [
  { id: "dashboard", label: "Дашборд", icon: Gauge },
  { id: "calls", label: "Звонки", icon: FileAudio },
  { id: "uploads", label: "Загрузки", icon: UploadCloud },
  { id: "managers", label: "Менеджеры", icon: Users },
  { id: "reports", label: "Отчеты", icon: BarChart3 },
  { id: "criteria", label: "Критерии", icon: ListChecks },
  { id: "jobs", label: "Задачи", icon: RefreshCw },
  { id: "settings", label: "Настройки", icon: Settings },
];

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<View>("dashboard");
  const [error, setError] = useState("");

  useEffect(() => {
    api<User>("/auth/me")
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  if (!user) {
    return <Login onLogin={setUser} />;
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <ShieldCheck size={28} />
          <div>
            <strong>Анализатор звонков</strong>
            <span>CRM Мегаполис</span>
          </div>
        </div>
        <nav>
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)} title={item.label}>
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">AI-контроль звонков отдела продаж</span>
            <h1>{nav.find((item) => item.id === view)?.label}</h1>
          </div>
          <div className="userbox">
            <div className="global-switcher" aria-label="Переключение между разделами">
              <a href="/">CRM</a>
              <a href="/certificates">Сертификаты</a>
              <a className="active" href="/calls-analyzer/">Анализатор звонков</a>
            </div>
            <span>{user.name}</span>
            <button
              className="icon-button"
              title="Выйти"
              onClick={() => {
                clearAuth();
                setUser(null);
              }}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        {error && <div className="notice danger">{error}</div>}
        <ViewRouter view={view} onError={setError} />
      </main>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const result = await api<{ user: User; access_token: string; csrf_token: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setAuth(result.access_token, result.csrf_token);
      onLogin(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка входа");
    }
  }

  return (
    <main className="login-page">
      <form className="login-panel" onSubmit={submit}>
        <div className="brand compact">
          <ShieldCheck size={30} />
          <div>
            <strong>Анализатор звонков</strong>
            <span>AI-контроль холодных звонков</span>
          </div>
        </div>
        <div className="global-switcher login-switcher" aria-label="Переключение между разделами">
          <a href="/">CRM</a>
          <a href="/certificates">Сертификаты</a>
          <a className="active" href="/calls-analyzer/">Анализатор звонков</a>
        </div>
        <label>
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          Пароль
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {error && <div className="notice danger">{error}</div>}
        <button className="primary">Войти</button>
      </form>
    </main>
  );
}

function ViewRouter({ view, onError }: { view: View; onError: (message: string) => void }) {
  if (view === "dashboard") return <DashboardView onError={onError} />;
  if (view === "calls") return <CallsView onError={onError} />;
  if (view === "uploads") return <UploadsView onError={onError} />;
  if (view === "managers") return <ManagersView onError={onError} />;
  if (view === "reports") return <ReportsView onError={onError} />;
  if (view === "criteria") return <CriteriaView onError={onError} />;
  if (view === "jobs") return <JobsView onError={onError} />;
  return <SettingsView onError={onError} />;
}

function DashboardView({ onError }: { onError: (message: string) => void }) {
  const [data, setData] = useState<Dashboard | null>(null);
  useEffect(() => {
    api<Dashboard>("/dashboard").then(setData).catch((err) => onError(err.message));
  }, [onError]);
  if (!data) return <Loading />;
  return (
    <>
      <section className="metrics">
        <Metric title="Всего звонков" value={data.calls_total} />
        <Metric title="Обработано" value={data.calls_completed} />
        <Metric title="Средний балл" value={data.average_score} />
        <Metric title="Токены" value={data.token_usage.prompt_tokens + data.token_usage.completion_tokens} />
      </section>
      <section className="grid two">
        <Panel title="Рейтинг менеджеров">
          <table>
            <thead>
              <tr>
                <th>Менеджер</th>
                <th>Звонки</th>
                <th>Балл</th>
              </tr>
            </thead>
            <tbody>
              {data.managers.map((manager) => (
                <tr key={manager.manager_id ?? "none"}>
                  <td>{manager.manager_name}</td>
                  <td>{manager.calls}</td>
                  <td>{manager.average_score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="Исходы">
          <div className="stack">
            {data.outcomes.map((item) => (
              <div className="bar-row" key={item.outcome}>
                <span>{labelOutcome(item.outcome)}</span>
                <strong>{item.count}</strong>
              </div>
            ))}
          </div>
        </Panel>
      </section>
    </>
  );
}

function UploadsView({ onError }: { onError: (message: string) => void }) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [files, setFiles] = useState<FileList | null>(null);
  const [metadata, setMetadata] = useState<File | null>(null);
  const [title, setTitle] = useState("Партия звонков");
  const [managerId, setManagerId] = useState("");
  const [processingBatchId, setProcessingBatchId] = useState<string | null>(null);
  const [deletingBatchId, setDeletingBatchId] = useState<string | null>(null);

  async function load() {
    const [nextBatches, nextManagers] = await Promise.all([api<Batch[]>("/batches"), api<Manager[]>("/managers")]);
    setBatches(nextBatches);
    setManagers(nextManagers);
  }

  useEffect(() => {
    load().catch((err) => onError(err.message));
  }, [onError]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!files?.length) return;
    const form = new FormData();
    form.append("title", title);
    if (managerId) form.append("manager_id", managerId);
    if (metadata) form.append("metadata_file", metadata);
    Array.from(files).forEach((file) => form.append("files", file));
    await api<Batch>("/batches", { method: "POST", form }).then(load).catch((err) => onError(err.message));
  }

  async function deleteBatch(batch: Batch) {
    const ok = window.confirm(`Удалить партию "${batch.title}" и все ее звонки? Файлы, расшифровки, аналитика и задачи будут стерты.`);
    if (!ok) return;
    setDeletingBatchId(batch.id);
    await api<void>(`/batches/${batch.id}`, { method: "DELETE" })
      .then(load)
      .catch((err) => onError(err.message))
      .finally(() => setDeletingBatchId(null));
  }

  async function processBatch(batch: Batch) {
    setProcessingBatchId(batch.id);
    await api<Job[]>(`/batches/${batch.id}/process`, { method: "POST" })
      .then(load)
      .catch((err) => onError(err.message))
      .finally(() => setProcessingBatchId(null));
  }

  return (
    <section className="grid two">
      <Panel title="Новая партия">
        <form className="form" onSubmit={submit}>
          <label>
            Название
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>
            Менеджер для всей партии
            <select value={managerId} onChange={(event) => setManagerId(event.target.value)}>
              <option value="">Определять из файла или таблицы</option>
              {managers.map((manager) => (
                <option key={manager.id} value={manager.id}>
                  {manager.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            CSV/XLSX метаданные
            <input type="file" accept=".csv,.xlsx" onChange={(event) => setMetadata(event.target.files?.[0] ?? null)} />
          </label>
          <label>
            Аудио или ZIP
            <input type="file" multiple accept=".mp3,.wav,.m4a,.ogg,.opus,.aac,.flac,.amr,.zip" onChange={(event) => setFiles(event.target.files)} />
          </label>
          <button className="primary">
            <UploadCloud size={18} />
            Загрузить и запустить
          </button>
        </form>
      </Panel>
      <Panel title="Партии">
        <div className="stack">
          {batches.map((batch) => (
            <div className="batch-row" key={batch.id}>
              <div>
                <strong>{batch.title}</strong>
                <span>{batch.status} · {batch.total_files} файлов</span>
              </div>
              <progress value={batch.progress} max={100} />
              <button
                className="icon-button"
                title="Запустить обработку"
                disabled={processingBatchId === batch.id || deletingBatchId === batch.id}
                onClick={() => processBatch(batch)}
              >
                <PlayCircle size={17} />
              </button>
              <button
                className="icon-button danger"
                title="Удалить загруженные звонки"
                disabled={deletingBatchId === batch.id}
                onClick={() => deleteBatch(batch)}
              >
                <Trash2 size={17} />
              </button>
            </div>
          ))}
        </div>
      </Panel>
    </section>
  );
}

function CallsView({ onError }: { onError: (message: string) => void }) {
  const [calls, setCalls] = useState<Call[]>([]);
  const [selected, setSelected] = useState<CallDetail | null>(null);
  const [query, setQuery] = useState("");

  async function load() {
    setCalls(await api<Call[]>(`/calls?limit=1000${query ? `&q=${encodeURIComponent(query)}` : ""}`));
  }

  useEffect(() => {
    load().catch((err) => onError(err.message));
  }, []);

  async function open(call: Call) {
    setSelected(await api<CallDetail>(`/calls/${call.id}`));
  }

  return (
    <section className="grid calls-layout">
      <Panel title="Звонки" action={<button className="icon-button" title="Обновить" onClick={load}><RefreshCw size={17} /></button>}>
        <div className="toolbar">
          <Filter size={17} />
          <input placeholder="Поиск по файлу, компании или телефону" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && load()} />
        </div>
        <table>
          <thead>
            <tr>
              <th>Файл</th>
              <th>Менеджер</th>
              <th>Статус</th>
              <th>Балл</th>
            </tr>
          </thead>
          <tbody>
            {calls.map((call) => (
              <tr key={call.id} onClick={() => open(call)} className={selected?.id === call.id ? "selected" : ""}>
                <td>{call.filename}</td>
                <td>{call.manager_name ?? "Не назначен"}</td>
                <td><Status value={call.status} /></td>
                <td>{call.overall_score ?? "..."}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <CallCard call={selected} onError={onError} onReload={open} />
    </section>
  );
}

function CallCard({ call, onError, onReload }: { call: CallDetail | null; onError: (message: string) => void; onReload: (call: Call) => void }) {
  if (!call) {
    return <Panel title="Карточка звонка"><div className="empty">Выберите звонок в таблице.</div></Panel>;
  }
  async function reanalyze() {
    await api(`/calls/${call!.id}/reanalyze`, { method: "POST" }).then(() => onReload(call!)).catch((err) => onError(err.message));
  }
  return (
    <Panel
      title={call.filename ?? "Звонок"}
      action={
        <div className="panel-actions">
          <a className="icon-button" title="Скачать отчет по звонку" href={exportUrl(`/exports/calls/${call.id}.xlsx`)} target="_blank">
            <Download size={17} />
          </a>
          <button className="icon-button" title="Повторить анализ" onClick={reanalyze}>
            <RefreshCw size={17} />
          </button>
        </div>
      }
    >
      <div className="call-head">
        <Metric title="Балл" value={call.analysis?.overall_score ?? call.overall_score ?? "..."} />
        <Metric title="Исход" value={labelOutcome(call.analysis?.outcome ?? call.outcome ?? "unknown")} />
      </div>
      <div className="audio-placeholder">
        <PlayCircle size={22} />
        <span>Аудиофайл хранится приватно на сервере; выдачу потока можно включить отдельной политикой доступа.</span>
      </div>
      {call.analysis && (
        <div className="stack">
          <h3>{call.analysis.summary}</h3>
          <TagList title="Сильные стороны" items={call.analysis.strengths} />
          <TagList title="Слабые места" items={call.analysis.weaknesses} tone="warn" />
          <TagList title="Рекомендации" items={call.analysis.recommendations} tone="info" />
          <table>
            <thead><tr><th>Критерий</th><th>Оценка</th><th>Вес</th></tr></thead>
            <tbody>{call.analysis.criteria.map((item) => <tr key={item.name}><td>{item.name}</td><td>{item.score}</td><td>{item.weight}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      {call.transcript && (
        <div className="transcript">
          {call.transcript.segments.map((segment) => (
            <div key={segment.id}>
              <strong>{segment.role === "manager" ? "Менеджер" : segment.role === "client" ? "Клиент" : segment.speaker}</strong>
              <p>{segment.text}</p>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function ManagersView({ onError }: { onError: (message: string) => void }) {
  const [managers, setManagers] = useState<Manager[]>([]);
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("Продажи");
  const [deletingManagerId, setDeletingManagerId] = useState<string | null>(null);

  async function load() {
    setManagers(await api<Manager[]>("/managers"));
  }
  useEffect(() => {
    load().catch((err) => onError(err.message));
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    await api<Manager>("/managers", { method: "POST", body: JSON.stringify({ name, department, is_active: true }) })
      .then(() => {
        setName("");
        return load();
      })
      .catch((err) => onError(err.message));
  }
  async function deleteManager(manager: Manager) {
    const ok = window.confirm(`Удалить менеджера "${manager.name}"? Его звонки останутся в системе как не назначенные.`);
    if (!ok) return;
    setDeletingManagerId(manager.id);
    await api<void>(`/managers/${manager.id}`, { method: "DELETE" })
      .then(load)
      .catch((err) => onError(err.message))
      .finally(() => setDeletingManagerId(null));
  }
  return (
    <section className="grid two">
      <Panel title="Добавить менеджера">
        <form className="form" onSubmit={submit}>
          <label>ФИО<input value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label>Отдел<input value={department} onChange={(event) => setDepartment(event.target.value)} /></label>
          <button className="primary"><UserPlus size={18} />Добавить</button>
        </form>
      </Panel>
      <Panel title="Команда">
        <table>
          <thead><tr><th>Менеджер</th><th>Отдел</th><th>Статус</th><th></th></tr></thead>
          <tbody>{managers.map((manager) => (
            <tr key={manager.id}>
              <td>{manager.name}</td>
              <td>{manager.department}</td>
              <td>{manager.is_active ? "Активен" : "Архив"}</td>
              <td>
                <button className="icon-button danger" title="Удалить менеджера" disabled={deletingManagerId === manager.id} onClick={() => deleteManager(manager)}>
                  <Trash2 size={17} />
                </button>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </Panel>
    </section>
  );
}

function CriteriaView({ onError }: { onError: (message: string) => void }) {
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [name, setName] = useState("");
  const [weight, setWeight] = useState(1);
  async function load() {
    setCriteria(await api<Criterion[]>("/criteria"));
  }
  useEffect(() => {
    load().catch((err) => onError(err.message));
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    await api<Criterion>("/criteria", { method: "POST", body: JSON.stringify({ name, description: "", weight, is_active: true }) })
      .then(() => {
        setName("");
        return load();
      })
      .catch((err) => onError(err.message));
  }
  return (
    <section className="grid two">
      <Panel title="Новый критерий">
        <form className="form" onSubmit={submit}>
          <label>Название<input value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label>Вес<input type="number" min="0" step="0.1" value={weight} onChange={(event) => setWeight(Number(event.target.value))} /></label>
          <button className="primary"><ListChecks size={18} />Добавить</button>
        </form>
      </Panel>
      <Panel title="Шкала оценки">
        <table>
          <thead><tr><th>Критерий</th><th>Вес</th><th>Активен</th></tr></thead>
          <tbody>{criteria.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.weight}</td><td>{item.is_active ? "Да" : "Нет"}</td></tr>)}</tbody>
        </table>
      </Panel>
    </section>
  );
}

function ReportsView({ onError }: { onError: (message: string) => void }) {
  const [report, setReport] = useState<{ managers: Dashboard["managers"]; weak_points: string[]; recommendations: string[]; calls: number } | null>(null);
  const [comparison, setComparison] = useState<ManagerComparisonReport | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  useEffect(() => {
    api<typeof report>("/reports/manager-performance").then(setReport).catch((err) => onError(err.message));
  }, []);
  async function generateComparison() {
    setComparisonLoading(true);
    await api<ManagerComparisonReport>("/reports/manager-comparison", { method: "POST" })
      .then(setComparison)
      .catch((err) => onError(err.message))
      .finally(() => setComparisonLoading(false));
  }
  return (
    <div className="stack">
      <section className="grid two">
        <Panel title="Сводка">
          {!report ? <Loading /> : (
            <div className="stack">
              <Metric title="Звонков в отчете" value={report.calls} />
              <button className="primary" disabled={comparisonLoading} onClick={generateComparison}>
                <BarChart3 size={18} />
                {comparisonLoading ? "AI сравнивает..." : "Сравнить менеджеров AI"}
              </button>
              <a className="primary link-button" href={exportUrl("/exports/calls.xlsx")} target="_blank">
                <Download size={18} />
                Скачать XLSX
              </a>
              <a className="primary link-button" href={exportUrl("/exports/calls-dialogues.xlsx")} target="_blank">
                <Download size={18} />
                Скачать отчет с диалогами
              </a>
            </div>
          )}
        </Panel>
        <Panel title="Рекомендации">
          <TagList title="Слабые места" items={report?.weak_points ?? []} tone="warn" />
          <TagList title="Что улучшить" items={report?.recommendations ?? []} tone="info" />
        </Panel>
      </section>
      {comparison && <ManagerComparison comparison={comparison} />}
    </div>
  );
}

function ManagerComparison({ comparison }: { comparison: ManagerComparisonReport }) {
  return (
    <section className="grid two">
      <Panel title="AI сравнение менеджеров">
        <div className="stack">
          <p className="muted">{comparison.summary}</p>
          <table>
            <thead><tr><th>Место</th><th>Менеджер</th><th>Звонки</th><th>Балл</th></tr></thead>
            <tbody>{comparison.manager_rankings.map((manager) => (
              <tr key={manager.manager_id ?? manager.manager_name}>
                <td>{manager.rank}</td>
                <td>{manager.manager_name}</td>
                <td>{manager.calls_analyzed}</td>
                <td>{manager.average_score}</td>
              </tr>
            ))}</tbody>
          </table>
          <TagList title="Выводы сравнения" items={comparison.comparative_findings} tone="info" />
          <TagList title="Общие рекомендации" items={comparison.recommendations} tone="ok" />
        </div>
      </Panel>
      <Panel title="Различия по услугам и слабостям">
        <div className="stack">
          {comparison.service_gaps.map((gap) => (
            <div className="insight" key={gap.service}>
              <strong>{gap.service}</strong>
              <span>Предлагают: {gap.offered_by.join(", ") || "нет данных"}</span>
              <span>Не предлагают: {gap.missing_managers.join(", ") || "нет данных"}</span>
              {gap.comment && <p>{gap.comment}</p>}
            </div>
          ))}
          {comparison.weaknesses_by_manager.map((manager) => (
            <div className="insight" key={manager.manager_id ?? manager.manager_name}>
              <strong>{manager.manager_name}</strong>
              <TagList title="Слабее в" items={manager.weaknesses} tone="warn" />
              <TagList title="Что подтянуть" items={manager.recommendations} tone="info" />
            </div>
          ))}
        </div>
      </Panel>
    </section>
  );
}

function JobsView({ onError }: { onError: (message: string) => void }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  async function load() {
    setJobs(await api<Job[]>("/jobs"));
  }
  useEffect(() => {
    load().catch((err) => onError(err.message));
  }, []);
  return (
    <Panel title="Фоновые задачи" action={<button className="icon-button" title="Обновить" onClick={load}><RefreshCw size={17} /></button>}>
      <table>
        <thead><tr><th>Тип</th><th>Статус</th><th>Попытки</th><th>Прогресс</th><th>Ошибка</th></tr></thead>
        <tbody>{jobs.map((job) => <tr key={job.id}><td>{job.job_type}</td><td><Status value={job.status} /></td><td>{job.attempts}</td><td>{job.progress}%</td><td>{job.error}</td></tr>)}</tbody>
      </table>
    </Panel>
  );
}

function SettingsView({ onError }: { onError: (message: string) => void }) {
  const [settings, setSettings] = useState<SettingsInfo | null>(null);
  useEffect(() => {
    api<SettingsInfo>("/settings").then(setSettings).catch((err) => onError(err.message));
  }, []);
  if (!settings) return <Loading />;
  return (
    <section className="grid two">
      <Panel title="Провайдеры">
        <dl>
          <dt>LLM</dt><dd>{settings.llm_provider}</dd>
          <dt>Расшифровка</dt><dd>{settings.transcription_provider}</dd>
          <dt>Whisper-модель</dt><dd>{settings.whisper_model}</dd>
          <dt>Дневной лимит токенов</dt><dd>{settings.daily_token_limit}</dd>
        </dl>
      </Panel>
      <Panel title="Правовое предупреждение">
        <p className="muted">{settings.legal_notice}</p>
      </Panel>
    </section>
  );
}

function Panel({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Metric({ title, value }: { title: string; value: string | number }) {
  return (
    <div className="metric">
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Status({ value }: { value: string }) {
  const ok = ["completed", "ready"].includes(value);
  const warn = ["queued", "uploaded", "running", "processing", "transcribing", "analyzing"].includes(value);
  return <span className={`status ${ok ? "ok" : warn ? "warn" : "bad"}`}>{value}</span>;
}

function TagList({ title, items, tone = "ok" }: { title: string; items: string[]; tone?: "ok" | "warn" | "info" }) {
  if (!items.length) return null;
  return (
    <div>
      <h4>{title}</h4>
      <div className="tags">{items.map((item) => <span className={`tag ${tone}`} key={item}>{item}</span>)}</div>
    </div>
  );
}

function Loading() {
  return <div className="empty"><RefreshCw size={18} />Загрузка...</div>;
}

function labelOutcome(value: string) {
  const labels: Record<string, string> = {
    next_step_agreed: "Есть следующий шаг",
    refusal: "Отказ",
    auto_answer: "Автоответчик",
    no_answer: "Не дозвонились",
    wrong_number: "Неверный номер",
    needs_review: "Нужна проверка",
    duplicate: "Дубликат",
    unknown: "Неизвестно",
  };
  return labels[value] ?? value;
}

export default App;
