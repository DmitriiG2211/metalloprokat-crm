import { AddTask, CalendarMonth, CheckCircle, Delete, Search, Tune } from "@mui/icons-material";
import {
  Box,
  Button,
  Checkbox,
  Chip,
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
import { FormEvent, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api } from "../api";
import { PageHeader } from "../components/PageHeader";
import { managerDisplayName } from "../display";
import { Task, User } from "../types";

const statusLabels: Record<string, string> = {
  new: "Новая",
  in_progress: "В работе",
  done: "Выполнена",
  canceled: "Отменена"
};

const priorityLabels: Record<string, string> = {
  low: "Низкий",
  normal: "Обычный",
  high: "Высокий",
  urgent: "Срочно"
};

const emptyTaskForm = { title: "", manager_id: "", deadline: "", priority: "normal", description: "" };

const formatDate = (value?: string | null) => {
  if (!value) return "Без срока";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(date);
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "Не выполнена";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
};

export function TasksPage() {
  const queryClient = useQueryClient();
  const { user } = useOutletContext<{ user: User }>();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyTaskForm);
  const [completeTask, setCompleteTask] = useState<Task | null>(null);
  const [managerComment, setManagerComment] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [managerFilter, setManagerFilter] = useState("");
  const [deadlineFilter, setDeadlineFilter] = useState("");
  const { data: tasks = [] } = useQuery({ queryKey: ["tasks"], queryFn: async () => (await api.get<Task[]>("/tasks")).data });
  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: async () => (await api.get<User[]>("/users")).data, retry: false });
  const canDeleteTasks = ["admin", "director", "senior_manager"].includes(user.role);

  const managers = useMemo(() => users.filter((user) => user.role === "manager"), [users]);
  const filteredTasks = useMemo(() => {
    const term = search.trim().toLowerCase();
    return tasks.filter((task) => {
      const text = [task.title, task.description, task.client?.company_name, managerDisplayName(task.manager)].filter(Boolean).join(" ").toLowerCase();
      return (
        (!term || text.includes(term)) &&
        (!statusFilter || task.status === statusFilter) &&
        (!priorityFilter || task.priority === priorityFilter) &&
        (!managerFilter || String(task.manager_id) === managerFilter) &&
        (!deadlineFilter || task.deadline === deadlineFilter)
      );
    });
  }, [deadlineFilter, managerFilter, priorityFilter, search, statusFilter, tasks]);

  const create = useMutation({
    mutationFn: async () => (await api.post("/tasks", { ...form, manager_id: Number(form.manager_id), deadline: form.deadline || undefined })).data,
    onSuccess: () => {
      setOpen(false);
      setForm(emptyTaskForm);
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    }
  });
  const complete = useMutation({
    mutationFn: async ({ id, manager_comment }: { id: number; manager_comment?: string }) => (await api.post(`/tasks/${id}/complete`, { manager_comment })).data,
    onSuccess: () => {
      setCompleteTask(null);
      setManagerComment("");
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    }
  });
  const deleteTask = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/tasks/${id}`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] })
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };

  const openCompleteDialog = (task: Task) => {
    setCompleteTask(task);
    setManagerComment(task.manager_comment || "");
  };

  const submitComplete = () => {
    if (!completeTask) return;
    complete.mutate({ id: completeTask.id, manager_comment: managerComment });
  };

  const removeTask = (task: Task) => {
    if (window.confirm(`Удалить задачу "${task.title}"?`)) {
      deleteTask.mutate(task.id);
    }
  };

  return (
    <>
      <PageHeader
        title="Задачи"
        actions={
          <Button variant="contained" startIcon={<AddTask />} onClick={() => setOpen(true)}>
            Создать задачу
          </Button>
        }
      />

      <Paper className="reference-filter-card" elevation={0}>
        <Box className="reference-filter-grid">
          <TextField size="small" label="Поиск" placeholder="Задача, клиент, описание..." value={search} onChange={(e) => setSearch(e.target.value)} InputProps={{ startAdornment: <Search fontSize="small" sx={{ mr: 1 }} /> }} />
          <TextField select size="small" label="Статус" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <MenuItem value="">Все статусы</MenuItem>
            {Object.entries(statusLabels).map(([key, label]) => (
              <MenuItem key={key} value={key}>{label}</MenuItem>
            ))}
          </TextField>
          <TextField select size="small" label="Приоритет" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
            <MenuItem value="">Все приоритеты</MenuItem>
            {Object.entries(priorityLabels).map(([key, label]) => (
              <MenuItem key={key} value={key}>{label}</MenuItem>
            ))}
          </TextField>
          <TextField select size="small" label="Менеджер" value={managerFilter} onChange={(e) => setManagerFilter(e.target.value)}>
            <MenuItem value="">Все менеджеры</MenuItem>
            {managers.map((manager) => (
              <MenuItem key={manager.id} value={manager.id}>{managerDisplayName(manager)}</MenuItem>
            ))}
          </TextField>
          <TextField type="date" size="small" label="Срок" value={deadlineFilter} onChange={(e) => setDeadlineFilter(e.target.value)} InputLabelProps={{ shrink: true }} />
          <Chip icon={<Tune />} label={`Найдено: ${filteredTasks.length}`} className="reference-filter-chip" />
        </Box>
      </Paper>

      <Paper className="reference-table-card" elevation={0}>
        <div className="table-scroll">
          <Table size="small" className="premium-table reference-tasks-table">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" />
                <TableCell>Задача</TableCell>
                <TableCell>Клиент</TableCell>
                <TableCell>Менеджер</TableCell>
                <TableCell>Срок</TableCell>
                <TableCell>Приоритет</TableCell>
                <TableCell>Статус</TableCell>
                <TableCell>Выполнено</TableCell>
                <TableCell align="right">Действия</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredTasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell padding="checkbox">
                    <Checkbox checked={task.status === "done"} disabled={task.status === "done"} onChange={() => openCompleteDialog(task)} />
                  </TableCell>
                  <TableCell sx={{ minWidth: 320 }}>
                    <Stack spacing={0.35}>
                      <Typography fontWeight={850} variant="body2">{task.title}</Typography>
                      {task.description && <Typography color="text.secondary" variant="body2" className="reference-task-description">{task.description}</Typography>}
                      {task.manager_comment && (
                        <Typography color="text.secondary" variant="body2" className="reference-task-description">
                          Комментарий менеджера: {task.manager_comment}
                        </Typography>
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell>{task.client?.company_name || "Без клиента"}</TableCell>
                  <TableCell>{managerDisplayName(task.manager)}</TableCell>
                  <TableCell>
                    <Chip size="small" icon={<CalendarMonth />} label={formatDate(task.deadline)} />
                  </TableCell>
                  <TableCell>
                    <Chip size="small" className={`priority-chip priority-${task.priority || "normal"}`} label={priorityLabels[task.priority] || task.priority || "Обычный"} />
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={statusLabels[task.status] || task.status} />
                  </TableCell>
                  <TableCell>{formatDateTime(task.completed_at)}</TableCell>
                  <TableCell align="right">
                    {task.status !== "done" && (
                      <Button size="small" startIcon={<CheckCircle />} onClick={() => openCompleteDialog(task)}>
                        Выполнить
                      </Button>
                    )}
                    {canDeleteTasks && (
                      <Button size="small" color="error" startIcon={<Delete />} onClick={() => removeTask(task)} disabled={deleteTask.isPending}>
                        Удалить
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {filteredTasks.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9}>Задачи не найдены</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Paper>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm" PaperProps={{ className: "glass-surface", sx: { borderRadius: "12px" } }}>
        <DialogTitle>Новая задача</DialogTitle>
        <DialogContent>
          <Stack id="task-form" component="form" spacing={2} sx={{ pt: 1 }} onSubmit={submit}>
            <TextField required label="Название" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <TextField select required label="Менеджер" value={form.manager_id} onChange={(e) => setForm({ ...form, manager_id: e.target.value })}>
              {managers.map((user) => (
                <MenuItem key={user.id} value={user.id}>{managerDisplayName(user)}</MenuItem>
              ))}
            </TextField>
            <TextField select label="Приоритет" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              {Object.entries(priorityLabels).map(([key, label]) => (
                <MenuItem key={key} value={key}>{label}</MenuItem>
              ))}
            </TextField>
            <TextField
              type="date"
              label="Срок"
              helperText={form.deadline ? formatDate(form.deadline) : "Выберите дату в календаре"}
              InputLabelProps={{ shrink: true }}
              value={form.deadline}
              onChange={(e) => setForm({ ...form, deadline: e.target.value })}
            />
            <TextField multiline minRows={3} label="Описание" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Отмена</Button>
          <Button form="task-form" type="submit" variant="contained">
            Создать
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={Boolean(completeTask)} onClose={() => setCompleteTask(null)} fullWidth maxWidth="sm" PaperProps={{ className: "glass-surface", sx: { borderRadius: "12px" } }}>
        <DialogTitle>Выполнить задачу</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            <Typography fontWeight={900}>{completeTask?.title}</Typography>
            <TextField
              label="Комментарий менеджера"
              value={managerComment}
              onChange={(event) => setManagerComment(event.target.value)}
              multiline
              minRows={3}
              placeholder="Что сделано, результат, что важно знать руководителю"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCompleteTask(null)}>Отмена</Button>
          <Button variant="contained" startIcon={<CheckCircle />} onClick={submitComplete} disabled={complete.isPending}>
            Выполнить
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
