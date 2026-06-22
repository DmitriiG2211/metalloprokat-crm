import { CloudUpload, DoneAll, Restore, TableRows, TipsAndUpdates } from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Chip,
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
import { useState } from "react";
import { api, errorMessage } from "../api";
import { PageHeader } from "../components/PageHeader";
import { managerDisplayName } from "../display";
import { ImportJob, ImportRollbackResult, User } from "../types";

const mappingFields = [
  ["company_name", "Компания / наименование клиента"],
  ["contact_person", "Контактное лицо"],
  ["phone", "Телефон"],
  ["email", "Почта"],
  ["website", "Сайт"],
  ["comment", "Комментарий"],
  ["last_call_date", "Дата звонка"],
  ["next_call_date", "Дата перезвона"]
] as const;

const formatDateTime = (value?: string | null) => {
  if (!value) return "";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
};

export function ImportPage() {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [managerId, setManagerId] = useState("");
  const [preview, setPreview] = useState<any>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [result, setResult] = useState<any>(null);
  const [rollbackResult, setRollbackResult] = useState<ImportRollbackResult | null>(null);
  const [error, setError] = useState("");
  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: async () => (await api.get<User[]>("/users")).data });
  const { data: imports = [] } = useQuery({ queryKey: ["imports"], queryFn: async () => (await api.get<ImportJob[]>("/imports")).data });
  const managerById = new Map(users.map((user) => [user.id, managerDisplayName(user)]));

  const rollbackImport = useMutation({
    mutationFn: async (importId: number) => (await api.post<ImportRollbackResult>(`/imports/${importId}/rollback`)).data,
    onSuccess: (data) => {
      setRollbackResult(data);
      queryClient.invalidateQueries({ queryKey: ["imports"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (err) => setError(errorMessage(err))
  });

  const previewFile = async () => {
    if (!file) return;
    setError("");
    setResult(null);
    setRollbackResult(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const data = (await api.post("/import/preview", form)).data;
      setPreview(data);
      setMapping(data.mapping || {});
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const confirm = async () => {
    if (!file || !managerId) return;
    setError("");
    setRollbackResult(null);
    const form = new FormData();
    form.append("file", file);
    form.append("assigned_manager_id", managerId);
    form.append("mapping_json", JSON.stringify(mapping || preview?.mapping || {}));
    try {
      setResult((await api.post("/import/confirm", form)).data);
      queryClient.invalidateQueries({ queryKey: ["imports"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const confirmRollback = (job: ImportJob) => {
    const ok = window.confirm(`Откатить импорт "${job.filename}"? Клиенты из этого импорта будут скрыты из базы, запись импорта останется в истории.`);
    if (ok) rollbackImport.mutate(job.id);
  };

  return (
    <>
      <PageHeader title="Импорт Excel" />

      <Paper className="reference-import-card" elevation={0}>
        <Box className="reference-import-grid">
          <Box className="reference-upload-zone">
            <CloudUpload />
            <Typography className="reference-panel-title">Загрузка базы клиентов</Typography>
            <Typography className="reference-panel-subtitle">Поддерживаются .xlsx, .xls и .csv. Цвета строк Excel будут учтены при назначении статусов.</Typography>
            <Button component="label" variant="contained" startIcon={<CloudUpload />}>
              Выбрать файл
              <input hidden type="file" accept=".xlsx,.xls,.csv" onChange={(event) => setFile(event.target.files?.[0] || null)} />
            </Button>
            {file && <Chip className="reference-file-chip" icon={<TableRows />} label={file.name} />}
          </Box>

          <Stack spacing={1.5} className="reference-import-settings">
            <Typography className="reference-panel-title">Настройки импорта</Typography>
            <TextField select label="Назначить менеджеру" value={managerId} onChange={(event) => setManagerId(event.target.value)}>
              {users
                .filter((user) => user.role === "manager")
                .map((user) => (
                  <MenuItem key={user.id} value={user.id}>
                    {managerDisplayName(user)}
                  </MenuItem>
                ))}
            </TextField>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Button variant="outlined" onClick={previewFile} disabled={!file}>
                Предпросмотр
              </Button>
              <Button variant="contained" color="success" startIcon={<DoneAll />} onClick={confirm} disabled={!preview || !managerId}>
                Импортировать
              </Button>
            </Stack>
            {error && <Alert severity="error">{error}</Alert>}
            {result && (
              <Alert severity="success">
                Импорт завершён: создано {result.created_count}, дублей {result.duplicate_count}, пропущено {result.skipped_count}, ошибок {result.error_count}
              </Alert>
            )}
            {rollbackResult && <Alert severity="info">Откат выполнен: скрыто клиентов {rollbackResult.rolled_back_clients}</Alert>}
          </Stack>

          <Box className="reference-import-note">
            <TipsAndUpdates />
            <Typography className="reference-panel-title">Как это работает</Typography>
            <Typography variant="body2" color="text.secondary">
              Сначала проверьте предпросмотр, затем назначьте менеджера и подтвердите импорт. Если файл загрузили ошибочно, его можно откатить из истории без удаления записи.
            </Typography>
          </Box>
        </Box>
      </Paper>

      {preview && (
        <Paper className="reference-table-card" elevation={0}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
            <Box>
              <Typography className="reference-panel-title">Предпросмотр данных</Typography>
              <Typography className="reference-panel-subtitle">Найдено строк: {preview.total_rows}</Typography>
            </Box>
            <Chip label={`Колонок: ${preview.columns.length}`} />
          </Stack>
          <Box className="import-mapping-grid" sx={{ mb: 2 }}>
            {mappingFields.map(([key, label]) => (
              <TextField
                key={key}
                select
                size="small"
                label={label}
                value={mapping[key] || ""}
                onChange={(event) => setMapping((current) => ({ ...current, [key]: event.target.value || null }))}
              >
                <MenuItem value="">Не использовать</MenuItem>
                {preview.columns.map((column: string) => (
                  <MenuItem key={`${key}-${column}`} value={column}>
                    {column}
                  </MenuItem>
                ))}
              </TextField>
            ))}
          </Box>
          <div className="table-scroll">
            <Table size="small" className="premium-table">
              <TableHead>
                <TableRow>
                  {preview.columns.map((column: string) => (
                    <TableCell key={column}>{column}</TableCell>
                  ))}
                </TableRow>
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

      <Paper className="reference-table-card" elevation={0}>
        <Typography className="reference-panel-title" sx={{ mb: 1.5 }}>
          История импортов
        </Typography>
        <div className="table-scroll">
          <Table size="small" className="premium-table">
            <TableHead>
              <TableRow>
                <TableCell>Дата</TableCell>
                <TableCell>Файл</TableCell>
                <TableCell>Менеджер</TableCell>
                <TableCell>Строк</TableCell>
                <TableCell>Создано</TableCell>
                <TableCell>Дубли</TableCell>
                <TableCell>Ошибки</TableCell>
                <TableCell>Статус</TableCell>
                <TableCell align="right">Действие</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {imports.map((job) => {
                const rolledBack = job.status === "rolled_back" || Boolean(job.rolled_back_at);
                return (
                  <TableRow key={job.id}>
                    <TableCell>{formatDateTime(job.created_at)}</TableCell>
                    <TableCell>{job.filename}</TableCell>
                    <TableCell>{managerById.get(job.assigned_manager_id) || job.assigned_manager_id}</TableCell>
                    <TableCell>{job.total_rows}</TableCell>
                    <TableCell>{job.created_count}</TableCell>
                    <TableCell>{job.duplicate_count}</TableCell>
                    <TableCell>{job.error_count}</TableCell>
                    <TableCell>
                      <Chip size="small" color={rolledBack ? "warning" : "success"} label={rolledBack ? "Откатан" : "Активен"} />
                    </TableCell>
                    <TableCell align="right">
                      <Button size="small" startIcon={<Restore />} disabled={rolledBack || job.created_count === 0 || rollbackImport.isPending} onClick={() => confirmRollback(job)}>
                        Откатить
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {imports.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9}>
                    <Typography color="text.secondary">Импортов пока нет</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Paper>
    </>
  );
}
