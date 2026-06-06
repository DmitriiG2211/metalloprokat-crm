import {
  AutoFixHigh,
  CleaningServices,
  EmojiEvents,
  Groups,
  Insights,
  Shield,
  TrendingUp,
  WarningAmber
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Chip,
  LinearProgress,
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
import { ReactNode, useMemo, useState } from "react";
import { api, errorMessage } from "../api";
import { PageHeader } from "../components/PageHeader";
import { BaseCleanupStats, ManagerQualityRow, MotivationRow, RefusalAnalytics, User } from "../types";

const toIsoDate = (date: Date) => {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
};

const today = () => toIsoDate(new Date());
const monthStart = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
};
const weekStart = () => {
  const date = new Date();
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return toIsoDate(date);
};
const yearStart = () => `${new Date().getFullYear()}-01-01`;

const managerColors = ["#5b7fa6", "#6f9472", "#b07d62", "#8878a8", "#5f9a9a", "#b58a52", "#9a6f83", "#7f8c8d"];

function managerLabel(row: { login: string; full_name: string; manager_number?: string | null }) {
  return row.manager_number ? `Менеджер ${row.manager_number}` : row.full_name || row.login;
}

function StatCard({ label, value, icon, helper }: { label: string; value: number | string; icon: ReactNode; helper?: string }) {
  return (
    <Paper className="glass-surface control-stat-card" sx={{ p: 2, borderRadius: "8px" }} elevation={0}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Box className="control-stat-icon">{icon}</Box>
        <Typography variant="body2" color="text.secondary" fontWeight={850}>
          {label}
        </Typography>
      </Stack>
      <Typography variant="h4" sx={{ mt: 1 }}>
        {value}
      </Typography>
      {helper && (
        <Typography variant="caption" color="text.secondary" fontWeight={700}>
          {helper}
        </Typography>
      )}
    </Paper>
  );
}

