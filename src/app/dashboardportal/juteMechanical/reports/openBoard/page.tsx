"use client";
import React, { Suspense, useCallback, useMemo, useState } from "react";
import { Box, Button, Chip, CircularProgress, Typography } from "@mui/material";
import { RefreshCw } from "lucide-react";
import { usePathname } from "next/navigation";
import type { GridColDef } from "@mui/x-data-grid";
import ReportGrid, { numCol } from "@/components/reports/ReportGrid";
import { exportRowsToExcel } from "@/components/reports/exportExcel";
import { resolveReportMenuId } from "@/utils/reportMenuService";
import { fetchOpenBreakdownBoardReport } from "@/utils/juteMechanicalService";
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
  dmyTime,
  minutesToHm,
  pickNum,
  pickStr,
  pickText,
} from "../_components/mechReportUtils";

/**
 * R12 — Open Breakdown Board: incidents with no restart yet, longest stoppage
 * first.
 *
 * This is a LIVE board — `elapsed_min` is computed by the backend at read time
 * against NOW(), so the numbers age as soon as the page is loaded. It therefore
 * carries an explicit Refresh control and shows when the data was last pulled,
 * rather than silently going stale or polling behind the user's back.
 *
 * Not failure-filtered: a machine stopped for a planned PM that has not
 * restarted is still a stopped machine the board must show, and each row is
 * labelled with its `downtime_type`.
 */
/** Minutes after which a stoppage is called out in the error colour. */
const LONG_STOPPAGE_MIN = 240;

type OpenBoardGridRow = {
  id: number;
  machine_name: string;
  mech_code: string;
  machine_type_name: string;
  dept_name: string;
  criticality: string;
  tran_date: string;
  spell_code: string;
  stop_datetime: string;
  attended_datetime: string;
  elapsed_min: number | null;
  elapsed_display: string;
  elapsed_hrs: number | null;
  response_min: number | null;
  reason_code: string;
  reason_desc: string;
  component_name: string;
  discipline: string;
  downtime_type: string;
  attended_dept_name: string;
  attended_by: string;
  reported_by: string;
  reported_by_user_name: string;
  status: string;
  remarks: string;
};

/** Elapsed time, escalated to the error colour past the long-stoppage mark. */
function ElapsedCell({ row }: { row: OpenBoardGridRow }) {
  if (row.elapsed_min === null) return null;
  const long = row.elapsed_min >= LONG_STOPPAGE_MIN;
  return (
    <Typography
      variant="body2"
      sx={{
        width: "100%",
        textAlign: "right",
        color: long ? "error.main" : "text.primary",
        fontWeight: long ? 700 : 400,
      }}
    >
      {row.elapsed_display}
    </Typography>
  );
}

/** OPEN / UNDER_REPAIR badge. */
function StatusCell({ row }: { row: OpenBoardGridRow }) {
  if (!row.status) return null;
  return (
    <Chip
      size="small"
      label={row.status}
      color={row.status === "UNDER_REPAIR" ? "info" : "warning"}
      variant={row.status === "UNDER_REPAIR" ? "filled" : "outlined"}
    />
  );
}

const columns: GridColDef<OpenBoardGridRow>[] = [
  {
    field: "elapsed_display",
    headerName: "Stopped For",
    width: 120,
    renderCell: (params) => <ElapsedCell row={params.row} />,
  },
  numCol("elapsed_min", "Elapsed (Min)", 120),
  {
    field: "status",
    headerName: "Status",
    width: 130,
    renderCell: (params) => <StatusCell row={params.row} />,
  },
  { field: "criticality", headerName: "Criticality", width: 95 },
  { field: "machine_name", headerName: "Machine", minWidth: 170 },
  { field: "mech_code", headerName: "Mech Code", width: 100 },
  { field: "machine_type_name", headerName: "Section", width: 140 },
  { field: "dept_name", headerName: "Department", width: 140 },
  { field: "tran_date", headerName: "Date", width: 105 },
  { field: "spell_code", headerName: "Spell", width: 80 },
  { field: "stop_datetime", headerName: "Stopped At", width: 140 },
  { field: "attended_datetime", headerName: "Attended At", width: 140 },
  numCol("response_min", "Response (Min)", 125),
  { field: "reason_code", headerName: "Reason Code", width: 110 },
  { field: "reason_desc", headerName: "Reason", minWidth: 180 },
  { field: "component_name", headerName: "Component", width: 130 },
  { field: "discipline", headerName: "Discipline", width: 110 },
  { field: "downtime_type", headerName: "Downtime Type", width: 130 },
  { field: "attended_dept_name", headerName: "Attended By Dept", width: 150 },
  { field: "attended_by", headerName: "Attended By", width: 130 },
  { field: "reported_by", headerName: "Reported By", width: 130 },
  { field: "reported_by_user_name", headerName: "Entered By (User)", width: 150 },
  { field: "remarks", headerName: "Remarks", minWidth: 150 },
];

