import { Add } from "@mui/icons-material";
import { Button, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api";
import { PageHeader } from "../components/PageHeader";
import { User } from "../types";

export function UsersPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ login: "", password: "", full_name: "", role: "manager", manager_number: "" });
  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: async () => (await api.get<User[]>("/users")).data });
  const create = useMutation({
    mutationFn: async () => (await api.post("/users", { ...form, is_active: true })).data,
    onSuccess: () => {
      setForm({ login: "", password: "", full_name: "", role: "manager", manager_number: "" });
      queryClient.invalidateQueries({ queryKey: ["users"] });
    }
  });
  return (
    <>
      <PageHeader title="Пользователи" />
      <Paper className="glass-surface" sx={{ p: 2, mb: 2, borderRadius: "8px" }} elevation={0}>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          <TextField size="small" label="Логин" value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} />
          <TextField size="small" label="Пароль" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <TextField size="small" label="ФИО" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          <TextField size="small" select label="Роль" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <MenuItem value="manager">Менеджер</MenuItem>
            <MenuItem value="director">Руководитель</MenuItem>
            <MenuItem value="admin">Админ</MenuItem>
          </TextField>
          <TextField size="small" label="Номер" value={form.manager_number} onChange={(e) => setForm({ ...form, manager_number: e.target.value })} />
          <Button variant="contained" startIcon={<Add />} onClick={() => create.mutate()}>
            Добавить
          </Button>
        </Stack>
      </Paper>
      <Paper className="glass-surface" sx={{ borderRadius: "8px" }} elevation={0}>
        <Table size="small" className="premium-table">
          <TableHead>
            <TableRow>
              <TableCell>Логин</TableCell>
              <TableCell>ФИО</TableCell>
              <TableCell>Роль</TableCell>
              <TableCell>Номер</TableCell>
              <TableCell>Активен</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>{user.login}</TableCell>
                <TableCell>{user.full_name}</TableCell>
                <TableCell>{user.role}</TableCell>
                <TableCell>{user.manager_number}</TableCell>
                <TableCell>{user.is_active ? "Да" : "Нет"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </>
  );
}
