import { AddTask, CheckCircle } from "@mui/icons-material";
import {
  Button,
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
import { FormEvent, useState } from "react";
import { api } from "../api";
import { PageHeader } from "../components/PageHeader";
import { Task, User } from "../types";

const statusLabels: Record<string, string> = {
  new: "Новая",
  in_progress: "В работе",
  done: "Выполнена",
  canceled: "Отменена"
};

const emptyTaskForm = { title: "", manager_id: "", deadline: "", priority: "normal", description: "" };

const formatDate = (value?: string | null) => {
  if (!value) return "Без срока";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(date);
};

export function TasksPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyTaskForm);
  const { data: tasks = [] } = useQuery({ queryKey: ["tasks"], queryFn: async () => (await api.get<Task[]>("/tasks")).data });
  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: async () => (await api.get<User[]>("/users")).data, retry: false });
  const create = useMutation({
    mutationFn: async () => (await api.post("/tasks", { ...form, manager_id: Number(form.manager_id), deadline: form.deadline || undefined })).data,
    onSuccess: () => {
      setOpen(false);
      setForm(emptyTaskForm);
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    }
  });
  const complete = useMutation({
    mutationFn: async (id: number) => (await api.post(`/tasks/${id}/complete`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] })
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };

  return (
    <>
      <PageHeader
        title="Задачи"
        actions={
          <Button variant="contained" startIcon={<AddTask />} onClick={() => setOpen(true)}>
            Создать
          </Button>
        }
      />
      <Paper className="table-scroll glass-surface" sx={{ borderRadius: "8px" }} elevation={0}>
        <Table size="small" className="premium-table">
          <TableHead>
            <TableRow>
              <TableCell>Задача</TableCell>
              <TableCell>Клиент</TableCell>
              <TableCell>Менеджер</TableCell>
              <TableCell>Срок</TableCell>
              <TableCell>Статус</TableCell>
              <TableCell align="right">Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tasks.map((task) => (
              <TableRow key={task.id}>
                <TableCell sx={{ minWidth: 280 }}>
                  <Stack spacing={0.4}>
                    <Typography fontWeight={850} variant="body2">
                      {task.title}
                    </Typography>
                    {task.description && (
                      <Typography color="text.secondary" variant="body2" sx={{ whiteSpace: "pre-wrap", lineHeight: 1.45 }}>
                        {task.description}
                      </Typography>
                    )}
                  </Stack>
                </TableCell>
                <TableCell>{task.client?.company_name}</TableCell>
                <TableCell>{task.manager?.login}</TableCell>
                <TableCell>{formatDate(task.deadline)}</TableCell>
                <TableCell>{statusLabels[task.status] || task.status}</TableCell>
                <TableCell align="right">
                  {task.status !== "done" && (
                    <Button size="small" startIcon={<CheckCircle />} onClick={() => complete.mutate(task.id)}>
                      Выполнить
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {tasks.length === 0 && (
              <TableRow>
                <TableCell colSpan={6}>У вас нет задач</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm" PaperProps={{ className: "glass-surface", sx: { borderRadius: "8px" } }}>
        <DialogTitle>Новая задача</DialogTitle>
        <DialogContent>
          <Stack id="task-form" component="form" spacing={2} sx={{ pt: 1 }} onSubmit={submit}>
            <TextField required label="Название" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <TextField select required label="Менеджер" value={form.manager_id} onChange={(e) => setForm({ ...form, manager_id: e.target.value })}>
              {users
                .filter((user) => user.role === "manager")
                .map((user) => (
                  <MenuItem key={user.id} value={user.id}>
                    {user.login}
                  </MenuItem>
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
    </>
  );
}
