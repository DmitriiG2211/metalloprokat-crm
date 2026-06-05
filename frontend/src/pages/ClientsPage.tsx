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
import { FormEvent, KeyboardEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api, errorMessage } from "../api";
import { PageHeader } from "../components/PageHeader";
import { StatusChip } from "../components/StatusChip";
import { Client, Page, Status, User } from "../types";

type ClientPatch = Partial<Pick<Client, "company_name" | "contact_person" | "phone" | "email" | "website" | "status_id" | "last_call_date" | "next_call_date">>;

const CLIENTS_PAGE_SIZE = 50;

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
  const hidden = items.slice(2);
  const open = Boolean(anchor);

  useEffect(() => {
    setDraft(value || "");
  }, [value]);

  const commit = () => {
    if ((value || "") !== draft) onSave(draft);
    setAnchor(null);
  };

  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.currentTarget.blur();
    }
  };

  return (
    <Box className="contact-cell">
      {kind === "phone" && items[0] && (
        <Tooltip title="Позвонить">
          <IconButton className="contact-call-button" size="small" href={`tel:${items[0].replace(/[^\d+]/g, "")}`}>
            <Phone sx={{ fontSize: 15 }} />
          </IconButton>
        </Tooltip>
      )}
      <TextField
        className="excel-input contact-inline-input"
        value={draft}
        placeholder={kind === "phone" ? "Телефон" : "Email"}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={keyDown}
        multiline
        minRows={2}
        maxRows={2}
        variant="standard"
        fullWidth
        InputProps={{ disableUnderline: true }}
      />
      {hidden.length > 0 && (
        <Button size="small" className="contact-more-button" endIcon={<ExpandMore />} onMouseDown={(event) => event.preventDefault()} onClick={(event) => setAnchor(event.currentTarget)}>
          +{hidden.length}
        </Button>
      )}
      <Popover open={open} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: "bottom", horizontal: "left" }}>
        <Stack spacing={1} sx={{ p: 1.5, width: { xs: "calc(100dvw - 32px)", sm: 360 } }}>
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
  const [draft, setDraft] = useState(value || "");

  useEffect(() => {
    setDraft(value || "");
  }, [value]);

  const commit = () => {
    if (draft.trim() && draft.trim() !== (value || "").trim()) onSave(draft.trim());
  };

  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.currentTarget.blur();
    }
  };

  return (
    <Box className="comment-cell">
      <TextField
        className="excel-input comment-inline-input"
        value={draft}
        placeholder="Добавить комментарий"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={keyDown}
        multiline
        minRows={3}
        maxRows={3}
        variant="standard"
        fullWidth
        InputProps={{ disableUnderline: true }}
      />
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

function MobileClientCard({
  client,
  statuses,
  saveField,
  addComment
}: {
  client: Client;
  statuses: Status[];
  saveField: (client: Client, patch: ClientPatch) => void;
  addComment: (id: number, comment: string) => void;
}) {
  return (
    <Paper className="glass-surface mobile-client-card" elevation={0}>
      <Stack spacing={1.25}>
        <Box className="mobile-card-head">
          <EditableCell width="100%" value={client.company_name} onSave={(value) => saveField(client, { company_name: value })} />
          <Typography variant="caption" sx={{ fontWeight: 900, color: "text.secondary" }}>
            {client.manager?.manager_number || client.manager?.login || "-"}
          </Typography>
        </Box>

        <Box className="mobile-card-grid">
          <Box>
            <Typography className="mobile-field-label" variant="caption">ФИО</Typography>
            <EditableCell width="100%" value={client.contact_person} onSave={(value) => saveField(client, { contact_person: value })} />
          </Box>
          <Box>
            <Typography className="mobile-field-label" variant="caption">Статус</Typography>
            <TextField
              className="excel-input mobile-select"
              select
              variant="standard"
              value={client.status_id || ""}
              onChange={(event) => saveField(client, { status_id: Number(event.target.value) })}
              fullWidth
              InputProps={{ disableUnderline: true }}
            >
              <MenuItem value="">Без статуса</MenuItem>
              {statuses.map((status) => (
                <MenuItem key={status.id} value={status.id}>
                  <StatusChip status={status} />
                </MenuItem>
              ))}
            </TextField>
          </Box>
        </Box>

        <Box className="mobile-card-grid">
          <Box>
            <Typography className="mobile-field-label" variant="caption">Телефон</Typography>
            <ContactCell value={client.phone} kind="phone" onSave={(value) => saveField(client, { phone: value })} />
          </Box>
          <Box>
            <Typography className="mobile-field-label" variant="caption">Почта</Typography>
            <ContactCell value={client.email} kind="email" onSave={(value) => saveField(client, { email: value })} />
          </Box>
        </Box>

        <Box>
          <Typography className="mobile-field-label" variant="caption">Комментарий</Typography>
          <CommentCell value={client.last_comment} onSave={(value) => addComment(client.id, value)} />
        </Box>

        <Box className="mobile-card-grid dates">
          <Box>
            <Typography className="mobile-field-label" variant="caption">Звонок</Typography>
            <EditableCell width="100%" type="date" value={client.last_call_date || ""} onSave={(value) => saveField(client, { last_call_date: value })} />
          </Box>
          <Box>
            <Typography className="mobile-field-label" variant="caption">Перезвон</Typography>
            <EditableCell width="100%" type="date" value={client.next_call_date || ""} onSave={(value) => saveField(client, { next_call_date: value })} />
          </Box>
        </Box>
      </Stack>
    </Paper>
  );
}

export function ClientsPage() {
  const { user } = useOutletContext<{ user: User }>();
  const queryClient = useQueryClient();
  const pageStorageKey = `crm_clients_page_${user.id}`;
  const [page, setPage] = useState(() => {
    const stored = Number(localStorage.getItem(pageStorageKey));
    return Number.isFinite(stored) && stored > 0 ? stored : 1;
  });
  const [search, setSearch] = useState("");
  const [statusId, setStatusId] = useState("");
  const [managerId, setManagerId] = useState("");
  const [nextCallFrom, setNextCallFrom] = useState("");
  const [nextCallTo, setNextCallTo] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ company_name: "", contact_person: "", phone: "", email: "", website: "", status_id: "", next_call_date: "" });
  const didInitFilters = useRef(false);

  useEffect(() => {
    localStorage.setItem(pageStorageKey, String(page));
  }, [page, pageStorageKey]);

  useEffect(() => {
    if (!didInitFilters.current) {
      didInitFilters.current = true;
      return;
    }
    setPage(1);
  }, [search, statusId, managerId, nextCallFrom, nextCallTo]);

  const { data: statuses = [] } = useQuery({ queryKey: ["statuses"], queryFn: async () => (await api.get<Status[]>("/statuses")).data });
  const canSeeManagers = ["admin", "director", "senior_manager"].includes(user.role);
  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get<User[]>("/users")).data,
    enabled: canSeeManagers,
    retry: false
  });
  const { data, isFetching } = useQuery({
    queryKey: ["clients", page, search, statusId, managerId, nextCallFrom, nextCallTo],
    queryFn: async () =>
      (
        await api.get<Page<Client>>("/clients", {
          params: {
            page,
            page_size: CLIENTS_PAGE_SIZE,
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

      <Stack className="mobile-list mobile-client-list" spacing={1.25}>
        {data?.items.map((client) => (
          <MobileClientCard
            key={client.id}
            client={client}
            statuses={statuses}
            saveField={saveField}
            addComment={(id, comment) => addComment.mutate({ id, comment })}
          />
        ))}
        {!isFetching && data?.items.length === 0 && (
          <Paper className="glass-surface mobile-empty-state" elevation={0}>
            <Typography>Клиенты не найдены</Typography>
          </Paper>
        )}
      </Stack>

      <Stack className="pagination-bar" direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1.5 }}>
        <Typography variant="body2">Всего: {data?.total ?? 0}</Typography>
        <Pagination count={Math.max(1, Math.ceil((data?.total ?? 0) / CLIENTS_PAGE_SIZE))} page={page} onChange={(_, value) => setPage(value)} />
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
