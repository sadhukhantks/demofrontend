"use client";
import React, { Suspense } from "react";
import { Box, CircularProgress } from "@mui/material";
import JuteStockReport from "../_components/JuteStockReport";

/**
 * Jute Stock (Production) — physical stock: receipt on the gate-out date at
 * net weight. The accounts view is its own page, ../juteStockAccounts
 * (TKT-000155; it used to be an Actual/Accounts toggle here).
 */
export default function JuteStockPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      }
    >
      <JuteStockReport
        basis="actual"
        title="Jute Stock (Production)"
        exportName="jute-stock-production"
      />
    </Suspense>
  );
}
