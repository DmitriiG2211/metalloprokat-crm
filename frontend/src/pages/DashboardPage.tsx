import {
  AccountTree,
  Assignment,
  BackupTable,
  EventBusy,
  EventRepeat,
  Groups,
  Insights,
  OpenInNew,
  People,
  QueryStats,
  UploadFile
} from "@mui/icons-material";
import { Box, Button, Chip, LinearProgress, Paper, Stack, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { ReactNode } from "react";
import { Link as RouterLink, useOutletContext } from "react-router-dom";
import { api } from "../api";
import { PageHeader } from "../components/PageHeader";
import { Client, Page, Task, User } from "../types";

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

interface ManagerReport {
  id: number;
  login: string;
  full_name: string;
  manager_number?: string | null;
  clients_total: number;
}

const taskStatusLabels: Record<string, string> = {
  new: "Новая",
  in_progress: "В работе",
  done: "Выполнена",
  canceled: "Отменена"
};

const todayIso = () => {
  const date = new Date();
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
};

const formatDate = (value?: string | null) => {
  if (!value) return "Без даты";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short" }).format(new Date(value));
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
    <Paper className={`glass-surface crm-metric crm-metric-${tone}`} sx={{ p: 2, borderRadius: "8px" }} elevation={0}>
      <Stack direction="row" spacing={1.25} alignItems="center">
        <Box className="crm-metric-icon">{icon}</Box>
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 850 }}>
          {label}
        </Typography>
      </Stack>
      <Typography variant="h4" sx={{ mt: 1.25, lineHeight: 1 }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75, fontWeight: 700 }}>
        {helper}
      </Typography>
    </Paper>
  );
}

function ObjectCard({
  title,
  description,
  icon,
  to,
  label
}: {
  title: string;
  description: string;
  icon: ReactNode;
  to: string;
  label: string;
}) {
  return (
    <Paper className="glass-surface crm-object-card" sx={{ p: 1.5, borderRadius: "8px" }} elevation={0}>
      <Stack direction="row" spacing={1.25} alignItems="flex-start">
        <Box className="crm-object-icon">{icon}</Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontWeight: 900 }}>{title}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35 }}>
            {description}
          </Typography>
          <Button component={RouterLink} to={to} size="small" endIcon={<OpenInNew />} sx={{ mt: 0.8, px: 0 }}>
            {label}
          </Button>
        </Box>
      </Stack>
    </Paper>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
      {text}
    </Typography>
  );
}

