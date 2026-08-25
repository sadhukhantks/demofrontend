"use client";
import React, { Suspense, useCallback, useMemo } from "react";
import { Box, CircularProgress } from "@mui/material";
import { usePathname } from "next/navigation";
import type { GridColDef } from "@mui/x-data-grid";
import ReportGrid, { numCol } from "@/components/reports/ReportGrid";
import { exportRowsToExcel } from "@/components/reports/exportExcel";
import { resolveReportMenuId } from "@/utils/reportMenuService";
import { fetchDepartmentSummaryReport } from "@/utils/juteMechanicalService";
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
  pickInt,
  pickNum,
  pickText,
  sumBy,
  unattributedPctFromRows,
} from "../_components/mechReportUtils";

/**
 * R5 — Department Summary: per department and machine type, the breakdown
 * count, downtime, MTTR and share of total mill downtime.
 *
 * The share column is the backend's `pct_of_mill_downtime` (NOT `share_pct`).
 */
type DepartmentSummaryGridRow = {
  id: string;
  dept_name: string;
  machine_type_name: string;
  machine_count: number | null;
  breakdown_count: number | null;
  total_downtime_min: number | null;
  mttr_min: number | null;
  mtbf_min: number | null;
  availability_pct: number | null;
  pct_of_mill_downtime: number | null;
  nr_downtime_min: number | null;
  unattributed_pct: number | null;
  production_loss_qty: number | null;
};

const columns: GridColDef<DepartmentSummaryGridRow>[] = [
  { field: "dept_name", headerName: "Department", minWidth: 170 },
  { field: "machine_type_name", headerName: "Section", minWidth: 150 },
  numCol("machine_count", "Machines", 100),
  numCol("breakdown_count", "Breakdowns", 110),
  numCol("total_downtime_min", "Total Downtime (Min)", 145),
  numCol("mttr_min", "MTTR (Min)", 110),
  numCol("mtbf_min", "MTBF (Min)", 120),
  numCol("availability_pct", "Availability %", 120),
  numCol("pct_of_mill_downtime", "% Of Mill Downtime", 145),
  numCol("nr_downtime_min", "Unattributed (Min)", 140),
  numCol("unattributed_pct", "Unattributed %", 125),
  numCol("production_loss_qty", "Prod Loss Qty", 120),
];

function DepartmentSummaryContent() {
  const filters = useMechReportFilters();
  const pathname = usePathname();
  const { reportParams, companyName, branch, dateFrom, dateTo, ready } = filters;

  const fetcher = useCallback(async () => {
    if (!reportParams) return { rows: [], unattributed: null };
    const result = await fetchDepartmentSummaryReport(reportParams);
    const records = result.data.map(asRecord);

    const rows: DepartmentSummaryGridRow[] = records.map((rec, index) => ({
      id: `${pickNum(rec, "dept_id") ?? "d"}-${pickNum(rec, "machine_type_id") ?? "t"}-${index}`,
      dept_name: pickText(rec, "dept_name"),
      machine_type_name: pickText(rec, "machine_type_name"),
      machine_count: pickNum(rec, "machine_count"),
      breakdown_count: pickNum(rec, "breakdown_count"),
      total_downtime_min: pickNum(rec, "total_downtime_min"),
      mttr_min: pickNum(rec, "mttr_min"),
      mtbf_min: pickNum(rec, "mtbf_min"),
      availability_pct: pickNum(rec, "availability_pct"),
      pct_of_mill_downtime: pickNum(rec, "pct_of_mill_downtime"),
      nr_downtime_min: pickNum(rec, "nr_downtime_min"),
      unattributed_pct: pickNum(rec, "unattributed_pct"),
      production_loss_qty: pickNum(rec, "production_loss_qty"),
    }));

    if (rows.length > 0) {
      const totalCount = records.reduce(
        (acc, rec) => acc + pickInt(rec, "breakdown_count", 0),
        0,
      );
      const totalDowntime = sumBy(records, "total_downtime_min");
      const totalNr = sumBy(records, "nr_downtime_min");
      rows.push({
        id: "grand-total",
        dept_name: "Grand Total",
        machine_type_name: "",
        machine_count: null,
        breakdown_count: totalCount,
        total_downtime_min: totalDowntime,
        mttr_min: totalCount > 0 ? totalDowntime / totalCount : null,
        mtbf_min: null,
        availability_pct: null,
        pct_of_mill_downtime: totalDowntime > 0 ? 100 : null,
        nr_downtime_min: totalNr,
        unattributed_pct:
          totalDowntime > 0 ? (totalNr * 100) / totalDowntime : null,
        production_loss_qty: sumBy(records, "production_loss_qty"),
      });
    }

    return { rows, unattributed: unattributedPctFromRows(records) };
  }, [reportParams]);

  const { rows, unattributed, loading, error, run } =
    useMechReportRun<DepartmentSummaryGridRow>(fetcher, ready);

  const handleExport = useCallback(() => {
    void (async () => {
      await exportRowsToExcel(columns, rows, "mech-department-summary", {
        companyName,
        branchName: branch?.branch_name,
        reportName: "Department Breakdown Summary",
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
      <MechReportTitle>Department Breakdown Summary</MechReportTitle>
      <UnattributedCaption value={unattributed} />

      {filters.mounted && (
        <MechFilterToolbar
          filters={filters}
          show={{ dates: true, machineType: true, discipline: true }}
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

export default function DepartmentSummaryPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      }
    >
      <DepartmentSummaryContent />
    </Suspense>
  );
}
