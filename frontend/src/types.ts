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
