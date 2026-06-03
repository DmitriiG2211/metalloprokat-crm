import {
  Assignment,
  Assessment,
  BackupTable,
  Dashboard,
  EventRepeat,
  Groups,
  History,
  Logout,
  Settings,
  UploadFile
} from "@mui/icons-material";
import {
  AppBar,
  Box,
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
import { Outlet, useLocation, useNavigate } from "react-router-dom";
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
  const visibleMenu = menu.filter((item) => !item.roles || item.roles.includes(user.role));

  const logout = () => {
    localStorage.removeItem("crm_token");
    localStorage.removeItem("crm_user");
    navigate("/login");
  };

  return (
    <Box className="app-shell" sx={{ display: "flex", minHeight: "100vh" }}>
      <AppBar className="app-topbar" position="fixed" elevation={0} sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar sx={{ bgcolor: "rgba(255,255,255,0.52)", color: "text.primary", backdropFilter: "blur(28px) saturate(1.2)" }}>
          <Typography className="brand-title" variant="h6" sx={{ flexGrow: 1, fontWeight: 900 }}>
            CRM Металлопрокат
          </Typography>
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
          width: drawerWidth,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: { width: drawerWidth, boxSizing: "border-box", borderRight: "1px solid rgba(255,255,255,0.58)" }
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: "auto", p: 1 }}>
          <List>
            {visibleMenu.map((item) => (
              <ListItemButton
                className="sidebar-link"
                component="a"
                href={item.path}
                key={item.path}
                selected={location.pathname === item.path}
                sx={{
                  borderRadius: "8px",
                  mb: 0.75,
                  minHeight: 48,
                  px: 1.4,
                  transition: "background 160ms ease, box-shadow 160ms ease, color 160ms ease",
                  "&.Mui-selected": {
                    bgcolor: "rgba(255,255,255,0.74)",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.92), 0 16px 34px rgba(25,58,63,0.12)",
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
        </Box>
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
