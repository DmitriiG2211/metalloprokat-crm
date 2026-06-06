import { Analytics, ReceiptLong, Save, Today } from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api, errorMessage } from "../api";
import { PageHeader } from "../components/PageHeader";
import { DailyReport, DailyReportSummaryRow, User } from "../types";

type ReportPayload = Omit<DailyReport, "id" | "manager_id" | "manager" | "created_at" | "updated_at">;
type NumericKey = Extract<{
  [K in keyof ReportPayload]: ReportPayload[K] extends number ? K : never;
}[keyof ReportPayload], string>;
type TextKey = Exclude<keyof ReportPayload, NumericKey | "report_date">;
type NumericInputValue = number | "";
type ReportFormState = Omit<ReportPayload, NumericKey> & Record<NumericKey, NumericInputValue>;

const toIsoDate = (date: Date) => {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
};

const today = () => toIsoDate(new Date());
const monthStart = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
};
const yearStart = () => `${new Date().getFullYear()}-01-01`;
const weekStart = () => {
  const date = new Date();
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return toIsoDate(date);
};

const managerPalette = ["#0877ee", "#0f9cff", "#0055c8", "#16a34a", "#d97706", "#db2777", "#7c3aed", "#0f766e"];

function managerColor(row: DailyReportSummaryRow) {
  const source = row.manager_number || row.login || String(row.manager_id);
  const hash = [...source].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return managerPalette[hash % managerPalette.length];
}

const numericKeys: NumericKey[] = [
  "advertising_city_phone_count",
  "advertising_avito_count",
  "calls_existing_count",
  "calls_existing_no_answer_count",
  "calls_existing_refusal_count",
  "calls_existing_email_count",
  "calls_existing_not_metal_count",
  "calls_new_count",
  "calls_new_no_answer_count",
  "calls_new_refusal_count",
  "calls_new_email_count",
  "calls_new_not_metal_count",
  "calls_regular_count",
  "invoice_count",
  "paid_invoice_count",
  "requests_received_count",
  "invoices_pending_payment_count",
  "unpaid_invoice_count",
  "invoices_in_work_count"
];

const emptyReport = (date: string): ReportFormState => ({
  report_date: date,
  advertising_city_phone_count: "",
  advertising_city_phone_comment: "",
  advertising_avito_count: "",
  advertising_avito_comment: "",
  calls_existing_count: "",
  calls_existing_no_answer_count: "",
  calls_existing_refusal_count: "",
  calls_existing_email_count: "",
  calls_existing_not_metal_count: "",
  calls_new_count: "",
  calls_new_no_answer_count: "",
  calls_new_refusal_count: "",
  calls_new_email_count: "",
  calls_new_not_metal_count: "",
  calls_regular_count: "",
  invoice_count: "",
  invoice_numbers: "",
  paid_invoice_count: "",
  paid_invoice_numbers: "",
  requests_received_count: "",
  request_numbers: "",
  invoices_pending_payment_count: "",
  invoices_pending_payment_numbers: "",
  unpaid_invoice_count: "",
  unpaid_invoice_numbers: "",
  invoices_in_work_count: "",
  invoices_in_work_numbers: "",
  note: ""
});

const advertisingFields: Array<{ count: NumericKey; comment: TextKey; label: string }> = [
  { count: "advertising_city_phone_count", comment: "advertising_city_phone_comment", label: "Городской телефон" },
  { count: "advertising_avito_count", comment: "advertising_avito_comment", label: "Авито" }
];

const existingCallFields: Array<{ key: NumericKey; label: string }> = [
  { key: "calls_existing_count", label: "Обзвоненных клиентов Excel/1С" },
  { key: "calls_existing_no_answer_count", label: "Не дозвон" },
  { key: "calls_existing_refusal_count", label: "Отказ / потрачено" },
  { key: "calls_existing_email_count", label: "Слили в почту / пока тишина / контактные" },
  { key: "calls_existing_not_metal_count", label: "Не работают с металлом" }
];

const newCallFields: Array<{ key: NumericKey; label: string }> = [
  { key: "calls_new_count", label: "Обзвоненных новых клиентов Excel/1С" },
  { key: "calls_new_no_answer_count", label: "Не дозвон" },
  { key: "calls_new_refusal_count", label: "Отказ / потрачено" },
  { key: "calls_new_email_count", label: "Слили в почту / пока тишина / контактные" },
  { key: "calls_new_not_metal_count", label: "Не работают с металлом" },
  { key: "calls_regular_count", label: "Обзвон постоянных клиентов" }
];

