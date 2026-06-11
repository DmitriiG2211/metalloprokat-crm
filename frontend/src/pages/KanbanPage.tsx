import { Add, Archive, Block, DragIndicator, Inventory2, Mail, Phone, Search, Sync, ViewKanban } from "@mui/icons-material";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api } from "../api";
import { PageHeader } from "../components/PageHeader";
import { KanbanMailStatus, KanbanMailSyncResult, KanbanRequest, KanbanStatus, SupplierBlacklistItem, User } from "../types";

const columns: Array<{ key: KanbanStatus; title: string; tone: string }> = [
  { key: "new", title: "Новая заявка", tone: "#5b7fa6" },
  { key: "in_progress", title: "В работе", tone: "#6f9472" },
  { key: "invoiced", title: "Счет выставлен", tone: "#9a7a5a" }
];

const sourceLabels: Record<string, string> = {
  mail: "Почта",
  phone: "Телефон",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  other: "Другое"
};

const emptyRequestForm = {
  company_name: "",
  contact_person: "",
  phone: "",
  email: "",
  subject: "",
  comment: "",
  nomenclature: "",
  source: "phone",
  manager_id: ""
};

const emptyBlacklistForm = { supplier_name: "", email: "", domain: "", note: "" };

const formatDateTime = (value?: string | null) => {
  if (!value) return "";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
};

function managerName(user?: User | null) {
  if (!user) return "Без менеджера";
  return user.manager_number ? `Менеджер ${user.manager_number}` : user.full_name || user.login;
}

function KanbanCard({
  item,
  onDragStart,
  onOpen
}: {
  item: KanbanRequest;
  onDragStart: (item: KanbanRequest) => void;
  onOpen: (item: KanbanRequest) => void;
}) {
  return (
    <Paper
      className="kanban-card"
      elevation={0}
      draggable
      role="button"
      tabIndex={0}
      onClick={() => onOpen(item)}
      onDragStart={() => onDragStart(item)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(item);
        }
      }}
    >
      <Stack spacing={1}>
        <Stack direction="row" spacing={1} alignItems="flex-start">
          <DragIndicator className="kanban-drag-icon" fontSize="small" />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography className="kanban-card-title">{item.company_name}</Typography>
            {(item.contact_person || item.subject) && (
              <Typography variant="body2" color="text.secondary" sx={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                {item.contact_person || item.subject}
              </Typography>
            )}
          </Box>
        </Stack>
        <Box className="kanban-card-meta">
          {item.phone && <Chip size="small" icon={<Phone />} label={item.phone} />}
          {item.email && <Chip size="small" icon={<Mail />} label={item.email} />}
          <Chip size="small" label={sourceLabels[item.source] || item.source} />
        </Box>
        {item.nomenclature && (
          <Typography variant="body2" className="kanban-card-text">
            {item.nomenclature}
          </Typography>
        )}
        {item.comment && (
          <Typography variant="body2" color="text.secondary" className="kanban-card-text">
            {item.comment}
          </Typography>
        )}
        <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center">
          <Typography variant="caption" color="text.secondary">
            {managerName(item.manager)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {formatDateTime(item.created_at)}
          </Typography>
        </Stack>
      </Stack>
    </Paper>
  );
}

