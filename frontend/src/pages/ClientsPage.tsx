import { Add, Download, ExpandMore, Phone, Search } from "@mui/icons-material";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Pagination,
  Paper,
  Popover,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, KeyboardEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "../api";
import { PageHeader } from "../components/PageHeader";
import { StatusChip } from "../components/StatusChip";
import { Client, Page, Status, User } from "../types";

type ClientPatch = Partial<Pick<Client, "company_name" | "contact_person" | "phone" | "email" | "website" | "status_id" | "last_call_date" | "next_call_date">>;

const splitContacts = (value?: string | null) =>
  (value || "")
    .split(/\n|;|,(?=\s*(?:\+?\d|[\w.+-]+@))/)
    .map((item) => item.trim())
    .filter(Boolean);

function EditableCell({
  value,
  width,
  multiline,
  type = "text",
  onSave
}: {
  value?: string | null;
  width: number | string;
  multiline?: boolean;
  type?: string;
  onSave: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value || "");

  useEffect(() => {
    setDraft(value || "");
  }, [value]);

  const commit = () => {
    if ((value || "") !== draft) onSave(draft);
  };

  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !multiline) {
      event.currentTarget.blur();
    }
  };

  return (
    <TextField
      className="excel-input"
      value={draft}
      type={type}
      multiline={multiline}
      minRows={multiline ? 1 : undefined}
      maxRows={multiline ? 2 : undefined}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={keyDown}
      variant="standard"
      fullWidth
      InputProps={{ disableUnderline: true }}
      sx={{ width }}
    />
  );
}

function ContactCell({ value, kind, onSave }: { value?: string | null; kind: "phone" | "email"; onSave: (value: string) => void }) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [draft, setDraft] = useState(value || "");
  const items = splitContacts(value);
  const visible = items.slice(0, 2);
  const hidden = items.slice(2);
  const open = Boolean(anchor);

  useEffect(() => {
    setDraft(value || "");
  }, [value]);

  const commit = () => {
    if ((value || "") !== draft) onSave(draft);
    setAnchor(null);
  };

  return (
    <Box sx={{ minWidth: 0 }}>
      {items.length === 0 ? (
        <Typography variant="body2" color="text.secondary">-</Typography>
      ) : (
        <Stack spacing={0.25}>
          {visible.map((item) => (
            <Box key={item} sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 0 }}>
              {kind === "phone" && (
                <Tooltip title="Позвонить">
                  <IconButton size="small" href={`tel:${item.replace(/[^\d+]/g, "")}`} sx={{ width: 24, height: 24 }}>
                    <Phone sx={{ fontSize: 15 }} />
                  </IconButton>
                </Tooltip>
              )}
              <Typography variant="body2" sx={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                {item}
              </Typography>
            </Box>
          ))}
        </Stack>
      )}
      <Button size="small" className="glass-button" endIcon={<ExpandMore />} onClick={(event) => setAnchor(event.currentTarget)} sx={{ mt: 0.4, minHeight: 26, px: 1 }}>
        {hidden.length > 0 ? `еще ${hidden.length}` : "ред."}
      </Button>
      <Popover open={open} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: "bottom", horizontal: "left" }}>
        <Stack spacing={1} sx={{ p: 1.5, width: 360 }}>
          {items.length > 0 && (
            <Stack spacing={0.5}>
              {items.map((item) => (
                <Typography key={item} variant="body2">
                  {item}
                </Typography>
              ))}
            </Stack>
          )}
          <TextField
            label={kind === "phone" ? "Все телефоны" : "Все почты"}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            multiline
            minRows={4}
            size="small"
          />
          <Button variant="contained" onClick={commit}>
            Сохранить
          </Button>
        </Stack>
      </Popover>
    </Box>
  );
}

function CommentCell({ value, onSave }: { value?: string | null; onSave: (value: string) => void }) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [draft, setDraft] = useState(value || "");
  const open = Boolean(anchor);

  useEffect(() => {
    setDraft(value || "");
  }, [value]);

  const compact = (value || "").replace(/\s+/g, " ").trim();

  const commit = () => {
    if (draft.trim() && draft.trim() !== (value || "").trim()) onSave(draft.trim());
    setAnchor(null);
  };

  return (
    <Box className="comment-cell">
      <Typography className="comment-preview" variant="body2" title={compact}>
        {compact || "Добавить комментарий"}
      </Typography>
      <Button size="small" className="glass-button comment-edit-button" endIcon={<ExpandMore />} onClick={(event) => setAnchor(event.currentTarget)}>
        ред.
      </Button>
      <Popover open={open} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: "bottom", horizontal: "left" }}>
        <Stack spacing={1} sx={{ p: 1.5, width: 520 }}>
          <TextField label="Комментарий" value={draft} onChange={(event) => setDraft(event.target.value)} multiline minRows={6} size="small" />
          <Button variant="contained" onClick={commit}>
            Добавить в историю
          </Button>
        </Stack>
      </Popover>
    </Box>
  );
}

