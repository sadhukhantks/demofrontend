"use client";

/**
 * Finishing Checklist body — one worker-spell per row with its anomaly remarks.
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
  fetchFinishingChecklist,
  type FinishingChecklistRow,
} from "@/utils/juteProductionReportService";
import { exportFinishingChecklistWorkbook } from "./finishingChecklistExcel";

const columns: GridColDef<FinishingChecklistRow>[] = [
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
  { field: "quality", headerName: "Quality", flex: 1, minWidth: 150 },
  numCol("net_hours", "Net Hrs", 100),
  numCol("prod_qty", "Prod Qty", 110),
  numCol("prod_wt_kg", "Prod KG", 110),
  { field: "remarks", headerName: "Remarks", flex: 1.5, minWidth: 260 },
];

export default function FinishingChecklistReport() {
  const { coId, branches, initialBranchId, dateParam } = useReportBranches();
  const { from, to } = currentMonthRange();
  return (
    <ReportPanel
      title="Finishing Checklist"
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
          : fetchFinishingChecklist({
              coId,
              branchId: f.branchId,
              dateFrom: f.dateFrom,
              dateTo: f.dateTo,
              rtype: f.extra || "chk",
            })
      }
      columns={columns}
      getRowId={(r) => r.row_id}
      sortField="tran_date"
      exportName="finishing-checklist"
      exportOverride={async (rows, header, f) => {
        // Sheet 2 (production pivot) must cover every worker, so it always
        // needs rtype=all even when the grid shows anomalies only.
        let allRows = rows;
        if (f.extra !== "all" && coId != null) {
          try {
            allRows = await fetchFinishingChecklist({
              coId,
              branchId: f.branchId,
              dateFrom: f.dateFrom,
              dateTo: f.dateTo,
              rtype: "all",
            });
          } catch {
            // ponytail: ReportPanel has no notify hook — fall back to the
            // loaded rows rather than lose the export entirely.
            allRows = rows;
          }
        }
        await exportFinishingChecklistWorkbook(
          columns,
          rows,
          allRows,
          "finishing-checklist",
          header,
          f.dateFrom,
          f.dateTo,
        );
      }}
    />
  );
}