export function KanbanPage() {
  const queryClient = useQueryClient();
  const { user } = useOutletContext<{ user: User }>();
  const [tab, setTab] = useState(0);
  const [openRequest, setOpenRequest] = useState(false);
  const [openBlacklist, setOpenBlacklist] = useState(false);
  const [archiveSearch, setArchiveSearch] = useState("");
  const [dragged, setDragged] = useState<KanbanRequest | null>(null);
  const [requestForm, setRequestForm] = useState(emptyRequestForm);
  const [blacklistForm, setBlacklistForm] = useState(emptyBlacklistForm);
  const [mailSyncMessage, setMailSyncMessage] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<KanbanRequest | null>(null);
  const canSeeManagers = ["admin", "director", "senior_manager"].includes(user.role);

  const { data: requests = [] } = useQuery({
    queryKey: ["kanban-requests"],
    queryFn: async () => (await api.get<KanbanRequest[]>("/kanban/requests")).data,
    refetchInterval: 60000
  });
  const { data: archived = [] } = useQuery({
    queryKey: ["kanban-archive", archiveSearch],
    queryFn: async () => (await api.get<KanbanRequest[]>("/kanban/archive", { params: { search: archiveSearch || undefined } })).data,
    enabled: tab === 1
  });
  const { data: blacklist = [] } = useQuery({
    queryKey: ["supplier-blacklist"],
    queryFn: async () => (await api.get<SupplierBlacklistItem[]>("/kanban/blacklist")).data,
    enabled: tab === 2
  });
  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get<User[]>("/users")).data,
    enabled: canSeeManagers || openRequest,
    retry: false
  });
  const { data: mailStatus } = useQuery({
    queryKey: ["kanban-mail-status"],
    queryFn: async () => (await api.get<KanbanMailStatus>("/kanban/mail/status")).data,
    enabled: canSeeManagers,
    retry: false
  });

  const managers = useMemo(() => users.filter((item) => item.role === "manager"), [users]);

  const createRequest = useMutation({
    mutationFn: async () =>
      (
        await api.post<KanbanRequest>("/kanban/requests", {
          ...requestForm,
          manager_id: requestForm.manager_id ? Number(requestForm.manager_id) : undefined
        })
      ).data,
    onSuccess: () => {
      setOpenRequest(false);
      setRequestForm(emptyRequestForm);
      queryClient.invalidateQueries({ queryKey: ["kanban-requests"] });
    }
  });

  const updateRequest = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: KanbanStatus }) => (await api.patch<KanbanRequest>(`/kanban/requests/${id}`, { status })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kanban-requests"] });
      queryClient.invalidateQueries({ queryKey: ["kanban-archive"] });
    }
  });

  const createBlacklist = useMutation({
    mutationFn: async () => (await api.post<SupplierBlacklistItem>("/kanban/blacklist", blacklistForm)).data,
    onSuccess: () => {
      setOpenBlacklist(false);
      setBlacklistForm(emptyBlacklistForm);
      queryClient.invalidateQueries({ queryKey: ["supplier-blacklist"] });
    }
  });

  const deleteBlacklist = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/kanban/blacklist/${id}`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["supplier-blacklist"] })
  });

  const syncMail = useMutation({
    mutationFn: async () => (await api.post<KanbanMailSyncResult>("/kanban/mail/sync")).data,
    onSuccess: (result) => {
      const errorText = result.errors.length ? ` Ошибка: ${result.errors[0]}` : "";
      setMailSyncMessage(
        `Проверено: ${result.checked}. Создано: ${result.created}. Дубли: ${result.skipped_duplicates}. Черный список: ${result.skipped_blacklist}.${errorText}`
      );
      queryClient.invalidateQueries({ queryKey: ["kanban-requests"] });
      queryClient.invalidateQueries({ queryKey: ["kanban-archive"] });
    },
    onError: () => setMailSyncMessage("Не удалось синхронизировать почту. Проверьте настройки Yandex в .env на сервере.")
  });

  const grouped = useMemo(
    () =>
      columns.reduce<Record<KanbanStatus, KanbanRequest[]>>(
        (acc, column) => {
          acc[column.key] = requests.filter((item) => item.status === column.key);
          return acc;
        },
        { new: [], in_progress: [], invoiced: [] }
      ),
    [requests]
  );

  const submitRequest = (event: FormEvent) => {
    event.preventDefault();
    createRequest.mutate();
  };

  const submitBlacklist = (event: FormEvent) => {
    event.preventDefault();
    createBlacklist.mutate();
  };

  const dropTo = (status: KanbanStatus) => {
    if (!dragged || dragged.status === status) return;
    updateRequest.mutate({ id: dragged.id, status });
    setDragged(null);
  };

  return (
    <>
      <PageHeader
        title="Kanban заявок"
        actions={
          <>
            {canSeeManagers && (
              <Tooltip title={mailStatus?.configured ? "Проверить новые письма Yandex" : "Укажите YANDEX_MAIL_USER и YANDEX_MAIL_PASSWORD на сервере"}>
                <span>
                  <Button startIcon={<Sync />} disabled={!mailStatus?.configured || syncMail.isPending} onClick={() => syncMail.mutate()}>
                    {syncMail.isPending ? "Проверяю почту" : "Синхронизировать почту"}
                  </Button>
                </span>
              </Tooltip>
            )}
            <Button startIcon={<Block />} onClick={() => setOpenBlacklist(true)}>
              Поставщик
            </Button>
            <Button variant="contained" startIcon={<Add />} onClick={() => setOpenRequest(true)}>
              Создать заявку
            </Button>
          </>
        }
      />
      <Paper className="glass-surface" sx={{ mb: 2, borderRadius: "8px" }} elevation={0}>
        <Tabs value={tab} onChange={(_, value) => setTab(value)}>
          <Tab icon={<ViewKanban />} iconPosition="start" label="Доска" />
          <Tab icon={<Archive />} iconPosition="start" label="Архив" />
          <Tab icon={<Block />} iconPosition="start" label="Черный список" />
        </Tabs>
      </Paper>
      {canSeeManagers && (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ xs: "stretch", sm: "center" }} sx={{ mb: 2 }}>
          <Chip
            icon={<Mail />}
            label={mailStatus?.configured ? `Yandex: ${mailStatus.user || "подключена"}` : "Yandex почта не настроена"}
            color={mailStatus?.configured ? "success" : "default"}
            variant={mailStatus?.configured ? "filled" : "outlined"}
          />
          {mailStatus?.configured && (
            <Typography variant="body2" color="text.secondary">
              Автоматическая проверка каждые {mailStatus.interval_seconds} сек.
            </Typography>
          )}
          {mailSyncMessage && (
            <Typography variant="body2" color="text.secondary">
              {mailSyncMessage}
            </Typography>
          )}
        </Stack>
      )}

      {tab === 0 && (
        <Box className="kanban-board">
          {columns.map((column) => (
            <Paper
              key={column.key}
              className="kanban-column glass-surface"
              elevation={0}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => dropTo(column.key)}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.25 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Box className="report-color-dot" sx={{ backgroundColor: column.tone }} />
                  <Typography fontWeight={900}>{column.title}</Typography>
                </Stack>
                <Chip size="small" label={grouped[column.key].length} />
              </Stack>
              <Stack spacing={1}>
                {grouped[column.key].map((item) => (
                  <KanbanCard key={item.id} item={item} onDragStart={setDragged} onOpen={setSelectedRequest} />
                ))}
                {grouped[column.key].length === 0 && (
                  <Box className="kanban-empty">
                    <Inventory2 fontSize="small" />
                    <Typography variant="body2">Заявок пока нет</Typography>
                  </Box>
                )}
              </Stack>
            </Paper>
          ))}
        </Box>
      )}

      {tab === 1 && (
        <Stack spacing={2}>
          <Paper className="glass-surface" sx={{ p: 1.5, borderRadius: "8px" }} elevation={0}>
            <TextField
              size="small"
              fullWidth
              label="Поиск по архиву"
              value={archiveSearch}
              onChange={(event) => setArchiveSearch(event.target.value)}
              InputProps={{ startAdornment: <Search fontSize="small" sx={{ mr: 1 }} /> }}
            />
          </Paper>
          <Box className="kanban-archive-grid">
            {archived.map((item) => (
              <KanbanCard key={item.id} item={item} onDragStart={() => undefined} onOpen={setSelectedRequest} />
            ))}
            {archived.length === 0 && (
              <Paper className="glass-surface kanban-empty-state" elevation={0}>
                <Typography>В архиве ничего не найдено</Typography>
              </Paper>
            )}
          </Box>
        </Stack>
      )}

      {tab === 2 && (
        <Paper className="glass-surface" sx={{ p: 2, borderRadius: "8px" }} elevation={0}>
          <Stack spacing={1.1}>
            {blacklist.map((item) => (
              <Box className="blacklist-row" key={item.id}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography fontWeight={900}>{item.supplier_name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {[item.email, item.domain].filter(Boolean).join(" · ") || "Email и домен не указаны"}
                  </Typography>
                  {item.note && (
                    <Typography variant="body2" color="text.secondary">
                      {item.note}
                    </Typography>
                  )}
                </Box>
                <Tooltip title="Удалить">
                  <IconButton onClick={() => deleteBlacklist.mutate(item.id)}>
                    <Block />
                  </IconButton>
                </Tooltip>
              </Box>
            ))}
            {blacklist.length === 0 && <Typography color="text.secondary">Черный список пока пуст</Typography>}
          </Stack>
        </Paper>
      )}

      <Dialog open={Boolean(selectedRequest)} onClose={() => setSelectedRequest(null)} fullWidth maxWidth="md" PaperProps={{ className: "glass-surface", sx: { borderRadius: "8px" } }}>
        {selectedRequest && (
          <>
            <DialogTitle>{selectedRequest.subject || selectedRequest.company_name}</DialogTitle>
            <DialogContent>
              <Stack spacing={2} sx={{ pt: 0.5 }}>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Chip size="small" label={sourceLabels[selectedRequest.source] || selectedRequest.source} />
                  {selectedRequest.email && <Chip size="small" icon={<Mail />} label={selectedRequest.email} />}
                  {selectedRequest.phone && <Chip size="small" icon={<Phone />} label={selectedRequest.phone} />}
                  <Chip size="small" label={formatDateTime(selectedRequest.received_at || selectedRequest.created_at)} />
                </Stack>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Компания
                  </Typography>
                  <Typography fontWeight={900}>{selectedRequest.company_name}</Typography>
                </Box>
                {selectedRequest.contact_person && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Контакт
                    </Typography>
                    <Typography>{selectedRequest.contact_person}</Typography>
                  </Box>
                )}
                {selectedRequest.nomenclature && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Номенклатура
                    </Typography>
                    <Typography sx={{ whiteSpace: "pre-wrap" }}>{selectedRequest.nomenclature}</Typography>
                  </Box>
                )}
                <Divider />
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Содержимое письма / комментарий
                  </Typography>
                  <Typography sx={{ mt: 0.75, whiteSpace: "pre-wrap" }}>{selectedRequest.comment || "Текст письма пустой"}</Typography>
                </Box>
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setSelectedRequest(null)}>Закрыть</Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      <Dialog open={openRequest} onClose={() => setOpenRequest(false)} fullWidth maxWidth="md" PaperProps={{ className: "glass-surface", sx: { borderRadius: "8px" } }}>
        <DialogTitle>Новая заявка</DialogTitle>
        <DialogContent>
          <Stack id="kanban-request-form" component="form" spacing={2} sx={{ pt: 1 }} onSubmit={submitRequest}>
            <Box className="kanban-form-grid">
              <TextField required label="Компания" value={requestForm.company_name} onChange={(event) => setRequestForm({ ...requestForm, company_name: event.target.value })} />
              <TextField label="Контактное лицо" value={requestForm.contact_person} onChange={(event) => setRequestForm({ ...requestForm, contact_person: event.target.value })} />
              <TextField label="Телефон" value={requestForm.phone} onChange={(event) => setRequestForm({ ...requestForm, phone: event.target.value })} />
              <TextField label="Email" value={requestForm.email} onChange={(event) => setRequestForm({ ...requestForm, email: event.target.value })} />
              <TextField select label="Источник" value={requestForm.source} onChange={(event) => setRequestForm({ ...requestForm, source: event.target.value })}>
                {Object.entries(sourceLabels).map(([key, label]) => (
                  <MenuItem key={key} value={key}>
                    {label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select label="Ответственный" value={requestForm.manager_id} onChange={(event) => setRequestForm({ ...requestForm, manager_id: event.target.value })}>
                <MenuItem value="">Назначить на меня</MenuItem>
                {managers.map((manager) => (
                  <MenuItem key={manager.id} value={manager.id}>
                    {managerName(manager)}
                  </MenuItem>
                ))}
              </TextField>
            </Box>
            <TextField label="Тема письма / заявки" value={requestForm.subject} onChange={(event) => setRequestForm({ ...requestForm, subject: event.target.value })} />
            <TextField label="Номенклатура" value={requestForm.nomenclature} onChange={(event) => setRequestForm({ ...requestForm, nomenclature: event.target.value })} multiline minRows={2} />
            <TextField label="Комментарий / текст письма" value={requestForm.comment} onChange={(event) => setRequestForm({ ...requestForm, comment: event.target.value })} multiline minRows={3} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenRequest(false)}>Отмена</Button>
          <Button form="kanban-request-form" type="submit" variant="contained" disabled={createRequest.isPending}>
            Создать
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openBlacklist} onClose={() => setOpenBlacklist(false)} fullWidth maxWidth="sm" PaperProps={{ className: "glass-surface", sx: { borderRadius: "8px" } }}>
        <DialogTitle>Поставщик в черный список</DialogTitle>
        <DialogContent>
          <Stack id="blacklist-form" component="form" spacing={2} sx={{ pt: 1 }} onSubmit={submitBlacklist}>
            <TextField required label="Название поставщика" value={blacklistForm.supplier_name} onChange={(event) => setBlacklistForm({ ...blacklistForm, supplier_name: event.target.value })} />
            <TextField label="Email" value={blacklistForm.email} onChange={(event) => setBlacklistForm({ ...blacklistForm, email: event.target.value })} />
            <TextField label="Домен" value={blacklistForm.domain} onChange={(event) => setBlacklistForm({ ...blacklistForm, domain: event.target.value })} />
            <Divider />
            <TextField label="Комментарий" value={blacklistForm.note} onChange={(event) => setBlacklistForm({ ...blacklistForm, note: event.target.value })} multiline minRows={2} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenBlacklist(false)}>Отмена</Button>
          <Button form="blacklist-form" type="submit" variant="contained" disabled={createBlacklist.isPending}>
            Добавить
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