function OpenBoardContent() {
  const filters = useMechReportFilters();
  const pathname = usePathname();
  const { reportParams, companyName, branch, ready } = filters;

  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);

  const fetcher = useCallback(async () => {
    if (!reportParams) return { rows: [], unattributed: null };
    const result = await fetchOpenBreakdownBoardReport(reportParams);
    const records = result.data.map(asRecord);

    const rows: OpenBoardGridRow[] = records.map((rec, index) => {
      const elapsed = pickNum(rec, "elapsed_min");
      return {
        id: pickNum(rec, "breakdown_id") ?? index,
        machine_name: pickText(rec, "machine_name"),
        mech_code: pickText(rec, "mech_code"),
        machine_type_name: pickText(rec, "machine_type_name"),
        dept_name: pickText(rec, "dept_name"),
        criticality: pickText(rec, "criticality"),
        tran_date: dmy(pickStr(rec, "tran_date")),
        spell_code: pickText(rec, "spell_code"),
        stop_datetime: dmyTime(pickStr(rec, "stop_datetime")),
        attended_datetime: dmyTime(pickStr(rec, "attended_datetime")),
        elapsed_min: elapsed,
        elapsed_display: minutesToHm(elapsed),
        elapsed_hrs: pickNum(rec, "elapsed_hrs"),
        response_min: pickNum(rec, "response_min"),
        reason_code: pickText(rec, "reason_code"),
        reason_desc: pickText(rec, "reason_desc"),
        component_name: pickText(rec, "component_name"),
        discipline: pickText(rec, "discipline"),
        downtime_type: pickText(rec, "downtime_type"),
        attended_dept_name: pickText(rec, "attended_dept_name"),
        attended_by: pickText(rec, "attended_by"),
        reported_by: pickText(rec, "reported_by"),
        reported_by_user_name: pickText(rec, "reported_by_user_name"),
        status: pickText(rec, "status"),
        remarks: pickText(rec, "remarks"),
      };
    });

    // Longest stoppage first — the board's whole point.
    rows.sort((a, b) => (b.elapsed_min ?? 0) - (a.elapsed_min ?? 0));

    setRefreshedAt(
      new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    );
    return { rows, unattributed: null };
  }, [reportParams]);

  const { rows, loading, error, run } = useMechReportRun<OpenBoardGridRow>(
    fetcher,
    ready,
  );

  const longStoppages = useMemo(
    () =>
      rows.filter(
        (row) => row.elapsed_min !== null && row.elapsed_min >= LONG_STOPPAGE_MIN,
      ).length,
    [rows],
  );

  const handleRefresh = useCallback(() => {
    void run();
  }, [run]);

  const handleExport = useCallback(() => {
    void (async () => {
      await exportRowsToExcel(columns, rows, "mech-open-breakdown-board", {
        companyName,
        branchName: branch?.branch_name,
        reportName: "Open Breakdown Board",
        reportNo: await resolveReportMenuId(pathname),
        reportFor: refreshedAt ? `As at ${refreshedAt}` : "",
      });
    })();
  }, [rows, companyName, branch?.branch_name, pathname, refreshedAt]);

  const exportDisabled = useMemo(
    () => rows.length === 0 || filters.branchId == null,
    [rows.length, filters.branchId],
  );

  return (
    <Box sx={{ p: 3 }}>
      <MechReportTitle>Open Breakdown Board</MechReportTitle>
      <Typography
        variant="caption"
        sx={{
          display: "block",
          mb: 1,
          color: longStoppages > 0 ? "error.main" : "text.secondary",
          fontWeight: longStoppages > 0 ? 700 : 400,
        }}
      >
        {rows.length} machine{rows.length === 1 ? "" : "s"} currently stopped
        {longStoppages > 0
          ? ` — ${longStoppages} down more than ${LONG_STOPPAGE_MIN / 60} hours`
          : ""}
        {refreshedAt ? ` · last refreshed ${refreshedAt}` : ""}
      </Typography>

      {filters.mounted && (
        <MechFilterToolbar
          filters={filters}
          show={{ dates: false, machine: true, machineType: true, discipline: true }}
          onSubmit={handleRefresh}
          onExport={handleExport}
          loading={loading}
          exportDisabled={exportDisabled}
          submitLabel="Apply Filters"
        >
          <Button
            variant="outlined"
            startIcon={<RefreshCw size={16} />}
            disabled={loading || filters.branchId == null}
            onClick={handleRefresh}
            sx={{ textTransform: "none" }}
          >
            Refresh
          </Button>
        </MechFilterToolbar>
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

export default function OpenBoardPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      }
    >
      <OpenBoardContent />
    </Suspense>
  );
}
