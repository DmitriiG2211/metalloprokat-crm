import { AddAlert } from "@mui/icons-material";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Stack, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api } from "../api";
import { PageHeader } from "../components/PageHeader";
import { StatusChip } from "../components/StatusChip";
import { Client, Page, User } from "../types";

const endpoints = ["/reminders/today", "/reminders/overdue", "/reminders/upcoming"];
const todayIso = () => {
  const date = new Date();
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
};

export function RemindersPage() {
  const queryClient = useQueryClient();
  const { user } = useOutletContext<{ user: User }>();
  const [tab, setTab] = useState(0);
  const [open, setOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [form, setForm] = useState({ client_id: "", manager_id: "", next_call_date: todayIso() });
  const canAssign = ["admin", "director"].includes(user.role);
  const { data = [] } = useQuery({ queryKey: ["reminders", tab], queryFn: async () => (await api.get<Client[]>(endpoints[tab])).data });
  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get<User[]>("/users")).data,
    enabled: canAssign,
    retry: false
  });
  const { data: clientsPage } = useQuery({
    queryKey: ["reminder-clients", clientSearch],
    queryFn: async () =>
      (
        await api.get<Page<Client>>("/clients", {
          params: { page: 1, page_size: 200, search: clientSearch || undefined }
        })
      ).data,
    enabled: canAssign
  });
  const clients = clientsPage?.items || [];
  const createReminder = useMutation({
    mutationFn: async () =>
      (
        await api.patch(`/clients/${form.client_id}`, {
          manager_id: Number(form.manager_id),
          next_call_date: form.next_call_date
        })
      ).data,
    onSuccess: () => {
      setOpen(false);
      setForm({ client_id: "", manager_id: "", next_call_date: todayIso() });
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
      queryClient.invalidateQueries({ queryKey: ["today-notification-reminders"] });
    }
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    createReminder.mutate();
  };

  return (
    <>
      <PageHeader
        title="Напоминания"
        actions={
          canAssign ? (
            <Button variant="contained" startIcon={<AddAlert />} onClick={() => setOpen(true)}>
              Создать напоминание
            </Button>
          ) : undefined
        }
      />
      <Paper className="glass-surface" sx={{ mb: 2, borderRadius: "8px" }} elevation={0}>
        <Tabs value={tab} onChange={(_, value) => setTab(value)}>
          <Tab label="Сегодня" />
          <Tab label="Просроченные" />
          <Tab label="Будущие" />
        </Tabs>
      </Paper>
      <Paper className="table-scroll glass-surface" sx={{ borderRadius: "8px" }} elevation={0}>
        <Table size="small" className="premium-table">
          <TableHead>
            <TableRow>
              <TableCell>Компания</TableCell>
              <TableCell>Телефон</TableCell>
              <TableCell>Дата перезвона</TableCell>
              <TableCell>Статус</TableCell>
              <TableCell>Менеджер</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.map((client) => (
              <TableRow key={client.id}>
                <TableCell>{client.company_name}</TableCell>
                <TableCell>{client.phone}</TableCell>
                <TableCell>{client.next_call_date}</TableCell>
                <TableCell>
                  <StatusChip status={client.status} />
                </TableCell>
                <TableCell>{client.manager?.login}</TableCell>
              </TableRow>
            ))}
            {data.length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>На выбранный период звонков нет</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm" PaperProps={{ className: "glass-surface", sx: { borderRadius: "8px" } }}>
        <DialogTitle>Новое напоминание</DialogTitle>
        <DialogContent>
          <Stack id="reminder-form" component="form" spacing={2} sx={{ pt: 1 }} onSubmit={submit}>
            <TextField select required label="Менеджер" value={form.manager_id} onChange={(event) => setForm({ ...form, manager_id: event.target.value })}>
              {users
                .filter((manager) => manager.role === "manager")
                .map((manager) => (
                  <MenuItem key={manager.id} value={manager.id}>
                    {manager.login} · {manager.full_name}
                  </MenuItem>
                ))}
            </TextField>
            <TextField label="Поиск клиента" value={clientSearch} onChange={(event) => setClientSearch(event.target.value)} placeholder="Название, телефон или почта" />
            <TextField
              select
              required
              label="Клиент"
              value={form.client_id}
              onChange={(event) => setForm({ ...form, client_id: event.target.value })}
              helperText={clients.length === 0 ? "Клиентов пока нет. Загрузите Excel или уточните поиск." : "Показаны первые 200 активных клиентов"}
            >
              {clients.map((client) => (
                <MenuItem key={client.id} value={client.id}>
                  {client.company_name}
                </MenuItem>
              ))}
            </TextField>
            <TextField required type="date" label="Дата напоминания" InputLabelProps={{ shrink: true }} value={form.next_call_date} onChange={(event) => setForm({ ...form, next_call_date: event.target.value })} />
            {createReminder.isError && (
              <Typography variant="body2" color="error">
                Не удалось создать напоминание
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Отмена</Button>
          <Button form="reminder-form" type="submit" variant="contained" disabled={createReminder.isPending}>
            Создать
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
