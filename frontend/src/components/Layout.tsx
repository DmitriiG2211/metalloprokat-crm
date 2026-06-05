import {
  Assignment,
  Assessment,
  BackupTable,
  Dashboard,
  EventRepeat,
  Groups,
  History,
  Logout,
  Menu,
  Settings,
  UploadFile
} from "@mui/icons-material";
import {
  AppBar,
  Box,
  Button,
  Chip,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Tooltip,
  Typography
} from "@mui/material";
import { useState } from "react";
import { Link as RouterLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { User } from "../types";
import { ErrorBoundary } from "./ErrorBoundary";

const drawerWidth = 248;

const menu = [
  { label: "Главная", path: "/", icon: <Dashboard /> },
  { label: "Клиенты", path: "/clients", icon: <BackupTable /> },
  { label: "Напоминания", path: "/reminders", icon: <EventRepeat /> },
  { label: "Задачи", path: "/tasks", icon: <Assignment /> },
  { label: "Импорт Excel", path: "/import", icon: <UploadFile />, roles: ["admin", "director"] },
  { label: "Статусы", path: "/statuses", icon: <Settings />, roles: ["admin", "director"] },
  { label: "Пользователи", path: "/users", icon: <Groups />, roles: ["admin", "director"] },
  { label: "Отчет", path: "/reports", icon: <Assessment /> },
  { label: "Журнал", path: "/audit", icon: <History />, roles: ["admin", "director"] },
  { label: "Настройки", path: "/settings", icon: <Settings />, roles: ["admin", "director"] }
];

export function Layout({ user }: { user: User }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const visibleMenu = menu.filter((item) => !item.roles || item.roles.includes(user.role));

  const logout = () => {
    localStorage.removeItem("crm_token");
    localStorage.removeItem("crm_user");
    navigate("/login");
  };

  const navList = (
    <Box sx={{ overflow: "auto", p: 1 }}>
      <List>
        {visibleMenu.map((item) => (
          <ListItemButton
            className="sidebar-link"
            component={RouterLink}
            to={item.path}
            key={item.path}
            selected={location.pathname === item.path}
            onClick={() => setMobileOpen(false)}
            sx={{
              borderRadius: "8px",
              mb: 0.75,
              minHeight: 48,
              px: 1.4,
              transition: "background 120ms ease, color 120ms ease",
              "&.Mui-selected": {
                bgcolor: "rgba(255,255,255,0.74)",
                boxShadow: "inset 3px 0 0 rgba(8,119,238,0.42)",
                color: "primary.dark"
              },
              "&:hover": { bgcolor: "rgba(255,255,255,0.6)" },
              "& .MuiListItemIcon-root": { minWidth: 38, color: "inherit" },
              "& .MuiListItemText-primary": { fontWeight: 800 }
            }}
          >
            <ListItemIcon>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        ))}
      </List>
      <Box className="sidebar-app-switcher">
        <Button className="global-switch-button active" href="/" size="small">
          CRM
        </Button>
        <Button className="global-switch-button" href="/certificates" size="small">
          Сертификаты
        </Button>
      </Box>
    </Box>
  );

  return (
    <Box className="app-shell" sx={{ display: "flex", minHeight: "100vh" }}>
      <AppBar className="app-topbar" position="fixed" elevation={0} sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar sx={{ bgcolor: "rgba(255,255,255,0.9)", color: "text.primary" }}>
          <IconButton className="glass-button mobile-menu-button" onClick={() => setMobileOpen(true)} sx={{ mr: 1, display: { md: "none" } }} aria-label="Menu">
            <Menu />
          </IconButton>
          <Box className="brand-lockup" sx={{ flexGrow: 1 }}>
            <Box component="img" className="brand-logo" src="/logo.jpg" alt="Мегаполис" />
            <Typography className="brand-title" variant="h6" sx={{ fontWeight: 900 }}>
              CRM Мегаполис
            </Typography>
          </Box>
          <Box className="global-switcher" aria-label="Переключение между разделами">
            <Button className="global-switch-button active" href="/" size="small">
              CRM
            </Button>
            <Button className="global-switch-button" href="/certificates" size="small">
              Сертификаты
            </Button>
          </Box>
          <Chip label={user.full_name} size="small" className="glass-button" sx={{ mr: 1.5, fontWeight: 800 }} />
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
        <Toolbar />
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
      </Box>
    </Box>
  );
}
