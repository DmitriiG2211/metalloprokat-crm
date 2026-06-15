import {
  AccountTree,
  Assignment,
  CalendarMonth,
  EventBusy,
  EventRepeat,
  Groups,
  Insights,
  MoreVert,
  People,
  Phone,
  QueryStats,
  UploadFile
} from "@mui/icons-material";
import {
  Box,
  Button,
  Chip,
  IconButton,
  LinearProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { ReactNode } from "react";
import { Link as RouterLink, useOutletContext } from "react-router-dom";
import { api } from "../api";
import { PageHeader } from "../components/PageHeader";
import { managerDisplayName } from "../display";
import { Client, DailyReportSummaryRow, Page, Task } from "../types";
import type { User } from "../types";

interface DashboardStats {
  clients_total: number;
  calls_today: number;
  overdue_calls: number;
  active_tasks: number;
}

interface StatusReport {
  name: string;
  color: string;
  count: number;
}

const taskStatusLabels: Record<string, string> = {
  new: "Новая",
  in_progress: "В работе",
  done: "Выполнена",
  canceled: "Отменена"
};

const managerPalette = ["#2f80ed", "#42a5f5", "#7e57c2", "#26a69a", "#8d6e63", "#78909c"];

const toIsoDate = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const todayIso = () => toIsoDate(new Date());
const monthStartIso = () => {
  const date = new Date();
  return toIsoDate(new Date(date.getFullYear(), date.getMonth(), 1));
};

const formatDate = (value?: string | null) => {
  if (!value) return "Без даты";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short" }).format(date);
};

function Metric({
  label,
  value,
  helper,
  icon,
  tone
}: {
  label: string;
  value: number;
  helper: string;
  icon: ReactNode;
  tone: "blue" | "green" | "amber" | "red";
}) {
  return (
    <Paper className={`reference-metric crm-metric-${tone}`} elevation={0}>
      <Box className="reference-metric-icon">{icon}</Box>
      <Box>
        <Typography className="reference-metric-label">{label}</Typography>
        <Typography className="reference-metric-value">{value}</Typography>
        <Typography className="reference-metric-helper">{helper}</Typography>
      </Box>
    </Paper>
  );
}

function ManagerAvatar({ number, index = 0 }: { number?: string | null; index?: number }) {
  return (
    <Box className="reference-manager-avatar" sx={{ backgroundColor: managerPalette[index % managerPalette.length] }}>
      {number || "M"}
    </Box>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <Typography variant="body2" color="text.secondary" sx={{ py: 1.5 }}>
      {text}
    </Typography>
  );
}

export function DashboardPage() {
  const { user } = useOutletContext<{ user: User }>();
  const isLeader = ["admin", "director", "senior_manager"].includes(user.role);
  const today = todayIso();

  const { data: stats } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => (await api.get<DashboardStats>("/reports/dashboard")).data
  });
  const { data: statuses = [] } = useQuery({
    queryKey: ["dashboard-statuses"],
    queryFn: async () => (await api.get<StatusReport[]>("/reports/statuses")).data
  });
  const { data: managerSummary = [] } = useQuery({
    queryKey: ["dashboard-manager-summary", monthStartIso(), today],
    queryFn: async () =>
      (
        await api.get<DailyReportSummaryRow[]>("/daily-reports/summary", {
          params: { date_from: monthStartIso(), date_to: today }
        })
      ).data,
    retry: false,
    enabled: isLeader
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ["dashboard-tasks"],
    queryFn: async () => (await api.get<Task[]>("/tasks")).data
  });
  const { data: todayReminders = [] } = useQuery({
    queryKey: ["dashboard-reminders-today"],
    queryFn: async () => (await api.get<Client[]>("/reminders/today")).data
  });
  const { data: overdueReminders = [] } = useQuery({
    queryKey: ["dashboard-reminders-overdue"],
    queryFn: async () => (await api.get<Client[]>("/reminders/overdue")).data
  });
  const { data: recentClients } = useQuery({
    queryKey: ["dashboard-recent-clients"],
    queryFn: async () =>
      (
        await api.get<Page<Client>>("/clients", {
          params: { page: 1, page_size: 5, sort_by: "updated_at", sort_dir: "desc" }
        })
      ).data
  });

  const activeTasks = tasks.filter((task) => !["done", "canceled"].includes(task.status)).slice(0, 6);
  const focusClients = [...overdueReminders, ...todayReminders].slice(0, 6);
  const totalByStatus = statuses.reduce((sum, status) => sum + status.count, 0);
  const topManagers = [...managerSummary]
    .sort((a, b) => b.total_calls + b.invoice_count * 3 + b.advertising_total - (a.total_calls + a.invoice_count * 3 + a.advertising_total))
    .slice(0, 5);

  return (
    <>
      <PageHeader
        title="Рабочий стол"
        actions={
          <>
            <Button component={RouterLink} to="/clients" startIcon={<Groups />}>
              Клиенты
            </Button>
            <Button component={RouterLink} to="/import" variant="contained" startIcon={<UploadFile />}>
              Импорт
            </Button>
          </>
        }
      />

      <Box className="reference-metric-grid">
        <Metric label="Всего клиентов" value={stats?.clients_total ?? 0} helper="Активная база без скрытых записей" icon={<People />} tone="blue" />
        <Metric label="Позвонить сегодня" value={stats?.calls_today ?? 0} helper="Запланированные контакты на сегодня" icon={<EventRepeat />} tone="green" />
        <Metric label="Просроченные звонки" value={stats?.overdue_calls ?? 0} helper="Требуют внимания в первую очередь" icon={<EventBusy />} tone="red" />
        <Metric label="Активные задачи" value={stats?.active_tasks ?? 0} helper="Открытые поручения по менеджерам" icon={<Assignment />} tone="amber" />
      </Box>

      <Box className="reference-dashboard-grid">
        <Paper className="reference-panel" elevation={0}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
            <Box>
              <Typography className="reference-panel-title">Воронка клиентов</Typography>
              <Typography className="reference-panel-subtitle">Распределение базы по статусам</Typography>
            </Box>
            <Chip size="small" icon={<AccountTree />} label="Все менеджеры" />
          </Stack>
          <Stack spacing={1.35}>
            {statuses.map((status) => {
              const percent = totalByStatus ? Math.round((status.count / totalByStatus) * 100) : 0;
              return (
                <Box key={status.name}>
                  <Stack direction="row" justifyContent="space-between" spacing={2}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                      <Box className="crm-status-dot" sx={{ bgcolor: status.color }} />
                      <Typography variant="body2" sx={{ fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {status.name}
                      </Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 850 }}>
                      {status.count} ({percent}%)
                    </Typography>
                  </Stack>
                  <LinearProgress className="crm-status-progress reference-progress" variant="determinate" value={percent} sx={{ mt: 0.8 }} />
                </Box>
              );
            })}
            {statuses.length === 0 && <EmptyLine text="Статусы пока не настроены" />}
          </Stack>
          <Typography className="reference-panel-total">Всего клиентов: {totalByStatus}</Typography>
        </Paper>

        <Paper className="reference-panel" elevation={0}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
            <Box>
              <Typography className="reference-panel-title">Фокус дня</Typography>
              <Typography className="reference-panel-subtitle">Просроченные и сегодняшние перезвоны</Typography>
            </Box>
            <Button component={RouterLink} to="/reminders" size="small">
              Открыть
            </Button>
          </Stack>
          <Stack spacing={0.25}>
            {focusClients.map((client) => {
              const isOverdue = Boolean(client.next_call_date && client.next_call_date < today);
              return (
                <Box className="reference-focus-row" key={`${client.id}-${client.next_call_date}`}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography className="reference-row-title">{client.company_name}</Typography>
                    <Typography className="reference-row-caption">{client.phone || "Телефон не указан"}</Typography>
                  </Box>
                  <Chip
                    size="small"
                    icon={<CalendarMonth />}
                    label={formatDate(client.next_call_date)}
                    color={isOverdue ? "error" : "success"}
                    variant={isOverdue ? "outlined" : "filled"}
                  />
                  <Phone color="primary" fontSize="small" />
                </Box>
              );
            })}
            {focusClients.length === 0 && <EmptyLine text="На сегодня критичных перезвонов нет" />}
          </Stack>
        </Paper>

        {isLeader && (
          <Paper className="reference-panel" elevation={0}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
              <Box>
                <Typography className="reference-panel-title">Лучшие менеджеры</Typography>
                <Typography className="reference-panel-subtitle">Сводка за текущий месяц</Typography>
              </Box>
              <QueryStats color="primary" />
            </Stack>
            <Stack spacing={1}>
              {topManagers.map((manager, index) => (
                <Box className="reference-rank-row" key={manager.manager_id}>
                  <Box className={`reference-rank-place rank-${index + 1}`}>{index + 1}</Box>
                  <ManagerAvatar number={manager.manager_number} index={index} />
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography className="reference-row-title">{managerDisplayName(manager)}</Typography>
                    <Typography className="reference-row-caption">Отчётов: {manager.reports_count}</Typography>
                  </Box>
                  <Box className="reference-rank-stats">
                    <span>{manager.total_calls}<small>звонков</small></span>
                    <span>{manager.invoice_count}<small>счетов</small></span>
                    <span>{manager.advertising_total}<small>реклама</small></span>
                  </Box>
                </Box>
              ))}
              {topManagers.length === 0 && <EmptyLine text="Отчётов по менеджерам пока нет" />}
            </Stack>
            <Button component={RouterLink} to="/reports" size="small" sx={{ mt: 1.5 }}>
              Перейти к отчёту
            </Button>
          </Paper>
        )}
      </Box>

      <Paper className="reference-table-card" elevation={0}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
          <Box>
            <Typography className="reference-panel-title">Активные задачи</Typography>
            <Typography className="reference-panel-subtitle">Ближайшие поручения в работе</Typography>
          </Box>
          <Button component={RouterLink} to="/tasks" size="small">
            Все задачи
          </Button>
        </Stack>
        <div className="table-scroll">
          <Table size="small" className="premium-table reference-task-table">
            <TableHead>
              <TableRow>
                <TableCell>Задача</TableCell>
                <TableCell>Клиент</TableCell>
                <TableCell>Менеджер</TableCell>
                <TableCell>Срок</TableCell>
                <TableCell>Статус</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {activeTasks.map((task, index) => (
                <TableRow key={task.id}>
                  <TableCell>
                    <Typography variant="body2" fontWeight={850}>{task.title}</Typography>
                  </TableCell>
                  <TableCell>{task.client?.company_name || "Без клиента"}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <ManagerAvatar number={task.manager?.manager_number} index={index} />
                      <span>{managerDisplayName(task.manager)}</span>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Chip size="small" icon={<CalendarMonth />} label={formatDate(task.deadline)} />
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={taskStatusLabels[task.status] || task.status} />
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" component={RouterLink} to="/tasks">
                      <MoreVert fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {activeTasks.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>Открытых задач нет</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Paper>

      <Paper className="reference-table-card reference-recent-card" elevation={0}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
          <Box>
            <Typography className="reference-panel-title">Последние изменения в базе</Typography>
            <Typography className="reference-panel-subtitle">Недавно обновлённые клиенты</Typography>
          </Box>
          <Insights color="primary" />
        </Stack>
        <Box className="reference-recent-grid">
          {recentClients?.items.map((client, index) => (
            <Box className="reference-recent-item" key={client.id}>
              <ManagerAvatar number={client.manager?.manager_number} index={index} />
              <Box sx={{ minWidth: 0 }}>
                <Typography className="reference-row-title">{client.company_name}</Typography>
                <Typography className="reference-row-caption">{managerDisplayName(client.manager)} · {client.status?.name || "Без статуса"}</Typography>
              </Box>
            </Box>
          ))}
          {recentClients?.items.length === 0 && <EmptyLine text="Клиентов пока нет" />}
        </Box>
      </Paper>
    </>
  );
}
