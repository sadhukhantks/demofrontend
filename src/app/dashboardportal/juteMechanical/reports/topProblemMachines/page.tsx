"use client";
import React, { Suspense, useCallback, useMemo, useState } from "react";
import { Box, CircularProgress, Typography } from "@mui/material";
import { usePathname } from "next/navigation";
import type { GridColDef } from "@mui/x-data-grid";
import ReportGrid, { numCol } from "@/components/reports/ReportGrid";
import { exportRowsToExcel } from "@/components/reports/exportExcel";
import { resolveReportMenuId } from "@/utils/reportMenuService";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { fetchTopProblemMachinesReport } from "@/utils/juteMechanicalService";
import MechFilterToolbar, {
  MechReportTitle,
  UnattributedCaption,
} from "../_components/MechFilterToolbar";
import {
  useMechReportFilters,
  useMechReportRun,
} from "../_components/useMechReportFilters";
import {
  asNamedRows,
  dmy,
  pickNum,
  pickStr,
  pickText,
  unattributedPctFromRows,
} from "../_components/mechReportUtils";

/**
 * R10 — Top Problem Machines: the worst offenders by downtime and by count,
 * plus the repeat-failure list.
 *
 * A repeat failure is the same machine + component failing again inside the
 * backend's REPEAT_FAILURE_WINDOW_DAYS. It is the sharpest signal this module
 * produces — it separates "we fixed it" from "we patched it".
 *
 * This endpoint returns `data` as an OBJECT of three named lists
 * (`by_downtime`, `by_count`, `repeat_failures`) rather than a flat array, so
 * the payload is read through {@link asNamedRows}, which accepts either shape.
 * The three lists have different columns, so a View picker swaps between them
 * without refetching.
 *
 * Top-N is the backend default (10): `top_n` is not part of the shared report
 * parameter set, so it is not exposed here.
 */
type TopView = "by_downtime" | "by_count" | "repeat_failures";

interface ViewOption {
  code: TopView;
  label: string;
}

const VIEW_OPTIONS: ViewOption[] = [
  { code: "by_downtime", label: "Top by Downtime" },
  { code: "by_count", label: "Top by Breakdown Count" },
  { code: "repeat_failures", label: "Repeat Failures" },
];

type TopRow = { id: string; view: TopView } & Record<string, string | number | null>;

const MACHINE_COLUMNS: GridColDef<TopRow>[] = [
  { field: "rank", headerName: "#", width: 60, type: "number" },
  { field: "machine_name", headerName: "Machine", minWidth: 170 },
  { field: "mech_code", headerName: "Mech Code", width: 100 },
  { field: "machine_type_name", headerName: "Section", width: 140 },
  { field: "dept_name", headerName: "Department", width: 140 },
  { field: "criticality", headerName: "Criticality", width: 95 },
  numCol<TopRow>("breakdown_count", "Breakdowns", 110),
  numCol<TopRow>("total_downtime_min", "Downtime (Min)", 130),
  numCol<TopRow>("mttr_min", "MTTR (Min)", 110),
  numCol<TopRow>("mtbf_min", "MTBF (Min)", 115),
  numCol<TopRow>("availability_pct", "Availability %", 120),
  numCol<TopRow>("pct_of_mill_downtime", "% Of Mill Downtime", 145),
  numCol<TopRow>("unattributed_pct", "Unattributed %", 125),
  { field: "first_breakdown_date", headerName: "First Breakdown", width: 130 },
  { field: "last_breakdown_date", headerName: "Last Breakdown", width: 130 },
];

const REPEAT_COLUMNS: GridColDef<TopRow>[] = [
  numCol<TopRow>("days_since_previous", "Days Since Previous", 150),
  { field: "machine_name", headerName: "Machine", minWidth: 170 },
  { field: "mech_code", headerName: "Mech Code", width: 100 },
  { field: "machine_type_name", headerName: "Section", width: 140 },
  { field: "dept_name", headerName: "Department", width: 140 },
  { field: "component_name", headerName: "Component", width: 140 },
  { field: "component_group", headerName: "Component Group", width: 140 },
  { field: "reason_code", headerName: "Reason Code", width: 110 },
  { field: "reason_desc", headerName: "Reason", minWidth: 180 },
  { field: "tran_date", headerName: "Failed On", width: 110 },
  numCol<TopRow>("duration_min", "Downtime (Min)", 130),
  { field: "prev_tran_date", headerName: "Previous Failure", width: 130 },
  { field: "prev_reason_code", headerName: "Previous Reason", width: 130 },
  numCol<TopRow>("prev_duration_min", "Previous Downtime (Min)", 175),
];