const invoiceFields: Array<{ count: NumericKey; numbers: TextKey; label: string }> = [
  { count: "invoice_count", numbers: "invoice_numbers", label: "Выставлено счетов" },
  { count: "paid_invoice_count", numbers: "paid_invoice_numbers", label: "Оплачено счетов" },
  { count: "requests_received_count", numbers: "request_numbers", label: "Получил заявок сегодня" },
  { count: "invoices_pending_payment_count", numbers: "invoices_pending_payment_numbers", label: "Счета под оплату" },
  { count: "unpaid_invoice_count", numbers: "unpaid_invoice_numbers", label: "Не будут платить" },
  { count: "invoices_in_work_count", numbers: "invoices_in_work_numbers", label: "Счета в работе" }
];

function numericValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function toFormState(date: string, report?: DailyReport | null): ReportFormState {
  const next = { ...emptyReport(date), ...(report || {}), report_date: date } as ReportFormState;
  return next;
}

function toPayload(form: ReportFormState): ReportPayload {
  const payload = { ...form } as ReportPayload;
  for (const key of numericKeys) {
    payload[key] = numericValue(form[key]);
  }
  return payload;
}

function NumberField({ label, value, onChange }: { label: string; value: NumericInputValue; onChange: (value: NumericInputValue) => void }) {
  return (
    <TextField
      name={label}
      type="number"
      label="Число"
      value={value}
      onChange={(event) => onChange(event.target.value === "" ? "" : numericValue(event.target.value))}
      inputProps={{ min: 0, inputMode: "numeric" }}
      size="small"
      fullWidth
    />
  );
}

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Paper className="glass-surface report-section" sx={{ p: 2, borderRadius: "8px" }} elevation={0}>
      <Typography fontWeight={900} sx={{ mb: 1.5 }}>
        {title}
      </Typography>
      <Stack spacing={1.2}>{children}</Stack>
    </Paper>
  );
}

