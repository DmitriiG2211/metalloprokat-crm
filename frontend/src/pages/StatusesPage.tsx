import { Add, Save } from "@mui/icons-material";
import { Button, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api";
import { PageHeader } from "../components/PageHeader";
import { Status } from "../types";

export function StatusesPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const { data: statuses = [] } = useQuery({ queryKey: ["statuses"], queryFn: async () => (await api.get<Status[]>("/statuses")).data });
  const create = useMutation({
    mutationFn: async () => (await api.post("/statuses", { name, color: "#E9ECEF", sort_order: statuses.length * 10 + 10 })).data,
    onSuccess: () => {
      setName("");
      queryClient.invalidateQueries({ queryKey: ["statuses"] });
    }
  });
  const update = useMutation({
    mutationFn: async (status: Status) => (await api.patch(`/statuses/${status.id}`, status)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["statuses"] })
  });
  return (
    <>
      <PageHeader title="Статусы" />
      <Paper className="glass-surface" sx={{ p: 2, mb: 2, borderRadius: "8px" }} elevation={0}>
        <Stack direction="row" spacing={1}>
          <TextField size="small" label="Новый статус" value={name} onChange={(e) => setName(e.target.value)} />
          <Button variant="contained" startIcon={<Add />} disabled={!name.trim()} onClick={() => create.mutate()}>
            Добавить
          </Button>
        </Stack>
      </Paper>
      <Paper className="glass-surface" sx={{ borderRadius: "8px" }} elevation={0}>
        <Table size="small" className="premium-table">
          <TableHead>
            <TableRow>
              <TableCell>Название</TableCell>
              <TableCell>Цвет</TableCell>
              <TableCell>Порядок</TableCell>
              <TableCell align="right">Сохранить</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {statuses.map((status) => (
              <StatusRow key={status.id} status={status} onSave={(next) => update.mutate(next)} />
            ))}
          </TableBody>
        </Table>
      </Paper>
    </>
  );
}

function StatusRow({ status, onSave }: { status: Status; onSave: (status: Status) => void }) {
  const [local, setLocal] = useState(status);
  return (
    <TableRow>
      <TableCell>
        <TextField size="small" value={local.name} onChange={(e) => setLocal({ ...local, name: e.target.value })} />
      </TableCell>
      <TableCell>
        <TextField size="small" type="color" value={local.color} onChange={(e) => setLocal({ ...local, color: e.target.value })} />
      </TableCell>
      <TableCell>
        <TextField size="small" type="number" value={local.sort_order} onChange={(e) => setLocal({ ...local, sort_order: Number(e.target.value) })} />
      </TableCell>
      <TableCell align="right">
        <Button startIcon={<Save />} onClick={() => onSave(local)}>
          Сохранить
        </Button>
      </TableCell>
    </TableRow>
  );
}
