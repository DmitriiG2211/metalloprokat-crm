import { Box, Typography } from "@mui/material";
import { ReactNode } from "react";

export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <Box className="page-header" sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, mb: 2 }}>
      <Box>
        <Typography variant="h4" sx={{ fontSize: { xs: 24, md: 30 }, lineHeight: 1.1 }}>
          {title}
        </Typography>
        <Box sx={{ width: 88, mt: 1 }} className="soft-divider" />
      </Box>
      <Box className="page-actions" sx={{ display: "flex", gap: 1 }}>{actions}</Box>
    </Box>
  );
}