function ManagerReportForm() {
  const queryClient = useQueryClient();
  const [reportDate, setReportDate] = useState(today());
  const [form, setForm] = useState<ReportFormState>(emptyReport(reportDate));

  const { data: currentReport, isFetching } = useQuery({
    queryKey: ["daily-report-my", reportDate],
    queryFn: async () => (await api.get<DailyReport | null>("/daily-reports/my", { params: { report_date: reportDate } })).data
  });
  const { data: previousReports = [] } = useQuery({
    queryKey: ["daily-reports-my-list"],
    queryFn: async () => (await api.get<DailyReport[]>("/daily-reports")).data
  });

  useEffect(() => {
    if (currentReport === undefined) return;
    setForm(toFormState(reportDate, currentReport));
  }, [currentReport, reportDate]);

  const save = useMutation({
    mutationFn: async () => (await api.put<DailyReport>("/daily-reports/my", toPayload(form))).data,
    onSuccess: (savedReport) => {
      setReportDate(savedReport.report_date);
      setForm(toFormState(savedReport.report_date, savedReport));
      queryClient.invalidateQueries({ queryKey: ["daily-report-my"] });
      queryClient.invalidateQueries({ queryKey: ["daily-reports-my-list"] });
      queryClient.invalidateQueries({ queryKey: ["daily-reports"] });
      queryClient.invalidateQueries({ queryKey: ["daily-reports-summary"] });
    }
  });

  const setNumber = (key: NumericKey, value: NumericInputValue) => setForm((current) => ({ ...current, [key]: value }));
  const setText = (key: TextKey, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <Stack component="form" className="daily-report-form" spacing={2} onSubmit={submit}>
      <Paper className="glass-surface" sx={{ p: 2, borderRadius: "8px" }} elevation={0}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ xs: "stretch", sm: "center" }}>
          <TextField
            name="report_date"
            type="date"
            label="Дата отчета"
            value={reportDate}
            onChange={(event) => setReportDate(event.target.value)}
            InputLabelProps={{ shrink: true }}
            size="small"
          />
          <TextField
            select
            label="Предыдущие отчеты"
            value=""
            onChange={(event) => setReportDate(event.target.value)}
            size="small"
            sx={{ minWidth: { sm: 220 } }}
          >
            <MenuItem value="" disabled>
              Выбрать дату
            </MenuItem>
            {previousReports.map((report) => (
              <MenuItem key={report.id} value={report.report_date}>
                {report.report_date}
              </MenuItem>
            ))}
            {previousReports.length === 0 && (
              <MenuItem value="" disabled>
                Сохраненных отчетов нет
              </MenuItem>
            )}
          </TextField>
          <Chip icon={<Today />} label={currentReport ? "Отчет за дату уже есть, можно обновить" : "Новый отчет за выбранную дату"} className="glass-button" />
          <Button type="submit" variant="contained" startIcon={<Save />} disabled={save.isPending || isFetching} sx={{ ml: { sm: "auto" } }}>
            Сохранить отчет
          </Button>
        </Stack>
        {save.error && (
          <Alert severity="error" sx={{ mt: 1.5 }}>
            {errorMessage(save.error)}
          </Alert>
        )}
        {save.isSuccess && (
          <Alert severity="success" sx={{ mt: 1.5 }}>
            Отчет сохранен
          </Alert>
        )}
      </Paper>

      <Box className="report-form-grid">
        <ReportSection title="Реклама">
          {advertisingFields.map((field) => (
            <Box className="report-line" key={field.count}>
              <Typography fontWeight={800}>{field.label}</Typography>
              <NumberField label={field.label} value={form[field.count]} onChange={(value) => setNumber(field.count, value)} />
              <TextField name={field.comment} label="Комментарий" value={form[field.comment] || ""} onChange={(event) => setText(field.comment, event.target.value)} size="small" multiline minRows={2} />
            </Box>
          ))}
        </ReportSection>

        <ReportSection title="Обзвон">
          <Typography variant="body2" color="text.secondary" fontWeight={800}>
            Текущая база
          </Typography>
          {existingCallFields.map((field) => (
            <Box className="report-line compact" key={field.key}>
              <Typography>{field.label}</Typography>
              <NumberField label={field.label} value={form[field.key]} onChange={(value) => setNumber(field.key, value)} />
            </Box>
          ))}
          <Divider />
          <Typography variant="body2" color="text.secondary" fontWeight={800}>
            Новые и постоянные клиенты
          </Typography>
          {newCallFields.map((field) => (
            <Box className="report-line compact" key={field.key}>
              <Typography>{field.label}</Typography>
              <NumberField label={field.label} value={form[field.key]} onChange={(value) => setNumber(field.key, value)} />
            </Box>
          ))}
        </ReportSection>

        <ReportSection title="Счета">
          {invoiceFields.map((field) => (
            <Box className="report-line" key={field.count}>
              <Typography fontWeight={800}>{field.label}</Typography>
              <NumberField label={field.label} value={form[field.count]} onChange={(value) => setNumber(field.count, value)} />
              <TextField name={field.numbers} label="№ счетов / заявок" value={form[field.numbers] || ""} onChange={(event) => setText(field.numbers, event.target.value)} size="small" multiline minRows={2} />
            </Box>
          ))}
        </ReportSection>
      </Box>

      <Paper className="glass-surface" sx={{ p: 2, borderRadius: "8px" }} elevation={0}>
        <TextField name="note" label="Общий комментарий за день" value={form.note || ""} onChange={(event) => setText("note", event.target.value)} multiline minRows={3} fullWidth />
      </Paper>
    </Stack>
  );
}

function BarChart({ rows, metric, label }: { rows: DailyReportSummaryRow[]; metric: keyof DailyReportSummaryRow; label: string }) {
  const max = Math.max(1, ...rows.map((row) => Number(row[metric]) || 0));
  return (
    <Paper className="glass-surface report-chart" sx={{ p: 2, borderRadius: "8px" }} elevation={0}>
      <Typography fontWeight={900} sx={{ mb: 1.5 }}>
        {label}
      </Typography>
      <Stack spacing={1}>
        {rows.map((row) => {
          const value = Number(row[metric]) || 0;
          const color = managerColor(row);
          return (
            <Box className="report-bar-row" key={`${row.manager_id}-${String(metric)}`}>
              <Box className="report-manager-label">
                <Box className="report-color-dot" sx={{ backgroundColor: color }} />
                <Typography variant="body2" fontWeight={800}>
                  {row.manager_number || row.login}
                </Typography>
              </Box>
              <Box className="report-bar-track">
                <Box className="report-bar-fill" sx={{ width: `${Math.max(4, (value / max) * 100)}%`, background: `linear-gradient(135deg, ${color}, ${color}cc)` }} />
              </Box>
              <Typography variant="body2" fontWeight={900}>
                {value}
              </Typography>
            </Box>
          );
        })}
      </Stack>
    </Paper>
  );
}

