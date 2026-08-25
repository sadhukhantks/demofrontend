"use client";

/**
 * Winding Checklist body — one component, two tabs: `direction` picks the
 * attendance side (who was present but produced nothing) or the production
 * side (who produced but wasn't marked present).
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
  fetchWindingChecklist,
  type WindingChecklistRow,
} from "@/utils/juteProductionReportService";

const columns: GridColDef<WindingChecklistRow>[] = [
  { field: "tran_date", headerName: "Date", width: 100 },
  { field: "spell_code", headerName: "Spell", width: 80 },
  {
    field: "eb_no",
    headerName: "EB No",
    width: 100,
    valueGetter: (_, row) => row.eb_no ?? (row.eb_id != null ? String(row.eb_id) : ""),
  },
  { field: "worker_name", headerName: "Worker", flex: 1, minWidth: 160 },
  { field: "designation", headerName: "Designation", width: 140 },
  numCol("net_hours", "Net Hrs", 100),
  numCol("doff_count", "Doffs", 90),
  numCol("production_qty", "Production KG", 130),
  { field: "remarks", headerName: "Remarks", flex: 1.5, minWidth: 260 },
];

export default function WindingChecklistReport({
  direction,
}: {
  direction: "attendance" | "production";
}) {
  const { coId, branches, initialBranchId, dateParam } = useReportBranches();
  const { from, to } = currentMonthRange();
  return (
    <ReportPanel
      title={
        direction === "attendance"
          ? "Winding Checklist"
          : "Winding Checklist (A)"
      }
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
          : fetchWindingChecklist({
              coId,
              branchId: f.branchId,
              dateFrom: f.dateFrom,
              dateTo: f.dateTo,
              rtype: f.extra || "chk",
              direction,
            })
      }
      columns={columns}
      getRowId={(r) => r.row_id}
      sortField="tran_date"
      exportName={
        direction === "attendance" ? "winding-checklist" : "winding-checklist-a"
      }
    />
  );
}
