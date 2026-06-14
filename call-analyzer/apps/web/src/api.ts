const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

type RequestOptions = RequestInit & { form?: FormData };

export type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  organization_id: string;
};

export type Manager = {
  id: string;
  name: string;
  phone_extension?: string | null;
  department?: string | null;
  is_active: boolean;
};

export type Batch = {
  id: string;
  title: string;
  period_start?: string | null;
  period_end?: string | null;
  department?: string | null;
  comment?: string | null;
  status: string;
  total_files: number;
  completed_files: number;
  warning_files: number;
  failed_files: number;
  progress: number;
};

export type Call = {
  id: string;
  batch_id: string;
  manager_id?: string | null;
  manager_name?: string | null;
  client_phone?: string | null;
  client_company?: string | null;
  call_date?: string | null;
  duration_seconds?: number | null;
  status: string;
  outcome?: string | null;
  overall_score?: number | null;
  filename?: string | null;
};

export type CallDetail = Call & {
  transcript?: {
    id: string;
    provider: string;
    language: string;
    text: string;
    confidence?: number | null;
    technical_info: Record<string, unknown>;
    segments: Array<{
      id: string;
      speaker: string;
      role?: string | null;
      start_ms: number;
      end_ms: number;
      text: string;
      confidence?: number | null;
    }>;
  } | null;
  analysis?: {
    id: string;
    summary: string;
    outcome: string;
    overall_score: number;
    strengths: string[];
    weaknesses: string[];
    recommendations: string[];
    evidence: Array<Record<string, unknown>>;
    criteria: Array<{ name: string; score: number; weight: number; comment: string }>;
    is_manually_corrected: boolean;
  } | null;
};

export type Dashboard = {
  calls_total: number;
  calls_completed: number;
  average_score: number;
  managers: Array<{ manager_id?: string | null; manager_name: string; calls: number; average_score: number }>;
  outcomes: Array<{ outcome: string; count: number }>;
  token_usage: { prompt_tokens: number; completion_tokens: number; cost_rub: number };
};

export type Criterion = {
  id: string;
  name: string;
  description: string;
  weight: number;
  is_active: boolean;
};

export type Job = {
  id: string;
  batch_id?: string | null;
  call_id?: string | null;
  job_type: string;
  status: string;
  attempts: number;
  progress: number;
  error?: string | null;
};

export type SettingsInfo = {
  llm_provider: string;
  transcription_provider: string;
  whisper_model: string;
  enable_diarization: boolean;
  daily_token_limit: number;
  monthly_budget_rub: number;
  legal_notice: string;
};

export type ManagerComparisonReport = {
  summary: string;
  manager_rankings: Array<{
    manager_id?: string | null;
    manager_name: string;
    rank: number;
    average_score: number;
    calls_analyzed: number;
    summary: string;
  }>;
  comparative_findings: string[];
  service_gaps: Array<{
    service: string;
    offered_by: string[];
    missing_managers: string[];
    comment?: string;
  }>;
  weaknesses_by_manager: Array<{
    manager_id?: string | null;
    manager_name: string;
    weaknesses: string[];
    recommendations: string[];
  }>;
  recommendations: string[];
};

let token = localStorage.getItem("access_token") ?? "";
let csrf = localStorage.getItem("csrf_token") ?? "";

export function setAuth(nextToken: string, nextCsrf: string) {
  token = nextToken;
  csrf = nextCsrf;
  localStorage.setItem("access_token", nextToken);
  localStorage.setItem("csrf_token", nextCsrf);
}

export function clearAuth() {
  token = "";
  csrf = "";
  localStorage.removeItem("access_token");
  localStorage.removeItem("csrf_token");
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (csrf) headers.set("X-CSRF-Token", csrf);
  if (!options.form && options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    body: options.form ?? options.body,
    headers,
    credentials: "include",
  });
  if (!response.ok) {
    let message = response.statusText;
    try {
      const data = await response.json();
      message = data.detail ?? message;
    } catch {
      // Ignore non-JSON error bodies.
    }
    throw new Error(Array.isArray(message) ? message.map((item) => item.msg).join(", ") : message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function exportUrl(path: string) {
  return `${API_URL}${path}`;
}
