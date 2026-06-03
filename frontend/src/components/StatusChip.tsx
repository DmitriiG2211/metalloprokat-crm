import { Chip } from "@mui/material";

export function StatusChip({ status }: { status?: { name: string; color: string } | null }) {
  if (!status) return <Chip size="small" label="Без статуса" className="glass-button" />;
  return (
    <Chip
      size="small"
      label={status.name}
      sx={{
        bgcolor: status.color,
        color: "#263238",
        fontWeight: 800,
        border: "1px solid rgba(255,255,255,0.72)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.76), 0 8px 18px rgba(31,54,58,0.08)"
      }}
    />
  );
}
