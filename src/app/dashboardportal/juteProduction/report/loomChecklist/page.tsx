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
import { GridColDef } from "@mui/x-data-grid";
import ReportPanel from "@/components/reports/ReportPanel";
import { numCol } from "@/components/reports/ReportGrid";
import { useReportBranches } from "@/components/reports/useReportBranches";
import { currentMonthRange } from "@/components/reports/reportDates";
import {
  fetchLoomChecklist,
  type LoomChecklistRow,
} from "@/utils/juteProductionReportService";

const columns: GridColDef<LoomChecklistRow>[] = [
  { field: "tran_date", headerName: "Date", width: 100 },
  { field: "mech_code", headerName: "Loom", width: 90 },
  { field: "machine_name", headerName: "Machine", flex: 1, minWidth: 130 },
  { field: "spell_code", headerName: "Spell", width: 80 },
  { field: "weaving_quality_code", headerName: "Quality", width: 110 },
  {
    field: "eb_no",
    headerName: "EB No",
    width: 100,
    valueGetter: (_, row) => row.eb_no ?? (row.eb_id != null ? String(row.eb_id) : ""),
  },
  numCol("open_jugar", "Opening Jugar", 120),
  numCol("cuts", "Cuts", 90),
  numCol("close_jugar", "Closing Jugar", 120),
  numCol("production_yds", "Production (yds)", 130),
  numCol("efficiency", "Efficiency %", 110),
  numCol("working_hours", "Loom Hrs", 100),
  { field: "remarks", headerName: "Remarks", flex: 1.5, minWidth: 260 },
];

function Content() {
  const { coId, branches, initialBranchId, dateParam } = useReportBranches();
  const { from, to } = currentMonthRange();
  return (
    <ReportPanel
      title="Loom Checklist"
      branches={branches}
      initialBranchId={initialBranchId}
      dates="range"
      initialDateFrom={from}
      initialDateTo={dateParam || to}
      extra={{
        label: "Report Type",
        options: [
          { value: "chk", label: "Checklist" },
          { value: "all", label: "All" },
        ],
      }}
      initialExtra="chk"
      fetcher={(f) =>
        coId == null
          ? Promise.resolve([])
          : fetchLoomChecklist({
              coId,
              branchId: f.branchId,
              dateFrom: f.dateFrom,
              dateTo: f.dateTo,
              rtype: f.extra || "chk",
            })
      }
      columns={columns}
      getRowId={(r) => r.weaving_daily_id}
      sortField="tran_date"
      exportName="loom-checklist"
    />
  );
}

export default function LoomChecklistPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      }
    >
      <Content />
    </Suspense>
  );
}
