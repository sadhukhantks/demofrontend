"use client";
import React, { Suspense, useCallback, useMemo } from "react";
import { Box, Chip, CircularProgress, Typography } from "@mui/material";
import { usePathname } from "next/navigation";
import type { GridColDef } from "@mui/x-data-grid";
import ReportGrid, { numCol } from "@/components/reports/ReportGrid";
import { exportRowsToExcel } from "@/components/reports/exportExcel";
import { resolveReportMenuId } from "@/utils/reportMenuService";
import { fetchMaintenanceDueReport } from "@/utils/juteMechanicalService";
import MechFilterToolbar, {
  MechReportTitle,
} from "../_components/MechFilterToolbar";
import {
  useMechReportFilters,
  useMechReportRun,
} from "../_components/useMechReportFilters";
import {
  asRecord,
  dmy,
  pickBool,
  pickNum,
  pickStr,
  pickText,
} from "../_components/mechReportUtils";

/**
 * R8 — Maintenance Due: PM and overhaul items due or overdue.
 *
 * One row per DUE ITEM, so a machine with both a PM and an overhaul pending
 * appears twice — `due_type` says which. `days_overdue` is positive once the
 * date has passed and negative while the item is merely upcoming.
 *
 * Ordering is criticality first (A before B before C, unclassified last), then
 * most overdue first. The backend already returns this order; it is reapplied
 * here so the grid keeps it regardless of how rows arrive.
 *
 * Overdue rows are called out with the theme's `error` palette and upcoming
 * ones with `warning` — palette tokens, never literal colours.
 *
 * The lookahead window is the backend default (30 days): `due_within_days` is
 * not part of the shared report parameter set, so it is not exposed here.
 */
const CRITICALITY_ORDER: Record<string, number> = { A: 1, B: 2, C: 3 };

function criticalityRank(value: string): number {
  return CRITICALITY_ORDER[value] ?? 4;
}

type MaintenanceDueGridRow = {
  id: string;
  due_type: string;
  machine_name: string;
  mech_code: string;
  machine_type_name: string;
  dept_name: string;
  criticality: string;
  make: string;
  model: string;
  due_date: string;
  last_done_date: string;
  freq_days: number | null;
  freq_months: number | null;
  days_overdue: number | null;
  due_status: string;
  /** Kept off-grid for sorting only. */
  _criticalityRank: number;
  _daysOverdue: number;
  _isOverdue: boolean;
};

/** Overdue / upcoming badge, coloured from the palette. */
function DueStatusCell({ row }: { row: MaintenanceDueGridRow }) {
  if (!row.due_status) return null;
  return (
    <Chip
      size="small"
      label={row.due_status}
      color={row._isOverdue ? "error" : "warning"}
      variant={row._isOverdue ? "filled" : "outlined"}
    />
  );
}

/** Days overdue, emphasised in the error colour once the date has passed. */
function DaysOverdueCell({ row }: { row: MaintenanceDueGridRow }) {
  if (row.days_overdue === null) return null;
  return (
    <Typography
      variant="body2"
      sx={{
        width: "100%",
        textAlign: "right",
        color: row._isOverdue ? "error.main" : "text.secondary",
        fontWeight: row._isOverdue ? 700 : 400,
      }}
    >
      {row.days_overdue}
    </Typography>
  );
}

const columns: GridColDef<MaintenanceDueGridRow>[] = [
  { field: "due_type", headerName: "Due Type", width: 105 },
  {
    field: "due_status",
    headerName: "Status",
    width: 115,
    renderCell: (params) => <DueStatusCell row={params.row} />,
  },
  { field: "criticality", headerName: "Criticality", width: 95 },
  { field: "machine_name", headerName: "Machine", minWidth: 170 },
  { field: "mech_code", headerName: "Mech Code", width: 100 },
  { field: "machine_type_name", headerName: "Section", width: 140 },
  { field: "dept_name", headerName: "Department", width: 140 },
  { field: "due_date", headerName: "Due Date", width: 110 },
  { field: "last_done_date", headerName: "Last Done", width: 110 },
  {
    field: "days_overdue",
    headerName: "Days Overdue",
    width: 120,
    type: "number",
    renderCell: (params) => <DaysOverdueCell row={params.row} />,
  },
  numCol("freq_days", "PM Freq (Days)", 125),
  numCol("freq_months", "Overhaul Freq (Months)", 165),
  { field: "make", headerName: "Make", width: 120 },
  { field: "model", headerName: "Model", width: 120 },
];

