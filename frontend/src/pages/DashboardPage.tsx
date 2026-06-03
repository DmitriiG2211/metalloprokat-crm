import { Assignment, EventBusy, EventRepeat, People } from "@mui/icons-material";
import { Box, Paper, Stack, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { PageHeader } from "../components/PageHeader";

function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <Box sx={{ p: 2, minHeight: 116 }}>
      <Stack direction="row" spacing={1.5} alignItems="center">
        {icon}
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
      </Stack>
      <Typography variant="h4" sx={{ mt: 1 }}>
        {value}
      </Typography>
    </Box>
  );
}

export function DashboardPage() {
  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => (await api.get("/reports/dashboard")).data
  });

  return (
    <>
      <PageHeader title="Главная" />
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 2 }}>
        <Paper className="glass-surface metric-card" sx={{ p: 0, borderRadius: "8px", overflow: "hidden" }} elevation={0}>
          <Metric label="Всего клиентов" value={data?.clients_total ?? 0} icon={<People color="primary" />} />
        </Paper>
        <Paper className="glass-surface metric-card" sx={{ p: 0, borderRadius: "8px", overflow: "hidden" }} elevation={0}>
          <Metric label="Позвонить сегодня" value={data?.calls_today ?? 0} icon={<EventRepeat color="success" />} />
        </Paper>
        <Paper className="glass-surface metric-card" sx={{ p: 0, borderRadius: "8px", overflow: "hidden" }} elevation={0}>
          <Metric label="Просроченные звонки" value={data?.overdue_calls ?? 0} icon={<EventBusy color="error" />} />
        </Paper>
        <Paper className="glass-surface metric-card" sx={{ p: 0, borderRadius: "8px", overflow: "hidden" }} elevation={0}>
          <Metric label="Активные задачи" value={data?.active_tasks ?? 0} icon={<Assignment color="warning" />} />
        </Paper>
      </Box>
    </>
  );
}
