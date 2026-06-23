import { Add, Delete, Download, ExpandMore, History, OpenInNew, Phone, Search } from "@mui/icons-material";
import {
  Box,
  Button,
  Checkbox,
  Chip,
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
  Typography,
  useMediaQuery
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, KeyboardEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { api, errorMessage } from "../api";
import { PageHeader } from "../components/PageHeader";
import { StatusChip } from "../components/StatusChip";
import { managerDisplayName } from "../display";
import { Client, ClientHistory, Page, Status, User } from "../types";

type ClientPatch = Partial<Pick<Client, "company_name" | "contact_person" | "phone" | "email" | "website" | "status_id" | "last_call_date" | "next_call_date">>;

const CLIENTS_PAGE_SIZE = 50;
const COMMENT_TEMPLATES = [
  "Недозвон",
  "Автоответчик",
  "Не берут трубку",
  "КП отправлено на почту",
  "Перезвонить позже",
  "Не закупают сейчас",
  "Не работают с металлом",
  "Сами продают металл",
  "Есть свой поставщик",
  "Контактный клиент"
];

const splitContacts = (value?: string | null) =>
  (value || "")
    .split(/\n|;|,(?=\s*(?:\+?\d|[\w.+-]+@))/)
    .map((item) => item.trim())
    .filter(Boolean);

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));

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

