export type Role = "admin" | "director" | "senior_manager" | "manager";

export interface User {
  id: number;
  login: string;
  full_name: string;
  role: Role;
  manager_number?: string | null;
  is_active: boolean;
}

export interface Status {
  id: number;
  name: string;
  color: string;
  sort_order: number;
  is_active: boolean;
}

export interface Client {
  id: number;
  manager_id: number;
  company_name: string;
  contact_person?: string | null;
  phone?: string | null;
  normalized_phone?: string | null;
  email?: string | null;
  website?: string | null;
  status_id?: number | null;
  status?: { id: number; name: string; color: string } | null;
  manager?: { id: number; login: string; full_name: string; manager_number?: string | null } | null;
  last_comment?: string | null;
  last_call_date?: string | null;
  next_call_date?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface Task {
  id: number;
  client_id?: number | null;
  manager_id: number;
  creator_id: number;
  title: string;
  description?: string | null;
  deadline?: string | null;
  priority: string;
  status: string;
  manager_comment?: string | null;
  completed_at?: string | null;
  client?: Client | null;
  manager?: User | null;
}

export interface DailyReport {
  id: number;
  manager_id: number;
  manager?: User | null;
  report_date: string;
  advertising_city_phone_count: number;
  advertising_city_phone_comment?: string | null;
  advertising_avito_count: number;
  advertising_avito_comment?: string | null;
  calls_existing_count: number;
  calls_existing_no_answer_count: number;
  calls_existing_refusal_count: number;
  calls_existing_email_count: number;
  calls_existing_not_metal_count: number;
  calls_new_count: number;
  calls_new_no_answer_count: number;
  calls_new_refusal_count: number;
  calls_new_email_count: number;
  calls_new_not_metal_count: number;
  calls_regular_count: number;
  invoice_count: number;
  invoice_numbers?: string | null;
  paid_invoice_count: number;
  paid_invoice_numbers?: string | null;
  requests_received_count: number;
  request_numbers?: string | null;
  invoices_pending_payment_count: number;
  invoices_pending_payment_numbers?: string | null;
  unpaid_invoice_count: number;
  unpaid_invoice_numbers?: string | null;
  invoices_in_work_count: number;
  invoices_in_work_numbers?: string | null;
  note?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DailyReportSummaryRow {
  manager_id: number;
  login: string;
  full_name: string;
  manager_number?: string | null;
  reports_count: number;
  total_calls: number;
  calls_existing: number;
  calls_new: number;
  calls_regular: number;
  total_no_answer: number;
  total_refusals: number;
  total_email_followups: number;
  total_not_metal: number;
  advertising_total: number;
  accounts_total: number;
  invoice_count: number;
  paid_invoice_count: number;
  requests_received_count: number;
  invoices_pending_payment_count: number;
  unpaid_invoice_count: number;
  invoices_in_work_count: number;
}

export interface ManagerQualityRow {
  manager_id: number;
  login: string;
  full_name: string;
  manager_number?: string | null;
  quality_score: number;
  reports_submitted: number;
  period_days: number;
  calls_total: number;
  comments_count: number;
  clients_total: number;
  without_comment: number;
  overdue_clients: number;
  task_total: number;
  task_done: number;
  task_overdue: number;
}

export interface RefusalReasonRow {
  key: string;
  label: string;
  count: number;
  share: number;
}

export interface RefusalAnalytics {
  total: number;
  reasons: RefusalReasonRow[];
  by_manager: Array<Record<string, string | number>>;
}

export interface BaseCleanupStats {
  total_clients: number;
  no_phone: number;
  no_email: number;
  no_comment: number;
  dead_clients: number;
  duplicate_groups_count: number;
  duplicate_groups: Array<{ type: string; value: string; count: number }>;
  recent_imports: Array<{
    id: number;
    filename: string;
    total_rows: number;
    created_count: number;
    duplicate_count: number;
    skipped_count: number;
    error_count: number;
    created_at: string;
  }>;
}

export interface MotivationRow {
  manager_id: number;
  login: string;
  full_name: string;
  manager_number?: string | null;
  place: number;
  points: number;
  calls: number;
  advertising: number;
  invoices: number;
  paid: number;
  reports_count: number;
  quality_score: number;
  badges: string[];
}
