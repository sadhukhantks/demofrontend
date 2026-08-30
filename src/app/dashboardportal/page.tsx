"use client";

import { Box, Typography } from "@mui/material";
import { ModuleMenuGrid } from "@/components/dashboard/ModuleMenuGrid";

export default function DashboardPage() {
  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
        Dashboard
      </Typography>
      <ModuleMenuGrid />
    </Box>
  );
}