function CompanyCell({ client, onSave, onHistory }: { client: Client; onSave: (value: string) => void; onHistory: () => void }) {
  return (
    <Box className="company-cell">
      <EditableCell width="100%" value={client.company_name} multiline onSave={onSave} />
      <Tooltip title="История касаний">
        <IconButton className="company-history-button" size="small" onClick={onHistory}>
          <History sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

function normalizeWebsiteHref(value?: string | null) {
  const text = (value || "").trim();
  if (!text) return "";
  return /^https?:\/\//i.test(text) ? text : `https://${text}`;
}

function managerNumberLabel(user?: Client["manager"] | null) {
  if (!user) return "-";
  if (user.manager_number) return String(user.manager_number);
  const fallback = user.login || user.full_name || "-";
  const number = fallback.match(/\d+/)?.[0];
  return number || fallback;
}

function WebsiteCell({ value, onSave }: { value?: string | null; onSave: (value: string) => void }) {
  const href = normalizeWebsiteHref(value);
  return (
    <Box className="website-cell">
      <EditableCell width="100%" value={value} onSave={onSave} />
      {href && (
        <Tooltip title="Открыть сайт">
          <IconButton className="website-open-button" size="small" href={href} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
            <OpenInNew sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}

function CommentCell({ value, onSave }: { value?: string | null; onSave: (value: string) => void }) {
  const [draft, setDraft] = useState(value || "");
  const [templateAnchor, setTemplateAnchor] = useState<HTMLButtonElement | null>(null);
  const templatesOpen = Boolean(templateAnchor);

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

  const applyTemplate = (template: string) => {
    const next = draft.trim() ? `${draft.trim()} // ${template}` : template;
    setDraft(next);
    setTemplateAnchor(null);
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
        minRows={1}
        maxRows={5}
        variant="standard"
        fullWidth
        InputProps={{ disableUnderline: true }}
      />
      <Button
        className="comment-template-button"
        size="small"
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => setTemplateAnchor(event.currentTarget)}
      >
        Шаблон
      </Button>
      <Popover open={templatesOpen} anchorEl={templateAnchor} onClose={() => setTemplateAnchor(null)} anchorOrigin={{ vertical: "bottom", horizontal: "left" }}>
        <Stack spacing={1} className="comment-template-menu">
          <Typography variant="caption" fontWeight={900} color="text.secondary">
            Быстрые комментарии
          </Typography>
          <Box className="comment-template-grid">
            {COMMENT_TEMPLATES.map((template) => (
              <Button key={template} size="small" onMouseDown={(event) => event.preventDefault()} onClick={() => applyTemplate(template)}>
                {template}
              </Button>
            ))}
          </Box>
          <Button variant="contained" onClick={commit} disabled={!draft.trim()}>
            Сохранить комментарий
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

function MobileClientCard({
  client,
  statuses,
  saveField,
  addComment,
  openHistory
}: {
  client: Client;
  statuses: Status[];
  saveField: (client: Client, patch: ClientPatch) => void;
  addComment: (id: number, comment: string) => void;
  openHistory: (client: Client) => void;
}) {
  return (
    <Paper className="glass-surface mobile-client-card" elevation={0}>
      <Stack spacing={1.25}>
        <Box className="mobile-card-head">
          <CompanyCell client={client} onSave={(value) => saveField(client, { company_name: value })} onHistory={() => openHistory(client)} />
          <Typography variant="caption" sx={{ fontWeight: 900, color: "text.secondary" }}>
            {managerNumberLabel(client.manager)}
          </Typography>
        </Box>

        <Box className="mobile-card-grid">
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
          <Typography className="mobile-field-label" variant="caption">Сайт</Typography>
          <WebsiteCell value={client.website} onSave={(value) => saveField(client, { website: value })} />
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

function ClientHistoryDialog({ client, onClose }: { client: Client | null; onClose: () => void }) {
  const { data, isFetching } = useQuery({
    queryKey: ["client-history", client?.id],
    queryFn: async () => (await api.get<ClientHistory>(`/clients/${client?.id}/history`)).data,
    enabled: Boolean(client?.id)
  });
  const typeLabel = {
    comment: "Комментарий",
    task: "Задача",
    transfer: "Передача",
    audit: "Изменение"
  } as Record<string, string>;

  return (
    <Dialog open={Boolean(client)} onClose={onClose} fullWidth maxWidth="md" PaperProps={{ className: "glass-surface", sx: { borderRadius: "8px" } }}>
      <DialogTitle>
        История касаний
        {client && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.3 }}>
            {client.company_name}
          </Typography>
        )}
      </DialogTitle>
      <DialogContent>
        <Stack className="history-timeline" spacing={1}>
          {isFetching && <Typography color="text.secondary">Загружаем историю...</Typography>}
          {!isFetching && data?.events.length === 0 && <Typography color="text.secondary">История пока пустая.</Typography>}
          {data?.events.map((event) => (
            <Box className={`history-event ${event.type}`} key={event.id}>
              <Box className="history-event-dot" />
              <Box className="history-event-content">
                <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap", gap: 0.75 }}>
                  <Typography fontWeight={950}>{event.title}</Typography>
                  <Chip size="small" label={typeLabel[event.type] || event.type} />
                  {event.status && <Chip size="small" label={event.status} color="primary" variant="outlined" />}
                </Stack>
                {event.description && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.4, whiteSpace: "pre-wrap" }}>
                    {event.description}
                  </Typography>
                )}
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.6, display: "block" }}>
                  {formatDateTime(event.created_at)}
                  {event.actor ? ` · ${event.actor}` : ""}
                </Typography>
              </Box>
            </Box>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Закрыть</Button>
      </DialogActions>
    </Dialog>
  );
}

export function ClientsPage() {
  const { user } = useOutletContext<{ user: User }>();
  const isDesktop = useMediaQuery("(min-width:900px)");
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const focusedClientId = searchParams.get("client_id");
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
  const [historyClient, setHistoryClient] = useState<Client | null>(null);
  const [selectedClientIds, setSelectedClientIds] = useState<number[]>([]);
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
    queryKey: ["clients", page, search, statusId, managerId, nextCallFrom, nextCallTo, focusedClientId],
    queryFn: async () =>
      (
        await api.get<Page<Client>>("/clients", {
          params: {
            page,
            page_size: CLIENTS_PAGE_SIZE,
            search: search || undefined,
            status_id: statusId || undefined,
            manager_id: managerId || undefined,
            client_id: focusedClientId || undefined,
            next_call_from: nextCallFrom || undefined,
            next_call_to: nextCallTo || undefined
          }
        })
      ).data
  });

  const managers = useMemo(() => users.filter((user) => user.role === "manager"), [users]);
  const visibleClientIds = useMemo(() => data?.items.map((client) => client.id) || [], [data]);
  const selectedVisibleCount = visibleClientIds.filter((id) => selectedClientIds.includes(id)).length;
  const allVisibleSelected = visibleClientIds.length > 0 && selectedVisibleCount === visibleClientIds.length;

  const updateClient = useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: ClientPatch }) => (await api.patch(`/clients/${id}`, patch)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clients"] })
  });

  const addComment = useMutation({
    mutationFn: async ({ id, comment }: { id: number; comment: string }) => (await api.post(`/clients/${id}/comments`, { comment_text: comment })).data,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["client-history", variables.id] });
    }
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

  const deleteClients = useMutation({
    mutationFn: async (payload: { ids?: number[]; delete_all?: boolean }) => (await api.post("/clients/bulk-delete", payload)).data,
    onSuccess: () => {
      setSelectedClientIds([]);
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    }
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };

  const saveField = (client: Client, patch: ClientPatch) => updateClient.mutate({ id: client.id, patch });

  const toggleClient = (id: number) => {
    setSelectedClientIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const toggleVisibleClients = () => {
    setSelectedClientIds((current) => {
      const visible = new Set(visibleClientIds);
      if (allVisibleSelected) return current.filter((id) => !visible.has(id));
      return Array.from(new Set([...current, ...visibleClientIds]));
    });
  };

  const deleteSelectedClients = () => {
    if (selectedClientIds.length === 0) return;
    if (window.confirm(`Удалить выбранных клиентов: ${selectedClientIds.length}?`)) {
      deleteClients.mutate({ ids: selectedClientIds });
    }
  };

  const deleteAllClients = () => {
    if (window.confirm("Полностью удалить всех клиентов? Это действие нельзя отменить.")) {
      deleteClients.mutate({ delete_all: true });
    }
  };

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
            {canSeeManagers && (
              <>
                <Button color="error" startIcon={<Delete />} onClick={deleteSelectedClients} disabled={selectedClientIds.length === 0 || deleteClients.isPending}>
                  Удалить выбранные
                </Button>
                <Button color="error" variant="outlined" startIcon={<Delete />} onClick={deleteAllClients} disabled={deleteClients.isPending}>
                  Удалить всех
                </Button>
              </>
            )}
            <Button variant="contained" startIcon={<Add />} onClick={() => setOpen(true)}>
              Добавить
            </Button>
          </>
        }
      />
      <Paper className="glass-surface filter-bar" sx={{ p: 1.5, mb: 1.5, borderRadius: "8px" }} elevation={0}>
        {focusedClientId && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
            <Chip label="Открыт клиент из напоминания" className="glass-button" />
            <Button size="small" onClick={() => setSearchParams({})}>
              Показать всех
            </Button>
          </Stack>
        )}
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
                {managerDisplayName(user)}
              </MenuItem>
            ))}
          </TextField>
          <TextField size="small" type="date" label="Перезвон с" InputLabelProps={{ shrink: true }} value={nextCallFrom} onChange={(e) => setNextCallFrom(e.target.value)} />
          <TextField size="small" type="date" label="Перезвон по" InputLabelProps={{ shrink: true }} value={nextCallTo} onChange={(e) => setNextCallTo(e.target.value)} />
        </Box>
      </Paper>

      {isDesktop ? (
        <Paper className="desktop-table glass-surface excel-sheet" sx={{ borderRadius: "8px", overflow: "hidden" }} elevation={0}>
          <Table size="small" className="premium-table excel-table">
            <colgroup>
              {canSeeManagers && <col style={{ width: 38 }} />}
              <col style={{ width: "18%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "28%" }} />
              <col style={{ width: "6%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "3%" }} />
            </colgroup>
            <TableHead>
              <TableRow>
                {canSeeManagers && (
                  <TableCell padding="checkbox">
                    <Checkbox checked={allVisibleSelected} indeterminate={selectedVisibleCount > 0 && !allVisibleSelected} onChange={toggleVisibleClients} />
                  </TableCell>
                )}
                <TableCell>Компания</TableCell>
                <TableCell>Телефон</TableCell>
                <TableCell>Почта</TableCell>
                <TableCell>Сайт</TableCell>
                <TableCell>Статус</TableCell>
                <TableCell>Комментарий</TableCell>
                <TableCell>Звонок</TableCell>
                <TableCell>Перезвон</TableCell>
                <TableCell>Менеджер</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data?.items.map((client) => (
                <TableRow key={client.id} hover>
                  {canSeeManagers && (
                    <TableCell padding="checkbox">
                      <Checkbox checked={selectedClientIds.includes(client.id)} onChange={() => toggleClient(client.id)} />
                    </TableCell>
                  )}
                  <ExcelCell width="18%">
                    <CompanyCell client={client} onSave={(value) => saveField(client, { company_name: value })} onHistory={() => setHistoryClient(client)} />
                  </ExcelCell>
                  <ExcelCell width="11%">
                    <ContactCell value={client.phone} kind="phone" onSave={(value) => saveField(client, { phone: value })} />
                  </ExcelCell>
                  <ExcelCell width="11%">
                    <ContactCell value={client.email} kind="email" onSave={(value) => saveField(client, { email: value })} />
                  </ExcelCell>
                  <ExcelCell width="8%">
                    <WebsiteCell value={client.website} onSave={(value) => saveField(client, { website: value })} />
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
                  <ExcelCell width="28%">
                    <CommentCell value={client.last_comment} onSave={(value) => addComment.mutate({ id: client.id, comment: value })} />
                  </ExcelCell>
                  <ExcelCell width="6%">
                    <EditableCell width="100%" type="date" value={client.last_call_date || ""} onSave={(value) => saveField(client, { last_call_date: value })} />
                  </ExcelCell>
                  <ExcelCell width="7%">
                    <EditableCell width="100%" type="date" value={client.next_call_date || ""} onSave={(value) => saveField(client, { next_call_date: value })} />
                  </ExcelCell>
                  <ExcelCell width="3%">
                    <Typography variant="body2" sx={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {managerNumberLabel(client.manager)}
                    </Typography>
                  </ExcelCell>
                </TableRow>
              ))}
              {!isFetching && data?.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canSeeManagers ? 10 : 9}>Клиенты не найдены</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Paper>
      ) : (
        <Stack className="mobile-list mobile-client-list" spacing={1.25}>
          {data?.items.map((client) => (
            <MobileClientCard
              key={client.id}
              client={client}
              statuses={statuses}
              saveField={saveField}
              addComment={(id, comment) => addComment.mutate({ id, comment })}
              openHistory={setHistoryClient}
            />
          ))}
          {!isFetching && data?.items.length === 0 && (
            <Paper className="glass-surface mobile-empty-state" elevation={0}>
              <Typography>Клиенты не найдены</Typography>
            </Paper>
          )}
        </Stack>
      )}

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
      <ClientHistoryDialog client={historyClient} onClose={() => setHistoryClient(null)} />
    </>
  );
}
