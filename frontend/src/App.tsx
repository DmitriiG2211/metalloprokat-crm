import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { User } from "./types";
import { Box, CircularProgress, Typography } from "@mui/material";

const Layout = lazy(() => import("./components/Layout").then((module) => ({ default: module.Layout })));
const LoginPage = lazy(() => import("./pages/LoginPage").then((module) => ({ default: module.LoginPage })));
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const ClientsPage = lazy(() => import("./pages/ClientsPage").then((module) => ({ default: module.ClientsPage })));
const RemindersPage = lazy(() => import("./pages/RemindersPage").then((module) => ({ default: module.RemindersPage })));
const TasksPage = lazy(() => import("./pages/TasksPage").then((module) => ({ default: module.TasksPage })));
const ImportPage = lazy(() => import("./pages/ImportPage").then((module) => ({ default: module.ImportPage })));
const StatusesPage = lazy(() => import("./pages/StatusesPage").then((module) => ({ default: module.StatusesPage })));
const UsersPage = lazy(() => import("./pages/UsersPage").then((module) => ({ default: module.UsersPage })));
const ReportsPage = lazy(() => import("./pages/ReportsPage").then((module) => ({ default: module.ReportsPage })));
const AuditLogPage = lazy(() => import("./pages/AuditLogPage").then((module) => ({ default: module.AuditLogPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((module) => ({ default: module.SettingsPage })));

function PageLoader() {
  return (
    <Box sx={{ minHeight: "50vh", display: "grid", placeItems: "center" }}>
      <Box sx={{ textAlign: "center" }}>
        <CircularProgress size={28} />
        <Typography sx={{ mt: 1.5 }} color="text.secondary">
          Открываем раздел...
        </Typography>
      </Box>
    </Box>
  );
}

function Protected() {
  const token = localStorage.getItem("crm_token");
  const { data: user, isLoading } = useQuery({
    queryKey: ["me", token],
    queryFn: async () => (await api.get<User>("/auth/me")).data,
    enabled: Boolean(token),
    retry: false
  });

  if (!token) return <Navigate to="/login" replace />;
  if (isLoading) {
    return (
      <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <Box sx={{ textAlign: "center" }}>
          <CircularProgress />
          <Typography sx={{ mt: 2 }}>Открываем CRM...</Typography>
        </Box>
      </Box>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <Layout user={user} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<Protected />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/reminders" element={<RemindersPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/statuses" element={<StatusesPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/audit" element={<AuditLogPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