export function DashboardPage() {
  const { user } = useOutletContext<{ user: User }>();
  const canSeeManagers = ["admin", "director", "senior_manager"].includes(user.role);

  const { data: stats } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => (await api.get<DashboardStats>("/reports/dashboard")).data
  });
  const { data: statuses = [] } = useQuery({
    queryKey: ["dashboard-statuses"],
    queryFn: async () => (await api.get<StatusReport[]>("/reports/statuses")).data
  });
  const { data: managers = [] } = useQuery({
    queryKey: ["dashboard-managers"],
    queryFn: async () => (await api.get<ManagerReport[]>("/reports/managers")).data,
    enabled: canSeeManagers,
    retry: false
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

  const activeTasks = tasks.filter((task) => !["done", "canceled"].includes(task.status)).slice(0, 5);
  const focusClients = [...overdueReminders, ...todayReminders].slice(0, 6);
  const totalByStatus = statuses.reduce((sum, status) => sum + status.count, 0);
  const topManagers = [...managers].sort((a, b) => b.clients_total - a.clients_total).slice(0, 5);
  const today = todayIso();

  return (
    <>
      <PageHeader
        title="Рабочий стол"
        actions={
          <>
            <Button component={RouterLink} to="/clients" startIcon={<BackupTable />}>
              Клиенты
            </Button>
            <Button component={RouterLink} to="/import" variant="contained" startIcon={<UploadFile />}>
              Импорт
            </Button>
          </>
        }
      />

      <Box className="crm-metric-grid">
        <Metric label="Всего клиентов" value={stats?.clients_total ?? 0} helper="Активная база без удаленных записей" icon={<People />} tone="blue" />
        <Metric label="Позвонить сегодня" value={stats?.calls_today ?? 0} helper="Запланированные контакты на сегодня" icon={<EventRepeat />} tone="green" />
        <Metric label="Просроченные звонки" value={stats?.overdue_calls ?? 0} helper="Требуют внимания в первую очередь" icon={<EventBusy />} tone="red" />
        <Metric label="Активные задачи" value={stats?.active_tasks ?? 0} helper="Открытые поручения по менеджерам" icon={<Assignment />} tone="amber" />
      </Box>

      <Box className="crm-dashboard-grid">
        <Paper className="glass-surface crm-panel" sx={{ p: 2, borderRadius: "8px" }} elevation={0}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
            <Box>
              <Typography variant="h6">Воронка клиентов</Typography>
              <Typography variant="body2" color="text.secondary">
                Распределение базы по статусам
              </Typography>
            </Box>
            <AccountTree color="primary" />
          </Stack>
          <Stack spacing={1.25}>
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
                      {status.count}
                    </Typography>
                  </Stack>
                  <LinearProgress className="crm-status-progress" variant="determinate" value={percent} sx={{ mt: 0.75 }} />
                </Box>
              );
            })}
            {statuses.length === 0 && <EmptyLine text="Статусы пока не настроены" />}
          </Stack>
        </Paper>

        <Paper className="glass-surface crm-panel" sx={{ p: 2, borderRadius: "8px" }} elevation={0}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
            <Box>
              <Typography variant="h6">Фокус дня</Typography>
              <Typography variant="body2" color="text.secondary">
                Просроченные и сегодняшние перезвоны
              </Typography>
            </Box>
            <Button component={RouterLink} to="/reminders" size="small">
              Открыть
            </Button>
          </Stack>
          <Stack spacing={1}>
            {focusClients.map((client) => (
              <Box className="crm-list-row" key={`${client.id}-${client.next_call_date}`}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {client.company_name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {client.phone || "Телефон не указан"}
                  </Typography>
                </Box>
                <Chip size="small" label={formatDate(client.next_call_date)} color={client.next_call_date && client.next_call_date < today ? "error" : "default"} />
              </Box>
            ))}
            {focusClients.length === 0 && <EmptyLine text="На сегодня критичных перезвонов нет" />}
          </Stack>
        </Paper>

        <Paper className="glass-surface crm-panel" sx={{ p: 2, borderRadius: "8px" }} elevation={0}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
            <Box>
              <Typography variant="h6">Активные задачи</Typography>
              <Typography variant="body2" color="text.secondary">
                Ближайшие поручения в работе
              </Typography>
            </Box>
            <Button component={RouterLink} to="/tasks" size="small">
              Все задачи
            </Button>
          </Stack>
          <Stack spacing={1}>
            {activeTasks.map((task) => (
              <Box className="crm-list-row" key={task.id}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {task.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {task.client?.company_name || task.manager?.login || "Без клиента"}
                  </Typography>
                </Box>
                <Chip size="small" label={taskStatusLabels[task.status] || task.status} />
              </Box>
            ))}
            {activeTasks.length === 0 && <EmptyLine text="Открытых задач нет" />}
          </Stack>
        </Paper>

        <Paper className="glass-surface crm-panel" sx={{ p: 2, borderRadius: "8px" }} elevation={0}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
            <Box>
              <Typography variant="h6">Последние клиенты</Typography>
              <Typography variant="body2" color="text.secondary">
                Недавно обновленные записи
              </Typography>
            </Box>
            <Insights color="primary" />
          </Stack>
          <Stack spacing={1}>
            {recentClients?.items.map((client) => (
              <Box className="crm-list-row" key={client.id}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {client.company_name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {client.manager?.manager_number || client.manager?.login || "Без менеджера"}
                  </Typography>
                </Box>
                <Chip size="small" label={client.status?.name || "Без статуса"} />
              </Box>
            ))}
            {recentClients?.items.length === 0 && <EmptyLine text="Клиентов пока нет" />}
          </Stack>
        </Paper>
      </Box>

      <Box className="crm-object-grid">
        <ObjectCard title="Клиенты" description="Объектная база компаний с inline-редактированием и фильтрами." icon={<BackupTable />} to="/clients" label="Открыть базу" />
        <ObjectCard title="Звонки" description="Сегодня, просрочка и ближайшие напоминания для менеджеров." icon={<EventRepeat />} to="/reminders" label="Проверить" />
        <ObjectCard title="Задачи" description="Поручения, статусы исполнения и контроль сроков." icon={<Assignment />} to="/tasks" label="Перейти" />
        <ObjectCard title="Отчеты" description="Сводка по менеджерам, звонкам, счетам и заявкам." icon={<QueryStats />} to="/reports" label="Смотреть" />
      </Box>

      {canSeeManagers && (
        <Paper className="glass-surface crm-panel" sx={{ p: 2, mt: 2, borderRadius: "8px" }} elevation={0}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
            <Box>
              <Typography variant="h6">Команда продаж</Typography>
              <Typography variant="body2" color="text.secondary">
                Нагрузка менеджеров по количеству клиентов
              </Typography>
            </Box>
            <Groups color="primary" />
          </Stack>
          <Box className="crm-manager-grid">
            {topManagers.map((manager) => (
              <Box className="crm-manager-row" key={manager.id}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 900 }}>
                    {manager.manager_number ? `Менеджер ${manager.manager_number}` : manager.login}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {manager.full_name}
                  </Typography>
                </Box>
                <Typography sx={{ fontWeight: 950 }}>{manager.clients_total}</Typography>
              </Box>
            ))}
            {topManagers.length === 0 && <EmptyLine text="Данные по менеджерам недоступны" />}
          </Box>
        </Paper>
      )}
    </>
  );
}