function SectionTitle({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  return (
    <Stack direction="row" spacing={1.2} alignItems="center" sx={{ mb: 1.5 }}>
      <Box className="control-section-icon">{icon}</Box>
      <Box>
        <Typography variant="h6">{title}</Typography>
        <Typography variant="body2" color="text.secondary">
          {subtitle}
        </Typography>
      </Box>
    </Stack>
  );
}

function PeriodFilters({
  dateFrom,
  dateTo,
  managerId,
  managers,
  onDateFrom,
  onDateTo,
  onManager,
  onPeriod
}: {
  dateFrom: string;
  dateTo: string;
  managerId: string;
  managers: User[];
  onDateFrom: (value: string) => void;
  onDateTo: (value: string) => void;
  onManager: (value: string) => void;
  onPeriod: (period: "today" | "week" | "month" | "year") => void;
}) {
  return (
    <Paper className="glass-surface control-filter-panel" sx={{ p: 2, borderRadius: "8px" }} elevation={0}>
      <Box className="control-filter-grid">
        <TextField type="date" label="Период с" value={dateFrom} onChange={(event) => onDateFrom(event.target.value)} InputLabelProps={{ shrink: true }} size="small" />
        <TextField type="date" label="Период по" value={dateTo} onChange={(event) => onDateTo(event.target.value)} InputLabelProps={{ shrink: true }} size="small" />
        <TextField select label="Менеджер" value={managerId} onChange={(event) => onManager(event.target.value)} size="small">
          <MenuItem value="">Весь отдел</MenuItem>
          {managers.map((manager) => (
            <MenuItem key={manager.id} value={String(manager.id)}>
              {manager.manager_number ? `Менеджер ${manager.manager_number}` : manager.login} · {manager.full_name}
            </MenuItem>
          ))}
        </TextField>
        <Stack direction="row" spacing={0.75} className="control-period-buttons">
          <Button size="small" onClick={() => onPeriod("today")}>
            Сегодня
          </Button>
          <Button size="small" onClick={() => onPeriod("week")}>
            Неделя
          </Button>
          <Button size="small" onClick={() => onPeriod("month")}>
            Месяц
          </Button>
          <Button size="small" onClick={() => onPeriod("year")}>
            Год
          </Button>
        </Stack>
      </Box>
    </Paper>
  );
}

function MotivationPanel({ rows }: { rows: MotivationRow[] }) {
  const max = Math.max(1, ...rows.map((row) => row.points));
  return (
    <Paper className="glass-surface control-panel" sx={{ p: 2, borderRadius: "8px" }} elevation={0}>
      <SectionTitle icon={<EmojiEvents />} title="Мотивационный экран" subtitle="Рейтинг отдела по активности, отчетам, счетам и качеству" />
      <Stack spacing={1}>
        {rows.map((row, index) => {
          const color = managerColors[index % managerColors.length];
          return (
            <Box className="motivation-row" key={row.manager_id}>
              <Box className="motivation-place" sx={{ borderColor: color, color }}>
                {row.place}
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography fontWeight={950}>{managerLabel(row)}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {row.full_name}
                </Typography>
                <Stack direction="row" spacing={0.6} sx={{ mt: 0.7, flexWrap: "wrap", gap: 0.6 }}>
                  {row.badges.map((badge) => (
                    <Chip key={badge} size="small" label={badge} className="glass-button" />
                  ))}
                </Stack>
              </Box>
              <Box className="motivation-score">
                <Typography fontWeight={950}>{row.points}</Typography>
                <LinearProgress variant="determinate" value={(row.points / max) * 100} sx={{ "& .MuiLinearProgress-bar": { backgroundColor: color } }} />
              </Box>
            </Box>
          );
        })}
        {rows.length === 0 && <Typography color="text.secondary">За выбранный период данных пока нет.</Typography>}
      </Stack>
    </Paper>
  );
}

function QualityPanel({ rows }: { rows: ManagerQualityRow[] }) {
  return (
    <Paper className="glass-surface control-panel table-scroll" sx={{ p: 2, borderRadius: "8px" }} elevation={0}>
      <SectionTitle icon={<Shield />} title="Контроль качества менеджеров" subtitle="Дисциплина отчетов, задачи, просрочки, комментарии и звонки" />
      <Table size="small" className="premium-table">
        <TableHead>
          <TableRow>
            <TableCell>Менеджер</TableCell>
            <TableCell>Качество</TableCell>
            <TableCell>Отчеты</TableCell>
            <TableCell>Звонков</TableCell>
            <TableCell>Комментариев</TableCell>
            <TableCell>Без комментария</TableCell>
            <TableCell>Просрочки</TableCell>
            <TableCell>Задачи</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={row.manager_id}>
              <TableCell>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Box className="report-color-dot" sx={{ backgroundColor: managerColors[index % managerColors.length] }} />
                  <Box>
                    <Typography fontWeight={850}>{managerLabel(row)}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {row.full_name}
                    </Typography>
                  </Box>
                </Stack>
              </TableCell>
              <TableCell>
                <Chip size="small" label={`${row.quality_score}%`} color={row.quality_score >= 75 ? "success" : row.quality_score >= 50 ? "warning" : "error"} />
              </TableCell>
              <TableCell>{row.reports_submitted}/{row.period_days}</TableCell>
              <TableCell>{row.calls_total}</TableCell>
              <TableCell>{row.comments_count}</TableCell>
              <TableCell>{row.without_comment}</TableCell>
              <TableCell>{row.overdue_clients + row.task_overdue}</TableCell>
              <TableCell>{row.task_done}/{row.task_total}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Paper>
  );
}

function RefusalsPanel({ data }: { data?: RefusalAnalytics }) {
  const max = Math.max(1, ...(data?.reasons.map((reason) => reason.count) || [0]));
  const commentMax = Math.max(1, ...(data?.comment_reasons?.reasons.map((reason) => reason.count) || [0]));
  return (
    <Paper className="glass-surface control-panel" sx={{ p: 2, borderRadius: "8px" }} elevation={0}>
      <SectionTitle icon={<WarningAmber />} title="Причины отказов и аналитика" subtitle="Откуда теряются контакты по ежедневным отчетам" />
      <Box className="refusal-analytics-grid">
        <Box>
          <Typography fontWeight={900} sx={{ mb: 1 }}>
            По ежедневным отчетам
          </Typography>
          <Stack spacing={1.2}>
            {data?.reasons.map((reason, index) => {
              const color = managerColors[index % managerColors.length];
              return (
                <Box className="refusal-row" key={reason.key}>
                  <Box>
                    <Typography fontWeight={850}>{reason.label}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {reason.share}% от всех причин
                    </Typography>
                  </Box>
                  <Box className="report-bar-track">
                    <Box className="report-bar-fill" sx={{ width: `${Math.max(4, (reason.count / max) * 100)}%`, background: color }} />
                  </Box>
                  <Typography fontWeight={950}>{reason.count}</Typography>
                </Box>
              );
            })}
            {(!data || data.reasons.every((reason) => reason.count === 0)) && <Typography color="text.secondary">Причин отказов за период пока нет.</Typography>}
          </Stack>
        </Box>
        <Box>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ xs: "stretch", sm: "center" }} justifyContent="space-between" sx={{ mb: 1 }}>
            <Typography fontWeight={900}>
              По комментариям клиентов
            </Typography>
            <Chip
              className="glass-button"
              size="small"
              label={`${data?.comment_reasons?.clients_with_comments ?? 0} из ${data?.comment_reasons?.total_clients ?? data?.comment_reasons?.total_dead_clients ?? 0}`}
            />
          </Stack>
          <Stack spacing={1.2}>
            {data?.comment_reasons?.reasons.map((reason, index) => {
              const color = managerColors[(index + 2) % managerColors.length];
              return (
                <Box className="comment-reason-card" key={reason.key}>
                  <Box className="refusal-row comment-reason-main">
                    <Box>
                      <Typography fontWeight={850}>{reason.label}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        клиентов: {reason.count}
                      </Typography>
                    </Box>
                    <Box className="report-bar-track">
                      <Box className="report-bar-fill" sx={{ width: `${Math.max(4, (reason.count / commentMax) * 100)}%`, background: color }} />
                    </Box>
                    <Typography fontWeight={950}>{reason.count}</Typography>
                  </Box>
                  {reason.examples.length > 0 && (
                    <Stack spacing={0.6} sx={{ mt: 0.85 }}>
                      {reason.examples.slice(0, 3).map((example) => (
                        <Box className="comment-reason-example" key={`${reason.key}-${example.company}-${example.comment}`}>
                          <Typography variant="caption" fontWeight={900}>
                            {example.company}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {example.comment}
                          </Typography>
                        </Box>
                      ))}
                    </Stack>
                  )}
                </Box>
              );
            })}
            {(!data?.comment_reasons || data.comment_reasons.reasons.every((reason) => reason.count === 0)) && (
              <Typography color="text.secondary">Комментариев с отказами пока не найдено.</Typography>
            )}
          </Stack>
        </Box>
      </Box>
    </Paper>
  );
}

