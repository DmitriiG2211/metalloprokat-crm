import { Paper, Stack, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api";
import { PageHeader } from "../components/PageHeader";
import { StatusChip } from "../components/StatusChip";
import { Client } from "../types";

const endpoints = ["/reminders/today", "/reminders/overdue", "/reminders/upcoming"];

export function RemindersPage() {
  const [tab, setTab] = useState(0);
  const { data = [] } = useQuery({ queryKey: ["reminders", tab], queryFn: async () => (await api.get<Client[]>(endpoints[tab])).data });
  return (
    <>
      <PageHeader title="Напоминания" />
      <Paper className="glass-surface" sx={{ mb: 2, borderRadius: "8px" }} elevation={0}>
        <Tabs value={tab} onChange={(_, value) => setTab(value)}>
          <Tab label="Сегодня" />
          <Tab label="Просроченные" />
          <Tab label="Будущие" />
        </Tabs>
      </Paper>
      <Paper className="table-scroll glass-surface" sx={{ borderRadius: "8px" }} elevation={0}>
        <Table size="small" className="premium-table">
          <TableHead>
            <TableRow>
              <TableCell>Компания</TableCell>
              <TableCell>Телефон</TableCell>
              <TableCell>Дата перезвона</TableCell>
              <TableCell>Статус</TableCell>
              <TableCell>Менеджер</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.map((client) => (
              <TableRow key={client.id}>
                <TableCell>{client.company_name}</TableCell>
                <TableCell>{client.phone}</TableCell>
                <TableCell>{client.next_call_date}</TableCell>
                <TableCell>
                  <StatusChip status={client.status} />
                </TableCell>
                <TableCell>{client.manager?.login}</TableCell>
              </TableRow>
            ))}
            {data.length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>На выбранный период звонков нет</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>
    </>
  );
}