function effectiveNewCalls(report: DailyReport) {
  return Math.max(0, report.calls_new_count - report.calls_new_no_answer_count);
}

function reportManagerName(report: DailyReport) {
  return report.manager?.full_name || report.manager?.login || `ID ${report.manager_id}`;
}

function textValue(value?: string | null) {
  const text = (value || "").trim();
  return text || "Нет данных";
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Paper className="glass-surface report-detail-section" sx={{ p: 2, borderRadius: "8px" }} elevation={0}>
      <Typography fontWeight={900} sx={{ mb: 1.25 }}>
        {title}
      </Typography>
      <Stack spacing={1}>{children}</Stack>
    </Paper>
  );
}

function DetailRow({ label, count, details }: { label: string; count: number; details?: string | null }) {
  return (
    <Box className="report-detail-row">
      <Typography fontWeight={800}>{label}</Typography>
      <Typography className="report-detail-count" fontWeight={900}>
        {count}
      </Typography>
      {details !== undefined && (
        <Typography className="report-detail-text" color="text.secondary">
          {textValue(details)}
        </Typography>
      )}
    </Box>
  );
}

function ReportDetailDialog({ report, onClose }: { report: DailyReport | null; onClose: () => void }) {
  if (!report) return null;

  const totalCalls = effectiveNewCalls(report);

  return (
    <Dialog open={Boolean(report)} onClose={onClose} fullWidth maxWidth="md" PaperProps={{ className: "glass-surface", sx: { borderRadius: "8px" } }}>
      <DialogTitle>
        <Typography component="span" variant="h6" fontWeight={950}>
          Полный отчет: {reportManagerName(report)}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Дата отчета: {report.report_date}
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Box className="report-detail-kpis">
            <Chip className="glass-button" label={`Звонков: ${totalCalls}`} />
            <Chip className="glass-button" label={`Постоянные клиенты: ${report.calls_regular_count}`} />
            <Chip className="glass-button" label={`Выставлено счетов: ${report.invoice_count}`} />
            <Chip className="glass-button" label={`Счета под оплату: ${report.invoices_pending_payment_count}`} />
          </Box>

          <Box className="report-detail-grid">
            <DetailSection title="Реклама">
              {advertisingFields.map((field) => (
                <DetailRow key={field.count} label={field.label} count={report[field.count]} details={report[field.comment]} />
              ))}
            </DetailSection>

            <DetailSection title="Обзвон">
              <Typography variant="body2" color="text.secondary" fontWeight={800}>
                Текущая база
              </Typography>
              {existingCallFields.map((field) => (
                <DetailRow key={field.key} label={field.label} count={report[field.key]} />
              ))}
              <Divider />
              <Typography variant="body2" color="text.secondary" fontWeight={800}>
                Новые и постоянные клиенты
              </Typography>
              {newCallFields.map((field) => (
                <DetailRow key={field.key} label={field.label} count={report[field.key]} />
              ))}
            </DetailSection>

            <DetailSection title="Счета">
              {invoiceFields.map((field) => (
                <DetailRow key={field.count} label={field.label} count={report[field.count]} details={report[field.numbers]} />
              ))}
            </DetailSection>
          </Box>

          <DetailSection title="Общий комментарий за день">
            <Typography sx={{ whiteSpace: "pre-wrap" }}>{textValue(report.note)}</Typography>
          </DetailSection>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="contained">
          Закрыть
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function LeaderReports({ isLeader }: { isLeader: boolean }) {
  const [dateFrom, setDateFrom] = useState(monthStart());
  const [dateTo, setDateTo] = useState(today());
  const [managerId, setManagerId] = useState("");
  const [selectedReport, setSelectedReport] = useState<DailyReport | null>(null);
  const params = { date_from: dateFrom || undefined, date_to: dateTo || undefined, manager_id: managerId || undefined };

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get<User[]>("/users")).data,
    enabled: isLeader,
    retry: false
  });

  const { data: summary = [] } = useQuery({
    queryKey: ["daily-reports-summary", dateFrom, dateTo, managerId],
    queryFn: async () => (await api.get<DailyReportSummaryRow[]>("/daily-reports/summary", { params })).data
  });
  const { data: reports = [] } = useQuery({
    queryKey: ["daily-reports", dateFrom, dateTo, managerId],
    queryFn: async () => (await api.get<DailyReport[]>("/daily-reports", { params })).data
  });

  const managers = useMemo(() => users.filter((item) => item.role === "manager"), [users]);
  const sortedSummary = useMemo(() => [...summary].sort((a, b) => b.total_calls - a.total_calls), [summary]);
  const totalCalls = summary.reduce((sum, row) => sum + row.total_calls, 0);
  const totalRegularCalls = summary.reduce((sum, row) => sum + row.calls_regular, 0);
  const totalInvoices = summary.reduce((sum, row) => sum + row.invoice_count, 0);
  const totalPaid = summary.reduce((sum, row) => sum + row.paid_invoice_count, 0);
  const selectedManager = managers.find((manager) => String(manager.id) === managerId);
  const scopeLabel = selectedManager
    ? `Сводка: ${selectedManager.manager_number ? `менеджер ${selectedManager.manager_number}` : selectedManager.full_name}`
    : isLeader
      ? "Сводка по всему отделу"
      : "Ваши итоги";

  const setPeriod = (period: "today" | "week" | "month" | "year") => {
    const end = today();
    const starts = {
      today: end,
      week: weekStart(),
      month: monthStart(),
      year: yearStart()
    };
    setDateFrom(starts[period]);
    setDateTo(end);
  };

  return (
    <Stack spacing={2}>
      <Paper className="glass-surface report-period-panel" sx={{ p: 2, borderRadius: "8px" }} elevation={0}>
        <Box className="report-period-layout">
          <Stack className="report-period-dates" direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ xs: "stretch", sm: "center" }}>
            <TextField type="date" label="Период с" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} InputLabelProps={{ shrink: true }} size="small" />
            <TextField type="date" label="Период по" value={dateTo} onChange={(event) => setDateTo(event.target.value)} InputLabelProps={{ shrink: true }} size="small" />
            <Chip icon={<Analytics />} label={scopeLabel} className="glass-button" />
          </Stack>
          <Stack className="report-period-actions" direction={{ xs: "column", md: "row" }} spacing={1} justifyContent="flex-end" alignItems={{ xs: "stretch", md: "center" }}>
            <Stack direction="row" spacing={0.75} className="report-quick-buttons">
              <Button size="small" onClick={() => setPeriod("today")}>Сегодня</Button>
              <Button size="small" onClick={() => setPeriod("week")}>Неделя</Button>
              <Button size="small" onClick={() => setPeriod("month")}>Месяц</Button>
              <Button size="small" onClick={() => setPeriod("year")}>Год</Button>
            </Stack>
            {isLeader && (
              <TextField className="report-manager-select" select size="small" label="Менеджер" value={managerId} onChange={(event) => setManagerId(String(event.target.value))}>
                <MenuItem value="">Весь отдел</MenuItem>
                {managers.map((manager) => (
                  <MenuItem key={manager.id} value={String(manager.id)}>
                    {manager.manager_number ? `Менеджер ${manager.manager_number}` : manager.login} · {manager.full_name}
                  </MenuItem>
                ))}
              </TextField>
            )}
          </Stack>
        </Box>
      </Paper>

      <Box className="report-kpi-grid">
        <Paper className="glass-surface metric-card" sx={{ p: 2, borderRadius: "8px" }} elevation={0}>
          <Typography variant="body2" color="text.secondary">
            Всего звонков
          </Typography>
          <Typography variant="h4">{totalCalls}</Typography>
        </Paper>
        <Paper className="glass-surface metric-card" sx={{ p: 2, borderRadius: "8px" }} elevation={0}>
          <Typography variant="body2" color="text.secondary">
            Постоянные клиенты
          </Typography>
          <Typography variant="h4">{totalRegularCalls}</Typography>
        </Paper>
        <Paper className="glass-surface metric-card" sx={{ p: 2, borderRadius: "8px" }} elevation={0}>
          <Typography variant="body2" color="text.secondary">
            Выставлено счетов
          </Typography>
          <Typography variant="h4">{totalInvoices}</Typography>
        </Paper>
        <Paper className="glass-surface metric-card" sx={{ p: 2, borderRadius: "8px" }} elevation={0}>
          <Typography variant="body2" color="text.secondary">
            Оплачено счетов
          </Typography>
          <Typography variant="h4">{totalPaid}</Typography>
        </Paper>
      </Box>

      <Box className="report-chart-grid">
        <BarChart rows={sortedSummary} metric="advertising_total" label="Реклама" />
        <BarChart rows={sortedSummary} metric="total_calls" label="Обзвон" />
        <BarChart rows={sortedSummary} metric="accounts_total" label="Счета" />
      </Box>

      <Paper className="glass-surface table-scroll" sx={{ p: 2, borderRadius: "8px" }} elevation={0}>
        <Typography fontWeight={900} sx={{ mb: 1.5 }}>
          Итоги по менеджерам
        </Typography>
        <Table size="small" className="premium-table">
          <TableHead>
            <TableRow>
              <TableCell>Менеджер</TableCell>
              <TableCell>Звонков</TableCell>
              <TableCell>Выставлено счетов</TableCell>
              <TableCell>Оплачено</TableCell>
              <TableCell>Реклама</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedSummary.map((row) => (
              <TableRow key={row.manager_id}>
                <TableCell>
                  <Typography fontWeight={850}>{row.full_name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {row.manager_number || row.login}
                  </Typography>
                </TableCell>
                <TableCell>{row.total_calls}</TableCell>
                <TableCell>{row.invoice_count}</TableCell>
                <TableCell>{row.paid_invoice_count}</TableCell>
                <TableCell>{row.advertising_total}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Paper className="glass-surface table-scroll" sx={{ p: 2, borderRadius: "8px" }} elevation={0}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
          <ReceiptLong color="primary" />
          <Typography fontWeight={900}>Ежедневные отчеты</Typography>
        </Stack>
        <Table size="small" className="premium-table">
          <TableHead>
            <TableRow>
              <TableCell>Дата</TableCell>
              <TableCell>Менеджер</TableCell>
              <TableCell>Звонков</TableCell>
              <TableCell>Счетов</TableCell>
              <TableCell>№ счетов</TableCell>
              <TableCell>Оплачено</TableCell>
              <TableCell>Заявок</TableCell>
              <TableCell>Под оплату</TableCell>
              <TableCell>Комментарий</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {reports.map((report) => (
              <TableRow
                key={report.id}
                hover
                className="clickable-report-row"
                tabIndex={0}
                aria-label={`Открыть полный отчет ${reportManagerName(report)} за ${report.report_date}`}
                onClick={() => setSelectedReport(report)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedReport(report);
                  }
                }}
              >
                <TableCell>{report.report_date}</TableCell>
                <TableCell>{report.manager?.full_name || report.manager?.login}</TableCell>
                <TableCell>{effectiveNewCalls(report)}</TableCell>
                <TableCell>{report.invoice_count}</TableCell>
                <TableCell sx={{ whiteSpace: "normal", minWidth: 180 }}>{report.invoice_numbers}</TableCell>
                <TableCell>{report.paid_invoice_count}</TableCell>
                <TableCell>{report.requests_received_count}</TableCell>
                <TableCell>{report.invoices_pending_payment_count}</TableCell>
                <TableCell sx={{ whiteSpace: "normal", minWidth: 220 }}>{report.note}</TableCell>
              </TableRow>
            ))}
            {reports.length === 0 && (
              <TableRow>
                <TableCell colSpan={9}>За выбранный период отчетов пока нет</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>
      <ReportDetailDialog report={selectedReport} onClose={() => setSelectedReport(null)} />
    </Stack>
  );
}

export function ReportsPage() {
  const { user } = useOutletContext<{ user: User }>();
  const isManager = user.role === "manager";
  const isLeader = user.role === "admin" || user.role === "director" || user.role === "senior_manager";

  return (
    <>
      <PageHeader title="Отчет" />
      <Stack spacing={2}>
        {isManager && <ManagerReportForm />}
        {isLeader && <LeaderReports isLeader={isLeader} />}
        {!isManager && !isLeader && (
          <Alert severity="info">Для вашей роли отчеты недоступны.</Alert>
        )}
      </Stack>
    </>
  );
}
