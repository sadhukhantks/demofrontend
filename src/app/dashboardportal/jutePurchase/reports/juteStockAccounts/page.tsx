"use client";
import React, { Suspense } from "react";
import { Box, CircularProgress } from "@mui/material";
import JuteStockReport from "../_components/JuteStockReport";

/**
 * Jute Stock (Accounts) — book stock (decision D5): receipt on the MR date at
 * approved weight, issues shifted to the MR date and booked at approved weight.
 * Split out of ../juteStock into its own page and report menu by TKT-000155.
 */
export default function JuteStockAccountsPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      }
    >
      <JuteStockReport
        basis="accounts"
        title="Jute Stock (Accounts)"
        exportName="jute-stock-accounts"
      />
    </Suspense>
  );
}