function TopProblemMachinesContent() {
  const filters = useMechReportFilters();
  const pathname = usePathname();
  const { reportParams, companyName, branch, dateFrom, dateTo, ready } = filters;

  const [view, setView] = useState<TopView>("by_downtime");

  const fetcher = useCallback(async () => {
    if (!reportParams) return { rows: [], unattributed: null };
    const result = await fetchTopProblemMachinesReport(reportParams);
    const payload: unknown = result.data;

    const machineRow = (
      rec: Record<string, unknown>,
      index: number,
      rowView: TopView,
    ): TopRow => ({
      id: `${rowView}-${pickNum(rec, "machine_id") ?? index}-${index}`,
      view: rowView,
      rank: index + 1,
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
      unattributed_pct: pickNum(rec, "unattributed_pct"),
      first_breakdown_date: dmy(pickStr(rec, "first_breakdown_date")),
      last_breakdown_date: dmy(pickStr(rec, "last_breakdown_date")),
    });

    const byDowntimeRecords = asNamedRows(payload, "by_downtime");
    const byCountRecords = asNamedRows(payload, "by_count");
    const repeatRecords = asNamedRows(payload, "repeat_failures");

    const rows: TopRow[] = [
      ...byDowntimeRecords.map((rec, i) => machineRow(rec, i, "by_downtime")),
      ...byCountRecords.map((rec, i) => machineRow(rec, i, "by_count")),
      ...repeatRecords.map((rec, index) => ({
        id: `repeat-${pickNum(rec, "breakdown_id") ?? index}-${index}`,
        view: "repeat_failures" as const,
        machine_name: pickText(rec, "machine_name"),
        mech_code: pickText(rec, "mech_code"),
        machine_type_name: pickText(rec, "machine_type_name"),
        dept_name: pickText(rec, "dept_name"),
        component_name: pickText(rec, "component_name"),
        component_group: pickText(rec, "component_group"),
        reason_code: pickText(rec, "reason_code"),
        reason_desc: pickText(rec, "reason_desc"),
        tran_date: dmy(pickStr(rec, "tran_date")),
        duration_min: pickNum(rec, "duration_min"),
        prev_tran_date: dmy(pickStr(rec, "prev_tran_date")),
        prev_reason_code: pickText(rec, "prev_reason_code"),
        prev_duration_min: pickNum(rec, "prev_duration_min"),
        days_since_previous: pickNum(rec, "days_since_previous"),
      })),
    ];

    return { rows, unattributed: unattributedPctFromRows(byDowntimeRecords) };
  }, [reportParams]);

  const { rows, unattributed, loading, error, run } = useMechReportRun<TopRow>(
    fetcher,
    ready,
  );

  const visibleRows = useMemo(
    () => rows.filter((row) => row.view === view),
    [rows, view],
  );
  const columns = useMemo(
    () => (view === "repeat_failures" ? REPEAT_COLUMNS : MACHINE_COLUMNS),
    [view],
  );
  const repeatCount = useMemo(
    () => rows.filter((row) => row.view === "repeat_failures").length,
    [rows],
  );

  const handleExport = useCallback(() => {
    void (async () => {
      const viewLabel =
        VIEW_OPTIONS.find((o) => o.code === view)?.label ?? "Top Machines";
      await exportRowsToExcel(
        columns,
        visibleRows,
        `mech-top-problem-machines-${view}`,
        {
          companyName,
          branchName: branch?.branch_name,
          reportName: `Top Problem Machines — ${viewLabel}`,
          reportNo: await resolveReportMenuId(pathname),
          reportFor: [dateFrom, dateTo].filter(Boolean).join(" To "),
        },
      );
    })();
  }, [
    columns,
    visibleRows,
    view,
    companyName,
    branch?.branch_name,
    pathname,
    dateFrom,
    dateTo,
  ]);

  const handleSubmit = useCallback(() => {
    void run();
  }, [run]);

  const exportDisabled = useMemo(
    () => visibleRows.length === 0 || filters.branchId == null,
    [visibleRows.length, filters.branchId],
  );

  const selectedView = useMemo(
    () => VIEW_OPTIONS.find((o) => o.code === view) ?? VIEW_OPTIONS[0],
    [view],
  );

  return (
    <Box sx={{ p: 3 }}>
      <MechReportTitle>Top Problem Machines</MechReportTitle>
      {repeatCount > 0 && (
        <Typography
          variant="caption"
          sx={{ display: "block", color: "warning.main", fontWeight: 700 }}
        >
          {repeatCount} repeat failures — the same machine and component failing
          again inside the repeat window.
        </Typography>
      )}
      <UnattributedCaption value={unattributed} />

      {filters.mounted && (
        <MechFilterToolbar
          filters={filters}
          show={{ dates: true, machineType: true, discipline: true }}
          onSubmit={handleSubmit}
          onExport={handleExport}
          loading={loading}
          exportDisabled={exportDisabled}
        >
          <Box sx={{ minWidth: 220 }}>
            <SearchableSelect<ViewOption>
              variant="outlined"
              label="View"
              size="small"
              options={VIEW_OPTIONS}
              value={selectedView}
              onChange={(option) => setView(option?.code ?? "by_downtime")}
              getOptionLabel={(option) => option.label}
              getOptionKey={(option) => option.code}
              isOptionEqualToValue={(option, value) => option.code === value.code}
              clearable={false}
            />
          </Box>
        </MechFilterToolbar>
      )}

      <ReportGrid
        rows={visibleRows}
        columns={columns}
        getRowId={(row) => row.id}
        loading={loading}
        error={error}
        branchId={filters.branchId}
      />
    </Box>
  );
}

export default function TopProblemMachinesPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      }
    >
      <TopProblemMachinesContent />
    </Suspense>
  );
}
