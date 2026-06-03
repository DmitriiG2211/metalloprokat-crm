import { Paper, Table, TableBody, TableCell, TableHead, TableRow } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { PageHeader } from "../components/PageHeader";

export function AuditLogPage() {
  const { data = [] } = useQuery({ queryKey: ["audit"], queryFn: async () => (await api.get("/audit-log")).data });
  return (
    <>
      <PageHeader title="Журнал действий" />
      <Paper className="table-scroll glass-surface" sx={{ borderRadius: "8px" }} elevation={0}>
        <Table size="small" className="premium-table">
          <TableHead>
            <TableRow>
              <TableCell>Дата</TableCell>
              <TableCell>Действие</TableCell>
              <TableCell>Объект</TableCell>
              <TableCell>ID</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.map((item: any) => (
              <TableRow key={item.id}>
                <TableCell>{new Date(item.created_at).toLocaleString("ru-RU")}</TableCell>
                <TableCell>{item.action}</TableCell>
                <TableCell>{item.entity_type}</TableCell>
                <TableCell>{item.entity_id}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </>
  );
}
