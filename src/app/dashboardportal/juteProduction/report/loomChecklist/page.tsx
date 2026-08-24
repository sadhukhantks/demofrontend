"use client";

/**
 * Loom Checklist — port of the legacy checklist/loomchkist.php sheet.
 *
 * Weaving-daily rows per loom + spell for a date range, with a Remarks column
 * naming every anomaly rule the row trips (EB/production mismatch, zero or
 * out-of-band efficiency, cuts/jugar without production, negative production).
 * "Checklist" shows only anomalous rows; "All" shows every entry.
 */

import React, { Suspense } from "react";
import { Box, CircularProgress } from "@mui/material";
import LoomChecklistReport from "./_components/LoomChecklistReport";

export default function LoomChecklistPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      }
    >
      <LoomChecklistReport />
    </Suspense>
  );
}
