"use client";
import React, { Suspense, useCallback, useMemo } from "react";
import { Box, CircularProgress, Typography } from "@mui/material";
import { usePathname } from "next/navigation";
import type { GridColDef } from "@mui/x-data-grid";
import ReportGrid, { numCol } from "@/components/reports/ReportGrid";
import { exportRowsToExcel } from "@/components/reports/exportExcel";
import { resolveReportMenuId } from "@/utils/reportMenuService";
import { fetchReasonParetoReport } from "@/utils/juteMechanicalService";
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
 * R3 — Reason Pareto: per reason count, total duration, duration per breakdown,
 * % share AND cumulative %, ordered by total duration descending.
 *
 * The mill's workbook stops after the first three columns. `pct_share` and
 * `cumulative_pct` are what turn that block into an actual Pareto — they answer
 * "which handful of reason codes are 80% of our downtime". Rows inside the 80%
 * cumulative cut are marked as the vital few so the answer is readable at a
 * glance rather than requiring the reader to add percentages up in their head.
 *
 * Backend key names differ from the display names: `count`, `total_duration`
 * and `pct_share` (see src/juteMechanical/reports.py).
 */
const PARETO_CUTOFF_PCT = 80;

type ParetoGridRow = {
  id: string;
  rank: number;
  reason_code: string;
  reason_desc: string;
  discipline: string;
  component_name: string;
  machine_count: number | null;
  count: number | null;
  total_duration: number | null;
  duration_per_breakdown: number | null;
  pct_share: number | null;
  cumulative_pct: number | null;
  /** Inside the 80% cumulative cut — the reasons worth fixing first. */
  vital_few: string;
};

/**
 * Cumulative % rendered as a value plus a proportional bar, so the point where
 * the curve crosses 80% is visible without reading every number. Uses palette
 * tokens (never literal colours).
 */
function CumulativeCell({ value, vital }: { value: number | null; vital: boolean }) {
  if (value === null) return null;
  return (
    <Box sx={{ width: "100%", display: "flex", alignItems: "center", gap: 1 }}>
      <Box
        sx={{
          position: "relative",
          flex: 1,
          height: 8,
          borderRadius: 1,
          bgcolor: "action.hover",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            width: `${Math.min(Math.max(value, 0), 100)}%`,
            bgcolor: vital ? "warning.main" : "success.main",
          }}
        />
      </Box>
      <Typography variant="caption" sx={{ minWidth: 46, textAlign: "right" }}>
        {value.toFixed(1)}%
      </Typography>
    </Box>
  );
}

const columns: GridColDef<ParetoGridRow>[] = [
  { field: "rank", headerName: "#", width: 60, type: "number" },
  { field: "reason_code", headerName: "Reason Code", width: 115 },
  { field: "reason_desc", headerName: "Reason", minWidth: 200 },
  { field: "discipline", headerName: "Discipline", width: 110 },
  { field: "component_name", headerName: "Component", width: 130 },
  numCol("count", "Breakdowns", 110),
  numCol("total_duration", "Total Duration (Min)", 145),
  numCol("duration_per_breakdown", "Duration / Breakdown", 155),
  numCol("pct_share", "% Share", 100),
  {
    field: "cumulative_pct",
    headerName: "Cumulative %",
    width: 190,
    type: "number",
    renderCell: (params) => (
      <CumulativeCell
        value={params.row.cumulative_pct}
        vital={params.row.vital_few === "Yes"}
      />
    ),
  },
  { field: "vital_few", headerName: "Vital Few (80%)", width: 125 },
  numCol("machine_count", "Machines Affected", 140),
];

function ReasonParetoContent() {
  const filters = useMechReportFilters();
  const pathname = usePathname();
  const { reportParams, companyName, branch, dateFrom, dateTo, ready } = filters;

  const fetcher = useCallback(async () => {
    if (!reportParams) return { rows: [], unattributed: null };
    const result = await fetchReasonParetoReport(reportParams);
    const records = result.data.map(asRecord);

    // Rows arrive ordered by total duration DESC, so the first row whose
    // cumulative % reaches the cutoff is the last of the vital few (it is
    // included — it is part of what makes up the 80%).
    let cutoffReached = false;
    const rows: ParetoGridRow[] = records.map((rec, index) => {
      const cumulative = pickNum(rec, "cumulative_pct");
      const vital = !cutoffReached;
      if (cumulative !== null && cumulative >= PARETO_CUTOFF_PCT) {
        cutoffReached = true;
      }
      return {
        id: String(pickNum(rec, "reason_id") ?? `row-${index}`),
        rank: index + 1,
        reason_code: pickText(rec, "reason_code"),
        reason_desc: pickText(rec, "reason_desc"),
        discipline: pickText(rec, "discipline"),
        component_name: pickText(rec, "component_name"),
        machine_count: pickNum(rec, "machine_count"),
        count: pickNum(rec, "count"),
        total_duration: pickNum(rec, "total_duration"),
        duration_per_breakdown: pickNum(rec, "duration_per_breakdown"),
        pct_share: pickNum(rec, "pct_share"),
        cumulative_pct: cumulative,
        vital_few: vital ? "Yes" : "",
      };
    });

    return { rows, unattributed: unattributedPctFromRows(records) };
  }, [reportParams]);

  const { rows, unattributed, loading, error, run } =
    useMechReportRun<ParetoGridRow>(fetcher, ready);

  const vitalFewCount = useMemo(
    () => rows.filter((r) => r.vital_few === "Yes").length,
    [rows],
  );

  const handleExport = useCallback(() => {
    void (async () => {
      await exportRowsToExcel(columns, rows, "mech-reason-pareto", {
        companyName,
        branchName: branch?.branch_name,
        reportName: "Breakdown Reason Pareto",
        reportNo: await resolveReportMenuId(pathname),
        reportFor: [dateFrom, dateTo].filter(Boolean).join(" To "),
      });
    })();
  }, [rows, companyName, branch?.branch_name, pathname, dateFrom, dateTo]);

  const handleSubmit = useCallback(() => {
    void run();
  }, [run]);

  const exportDisabled = useMemo(
    () => rows.length === 0 || filters.branchId == null,
    [rows.length, filters.branchId],
  );

  return (
    <Box sx={{ p: 3 }}>
      <MechReportTitle>Breakdown Reason Pareto</MechReportTitle>
      {vitalFewCount > 0 && (
        <Typography
          variant="caption"
          sx={{ display: "block", color: "text.secondary" }}
        >
          {vitalFewCount} of {rows.length} reason codes account for the first{" "}
          {PARETO_CUTOFF_PCT}% of downtime.
        </Typography>
      )}
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

export default function ReasonParetoPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      }
    >
      <ReasonParetoContent />
    </Suspense>
  );
}
