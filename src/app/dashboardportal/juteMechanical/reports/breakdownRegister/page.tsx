"use client";
import React, { Suspense, useCallback, useMemo } from "react";
import { Box, CircularProgress } from "@mui/material";
import { usePathname } from "next/navigation";
import type { GridColDef } from "@mui/x-data-grid";
import ReportGrid, { numCol } from "@/components/reports/ReportGrid";
import { exportRowsToExcel } from "@/components/reports/exportExcel";
import { resolveReportMenuId } from "@/utils/reportMenuService";
import { fetchBreakdownRegisterReport } from "@/utils/juteMechanicalService";
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
  dmy,
  dmyTime,
  pickNum,
  pickStr,
  pickText,
  unattributedPctFromRows,
} from "../_components/mechReportUtils";

/**
 * R1 — Breakdown Register: the raw filterable incident log.
 *
 * Deliberately NOT limited to `downtime_type = 'BREAKDOWN'`: the register is the
 * audit trail and shows planned PM / no-material / changeover rows too, each
 * labelled by its `downtime_type`. The unattributed caption is computed over the
 * BREAKDOWN rows only, so it matches the analytic reports.
 */
type RegisterGridRow = {
  id: number;
  tran_date: string;
  machine_name: string;
  mech_code: string;
  machine_type_name: string;
  dept_name: string;
  spell_code: string;
  stop_datetime: string;
  attended_datetime: string;
  restart_datetime: string;
  duration_min: number | null;
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
  fixed_by_user_name: string;
  prod_check: string;
  prod_confirm_by_name: string;
  prod_restart_datetime: string;
  prod_confirm_remarks: string;
  root_cause: string;
  action_taken: string;
  preventive_action: string;
  production_loss_qty: number | null;
  status: string;
  remarks: string;
};

/** Production's verdict on a closed incident's fix; blank while it is still open. */
function prodCheckLabel(
  status: string | null | undefined,
  prodStatus: string | null | undefined,
): string {
  if (prodStatus === "CONFIRMED") return "Confirmed";
  if (prodStatus === "DISPUTED") return "Differs";
  return status === "CLOSED" ? "Not checked" : "";
}

const columns: GridColDef<RegisterGridRow>[] = [
  { field: "tran_date", headerName: "Date", width: 105 },
  { field: "machine_name", headerName: "Machine", minWidth: 150 },
  { field: "mech_code", headerName: "Mech Code", width: 100 },
  { field: "machine_type_name", headerName: "Section", width: 130 },
  { field: "dept_name", headerName: "Department", width: 130 },
  { field: "spell_code", headerName: "Spell", width: 80 },
  { field: "stop_datetime", headerName: "Stopped At", width: 140 },
  { field: "attended_datetime", headerName: "Attended At", width: 140 },
  { field: "restart_datetime", headerName: "Restarted At", width: 140 },
  numCol("duration_min", "Downtime (Min)", 120),
  numCol("response_min", "Response (Min)", 120),
  { field: "reason_code", headerName: "Reason Code", width: 110 },
  { field: "reason_desc", headerName: "Reason", minWidth: 180 },
  { field: "component_name", headerName: "Component", width: 130 },
  { field: "discipline", headerName: "Discipline", width: 110 },
  { field: "downtime_type", headerName: "Downtime Type", width: 130 },
  { field: "attended_dept_name", headerName: "Attended By Dept", width: 150 },
  { field: "attended_by", headerName: "Attended By", width: 130 },
  { field: "reported_by", headerName: "Reported By", width: 130 },
  { field: "reported_by_user_name", headerName: "Entered By (User)", width: 150 },
  { field: "fixed_by_user_name", headerName: "Fix Entered By", width: 150 },
  { field: "prod_check", headerName: "Production Check", width: 150 },
  { field: "prod_confirm_by_name", headerName: "Checked By", width: 150 },
  { field: "prod_restart_datetime", headerName: "Prod. Restart", width: 140 },
  { field: "prod_confirm_remarks", headerName: "Prod. Remark", minWidth: 180 },
  { field: "root_cause", headerName: "Root Cause", minWidth: 180 },
  { field: "action_taken", headerName: "Action Taken", minWidth: 180 },
  { field: "preventive_action", headerName: "Preventive Action", minWidth: 180 },
  numCol("production_loss_qty", "Prod Loss Qty", 120),
  { field: "status", headerName: "Status", width: 120 },
  { field: "remarks", headerName: "Remarks", minWidth: 160 },
];

function BreakdownRegisterContent() {
  const filters = useMechReportFilters();
  const pathname = usePathname();
  const { reportParams, companyName, branch, dateFrom, dateTo, ready } = filters;

  const fetcher = useCallback(async () => {
    if (!reportParams) return { rows: [], unattributed: null };
    const result = await fetchBreakdownRegisterReport(reportParams);
    const records = result.data.map(asRecord);

    const rows: RegisterGridRow[] = records.map((rec, index) => ({
      id: pickNum(rec, "breakdown_id") ?? index,
      tran_date: dmy(pickStr(rec, "tran_date")),
      machine_name: pickText(rec, "machine_name"),
      mech_code: pickText(rec, "mech_code"),
      machine_type_name: pickText(rec, "machine_type_name"),
      dept_name: pickText(rec, "dept_name"),
      spell_code: pickText(rec, "spell_code"),
      stop_datetime: dmyTime(pickStr(rec, "stop_datetime")),
      attended_datetime: dmyTime(pickStr(rec, "attended_datetime")),
      restart_datetime: dmyTime(pickStr(rec, "restart_datetime")),
      duration_min: pickNum(rec, "duration_min"),
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
      fixed_by_user_name: pickText(rec, "fixed_by_user_name"),
      prod_check: prodCheckLabel(pickStr(rec, "status"), pickStr(rec, "prod_confirm_status")),
      prod_confirm_by_name: pickText(rec, "prod_confirm_by_name"),
      prod_restart_datetime: dmyTime(pickStr(rec, "prod_restart_datetime")),
      prod_confirm_remarks: pickText(rec, "prod_confirm_remarks"),
      root_cause: pickText(rec, "root_cause"),
      action_taken: pickText(rec, "action_taken"),
      preventive_action: pickText(rec, "preventive_action"),
      production_loss_qty: pickNum(rec, "production_loss_qty"),
      status: pickText(rec, "status"),
      remarks: pickText(rec, "remarks"),
    }));

    // Failure rows only, matching the backend's failure-gated metric set.
    const failures = records.filter(
      (rec) => pickStr(rec, "downtime_type") === "BREAKDOWN",
    );
    return { rows, unattributed: unattributedPctFromRows(failures) };
  }, [reportParams]);

  const { rows, unattributed, loading, error, run } =
    useMechReportRun<RegisterGridRow>(fetcher, ready);

  const handleExport = useCallback(() => {
    void (async () => {
      await exportRowsToExcel(columns, rows, "mech-breakdown-register", {
        companyName,
        branchName: branch?.branch_name,
        reportName: "Breakdown Register",
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
      <MechReportTitle>Breakdown Register</MechReportTitle>
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

export default function BreakdownRegisterPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      }
    >
      <BreakdownRegisterContent />
    </Suspense>
  );
}