function MaintenanceDueContent() {
  const filters = useMechReportFilters();
  const pathname = usePathname();
  const { reportParams, companyName, branch, ready } = filters;

  const fetcher = useCallback(async () => {
    if (!reportParams) return { rows: [], unattributed: null };
    const result = await fetchMaintenanceDueReport(reportParams);
    const records = result.data.map(asRecord);

    const rows: MaintenanceDueGridRow[] = records.map((rec, index) => {
      const daysOverdue = pickNum(rec, "days_overdue");
      const isOverdue = pickBool(rec, "is_overdue");
      const criticality = pickText(rec, "criticality");
      return {
        id: `${pickText(rec, "due_type", "DUE")}-${pickNum(rec, "machine_id") ?? index}-${index}`,
        due_type: pickText(rec, "due_type"),
        machine_name: pickText(rec, "machine_name"),
        mech_code: pickText(rec, "mech_code"),
        machine_type_name: pickText(rec, "machine_type_name"),
        dept_name: pickText(rec, "dept_name"),
        criticality,
        make: pickText(rec, "make"),
        model: pickText(rec, "model"),
        due_date: dmy(pickStr(rec, "due_date")),
        last_done_date: dmy(pickStr(rec, "last_done_date")),
        freq_days: pickNum(rec, "freq_days"),
        freq_months: pickNum(rec, "freq_months"),
        days_overdue: daysOverdue,
        due_status: isOverdue ? "Overdue" : "Due Soon",
        _criticalityRank: criticalityRank(criticality),
        _daysOverdue: daysOverdue ?? Number.NEGATIVE_INFINITY,
        _isOverdue: isOverdue,
      };
    });

    // Criticality A first, then most overdue first.
    rows.sort((a, b) => {
      if (a._criticalityRank !== b._criticalityRank) {
        return a._criticalityRank - b._criticalityRank;
      }
      if (a._daysOverdue !== b._daysOverdue) {
        return b._daysOverdue - a._daysOverdue;
      }
      return a.machine_name.localeCompare(b.machine_name);
    });

    return { rows, unattributed: null };
  }, [reportParams]);

  const { rows, loading, error, run } =
    useMechReportRun<MaintenanceDueGridRow>(fetcher, ready);

  const overdueCount = useMemo(
    () => rows.filter((r) => r._isOverdue).length,
    [rows],
  );
  const criticalOverdue = useMemo(
    () => rows.filter((r) => r._isOverdue && r.criticality === "A").length,
    [rows],
  );

  const handleExport = useCallback(() => {
    void (async () => {
      await exportRowsToExcel(columns, rows, "mech-maintenance-due", {
        companyName,
        branchName: branch?.branch_name,
        reportName: "Maintenance Due (PM & Overhaul)",
        reportNo: await resolveReportMenuId(pathname),
        reportFor: "",
      });
    })();
  }, [rows, companyName, branch?.branch_name, pathname]);

  const handleSubmit = useCallback(() => {
    void run();
  }, [run]);

  const exportDisabled = useMemo(
    () => rows.length === 0 || filters.branchId == null,
    [rows.length, filters.branchId],
  );

  return (
    <Box sx={{ p: 3 }}>
      <MechReportTitle>Maintenance Due</MechReportTitle>
      {rows.length > 0 && (
        <Typography
          variant="caption"
          sx={{
            display: "block",
            mb: 1,
            color: overdueCount > 0 ? "error.main" : "text.secondary",
            fontWeight: overdueCount > 0 ? 700 : 400,
          }}
        >
          {overdueCount} of {rows.length} items overdue
          {criticalOverdue > 0
            ? ` — ${criticalOverdue} on criticality A machines`
            : ""}
          .
        </Typography>
      )}

      {filters.mounted && (
        <MechFilterToolbar
          filters={filters}
          show={{ dates: false, machine: true, machineType: true }}
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

export default function MaintenanceDuePage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      }
    >
      <MaintenanceDueContent />
    </Suspense>
  );
}