function ExcelCell({ children, width }: { children: ReactNode; width: number | string }) {
  return (
    <TableCell sx={{ width, maxWidth: width, p: 0.75, verticalAlign: "top" }}>
      {children}
    </TableCell>
  );
}

export function ClientsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusId, setStatusId] = useState("");
  const [managerId, setManagerId] = useState("");
  const [nextCallFrom, setNextCallFrom] = useState("");
  const [nextCallTo, setNextCallTo] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ company_name: "", contact_person: "", phone: "", email: "", website: "", status_id: "", next_call_date: "" });

  const { data: statuses = [] } = useQuery({ queryKey: ["statuses"], queryFn: async () => (await api.get<Status[]>("/statuses")).data });
  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: async () => (await api.get<User[]>("/users")).data, retry: false });
  const { data, isFetching } = useQuery({
    queryKey: ["clients", page, search, statusId, managerId, nextCallFrom, nextCallTo],
    queryFn: async () =>
      (
        await api.get<Page<Client>>("/clients", {
          params: {
            page,
            page_size: 25,
            search: search || undefined,
            status_id: statusId || undefined,
            manager_id: managerId || undefined,
            next_call_from: nextCallFrom || undefined,
            next_call_to: nextCallTo || undefined
          }
        })
      ).data
  });

  const managers = useMemo(() => users.filter((user) => user.role === "manager"), [users]);

  const updateClient = useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: ClientPatch }) => (await api.patch(`/clients/${id}`, patch)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clients"] })
  });

  const addComment = useMutation({
    mutationFn: async ({ id, comment }: { id: number; comment: string }) => (await api.post(`/clients/${id}/comments`, { comment_text: comment })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clients"] })
  });

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post("/clients", {
          ...form,
          status_id: form.status_id ? Number(form.status_id) : undefined,
          next_call_date: form.next_call_date || undefined
        })
      ).data,
    onSuccess: () => {
      setOpen(false);
      setForm({ company_name: "", contact_person: "", phone: "", email: "", website: "", status_id: "", next_call_date: "" });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    }
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };

  const saveField = (client: Client, patch: ClientPatch) => updateClient.mutate({ id: client.id, patch });

  const downloadExcel = async () => {
    const response = await api.get("/export/clients.xlsx", {
      responseType: "blob",
      params: {
        status_id: statusId || undefined,
        manager_id: managerId || undefined,
        next_call_from: nextCallFrom || undefined,
        next_call_to: nextCallTo || undefined
      }
    });
    const url = URL.createObjectURL(response.data);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "clients.xlsx";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        title="Клиенты"
        actions={
          <>
            <Button startIcon={<Download />} onClick={downloadExcel}>
              Excel
            </Button>
            <Button variant="contained" startIcon={<Add />} onClick={() => setOpen(true)}>
              Добавить
            </Button>
          </>
        }
      />
      <Paper className="glass-surface filter-bar" sx={{ p: 1.5, mb: 1.5, borderRadius: "8px" }} elevation={0}>
        <Box className="filter-grid" sx={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) 150px 150px 150px 150px", gap: 1 }}>
          <TextField size="small" label="Поиск" value={search} onChange={(e) => setSearch(e.target.value)} InputProps={{ startAdornment: <Search fontSize="small" sx={{ mr: 1 }} /> }} />
          <TextField size="small" select label="Статус" value={statusId} onChange={(e) => setStatusId(e.target.value)}>
            <MenuItem value="">Все</MenuItem>
            {statuses.map((status) => (
              <MenuItem key={status.id} value={status.id}>
                {status.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField size="small" select label="Менеджер" value={managerId} onChange={(e) => setManagerId(e.target.value)}>
            <MenuItem value="">Все</MenuItem>
            {managers.map((user) => (
              <MenuItem key={user.id} value={user.id}>
                {user.login}
              </MenuItem>
            ))}
          </TextField>
          <TextField size="small" type="date" label="Перезвон с" InputLabelProps={{ shrink: true }} value={nextCallFrom} onChange={(e) => setNextCallFrom(e.target.value)} />
          <TextField size="small" type="date" label="Перезвон по" InputLabelProps={{ shrink: true }} value={nextCallTo} onChange={(e) => setNextCallTo(e.target.value)} />
        </Box>
      </Paper>

      <Paper className="desktop-table glass-surface excel-sheet" sx={{ borderRadius: "8px", overflow: "hidden" }} elevation={0}>
        <Table size="small" className="premium-table excel-table">
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: "15%" }}>Компания</TableCell>
              <TableCell sx={{ width: "9%" }}>ФИО</TableCell>
              <TableCell sx={{ width: "13%" }}>Телефон</TableCell>
              <TableCell sx={{ width: "13%" }}>Почта</TableCell>
              <TableCell sx={{ width: "8%" }}>Статус</TableCell>
              <TableCell sx={{ width: "19%" }}>Комментарий</TableCell>
              <TableCell sx={{ width: "7%" }}>Звонок</TableCell>
              <TableCell sx={{ width: "8%" }}>Перезвон</TableCell>
              <TableCell sx={{ width: "5%" }}>Менеджер</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data?.items.map((client) => (
              <TableRow key={client.id} hover>
                <ExcelCell width="15%">
                  <EditableCell width="100%" value={client.company_name} onSave={(value) => saveField(client, { company_name: value })} />
                </ExcelCell>
                <ExcelCell width="9%">
                  <EditableCell width="100%" value={client.contact_person} onSave={(value) => saveField(client, { contact_person: value })} />
                </ExcelCell>
                <ExcelCell width="13%">
                  <ContactCell value={client.phone} kind="phone" onSave={(value) => saveField(client, { phone: value })} />
                </ExcelCell>
                <ExcelCell width="13%">
                  <ContactCell value={client.email} kind="email" onSave={(value) => saveField(client, { email: value })} />
                </ExcelCell>
                <ExcelCell width="8%">
                  <TextField
                    className="excel-input"
                    select
                    variant="standard"
                    value={client.status_id || ""}
                    onChange={(event) => saveField(client, { status_id: Number(event.target.value) })}
                    fullWidth
                    InputProps={{ disableUnderline: true }}
                  >
                    {statuses.map((status) => (
                      <MenuItem key={status.id} value={status.id}>
                        <StatusChip status={status} />
                      </MenuItem>
                    ))}
                  </TextField>
                </ExcelCell>
                <ExcelCell width="19%">
                  <CommentCell value={client.last_comment} onSave={(value) => addComment.mutate({ id: client.id, comment: value })} />
                </ExcelCell>
                <ExcelCell width="7%">
                  <EditableCell width="100%" type="date" value={client.last_call_date || ""} onSave={(value) => saveField(client, { last_call_date: value })} />
                </ExcelCell>
                <ExcelCell width="8%">
                  <EditableCell width="100%" type="date" value={client.next_call_date || ""} onSave={(value) => saveField(client, { next_call_date: value })} />
                </ExcelCell>
                <ExcelCell width="5%">
                  <Typography variant="body2" sx={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {client.manager?.manager_number || client.manager?.login}
                  </Typography>
                </ExcelCell>
              </TableRow>
            ))}
            {!isFetching && data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={9}>Клиенты не найдены</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      <Stack className="pagination-bar" direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1.5 }}>
        <Typography variant="body2">Всего: {data?.total ?? 0}</Typography>
        <Pagination count={Math.max(1, Math.ceil((data?.total ?? 0) / 25))} page={page} onChange={(_, value) => setPage(value)} />
      </Stack>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm" PaperProps={{ className: "glass-surface", sx: { borderRadius: "8px" } }}>
        <DialogTitle>Новый клиент</DialogTitle>
        <DialogContent>
          <Stack component="form" id="client-form" spacing={2} sx={{ pt: 1 }} onSubmit={submit}>
            <TextField required label="Компания" value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
            <TextField label="ФИО" value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} />
            <TextField label="Телефон" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <TextField label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <TextField label="Сайт" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            <TextField select label="Статус" value={form.status_id} onChange={(e) => setForm({ ...form, status_id: e.target.value })}>
              <MenuItem value="">Без статуса</MenuItem>
              {statuses.map((status) => (
                <MenuItem key={status.id} value={status.id}>
                  {status.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField type="date" label="Дата перезвона" InputLabelProps={{ shrink: true }} value={form.next_call_date} onChange={(e) => setForm({ ...form, next_call_date: e.target.value })} />
            {create.error && <Typography color="error">{errorMessage(create.error)}</Typography>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Отмена</Button>
          <Button form="client-form" type="submit" variant="contained">
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
