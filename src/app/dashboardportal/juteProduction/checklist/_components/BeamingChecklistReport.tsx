"use client";

/**
 * Beaming Checklist body — one machine-spell per row with its anomaly remarks.
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
  fetchBeamingChecklist,
  type BeamingChecklistRow,
} from "@/utils/juteProductionReportService";

const columns: GridColDef<BeamingChecklistRow>[] = [
  { field: "tran_date", headerName: "Date", width: 100 },
  { field: "spell_code", headerName: "Spell", width: 80 },
  { field: "mech_code", headerName: "Machine Code", width: 120 },
  { field: "machine_name", headerName: "Machine", flex: 1, minWidth: 140 },
  { field: "workers", headerName: "Workers", flex: 1, minWidth: 160 },
  numCol("net_hours", "Net Hrs", 100),
  numCol("cuts", "Cuts", 90),
  { field: "remarks", headerName: "Remarks", flex: 1.5, minWidth: 260 },
];

export default function BeamingChecklistReport() {
  const { coId, branches, initialBranchId, dateParam } = useReportBranches();
  const { from, to } = currentMonthRange();
  return (
    <ReportPanel
      title="Beaming Checklist"
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
          : fetchBeamingChecklist({
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
      exportName="beaming-checklist"
    />
  );
}
