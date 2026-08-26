"use client";

/**
 * Loom Checklist report body — shared by the standalone report route
 * (report/loomChecklist) and the Checklist page's "Loom" tab.
 *
 * Callers MUST render this inside a <Suspense> boundary: useReportBranches()
 * reads useSearchParams(), and `next build` fails without one.
 */

import React from "react";
import { GridColDef } from "@mui/x-data-grid";
import ReportPanel from "@/components/reports/ReportPanel";
import { numCol } from "@/components/reports/ReportGrid";
import { useReportBranches } from "@/components/reports/useReportBranches";
import { currentMonthRange } from "@/components/reports/reportDates";
import {
  fetchLoomChecklist,
  type LoomChecklistRow,
} from "@/utils/juteProductionReportService";

const SYNC_STATE_LABEL: Record<string, string> = {
  not_synced: "Not synced",
  synced: "Synced",
  locked: "Locked",
  stale: "Stale",
};

const columns: GridColDef<LoomChecklistRow>[] = [
  { field: "tran_date", headerName: "Date", width: 100 },
  // No Machine column: mech_code IS the machine, it was the same value twice.
  { field: "mech_code", headerName: "Loom", width: 90 },
  { field: "spell_code", headerName: "Spell", width: 70 },
  { field: "weaving_quality_code", headerName: "Quality", width: 110 },
  {
    field: "eb_no",
    headerName: "EB No",
    width: 100,
    valueGetter: (_, row) => row.eb_no ?? (row.eb_id != null ? String(row.eb_id) : ""),
  },
  {
    field: "sync_state",
    headerName: "State",
    width: 100,
    valueGetter: (_, row) => SYNC_STATE_LABEL[row.sync_state] ?? "",
  },
  numCol("open_jugar", "Op Jug", 85),
  numCol("cuts", "Cuts", 70),
  numCol("close_jugar", "Cl. Jug", 85),
  numCol("production_yds", "Production (yds)", 130),
  numCol("efficiency", "Eff%", 80),
  numCol("working_hours", "Loom Hrs", 100),
  { field: "remarks", headerName: "Remarks", flex: 1.5, minWidth: 260 },
];

export default function LoomChecklistReport() {
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
      pdfExport
    />
  );
}
