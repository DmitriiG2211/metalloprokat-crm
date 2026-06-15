import {
  Assignment,
  Assessment,
  BackupTable,
  Dashboard,
  EventRepeat,
  Groups,
  History,
  Logout,
  ManageSearch,
  Menu,
  Notifications,
  Search,
  Settings,
  UploadFile,
  ViewKanban
} from "@mui/icons-material";
import {
  AppBar,
  Badge,
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Popover,
  Toolbar,
  Tooltip,
  Typography
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { ReactNode, useMemo, useState } from "react";
import { Link as RouterLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { userDisplayName } from "../display";
import { Client, Task, User } from "../types";
import { ErrorBoundary } from "./ErrorBoundary";

const drawerWidth = 248;
const leaderRoles = new Set<User["role"]>(["admin", "director", "senior_manager"]);

type MenuItemConfig = {
  label: string;
  path: string;
  icon: ReactNode;
  roles?: User["role"][];
  section: "Работа" | "Администрирование";
};

const menu = [
  { label: "Рабочий стол", path: "/", icon: <Dashboard />, section: "Работа" },
  { label: "Клиенты", path: "/clients", icon: <BackupTable />, section: "Работа" },
  { label: "Напоминания", path: "/reminders", icon: <EventRepeat />, section: "Работа" },
  { label: "Задачи", path: "/tasks", icon: <Assignment />, section: "Работа" },
  { label: "Kanban", path: "/kanban", icon: <ViewKanban />, section: "Работа" },
  { label: "Отчет", path: "/reports", icon: <Assessment />, section: "Работа" },
  { label: "Контроль", path: "/control", icon: <ManageSearch />, roles: ["admin", "director", "senior_manager"], section: "Работа" },
  { label: "Импорт Excel", path: "/import", icon: <UploadFile />, roles: ["admin", "director"], section: "Администрирование" },
  { label: "Статусы", path: "/statuses", icon: <Settings />, roles: ["admin", "director"], section: "Администрирование" },
  { label: "Пользователи", path: "/users", icon: <Groups />, roles: ["admin", "director"], section: "Администрирование" },
  { label: "Журнал", path: "/audit", icon: <History />, roles: ["admin", "director"], section: "Администрирование" },
  { label: "Настройки", path: "/settings", icon: <Settings />, roles: ["admin", "director"], section: "Администрирование" }
] satisfies MenuItemConfig[];

const todayIso = () => {
  const date = new Date();
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
};

function TodayNotifications({ user }: { user: User }) {
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const enabled = user.role === "manager";
  const today = todayIso();
  const { data: tasks = [] } = useQuery({
    queryKey: ["today-notification-tasks", user.id],
    queryFn: async () => (await api.get<Task[]>("/tasks")).data,
    enabled,
    refetchInterval: 60000
  });
  const { data: reminders = [] } = useQuery({
    queryKey: ["today-notification-reminders", user.id],
    queryFn: async () => (await api.get<Client[]>("/reminders/today")).data,
    enabled,
    refetchInterval: 60000
  });
  const todayTasks = useMemo(() => tasks.filter((task) => task.deadline === today && !["done", "canceled"].includes(task.status)), [tasks, today]);
  const count = todayTasks.length + reminders.length;
  const open = Boolean(anchorEl);

  if (!enabled) return null;

  return (
    <>
      <Tooltip title="Уведомления">
        <IconButton className="glass-button" onClick={(event) => setAnchorEl(event.currentTarget)} sx={{ mr: 1 }}>
          <Badge badgeContent={count} color="error" overlap="circular">
            <Notifications />
          </Badge>
        </IconButton>
      </Tooltip>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        PaperProps={{ className: "glass-surface", sx: { width: 360, maxWidth: "calc(100vw - 24px)", borderRadius: "8px", p: 2 } }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 900, mb: 1 }}>
          Сегодня от руководителя
        </Typography>
        {count === 0 && (
          <Typography variant="body2" color="text.secondary">
            На сегодня задач и напоминаний нет
          </Typography>
        )}
        {todayTasks.length > 0 && (
          <Box sx={{ display: "grid", gap: 1 }}>
            <Typography variant="overline" color="text.secondary">
              Задачи
            </Typography>
            {todayTasks.map((task) => (
              <Box key={task.id} sx={{ borderRadius: "8px", bgcolor: "rgba(255,255,255,0.68)", p: 1.1 }}>
                <Typography variant="body2" sx={{ fontWeight: 800 }}>
                  {task.title}
                </Typography>
                {task.description && (
                  <Typography variant="caption" color="text.secondary">
                    {task.description}
                  </Typography>
                )}
              </Box>
            ))}
          </Box>
        )}
        {todayTasks.length > 0 && reminders.length > 0 && <Divider sx={{ my: 1.5 }} />}
        {reminders.length > 0 && (
          <Box sx={{ display: "grid", gap: 1 }}>
            <Typography variant="overline" color="text.secondary">
              Напоминания
            </Typography>
            {reminders.map((client) => (
              <Box key={client.id} sx={{ borderRadius: "8px", bgcolor: "rgba(255,255,255,0.68)", p: 1.1 }}>
                <Typography variant="body2" sx={{ fontWeight: 800 }}>
                  {client.company_name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {client.phone || "Телефон не указан"}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
        {count > 0 && (
          <Box sx={{ display: "flex", gap: 1, mt: 1.5 }}>
            <Button component={RouterLink} to="/tasks" size="small" onClick={() => setAnchorEl(null)}>
              Задачи
            </Button>
            <Button component={RouterLink} to="/reminders" size="small" onClick={() => setAnchorEl(null)}>
              Напоминания
            </Button>
          </Box>
        )}
      </Popover>
    </>
  );
}

export function Layout({ user }: { user: User }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const canUseCallAnalyzer = leaderRoles.has(user.role);
  const visibleMenu = menu.filter((item) => !item.roles || (item.roles as readonly User["role"][]).includes(user.role));
  const currentItem = visibleMenu.find((item) => item.path === location.pathname) || visibleMenu[0];
  const sections = ["Работа", "Администрирование"] as const;

  const logout = () => {
    localStorage.removeItem("crm_token");
    localStorage.removeItem("crm_user");
    navigate("/login");
  };

  const navList = (
    <Box sx={{ overflow: "auto", p: 1.25 }}>
      <Box className="sidebar-workspace">
        <Box className="workspace-mark">
          <Box component="img" src="/logo.jpg" alt="Мегаполис" />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography className="workspace-name">CRM Мегаполис</Typography>
          <Typography className="workspace-meta">Металлопрокат</Typography>
        </Box>
      </Box>
      {sections.map((section) => {
        const sectionItems = visibleMenu.filter((item) => item.section === section);
        if (sectionItems.length === 0) return null;
        return (
          <Box key={section} className="sidebar-section">
            <Typography className="sidebar-section-label">{section}</Typography>
            <List disablePadding>
              {sectionItems.map((item) => (
                <ListItemButton
                  className="sidebar-link"
                  component={RouterLink}
                  to={item.path}
                  key={item.path}
                  selected={location.pathname === item.path}
                  onClick={() => setMobileOpen(false)}
                  sx={{
                    borderRadius: "8px",
                    mb: 0.25,
                    minHeight: 36,
                    px: 1,
                    py: 0.55,
                    transition: "background 120ms ease, color 120ms ease",
                    "& .MuiListItemIcon-root": { minWidth: 30, color: "inherit" },
                    "& .MuiListItemText-primary": { fontWeight: 700, fontSize: 14 }
                  }}
                >
                  <ListItemIcon>{item.icon}</ListItemIcon>
                  <ListItemText primary={item.label} />
                </ListItemButton>
              ))}
            </List>
          </Box>
        );
      })}
      <Box className="sidebar-app-switcher">
        <Button className="global-switch-button active" href="/" size="small">
          CRM
        </Button>
        <Button className="global-switch-button" href="/certificates" size="small">
          Сертификаты
        </Button>
        {canUseCallAnalyzer && (
          <Button className="global-switch-button" href="/calls-analyzer/" size="small">
            Анализатор звонков
          </Button>
        )}
      </Box>
    </Box>
  );

  return (
    <Box className="app-shell" sx={{ display: "flex", minHeight: "100vh" }}>
      <AppBar
        className="app-topbar"
        position="fixed"
        elevation={0}
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          width: { md: `calc(100% - ${drawerWidth}px)` },
          ml: { md: `${drawerWidth}px` }
        }}
      >
        <Toolbar sx={{ bgcolor: "background.paper", color: "text.primary" }}>
          <IconButton className="glass-button mobile-menu-button" onClick={() => setMobileOpen(true)} sx={{ mr: 1, display: { md: "none" } }} aria-label="Menu">
            <Menu />
          </IconButton>
          <Box className="brand-lockup" sx={{ flexGrow: 1 }}>
            <Typography className="brand-title" variant="h6" sx={{ fontWeight: 900 }}>
              {currentItem?.label || "CRM Мегаполис"}
            </Typography>
          </Box>
          <Button className="topbar-search-button" component={RouterLink} to="/clients" startIcon={<Search />} size="small">
            Поиск клиентов
          </Button>
          <Box className="global-switcher" aria-label="Переключение между разделами">
            <Button className="global-switch-button active" href="/" size="small">
              CRM
            </Button>
            <Button className="global-switch-button" href="/certificates" size="small">
              Сертификаты
            </Button>
            {canUseCallAnalyzer && (
              <Button className="global-switch-button" href="/calls-analyzer/" size="small">
                Анализатор звонков
              </Button>
            )}
          </Box>
          <TodayNotifications user={user} />
          <Chip label={userDisplayName(user)} size="small" className="glass-button user-chip" sx={{ mr: 1.5, fontWeight: 800 }} />
          <Tooltip title="Выйти">
            <IconButton className="glass-button" onClick={logout}>
              <Logout />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>
      <Drawer
        variant="permanent"
        PaperProps={{ className: "sidebar-panel" }}
        sx={{
          display: { xs: "none", md: "block" },
          width: drawerWidth,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: { width: drawerWidth, boxSizing: "border-box", borderRight: "1px solid rgba(255,255,255,0.58)" }
        }}
      >
        {navList}
      </Drawer>
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        PaperProps={{ className: "sidebar-panel mobile-sidebar" }}
        sx={{
          display: { xs: "block", md: "none" },
          [`& .MuiDrawer-paper`]: { width: "min(82vw, 320px)", boxSizing: "border-box" }
        }}
      >
        <Toolbar />
        {navList}
      </Drawer>
      <Box className="app-main" component="main" sx={{ flexGrow: 1, minWidth: 0, p: { xs: 2, md: 3 } }}>
        <Toolbar />
        <ErrorBoundary resetKey={location.pathname}>
          <Outlet context={{ user }} />
        </ErrorBoundary>
        <Typography className="app-footer-credit">Разработал Голуб Д.А.</Typography>
      </Box>
    </Box>
  );
}
