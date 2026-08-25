"use client";
import React, { Suspense, useCallback, useMemo } from "react";
import { Box, CircularProgress } from "@mui/material";
import { usePathname } from "next/navigation";
import type { GridColDef } from "@mui/x-data-grid";
import ReportGrid, { numCol } from "@/components/reports/ReportGrid";
import { exportRowsToExcel } from "@/components/reports/exportExcel";
import { resolveReportMenuId } from "@/utils/reportMenuService";
import { fetchMachineSummaryReport } from "@/utils/juteMechanicalService";
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
 * R2 — Machine Summary: per machine breakdown count, total downtime and MTTR.
 *
 * THE workbook's main sheet — the one the mill maintains by hand today. MTTR is
 * what that sheet calls "duration per breakdown"; MTBF and availability are what
 * it cannot compute at all and come back null (not zero) when the date range
 * gives no denominator.
 *
 * A Grand Total row closes the sheet, as it does in the workbook.
 */
interface MachineSummaryGridRow {
  id: string;
  machine_name: string;
  mech_code: string;
  machine_type_name: string;
  dept_name: string;
  criticality: string;
  breakdown_count: number | null;
  total_downtime_min: number | null;
  mttr_min: number | null;
  mtbf_min: number | null;
  availability_pct: number | null;
  pct_of_mill_downtime: number | null;
  avg_response_min: number | null;
  open_count: number | null;
  nr_downtime_min: number | null;
  unattributed_pct: number | null;
  production_loss_qty: number | null;
  days_in_range: number | null;
}

const columns: GridColDef<MachineSummaryGridRow>[] = [
  { field: "machine_name", headerName: "Machine", minWidth: 170 },
  { field: "mech_code", headerName: "Mech Code", width: 100 },
  { field: "machine_type_name", headerName: "Section", width: 140 },
  { field: "dept_name", headerName: "Department", width: 140 },
  { field: "criticality", headerName: "Criticality", width: 95 },
  numCol("breakdown_count", "Breakdowns", 110),
  numCol("total_downtime_min", "Total Downtime (Min)", 140),
  numCol("mttr_min", "MTTR (Min)", 110),
  numCol("mtbf_min", "MTBF (Min)", 120),
  numCol("availability_pct", "Availability %", 120),
  numCol("pct_of_mill_downtime", "% Of Mill Downtime", 140),
  numCol("avg_response_min", "Avg Response (Min)", 140),
  numCol("open_count", "Still Open", 100),
  numCol("nr_downtime_min", "Unattributed (Min)", 140),
  numCol("unattributed_pct", "Unattributed %", 125),
  numCol("production_loss_qty", "Prod Loss Qty", 120),
  numCol("days_in_range", "Days In Range", 115),
];

function MachineSummaryContent() {
  const filters = useMechReportFilters();
  const pathname = usePathname();
  const { reportParams, companyName, branch, dateFrom, dateTo, ready } = filters;

  const fetcher = useCallback(async () => {
    if (!reportParams) return { rows: [], unattributed: null };
    const result = await fetchMachineSummaryReport(reportParams);
    const records = result.data.map(asRecord);

    const rows: MachineSummaryGridRow[] = records.map((rec, index) => ({
      id: String(pickNum(rec, "machine_id") ?? `row-${index}`),
      machine_name: pickText(rec, "machine_name"),
      mech_code: pickText(rec, "mech_code"),
      machine_type_name: pickText(rec, "machine_type_name"),
      dept_name: pickText(rec, "dept_name"),
      criticality: pickText(rec, "criticality"),
      breakdown_count: pickNum(rec, "breakdown_count"),
      total_downtime_min: pickNum(rec, "total_downtime_min"),
      mttr_min: pickNum(rec, "mttr_min"),
      mtbf_min: pickNum(rec, "mtbf_min"),
      availability_pct: pickNum(rec, "availability_pct"),
      pct_of_mill_downtime: pickNum(rec, "pct_of_mill_downtime"),
      avg_response_min: pickNum(rec, "avg_response_min"),
      open_count: pickNum(rec, "open_count"),
      nr_downtime_min: pickNum(rec, "nr_downtime_min"),
      unattributed_pct: pickNum(rec, "unattributed_pct"),
      production_loss_qty: pickNum(rec, "production_loss_qty"),
      days_in_range: pickNum(rec, "days_in_range"),
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
        machine_name: "Grand Total",
        mech_code: "",
        machine_type_name: "",
        dept_name: "",
        criticality: "",
        breakdown_count: totalCount,
        total_downtime_min: totalDowntime,
        // Mill-level MTTR: total downtime over total incidents, not an average
        // of per-machine MTTRs (which would weight a rare machine equally).
        mttr_min: totalCount > 0 ? totalDowntime / totalCount : null,
        mtbf_min: null,
        availability_pct: null,
        pct_of_mill_downtime: totalDowntime > 0 ? 100 : null,
        avg_response_min: null,
        open_count: records.reduce(
          (acc, rec) => acc + pickInt(rec, "open_count", 0),
          0,
        ),
        nr_downtime_min: totalNr,
        unattributed_pct:
          totalDowntime > 0 ? (totalNr * 100) / totalDowntime : null,
        production_loss_qty: sumBy(records, "production_loss_qty"),
        days_in_range: null,
      });
    }

    return { rows, unattributed: unattributedPctFromRows(records) };
  }, [reportParams]);

  const { rows, unattributed, loading, error, run } =
    useMechReportRun<MachineSummaryGridRow>(fetcher, ready);

  const handleExport = useCallback(() => {
    void (async () => {
      await exportRowsToExcel(columns, rows, "mech-machine-summary", {
        companyName,
        branchName: branch?.branch_name,
        reportName: "Machine Breakdown Summary",
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
      <MechReportTitle>Machine Breakdown Summary</MechReportTitle>
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

export default function MachineSummaryPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      }
    >
      <MachineSummaryContent />
    </Suspense>
  );
}
