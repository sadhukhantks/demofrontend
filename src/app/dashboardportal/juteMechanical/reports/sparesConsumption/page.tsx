"use client";
import React, { Suspense, useCallback, useMemo } from "react";
import { Box, CircularProgress } from "@mui/material";
import { usePathname } from "next/navigation";
import type { GridColDef } from "@mui/x-data-grid";
import ReportGrid, { numCol } from "@/components/reports/ReportGrid";
import { exportRowsToExcel } from "@/components/reports/exportExcel";
import { resolveReportMenuId } from "@/utils/reportMenuService";
import { fetchSparesConsumptionReport } from "@/utils/juteMechanicalService";
import MechFilterToolbar, {
  MechReportTitle,
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
} from "../_components/mechReportUtils";

/**
 * R9 — Spares Consumption: per machine and item, quantity and value, split by
 * the register the spare was booked on (breakdown vs overhaul).
 *
 * Backend keys are the split pairs `breakdown_qty` / `breakdown_value`,
 * `overhaul_qty` / `overhaul_value` and the `total_qty` / `total_value` rollup.
 *
 * The endpoint also returns a `machine_cost` block (maintenance cost per
 * machine, including overhaul labour). The shared `{ data, total }` list
 * envelope in juteMechanicalService drops it, so this page shows the item rows;
 * per-machine cost needs that envelope widened before it can be surfaced.
 */
type SparesGridRow = {
  id: string;
  machine_name: string;
  mech_code: string;
  machine_type_name: string;
  dept_name: string;
  item_code: string;
  item_name: string;
  uom_name: string;
  breakdown_qty: number | null;
  breakdown_value: number | null;
  overhaul_qty: number | null;
  overhaul_value: number | null;
  total_qty: number | null;
  total_value: number | null;
  line_count: number | null;
};

const columns: GridColDef<SparesGridRow>[] = [
  { field: "machine_name", headerName: "Machine", minWidth: 170 },
  { field: "mech_code", headerName: "Mech Code", width: 100 },
  { field: "machine_type_name", headerName: "Section", width: 140 },
  { field: "dept_name", headerName: "Department", width: 140 },
  { field: "item_code", headerName: "Item Code", width: 120 },
  { field: "item_name", headerName: "Item Description", minWidth: 200 },
  { field: "uom_name", headerName: "UOM", width: 80 },
  numCol("breakdown_qty", "Breakdown Qty", 125),
  numCol("breakdown_value", "Breakdown Value", 135),
  numCol("overhaul_qty", "Overhaul Qty", 120),
  numCol("overhaul_value", "Overhaul Value", 130),
  numCol("total_qty", "Total Qty", 105),
  numCol("total_value", "Total Value", 115),
  numCol("line_count", "Lines", 85),
];

function SparesConsumptionContent() {
  const filters = useMechReportFilters();
  const pathname = usePathname();
  const { reportParams, companyName, branch, dateFrom, dateTo, ready } = filters;

  const fetcher = useCallback(async () => {
    if (!reportParams) return { rows: [], unattributed: null };
    const result = await fetchSparesConsumptionReport(reportParams);
    const records = result.data.map(asRecord);

    const rows: SparesGridRow[] = records.map((rec, index) => ({
      id: `${pickNum(rec, "machine_id") ?? "m"}-${pickNum(rec, "item_id") ?? "i"}-${index}`,
      machine_name: pickText(rec, "machine_name"),
      mech_code: pickText(rec, "mech_code"),
      machine_type_name: pickText(rec, "machine_type_name"),
      dept_name: pickText(rec, "dept_name"),
      item_code: pickText(rec, "item_code"),
      item_name: pickText(rec, "item_name"),
      uom_name: pickText(rec, "uom_name"),
      breakdown_qty: pickNum(rec, "breakdown_qty"),
      breakdown_value: pickNum(rec, "breakdown_value"),
      overhaul_qty: pickNum(rec, "overhaul_qty"),
      overhaul_value: pickNum(rec, "overhaul_value"),
      total_qty: pickNum(rec, "total_qty"),
      total_value: pickNum(rec, "total_value"),
      line_count: pickNum(rec, "line_count"),
    }));

    if (rows.length > 0) {
      rows.push({
        id: "grand-total",
        machine_name: "Grand Total",
        mech_code: "",
        machine_type_name: "",
        dept_name: "",
        item_code: "",
        item_name: "",
        uom_name: "",
        breakdown_qty: sumBy(records, "breakdown_qty"),
        breakdown_value: sumBy(records, "breakdown_value"),
        overhaul_qty: sumBy(records, "overhaul_qty"),
        overhaul_value: sumBy(records, "overhaul_value"),
        total_qty: sumBy(records, "total_qty"),
        total_value: sumBy(records, "total_value"),
        line_count: records.reduce(
          (acc, rec) => acc + pickInt(rec, "line_count", 0),
          0,
        ),
      });
    }

    return { rows, unattributed: null };
  }, [reportParams]);

  const { rows, loading, error, run } = useMechReportRun<SparesGridRow>(
    fetcher,
    ready,
  );

  const handleExport = useCallback(() => {
    void (async () => {
      await exportRowsToExcel(columns, rows, "mech-spares-consumption", {
        companyName,
        branchName: branch?.branch_name,
        reportName: "Maintenance Spares Consumption",
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
      <MechReportTitle>Maintenance Spares Consumption</MechReportTitle>

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

export default function SparesConsumptionPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      }
    >
      <SparesConsumptionContent />
    </Suspense>
  );
}
