import { Alert, Paper, Stack, Typography } from "@mui/material";
import { PageHeader } from "../components/PageHeader";

export function SettingsPage() {
  return (
    <>
      <PageHeader title="Настройки" />
      <Paper className="glass-surface" sx={{ p: 2, borderRadius: "8px" }} elevation={0}>
        <Stack spacing={1}>
          <Alert severity="info">Основные параметры задаются через `.env` и Docker Compose.</Alert>
          <Typography>Роли, статусы, импорт, экспорт и резервное копирование уже вынесены в отдельные разделы.</Typography>
        </Stack>
      </Paper>
    </>
  );
}
