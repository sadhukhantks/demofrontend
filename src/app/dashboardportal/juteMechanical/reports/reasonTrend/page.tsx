"use client";
import React, { Suspense, useCallback, useMemo, useState } from "react";
import { Box, CircularProgress } from "@mui/material";
import { usePathname } from "next/navigation";
import type { GridColDef } from "@mui/x-data-grid";
import ReportGrid, { numCol } from "@/components/reports/ReportGrid";
import { exportRowsToExcel } from "@/components/reports/exportExcel";
import { resolveReportMenuId } from "@/utils/reportMenuService";
import { fetchReasonTrendReport } from "@/utils/juteMechanicalService";
import MechFilterToolbar, {
  MechReportTitle,
  UnattributedCaption,
} from "../_components/MechFilterToolbar";
import {
  useMechReportFilters,
  useMechReportRun,
} from "../_components/useMechReportFilters";
import {
  asRecord,
  pickNum,
  pickText,
  unattributedPctFromRows,
} from "../_components/mechReportUtils";

/**
 * R7 — Reason Trend: month × reason count and duration. The workbook's Summary
 * sheets.
 *
 * The backend returns rows ALREADY PIVOTED — one row per reason carrying a
 * `<YYYY-MM>_count` and `<YYYY-MM>_duration` key for every month in range. The
 * month list travels as a top-level `months` key which the service's list
 * envelope does not surface, so the columns are derived from the row keys
 * themselves (they are the same set).
 */
const MONTH_KEY_RE = /^(\d{4})-(\d{2})_count$/;

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2026-07" → "Jul 26". */
function monthLabel(ym: string): string {
  const [year, month] = ym.split("-");
  const index = Number(month) - 1;
  const name = MONTH_LABELS[index] ?? month;
  return `${name} ${year.slice(2)}`;
}

type TrendGridRow = { id: string } & Record<string, string | number | null>;

const LEAD_COLUMNS: GridColDef<TrendGridRow>[] = [
  { field: "reason_code", headerName: "Reason Code", width: 115 },
  { field: "reason_desc", headerName: "Reason", minWidth: 200 },
  { field: "discipline", headerName: "Discipline", width: 110 },
  { field: "component_name", headerName: "Component", width: 130 },
];

const TAIL_COLUMNS: GridColDef<TrendGridRow>[] = [
  numCol<TrendGridRow>("total_count", "Total Breakdowns", 135),
  numCol<TrendGridRow>("total_duration", "Total Duration (Min)", 145),
  numCol<TrendGridRow>("duration_per_breakdown", "Duration / Breakdown", 155),
];

function ReasonTrendContent() {
  const filters = useMechReportFilters();
  const pathname = usePathname();
  const { reportParams, companyName, branch, dateFrom, dateTo, ready } = filters;

  const [monthColumns, setMonthColumns] = useState<GridColDef<TrendGridRow>[]>([]);

  const fetcher = useCallback(async () => {
    if (!reportParams) return { rows: [], unattributed: null };
    const result = await fetchReasonTrendReport(reportParams);
    const records = result.data.map(asRecord);

    // Months present across all rows, in chronological order.
    const months = new Set<string>();
    for (const rec of records) {
      for (const key of Object.keys(rec)) {
        const match = MONTH_KEY_RE.exec(key);
        if (match) months.add(`${match[1]}-${match[2]}`);
      }
    }
    const orderedMonths = Array.from(months).sort();

    setMonthColumns(
      orderedMonths.flatMap((ym) => [
        numCol<TrendGridRow>(`${ym}_count`, `${monthLabel(ym)} Cnt`, 95),
        numCol<TrendGridRow>(`${ym}_duration`, `${monthLabel(ym)} Min`, 105),
      ]),
    );

    const rows: TrendGridRow[] = records.map((rec, index) => {
      const row: TrendGridRow = {
        id: String(pickNum(rec, "reason_id") ?? `row-${index}`),
        reason_code: pickText(rec, "reason_code"),
        reason_desc: pickText(rec, "reason_desc"),
        discipline: pickText(rec, "discipline"),
        component_name: pickText(rec, "component_name"),
        total_count: pickNum(rec, "total_count"),
        total_duration: pickNum(rec, "total_duration"),
        duration_per_breakdown: pickNum(rec, "duration_per_breakdown"),
      };
      for (const ym of orderedMonths) {
        row[`${ym}_count`] = pickNum(rec, `${ym}_count`) ?? 0;
        row[`${ym}_duration`] = pickNum(rec, `${ym}_duration`) ?? 0;
      }
      return row;
    });

    return { rows, unattributed: unattributedPctFromRows(records) };
  }, [reportParams]);

  const { rows, unattributed, loading, error, run } =
    useMechReportRun<TrendGridRow>(fetcher, ready);

  const columns = useMemo<GridColDef<TrendGridRow>[]>(
    () => [...LEAD_COLUMNS, ...monthColumns, ...TAIL_COLUMNS],
    [monthColumns],
  );

  const handleExport = useCallback(() => {
    void (async () => {
      await exportRowsToExcel(columns, rows, "mech-reason-trend", {
        companyName,
        branchName: branch?.branch_name,
        reportName: "Breakdown Reason Trend (Month × Reason)",
        reportNo: await resolveReportMenuId(pathname),
        reportFor: [dateFrom, dateTo].filter(Boolean).join(" To "),
      });
    })();
  }, [columns, rows, companyName, branch?.branch_name, pathname, dateFrom, dateTo]);

  const handleSubmit = useCallback(() => {
    void run();
  }, [run]);

  const exportDisabled = useMemo(
    () => rows.length === 0 || filters.branchId == null,
    [rows.length, filters.branchId],
  );

  return (
    <Box sx={{ p: 3 }}>
      <MechReportTitle>Breakdown Reason Trend</MechReportTitle>
      <UnattributedCaption value={unattributed} />

      {filters.mounted && (
        <MechFilterToolbar
          filters={filters}
          show={{ dates: true, machine: true, machineType: true, discipline: true }}
          onSubmit={handleSubmit}
          onExport={handleExport}
          loading={loading}
          exportDisabled={exportDisabled}
        />
      )}

      <ReportGrid
        rows={rows}
        columns={columns}
        getRowId={(row) => row.id}
        loading={loading}
        error={error}
        branchId={filters.branchId}
      />
    </Box>
  );
}

export default function ReasonTrendPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      }
    >
      <ReasonTrendContent />
    </Suspense>
  );
}