function CleanupPanel({ stats }: { stats?: BaseCleanupStats }) {
  const queryClient = useQueryClient();
  const normalize = useMutation({
    mutationFn: async () => (await api.post("/analytics/base-cleanup/normalize")).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["base-cleanup"] })
  });
  const archiveDead = useMutation({
    mutationFn: async () => (await api.post("/analytics/base-cleanup/archive-dead")).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["base-cleanup"] })
  });

  return (
    <Paper className="glass-surface control-panel" sx={{ p: 2, borderRadius: "8px" }} elevation={0}>
      <SectionTitle icon={<CleaningServices />} title="Импорт и чистка базы" subtitle="Контроль дублей, пустых контактов и мертвых клиентов после Excel" />
      <Box className="control-stat-grid compact">
        <StatCard label="Клиентов" value={stats?.total_clients ?? 0} icon={<Groups />} />
        <StatCard label="Без телефона" value={stats?.no_phone ?? 0} icon={<WarningAmber />} />
        <StatCard label="Без почты" value={stats?.no_email ?? 0} icon={<WarningAmber />} />
        <StatCard label="Без комментария" value={stats?.no_comment ?? 0} icon={<Insights />} />
        <StatCard label="Мертвые" value={stats?.dead_clients ?? 0} icon={<WarningAmber />} />
        <StatCard label="Группы дублей" value={stats?.duplicate_groups_count ?? 0} icon={<AutoFixHigh />} />
      </Box>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mt: 1.5 }}>
        <Button variant="contained" startIcon={<AutoFixHigh />} onClick={() => normalize.mutate()} disabled={normalize.isPending}>
          Нормализовать контакты
        </Button>
        <Button color="warning" startIcon={<CleaningServices />} onClick={() => archiveDead.mutate()} disabled={archiveDead.isPending}>
          Архивировать мертвых
        </Button>
      </Stack>
      {(normalize.error || archiveDead.error) && (
        <Alert severity="error" sx={{ mt: 1.5 }}>
          {errorMessage(normalize.error || archiveDead.error)}
        </Alert>
      )}
      {(normalize.isSuccess || archiveDead.isSuccess) && (
        <Alert severity="success" sx={{ mt: 1.5 }}>
          База обновлена
        </Alert>
      )}
      <Box className="cleanup-grid">
        <Box>
          <Typography fontWeight={900} sx={{ mt: 2, mb: 1 }}>
            Найденные дубли
          </Typography>
          <Stack spacing={0.75}>
            {stats?.duplicate_groups.slice(0, 8).map((group) => (
              <Box className="cleanup-row" key={`${group.type}-${group.value}`}>
                <Typography variant="body2" fontWeight={850}>
                  {group.type}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
                  {group.value}
                </Typography>
                <Chip size="small" label={group.count} />
              </Box>
            ))}
            {stats?.duplicate_groups.length === 0 && <Typography color="text.secondary">Явных дублей нет.</Typography>}
          </Stack>
        </Box>
        <Box>
          <Typography fontWeight={900} sx={{ mt: 2, mb: 1 }}>
            Последние импорты
          </Typography>
          <Stack spacing={0.75}>
            {stats?.recent_imports.map((item) => (
              <Box className="cleanup-row import" key={item.id}>
                <Typography variant="body2" fontWeight={850} sx={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                  {item.filename}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  строк {item.total_rows}, создано {item.created_count}, дублей {item.duplicate_count}, ошибок {item.error_count}
                </Typography>
              </Box>
            ))}
            {stats?.recent_imports.length === 0 && <Typography color="text.secondary">Истории импорта пока нет.</Typography>}
          </Stack>
        </Box>
      </Box>
    </Paper>
  );
}

