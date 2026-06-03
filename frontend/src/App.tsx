import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { User } from "./types";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ClientsPage } from "./pages/ClientsPage";
import { RemindersPage } from "./pages/RemindersPage";
import { TasksPage } from "./pages/TasksPage";
import { ImportPage } from "./pages/ImportPage";
import { StatusesPage } from "./pages/StatusesPage";
import { UsersPage } from "./pages/UsersPage";
import { ReportsPage } from "./pages/ReportsPage";
import { AuditLogPage } from "./pages/AuditLogPage";
import { SettingsPage } from "./pages/SettingsPage";
import { Box, CircularProgress, Typography } from "@mui/material";

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
    </BrowserRouter>
  );
}
