"use client";
import React, { Suspense, useCallback, useMemo } from "react";
import { Box, CircularProgress } from "@mui/material";
import { usePathname } from "next/navigation";
import type { GridColDef } from "@mui/x-data-grid";
import ReportGrid, { numCol } from "@/components/reports/ReportGrid";
import { exportRowsToExcel } from "@/components/reports/exportExcel";
import { resolveReportMenuId } from "@/utils/reportMenuService";
import { fetchReliabilityReport } from "@/utils/juteMechanicalService";
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
 * R6 — Reliability: per machine MTBF, MTTR, availability % and downtime per
 * 1000 running hours.
 *
 * `running_hrs` is (available_min − downtime) / 60, so the per-1000-hours figure
 * measures downtime against time the machine could actually have run. Every
 * ratio is null rather than 0 when its denominator is missing — an empty range
 * must read as "not computable", not as perfect reliability.
 *
 * Note the backend key is `downtime_per_1000_running_hrs`.
 */
interface ReliabilityGridRow {
  id: string;
  machine_name: string;
  mech_code: string;
  machine_type_name: string;
  dept_name: string;
  criticality: string;
  breakdown_count: number | null;
  total_downtime_min: number | null;
  days_in_range: number | null;
  available_min: number | null;
  running_hrs: number | null;
  mtbf_min: number | null;
  mtbf_hrs: number | null;
  mttr_min: number | null;
  availability_pct: number | null;
  downtime_per_1000_running_hrs: number | null;
  avg_response_min: number | null;
  unattributed_pct: number | null;
  open_count: number | null;
}

const columns: GridColDef<ReliabilityGridRow>[] = [
  { field: "machine_name", headerName: "Machine", minWidth: 170 },
  { field: "mech_code", headerName: "Mech Code", width: 100 },
  { field: "machine_type_name", headerName: "Section", width: 140 },
  { field: "dept_name", headerName: "Department", width: 140 },
  { field: "criticality", headerName: "Criticality", width: 95 },
  numCol("breakdown_count", "Breakdowns", 110),
  numCol("total_downtime_min", "Downtime (Min)", 130),
  numCol("days_in_range", "Days", 80),
  numCol("available_min", "Available (Min)", 130),
  numCol("running_hrs", "Running Hrs", 115),
  numCol("mtbf_min", "MTBF (Min)", 115),
  numCol("mtbf_hrs", "MTBF (Hrs)", 115),
  numCol("mttr_min", "MTTR (Min)", 110),
  numCol("availability_pct", "Availability %", 120),
  numCol("downtime_per_1000_running_hrs", "Downtime / 1000 Running Hrs", 190),
  numCol("avg_response_min", "Avg Response (Min)", 145),
  numCol("unattributed_pct", "Unattributed %", 125),
  numCol("open_count", "Still Open", 100),
];

function ReliabilityContent() {
  const filters = useMechReportFilters();
  const pathname = usePathname();
  const { reportParams, companyName, branch, dateFrom, dateTo, ready } = filters;

  const fetcher = useCallback(async () => {
    if (!reportParams) return { rows: [], unattributed: null };
    const result = await fetchReliabilityReport(reportParams);
    const records = result.data.map(asRecord);

    const rows: ReliabilityGridRow[] = records.map((rec, index) => ({
      id: String(pickNum(rec, "machine_id") ?? `row-${index}`),
      machine_name: pickText(rec, "machine_name"),
      mech_code: pickText(rec, "mech_code"),
      machine_type_name: pickText(rec, "machine_type_name"),
      dept_name: pickText(rec, "dept_name"),
      criticality: pickText(rec, "criticality"),
      breakdown_count: pickNum(rec, "breakdown_count"),
      total_downtime_min: pickNum(rec, "total_downtime_min"),
      days_in_range: pickNum(rec, "days_in_range"),
      available_min: pickNum(rec, "available_min"),
      running_hrs: pickNum(rec, "running_hrs"),
      mtbf_min: pickNum(rec, "mtbf_min"),
      mtbf_hrs: pickNum(rec, "mtbf_hrs"),
      mttr_min: pickNum(rec, "mttr_min"),
      availability_pct: pickNum(rec, "availability_pct"),
      downtime_per_1000_running_hrs: pickNum(
        rec,
        "downtime_per_1000_running_hrs",
      ),
      avg_response_min: pickNum(rec, "avg_response_min"),
      unattributed_pct: pickNum(rec, "unattributed_pct"),
      open_count: pickNum(rec, "open_count"),
    }));

    return { rows, unattributed: unattributedPctFromRows(records) };
  }, [reportParams]);

  const { rows, unattributed, loading, error, run } =
    useMechReportRun<ReliabilityGridRow>(fetcher, ready);

  const handleExport = useCallback(() => {
    void (async () => {
      await exportRowsToExcel(columns, rows, "mech-reliability", {
        companyName,
        branchName: branch?.branch_name,
        reportName: "Machine Reliability (MTBF / MTTR / Availability)",
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
      <MechReportTitle>Machine Reliability</MechReportTitle>
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

export default function ReliabilityPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      }
    >
      <ReliabilityContent />
    </Suspense>
  );
}
