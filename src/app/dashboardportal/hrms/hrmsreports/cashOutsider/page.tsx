"use client";
import React, { Suspense, useCallback, useMemo } from "react";
import { Box, CircularProgress } from "@mui/material";
import { GridColDef } from "@mui/x-data-grid";
import ReportPanel, {
  type ReportFilters,
} from "@/components/reports/ReportPanel";
import { numCol } from "@/components/reports/ReportGrid";
import { useReportBranches } from "@/components/reports/useReportBranches";
import { yesterdayIso } from "@/components/reports/reportDates";
import { fetchCashHands, type CashHandsRow } from "@/utils/hrmsReportService";
import type { ReportExportHeader } from "@/components/reports/exportExcel";
import {
  exportCashOutsiderWorkbook,
  totalRow,
} from "./cashOutsiderExcel";

/** A payment row, or one of the Total rows built below it. */
type Row = CashHandsRow;

function Content() {
  const { coId, branches, initialBranchId, dateParam } = useReportBranches();

  const fetcher = useCallback(
    async (f: ReportFilters): Promise<Row[]> => {
      if (coId == null) return [];
      // Legacy 682 is a single PAY DATE, never a period — the one date the
      // panel collects is sent as both ends of the range.
      const rows = await fetchCashHands({
        coId,
        branchId: f.branchId,
        dateFrom: f.dateTo,
        dateTo: f.dateTo,
      });

      // Legacy ordered by department code, contractor, then EB no.
      const sorted = [...rows].sort(
        (a, b) =>
          (a.dept_code ?? "").localeCompare(b.dept_code ?? "") ||
          (a.department ?? "").localeCompare(b.department ?? "") ||
          (a.contractor ?? "").localeCompare(b.contractor ?? "") ||
          (a.eb_no ?? "").localeCompare(b.eb_no ?? ""),
      );

      // Ids continue past the data rows, which the service numbers from 0.
      let nextId = sorted.length;
      const out: Row[] = [];
      let group: Row[] = [];
      const flush = () => {
        if (group.length) {
          out.push(totalRow(nextId++, group[0].department ?? "", group));
        }
        group = [];
      };
      for (const row of sorted) {
        if (group.length && group[0].department !== row.department) flush();
        out.push(row);
        group.push(row);
      }
      flush();
      // "Grand Total" in the lead column is itself the marker, so no label.
      if (out.length) out.push(totalRow(nextId++, "Grand Total", sorted, ""));
      return out;
    },
    [coId],
  );

  const columns = useMemo<GridColDef<Row>[]>(
    () => [
      { field: "department", headerName: "Department", flex: 1.4, minWidth: 160 },
      { field: "dept_code", headerName: "Dept Code", width: 100 },
      { field: "contractor", headerName: "Contractor", flex: 1, minWidth: 140 },
      { field: "eb_no", headerName: "EB No", width: 110 },
      { field: "worker_name", headerName: "Name", flex: 1.6, minWidth: 180 },
      { field: "occupation", headerName: "Designation", flex: 1.6, minWidth: 180 },
      { field: "shift", headerName: "Shift", width: 80 },
      numCol<Row>("working_hours", "Work Hours", 110),
      numCol<Row>("rate", "Rate", 100),
      numCol<Row>("oth_rate", "Oth Rate", 100),
      numCol<Row>("amount", "Amount", 120),
    ],
    [],
  );

  // One sheet per department plus a department-wise summary, instead of the
  // panel's default single-sheet dump.
  const exportOverride = useCallback(
    (rows: Row[], header: ReportExportHeader) =>
      exportCashOutsiderWorkbook(rows, columns, header),
    [columns],
  );

  return (
    <ReportPanel
      title="Daily Cash Outsider Payment"
      branches={branches}
      initialBranchId={initialBranchId}
      dates="single"
      singleLabel="Pay Date"
      initialDateTo={dateParam || yesterdayIso()}
      fetcher={fetcher}
      columns={columns}
      getRowId={(r) => r.id}
      // No initial sort — it would break the department grouping above.
      exportName="daily-cash-outsider-payment"
      exportOverride={exportOverride}
      pdfExport
    />
  );
}

export default function CashOutsiderPage() {
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
