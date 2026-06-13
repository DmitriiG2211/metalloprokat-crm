import { ManageAccounts, Person, SupervisorAccount } from "@mui/icons-material";
import { Alert, Box, Button, CircularProgress, Paper, Stack, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, errorMessage } from "../api";
import { userDisplayName } from "../display";
import { User } from "../types";

const leaderRoles = new Set(["admin", "director", "senior_manager"]);

function userLabel(user: User) {
  return userDisplayName(user);
}

export function LoginPage() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [loadingLogin, setLoadingLogin] = useState("");
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["login-options"],
    queryFn: async () => (await api.get<User[]>("/auth/login-options")).data,
    retry: false
  });

  const leaders = users
    .filter((user) => leaderRoles.has(user.role))
    .sort((a, b) => (a.role === "admin" ? -1 : b.role === "admin" ? 1 : 0))
    .slice(0, 1);
  const managers = users.filter((user) => user.role === "manager");

  const quickLogin = async (login: string) => {
    setLoadingLogin(login);
    setError("");
    try {
      const { data } = await api.post("/auth/quick-login", { login });
      localStorage.setItem("crm_token", data.access_token);
      navigate("/");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadingLogin("");
    }
  };

  return (
    <Box className="login-shell">
      <Paper className="glass-surface login-card" sx={{ width: "100%", maxWidth: 620, p: { xs: 3, md: 4 }, borderRadius: "8px" }} elevation={0}>
        <Box className="login-logo-wrap">
          <Box component="img" className="login-logo" src="/logo.jpg" alt="Мегаполис" />
        </Box>
        <Typography variant="h4" sx={{ mb: 1, fontSize: 30, textWrap: "balance" }}>
          CRM Мегаполис
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3, textWrap: "pretty" }}>
          Выберите пользователя для работы
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {isLoading ? (
          <Stack alignItems="center" spacing={1.5} sx={{ py: 4 }}>
            <CircularProgress />
            <Typography color="text.secondary">Загружаем пользователей...</Typography>
          </Stack>
        ) : (
          <Stack spacing={2.5}>
            <Box>
              <Typography fontWeight={900} sx={{ mb: 1 }}>
                Руководитель
              </Typography>
              <Box className="login-choice-grid">
                {leaders.map((user) => (
                  <Button
                    key={user.id}
                    type="button"
                    className="glass-button login-choice-button"
                    startIcon={<SupervisorAccount />}
                    onClick={() => quickLogin(user.login)}
                    disabled={Boolean(loadingLogin)}
                  >
                    <span>{userLabel(user)}</span>
                  </Button>
                ))}
              </Box>
            </Box>

            <Box>
              <Typography fontWeight={900} sx={{ mb: 1 }}>
                Менеджеры
              </Typography>
              <Box className="login-choice-grid managers">
                {managers.map((user) => (
                  <Button
                    key={user.id}
                    type="button"
                    className="glass-button login-choice-button"
                    startIcon={<Person />}
                    onClick={() => quickLogin(user.login)}
                    disabled={Boolean(loadingLogin)}
                  >
                    <span>{userLabel(user)}</span>
                  </Button>
                ))}
              </Box>
            </Box>

            {users.length === 0 && (
              <Alert severity="warning" icon={<ManageAccounts />}>
                Пользователи не найдены. Проверьте, что backend запущен.
              </Alert>
            )}
          </Stack>
        )}
      </Paper>
    </Box>
  );
}