export function ControlPage() {
  const [dateFrom, setDateFrom] = useState(monthStart());
  const [dateTo, setDateTo] = useState(today());
  const [managerId, setManagerId] = useState("");
  const params = { date_from: dateFrom || undefined, date_to: dateTo || undefined, manager_id: managerId || undefined };

  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: async () => (await api.get<User[]>("/users")).data });
  const managers = useMemo(() => users.filter((user) => user.role === "manager"), [users]);
  const { data: quality = [] } = useQuery({
    queryKey: ["manager-quality", dateFrom, dateTo, managerId],
    queryFn: async () => (await api.get<ManagerQualityRow[]>("/analytics/manager-quality", { params })).data
  });
  const { data: refusals } = useQuery({
    queryKey: ["refusals", dateFrom, dateTo, managerId],
    queryFn: async () => (await api.get<RefusalAnalytics>("/analytics/refusals", { params })).data
  });
  const { data: cleanup } = useQuery({
    queryKey: ["base-cleanup"],
    queryFn: async () => (await api.get<BaseCleanupStats>("/analytics/base-cleanup")).data
  });
  const { data: motivation = [] } = useQuery({
    queryKey: ["motivation", dateFrom, dateTo],
    queryFn: async () => (await api.get<MotivationRow[]>("/analytics/motivation", { params: { date_from: dateFrom, date_to: dateTo } })).data
  });

  const setPeriod = (period: "today" | "week" | "month" | "year") => {
    const end = today();
    const starts = { today: end, week: weekStart(), month: monthStart(), year: yearStart() };
    setDateFrom(starts[period]);
    setDateTo(end);
  };

  const totalQuality = quality.length ? Math.round(quality.reduce((sum, row) => sum + row.quality_score, 0) / quality.length) : 0;
  const totalCalls = quality.reduce((sum, row) => sum + row.calls_total, 0);
  const overdue = quality.reduce((sum, row) => sum + row.overdue_clients + row.task_overdue, 0);

  return (
    <>
      <PageHeader title="Контроль" />
      <Stack spacing={2}>
        <PeriodFilters
          dateFrom={dateFrom}
          dateTo={dateTo}
          managerId={managerId}
          managers={managers}
          onDateFrom={setDateFrom}
          onDateTo={setDateTo}
          onManager={setManagerId}
          onPeriod={setPeriod}
        />
        <Box className="control-stat-grid">
          <StatCard label="Среднее качество" value={`${totalQuality}%`} helper="по выбранной команде" icon={<Shield />} />
          <StatCard label="Звонков" value={totalCalls} helper="новые клиенты минус не дозвон" icon={<TrendingUp />} />
          <StatCard label="Причин отказа" value={refusals?.total ?? 0} helper="из ежедневных отчетов" icon={<WarningAmber />} />
          <StatCard label="Просрочки" value={overdue} helper="клиенты и задачи" icon={<Insights />} />
        </Box>
        <MotivationPanel rows={motivation} />
        <QualityPanel rows={quality} />
        <RefusalsPanel data={refusals} />
        <CleanupPanel stats={cleanup} />
      </Stack>
    </>
  );
}
