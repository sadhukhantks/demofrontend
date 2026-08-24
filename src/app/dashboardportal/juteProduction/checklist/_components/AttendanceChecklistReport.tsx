"use client";

/**
 * Attendance Checklist body — the raw attendance list behind the other sheets,
 * so no Report Type filter and no remarks column. The server caps the range at
 * 31 days; the pickers default to the current month like the other tabs.
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
  fetchAttendanceChecklist,
  type AttendanceChecklistRow,
} from "@/utils/juteProductionReportService";

const columns: GridColDef<AttendanceChecklistRow>[] = [
  { field: "tran_date", headerName: "Date", width: 100 },
  { field: "spell_code", headerName: "Spell", width: 80 },
  {
    field: "eb_no",
    headerName: "EB No",
    width: 100,
    valueGetter: (_, row) => row.eb_no ?? (row.eb_id != null ? String(row.eb_id) : ""),
  },
  { field: "worker_name", headerName: "Worker", flex: 1, minWidth: 160 },
  { field: "department", headerName: "Department", width: 140 },
  { field: "designation", headerName: "Designation", width: 140 },
  { field: "attendance_type", headerName: "Type", width: 110 },
  numCol("net_hours", "Net Hrs", 100),
  { field: "machines", headerName: "Machines", flex: 1, minWidth: 180 },
];

export default function AttendanceChecklistReport() {
  const { coId, branches, initialBranchId, dateParam } = useReportBranches();
  const { from, to } = currentMonthRange();
  return (
    <ReportPanel
      title="Attendance Checklist"
      branches={branches}
      initialBranchId={initialBranchId}
      dates="range"
      initialDateFrom={from}
      initialDateTo={dateParam || to}
      fetcher={(f) =>
        coId == null
          ? Promise.resolve([])
          : fetchAttendanceChecklist({
              coId,
              branchId: f.branchId,
              dateFrom: f.dateFrom,
              dateTo: f.dateTo,
            })
      }
      columns={columns}
      getRowId={(r) => r.row_id}
      sortField="tran_date"
      exportName="attendance-checklist"
    />
  );
}
