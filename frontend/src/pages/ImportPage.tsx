import { CloudUpload, DoneAll } from "@mui/icons-material";
import { Alert, Button, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api, errorMessage } from "../api";
import { PageHeader } from "../components/PageHeader";
import { User } from "../types";

export function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [managerId, setManagerId] = useState("");
  const [preview, setPreview] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: async () => (await api.get<User[]>("/users")).data });

  const previewFile = async () => {
    if (!file) return;
    setError("");
    const form = new FormData();
    form.append("file", file);
    try {
      setPreview((await api.post("/import/preview", form)).data);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const confirm = async () => {
    if (!file || !managerId) return;
    setError("");
    const form = new FormData();
    form.append("file", file);
    form.append("assigned_manager_id", managerId);
    form.append("mapping_json", JSON.stringify(preview?.mapping || {}));
    try {
      setResult((await api.post("/import/confirm", form)).data);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <>
      <PageHeader title="Импорт Excel" />
      <Paper className="glass-surface" sx={{ p: 2, mb: 2, borderRadius: "8px" }} elevation={0}>
        <Stack spacing={2} sx={{ maxWidth: 720 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Button component="label" variant="outlined" startIcon={<CloudUpload />} sx={{ alignSelf: "flex-start" }}>
            Выбрать файл
            <input hidden type="file" accept=".xlsx,.xls,.csv" onChange={(event) => setFile(event.target.files?.[0] || null)} />
          </Button>
          {file && <Typography>{file.name}</Typography>}
          <TextField select label="Назначить менеджеру" value={managerId} onChange={(e) => setManagerId(e.target.value)}>
            {users
              .filter((user) => user.role === "manager")
              .map((user) => (
                <MenuItem key={user.id} value={user.id}>
                  {user.login} · {user.full_name}
                </MenuItem>
              ))}
          </TextField>
          <Stack direction="row" spacing={1}>
            <Button variant="contained" onClick={previewFile} disabled={!file}>
              Предпросмотр
            </Button>
            <Button variant="contained" color="success" startIcon={<DoneAll />} onClick={confirm} disabled={!preview || !managerId}>
              Импортировать
            </Button>
          </Stack>
        </Stack>
      </Paper>
      {preview && (
        <Paper className="glass-surface" sx={{ p: 2, mb: 2, borderRadius: "8px" }} elevation={0}>
          <Typography fontWeight={800} sx={{ mb: 1 }}>
            Найдено строк: {preview.total_rows}
          </Typography>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Сопоставление колонок: {Object.entries(preview.mapping).map(([k, v]) => `${k}: ${v || "не найдено"}`).join(", ")}
          </Typography>
          <div className="table-scroll">
            <Table size="small">
              <TableHead>
                <TableRow>{preview.columns.map((column: string) => <TableCell key={column}>{column}</TableCell>)}</TableRow>
              </TableHead>
              <TableBody>
                {preview.preview_rows.slice(0, 8).map((row: any, index: number) => (
                  <TableRow key={index}>
                    {preview.columns.map((column: string) => (
                      <TableCell key={column}>{String(row[column] ?? "")}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Paper>
      )}
      {result && (
        <Alert severity="success">
          Импорт завершен: создано {result.created_count}, дублей {result.duplicate_count}, пропущено {result.skipped_count}, ошибок {result.error_count}
        </Alert>
      )}
    </>
  );
}
