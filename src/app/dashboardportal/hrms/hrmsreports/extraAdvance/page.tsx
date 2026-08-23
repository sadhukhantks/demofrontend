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
import {
  fetchExtraAdvancePayment,
  type ExtraAdvancePaymentRow,
} from "@/utils/hrmsReportService";
import type { ReportExportHeader } from "@/components/reports/exportExcel";
import { exportExtraAdvanceWorkbook } from "./extraAdvanceExcel";

type Row = ExtraAdvancePaymentRow;

const SHIFTS = [
  { value: "", label: "All Shifts" },
  { value: "A", label: "A" },
  { value: "B", label: "B" },
  { value: "C", label: "C" },
];

const r2 = (n: number) => Math.round(n * 100) / 100;

function Content() {
  const { coId, branches, initialBranchId, dateParam } = useReportBranches();

  const fetcher = useCallback(
    async (f: ReportFilters): Promise<Row[]> => {
      if (coId == null) return [];
      // Single-date report (legacy "Daily Extra Advance Payment Date <date>").
      const rows = await fetchExtraAdvancePayment({
        coId,
        branchId: f.branchId,
        dateFrom: f.dateTo,
        dateTo: f.dateTo,
        shift: f.extra || null,
      });
      if (!rows.length) return rows;

      const total: Row = {
        id: -1,
        attendance_date: f.dateTo,
        eb_no: "Total",
        worker_name: "",
        shift: "",
        department: "",
        occupation: "",
        work_hours: r2(rows.reduce((s, r) => s + r.work_hours, 0)),
        advance_amount: r2(rows.reduce((s, r) => s + r.advance_amount, 0)),
      };
      return [...rows, total];
    },
    [coId],
  );

  // The Excel is the legacy signature sheet, not a dump of the grid — and its
  // per-sheet Total is computed there, so the grid's Total row (id -1) is
  // dropped on the way in.
  const exportOverride = useCallback(
    async (
      exportRows: Row[],
      header: ReportExportHeader,
      f: ReportFilters,
    ) => {
      await exportExtraAdvanceWorkbook(
        exportRows.filter((r) => r.id >= 0),
        header,
        f.dateTo,
      );
    },
    [],
  );

  const columns = useMemo<GridColDef<Row>[]>(
    () => [
      { field: "eb_no", headerName: "EB Number", width: 110 },
      { field: "worker_name", headerName: "Worker Name", flex: 1.6, minWidth: 180 },
      { field: "shift", headerName: "Shift", width: 80 },
      { field: "department", headerName: "Department", flex: 1.2, minWidth: 150 },
      { field: "occupation", headerName: "Occupation", flex: 1.6, minWidth: 190 },
      numCol<Row>("work_hours", "Working Hours", 130),
      numCol<Row>("advance_amount", "Adv Amount", 130),
    ],
    [],
  );

  return (
    <ReportPanel
      title="Daily Extra Advance Payment"
      branches={branches}
      initialBranchId={initialBranchId}
      dates="single"
      singleLabel="Date"
      initialDateTo={dateParam || yesterdayIso()}
      extra={{ label: "Shift", options: SHIFTS }}
      fetcher={fetcher}
      columns={columns}
      getRowId={(r) => r.id}
      exportOverride={exportOverride}
      // No initial sort — the backend orders by department, shift, EB number
      // and the Total row has to stay last.
      exportName="extra-advance-payment"
    />
  );
}

export default function ExtraAdvancePaymentPage() {
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
