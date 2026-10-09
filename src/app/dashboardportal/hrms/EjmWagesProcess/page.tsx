"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Backdrop,
  Box,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Snackbar,
  Typography,
} from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import MuiForm, {
  type Field,
  type MuiFormHandle,
  type Option,
  type Schema,
} from "@/components/ui/muiform";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import { todayIso } from "@/components/reports/reportDates";
import {
  downloadEjmTextPrint,
  downloadEjmWagesPayrollExcel,
  exportBankSheet,
  fetchNjmPayPeriod,
  fetchPaySchemeList,
  printPaySlips,
} from "@/utils/hrmsService";
import { exportRowsToExcel } from "@/components/reports/exportExcel";
import { saveAs } from "file-saver";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";

/** Legacy `hol_get` code for the Holiday Data process. */
const ACTION_HOLIDAY_DATA = "1";
/** Legacy oattprdprocess — rebuilds tbl_daily_cash_outsider_payment_production. */
const ACTION_CASH_OUTSIDER = "14";
/** The only branch action 14 may run for (EJM FACTORY, sls). */
const EJM_CASH_BRANCH_ID = 29;
/** Legacy `hol_get` code for Main Payroll FN Attendance Incentive. */
const ACTION_ATT_INCENTIVE = "2";
/** Legacy exportdbfdata holget 20 — posts the pay period into cumulative_data_table. */
const ACTION_CUMULATIVE_TRANSFER = "20";
/** New (not a legacy code): run the five collection steps below over
 *  tbl_ejm_wages_data_collection, then browse/correct the result. */
const ACTION_WAGES_DATA = "27";
/** New (not a legacy code): legacy SPREDEFF.PRG — spreader individual / shift /
 *  overall efficiency for the fortnight into ejm_fne_wages_eff_data. */
const ACTION_SPREADER_EFF = "28";
/** New: legacy DRAWEFF1.PRG — drawing operator / group efficiency, same table. */
const ACTION_DRAWING_EFF = "29";
/** New: legacy DOFFEFF1.PRG — spinner individual / group efficiency, same table. */
const ACTION_SPINNING_EFF = "30";
/** New: legacy DOFMAZRP.PRG — doff mazdoor / sliver feeder / piecer efficiency. */
const ACTION_DOFF_MAZDOOR_EFF = "31";
/** New: legacy LOOMEFF1.PRG — weaver individual / weaving group efficiency. */
const ACTION_LOOM_EFF = "32";
/** New: legacy BEAMEFF1.PRG — beaming group efficiency. */
const ACTION_BEAMING_EFF = "33";
/** New: legacy FINISHEF.PRG — hemming / herackle / sack sewing / lapping / cutting efficiency. */
const ACTION_FINISHING_EFF = "34";
/** New: legacy WINDCALC.PRG — winder efficiency and production amount. */
const ACTION_WINDING_EFF = "35";
/** New: Press machines — same group-machine calculation as Beaming. */
const ACTION_PRESS_EFF = "36";
/** New: upload an Excel of EB No / OT Advance into tbl_ejm_wages_data_collection. */
const ACTION_OT_ADVANCE = "37";
/** New: spinning + weaving overall efficiency (legacy SPGWVGEF), after Spinning and Loom. */
const ACTION_OVERALL_EFF = "38";
/** The fortnight efficiency processes: each its own Report option and a step
 *  (in this order) at the end of the Wages Data Process pipeline. */
const EFF_PROCESSES: Record<string, { label: string; route: string }> = {
  [ACTION_SPREADER_EFF]: { label: "Spreader Efficiency", route: apiRoutesPortalMasters.EJM_SPREADER_EFF_PROCESS },
  [ACTION_DRAWING_EFF]: { label: "Drawing Efficiency", route: apiRoutesPortalMasters.EJM_DRAWING_EFF_PROCESS },
  [ACTION_SPINNING_EFF]: { label: "Spinning Efficiency", route: apiRoutesPortalMasters.EJM_SPINNING_EFF_PROCESS },
  [ACTION_DOFF_MAZDOOR_EFF]: { label: "Doff Mazdoor Efficiency", route: apiRoutesPortalMasters.EJM_DOFF_MAZDOOR_EFF_PROCESS },
  [ACTION_LOOM_EFF]: { label: "Loom Efficiency", route: apiRoutesPortalMasters.EJM_LOOM_EFF_PROCESS },
  [ACTION_BEAMING_EFF]: { label: "Beaming Efficiency", route: apiRoutesPortalMasters.EJM_BEAMING_EFF_PROCESS },
  [ACTION_FINISHING_EFF]: { label: "Finishing Efficiency", route: apiRoutesPortalMasters.EJM_FINISHING_EFF_PROCESS },
  [ACTION_WINDING_EFF]: { label: "Winding Efficiency", route: apiRoutesPortalMasters.EJM_WINDING_EFF_PROCESS },
  [ACTION_PRESS_EFF]: { label: "Press Efficiency", route: apiRoutesPortalMasters.EJM_PRESS_EFF_PROCESS },
  [ACTION_OVERALL_EFF]: { label: "Spinning + Weaving Overall Efficiency", route: apiRoutesPortalMasters.EJM_OVERALL_EFF_PROCESS },
};

/** The Wages Data Process pipeline, run in this order on Submit. Each step is
 *  its own request so progress is visible and a failure stops the chain
 *  where it happened (legacy mainwagesprocess1 did the same, arm by arm). */
type StepStatus = "pending" | "running" | "done" | "skipped" | "failed";
interface PipelineStep {
  label: string;
  status: StepStatus;
  message?: string;
}
const STEP_TEXT: Record<StepStatus, string> = {
  pending: "waiting",
  running: "running…",
  done: "done",
  skipped: "skipped",
  failed: "failed",
};
const STEP_COLOR: Record<StepStatus, string> = {
  pending: "text.disabled",
  running: "info.main",
  done: "success.main",
  skipped: "warning.main",
  failed: "error.main",
};

/**
 * EJM Wages Process — period + pay scheme + action, then Process.
 *
 * Ports the header of the "Holiday/Attendance Incentive Data" screen from the
 * legacy Data-Portal-Php app (`views/other_data_entry/holiday_att_incn_process.php`).
 * The "Data For" values are the legacy `hol_get` codes verbatim so the backend
 * port can dispatch on the same numbers.
 *
 * Everything the actions write lands in `tbl_ejm_wages_data_collection`, keyed
 * by (date_from, date_to, eb_id, pay_scheme_id).
 */

/** The "Data For" list from holiday_att_incn_process.php — legacy `$holget`
 *  codes and labels verbatim, so operators and the backend port see the same
 *  numbers they do today. */
const ACTION_OPTIONS: Option[] = [
  { label: "Holiday Data", value: "1" },
  { label: "Main Payroll FN Attendance Incentive", value: "2" },
  { label: "Forthnightly Attendance Incentive", value: "3" },
  { label: "Monthly Attendance Incentive", value: "4" },
  { label: "Attendance Data For EJM", value: "5" },
  { label: "Mill Att Data EJM", value: "6" },
  { label: "Forthnightly Attendance Incentive(T)", value: "7" },
  { label: "Monthly Attendance Incentive(T)", value: "8" },
  { label: "Attendance Data For NJM", value: "9" },
  { label: "Leave Transfer Data For NJM", value: "10" },
  { label: "Sardar/Helper Hours Transfer For NJM", value: "11" },
  { label: "Beaming Production Data Transfer for NJM", value: "12" },
  { label: "NJM wages data prepartion", value: "13" },
  { label: "EJM Cash/Outsider Daily Payment prepartion", value: "14" },
  { label: "EJM Std Hands Updation", value: "15" },
  { label: "T NO Other Data Updation", value: "16" },
  { label: "Non Working Date", value: "17" },
  { label: "EJM-Main Payroll Attendance Data Transfer", value: "18" },
  { label: "EJM-Winding Production Data Transfer", value: "19" },
  { label: "EJM-Cumulative Data Transfer", value: "20" },
  { label: "EJM-Att Incentive Dept Summary", value: "21" },
  { label: "STL Data Stamement", value: "22" },
  { label: "Canteen Data Statement", value: "23" },
  { label: "Attendance Sheet", value: "24" },
  { label: "Daily Outsider Production(EJM)", value: "25" },
  { label: "Pay Roll Posting", value: "26" },
  // 27 is ours, not a legacy hol_get code — the legacy modal had this as the
  // "Attendance Preparation & Updation" grid over tbl_ejm_wages_data_collection.
  { label: "EJM Wages Data Process", value: ACTION_WAGES_DATA },
  { label: "EJM Spreader Efficiency Process", value: ACTION_SPREADER_EFF },
  { label: "EJM Drawing Efficiency Process", value: ACTION_DRAWING_EFF },
  { label: "EJM Spinning Efficiency Process", value: ACTION_SPINNING_EFF },
  { label: "EJM Doff Mazdoor Efficiency Process", value: ACTION_DOFF_MAZDOOR_EFF },
  { label: "EJM Loom Efficiency Process", value: ACTION_LOOM_EFF },
  { label: "EJM Beaming Efficiency Process", value: ACTION_BEAMING_EFF },
  { label: "EJM Finishing Efficiency Process", value: ACTION_FINISHING_EFF },
  { label: "EJM Winding Efficiency Process", value: ACTION_WINDING_EFF },
  { label: "EJM Press Efficiency Process", value: ACTION_PRESS_EFF },
  { label: "EJM Spinning + Weaving Overall Efficiency Process", value: ACTION_OVERALL_EFF },
  { label: "OT Advance", value: ACTION_OT_ADVANCE },
];

/** Legacy `$holget` from pay_register_payslip.php — "Pay Ragister/ Pay Slip
 *  Type". Codes 9, 10 and 17–28 were never assigned there; the numbering is
 *  kept so the backend port dispatches on the same values. */
const PAY_REGISTER_OPTIONS: Option[] = [
  { label: "Main Pay Roll", value: "1" },
  { label: "Main Pay Roll Vouchers", value: "2" },
  { label: "Mill Retired", value: "3" },
  { label: "Card Holder Bank", value: "4" },
  { label: "Card Holder Cash", value: "5" },
  { label: "Trainee", value: "6" },
  { label: "Main Pay Roll Vouchers(ESI)", value: "7" },
  { label: "Pay Image Comparative Statement", value: "8" },
  { label: "NJM Main Pay Roll", value: "11" },
  { label: "NJM OFB CLERK", value: "12" },
  { label: "C.E DEDUCTION ABSTRACT SHEET", value: "13" },
  { label: "Bank Sheet", value: "14" },
  { label: "P.Tax Report", value: "15" },
  { label: "Periodical Payregister For Trainee Wages", value: "16" },
  { label: "Periodical Payregister For All-Learner & C-Voucher", value: "29" },
  { label: "Periodical Payregister For Main Payroll & 18-PF", value: "30" },
  { label: "Pay Roll Posting", value: "31" },
];

/** Legacy `$holget` from ot_register_payslip.php — "Data For". Its own list:
 *  code "1" here is unrelated to code "1" in the other two selects. */
const OT_DATA_OPTIONS: Option[] = [
  { label: "Main Pay Roll", value: "1" },
  { label: "Trainee", value: "2" },
  { label: "EJM-DEPARTMENT WISE OT SUMMARY REGISTER", value: "3" },
  { label: "EJM-DEPARTMENT WISE OT DETAILS REGISTER", value: "4" },
];

/** Which select supplies the code — each has its own button, the way the
 *  legacy app had a screen (and a `hol_get`) per list. */
type RunKind = "action" | "payreg" | "ot";

const RUN_KINDS: Record<RunKind, { options: Option[]; field: keyof FilterValues; what: string }> = {
  action: { options: ACTION_OPTIONS, field: "action", what: "what to process" },
  payreg: { options: PAY_REGISTER_OPTIONS, field: "pay_register_type", what: "the Pay Register / Pay Slip type" },
  ot: { options: OT_DATA_OPTIONS, field: "ot_data_for", what: "the OT data" },
};

/** Pay Register codes whose pay slips are the existing Main Pay Roll PDF
 *  (/hrms/pay_register_payslips); 14 is the bank sheet workbook. The other
 *  codes' legacy slips were bespoke dot-matrix layouts and are not ported —
 *  their register exports to Excel instead. */
const PAYSLIP_PDF_CODES = new Set(["1", "2", "7"]);
const PAYREG_BANK_SHEET = "14";

/** A Pay / OT Register response: the backend decides the columns per report
 *  code, and the last row is the grand total. */
interface ReportColumn {
  field: string;
  headerName: string;
  type?: "number" | null;
}
interface ReportResponse {
  title: string;
  payperiod_id: number | null;
  columns: ReportColumn[];
  data: Record<string, unknown>[];
}
type ReportRow = Record<string, unknown> & { id: number };

const toGridColumns = (cols: ReportColumn[]): GridColDef[] =>
  cols.map((c) =>
    c.type === "number"
      ? { field: c.field, headerName: c.headerName, type: "number", width: 110 }
      : {
          field: c.field,
          headerName: c.headerName,
          width: c.field === "wname" || c.field === "dept_desc" ? 200 : 110,
        },
  );

interface FilterValues {
  date_from: string;
  date_to: string;
  pay_scheme_id: string;
  action: string;
  pay_register_type: string;
  ot_data_for: string;
}

const INITIAL_FILTERS: FilterValues = {
  date_from: "",
  date_to: "",
  pay_scheme_id: "",
  action: "",
  pay_register_type: "",
  ot_data_for: "",
};

/** The shared header; the picked code is checked per button in `run`. */
const submitSchema = z
  .object({
    date_from: z.string().min(1, "Please select the From Date"),
    date_to: z.string().min(1, "Please select the To Date"),
    pay_scheme_id: z.string().min(1, "Please select the Pay Scheme"),
  })
  .refine((v) => v.date_to >= v.date_from, {
    message: "To Date cannot be earlier than From Date",
    path: ["date_to"],
  });

/** One row of tbl_ejm_wages_data_collection as the list endpoint returns it. */
interface WagesDataRow {
  data_collection_id: number;
  eb_id: number | null;
  eb_no: string;
  emp_name: string;
  /** daily_attendance.spell_id — attendance rows only. */
  spell_id: number | null;
  /** spell_mst.spell_code for spell_id (A1, B1, ...). */
  spell_name: string | null;
  /** daily_attendance.worked_department_id (a sub-department id) — attendance rows only. */
  dept_id: number | null;
  /** sub_dept_mst.sub_dept_desc for dept_id. */
  sub_dept_name: string | null;
  /** daily_attendance.worked_designation_id — attendance rows only. */
  desig_id: number | null;
  /** designation_mst.desig for desig_id. */
  desig_name: string | null;
  dept_code: string | null;
  occu_code: string | null;
  shift: string | null;
  t_p: string | null;
  mc_nos: string | null;
  /** machine_mst.machine_id — BEAMING / FINISHING attendance is collected machine-wise. */
  mc_id: number | null;
  /** Set by "Apply Efficiency to Wages Data" (legacy WGRPCALC). */
  act_eff: number | null;
  working_hours_eff: number | null;
  ot_hours_eff: number | null;
  ns_hrs_eff: number | null;
  prod_basic: number | null;
  time_basic: number | null;
  working_hours: number;
  ot_hours: number;
  ns_hours: number;
  ot_ns_hours: number;
  fest_hours: number;
  stl_days: number;
  production: number;
  puja_advance: number;
  ot_advance: number;
  stl_advance: number;
  installment_advance: number;
  co_loan: number;
  atten_incentive: number | null;
  misc_earn: number;
  misc_ded: number;
  misc_ot_earn: number;
  misc_ot_ded: number;
  prev_cuml_w_days: number;
  prev_cuml_pf_gross: number;
  prev_cuml_pf_contribution: number;
  prev_cuml_bonus_gross: number;
  prev_cuml_fpf_contribution: number;
  update_for: string | null;
}

/** The hour/advance fields the grid lets the operator correct — must stay a
 *  subset of the backend's EDITABLE_FIELDS whitelist. */
const EDITABLE_NUMERIC_FIELDS = [
  "working_hours", "ot_hours", "ns_hours", "ot_ns_hours", "fest_hours",
  "stl_days", "production", "puja_advance", "ot_advance", "stl_advance",
  "installment_advance", "co_loan", "atten_incentive", "misc_earn", "misc_ded",
  "misc_ot_earn", "misc_ot_ded",
] as const;

const numCol = (field: string, headerName: string): GridColDef => ({
  field,
  headerName,
  width: 100,
  type: "number",
  editable: true,
});

/** Second sheet of the wages export — the fortnight's ejm_fne_wages_eff_data. */
const EFF_DATA_COLUMNS: GridColDef[] = [
  { field: "details", headerName: "Details" },
  { field: "detcode", headerName: "Det Code" },
  { field: "deptcode", headerName: "Dept" },
  { field: "occucode", headerName: "Occu" },
  { field: "eb_no", headerName: "EB No" },
  { field: "name", headerName: "Name" },
  { field: "shift", headerName: "Shift" },
  { field: "mcno", headerName: "M/C No" },
  { field: "quality_id", headerName: "Quality ID" },
  { field: "quantity", headerName: "Quantity", type: "number" },
  { field: "target_qty", headerName: "Target Qty", type: "number" },
  { field: "eff", headerName: "Eff", type: "number" },
  { field: "tareff", headerName: "Target Eff", type: "number" },
  { field: "acteff", headerName: "Act Eff", type: "number" },
  { field: "effcode", headerName: "Eff Code" },
  { field: "prod_amount", headerName: "Prod Amount", type: "number" },
];

const WAGES_GRID_COLUMNS: GridColDef[] = [
  { field: "eb_no", headerName: "EB No", width: 90 },
  { field: "emp_name", headerName: "Employee", width: 180 },
  { field: "update_for", headerName: "Source", width: 80 },
  { field: "dept_id", headerName: "Dept ID", width: 80 },
  { field: "dept_code", headerName: "Dept", width: 70 },
  { field: "sub_dept_name", headerName: "Sub Dept", width: 150 },
  { field: "desig_id", headerName: "Desig ID", width: 80 },
  { field: "desig_name", headerName: "Designation", width: 170 },
  { field: "occu_code", headerName: "Occu", width: 70 },
  { field: "spell_id", headerName: "Spell ID", width: 80 },
  { field: "spell_name", headerName: "Spell", width: 70 },
  { field: "shift", headerName: "Shift", width: 60, editable: true },
  { field: "mc_nos", headerName: "MC Nos", width: 90, editable: true },
  { field: "mc_id", headerName: "MC ID", width: 80 },
  numCol("working_hours", "Work Hrs"),
  numCol("ot_hours", "OT Hrs"),
  numCol("ns_hours", "NS Hrs"),
  numCol("ot_ns_hours", "OT NS Hrs"),
  // Efficiency results — recomputed by "Apply Efficiency to Wages Data", not edited here.
  { ...numCol("act_eff", "Eff %"), editable: false },
  { ...numCol("working_hours_eff", "Work Hrs Eff"), editable: false },
  { ...numCol("ot_hours_eff", "OT Hrs Eff"), editable: false },
  { ...numCol("ns_hrs_eff", "NS Hrs Eff"), editable: false },
  { ...numCol("prod_basic", "Prod Basic"), editable: false },
  { ...numCol("time_basic", "Time Basic"), editable: false },
  numCol("fest_hours", "Fest Hrs"),
  numCol("stl_days", "STL Days"),
  numCol("production", "Production"),
  numCol("puja_advance", "Puja Adv"),
  numCol("ot_advance", "OT Adv"),
  numCol("stl_advance", "STL Adv"),
  numCol("installment_advance", "Inst Adv"),
  numCol("co_loan", "CO Loan"),
  numCol("atten_incentive", "Att Incentive"),
  numCol("misc_earn", "Misc Earn"),
  numCol("misc_ded", "Misc Ded"),
  numCol("misc_ot_earn", "Misc OT Earn"),
  numCol("misc_ot_ded", "Misc OT Ded"),
  // Previous cumulatives are computed by the Cumulative Data Process, never
  // hand-corrected: fix the past period in cumulative_data_table instead.
  { ...numCol("prev_cuml_w_days", "Prev W Days"), editable: false },
  { ...numCol("prev_cuml_pf_gross", "Prev PF Gross"), editable: false },
  { ...numCol("prev_cuml_pf_contribution", "Prev PF Cont"), editable: false },
  { ...numCol("prev_cuml_bonus_gross", "Prev Bonus Gross"), editable: false },
  { ...numCol("prev_cuml_fpf_contribution", "Prev FPF Cont"), editable: false },
];

/** Eligible days needed to earn any incentive — mirrors the backend's
 *  INCENTIVE_MIN_DAYS (legacy $attincd). Display only; the backend decides. */
const INCENTIVE_MIN_DAYS = 12;

/** One employee's fortnightly attendance incentive. */
interface IncentiveRow {
  eb_id: number;
  emp_code: string;
  dept_desc: string | null;
  empname: string;
  incdays: number;
  lvdays: number;
  elegday: number;
  fn_att_inc_rate: number;
  incamt: number;
}

const INCENTIVE_GRID_COLUMNS: GridColDef[] = [
  { field: "emp_code", headerName: "EB No", width: 90 },
  { field: "empname", headerName: "Employee", width: 200 },
  { field: "dept_desc", headerName: "Department", width: 190 },
  { field: "incdays", headerName: "Inc Days", width: 100, type: "number" },
  { field: "lvdays", headerName: "Leave Days", width: 110, type: "number" },
  { field: "elegday", headerName: "Eligible Days", width: 120, type: "number" },
  { field: "fn_att_inc_rate", headerName: "Rate", width: 90, type: "number" },
  { field: "incamt", headerName: "Incentive Amt", width: 130, type: "number" },
];

/** What Submit last produced. The two reports have different shapes, so the
 *  kind decides the columns, the row id, and whether the grid is editable. */
type ReportResult =
  | { kind: "wages"; rows: WagesDataRow[] }
  | { kind: "incentive"; rows: IncentiveRow[] }
  | { kind: "report"; title: string; columns: GridColDef[]; rows: ReportRow[] };

export default function EjmWagesProcessPage() {
  // Every action here processes one branch's data — the legacy screen used the
  // logged-in company, this uses the sidebar branch selection.
  const { selectedBranches, selectedCompany } = useSidebarContext();
  const branchId = selectedBranches.length > 0 ? selectedBranches[0] : undefined;
  // From the live context, not the localStorage hook: that one only refreshes
  // on a cross-tab storage event, so switching company in the sidebar left the
  // Pay Scheme list showing the previous company's schemes.
  const coId = selectedCompany ? String(selectedCompany.co_id) : "";
  const formRef = useRef<MuiFormHandle>(null);

  const [filters, setFilters] = useState<FilterValues>(INITIAL_FILTERS);
  const [paySchemes, setPaySchemes] = useState<Option[]>([]);
  const [submitting, setSubmitting] = useState(false);
  // null = nothing run yet (grid hidden); rows [] = ran, found nothing.
  const [result, setResult] = useState<ReportResult | null>(null);
  // Step-by-step outcome of the last Wages Data Process run.
  const [pipeline, setPipeline] = useState<PipelineStep[] | null>(null);
  // OT Advance upload popup; the file picked in it.
  const [otAdvOpen, setOtAdvOpen] = useState(false);
  const [otAdvFile, setOtAdvFile] = useState<File | null>(null);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error" | "info";
  }>({ open: false, message: "", severity: "success" });

  const notify = useCallback(
    (message: string, severity: "success" | "error" | "info" = "info") =>
      setSnackbar({ open: true, message, severity }),
    [],
  );

  // Default both dates to today — after mount, never during render: server and
  // browser can straddle midnight and baking "today" into SSR breaks hydration.
  useEffect(() => {
    const today = todayIso();
    formRef.current?.setValue("date_from", today);
    formRef.current?.setValue("date_to", today);
  }, []);

  useEffect(() => {
    if (!coId) return;
    let cancelled = false;
    (async () => {
      // page_size 200: the scheme list is a dropdown here, not a browse grid.
      const { data, error } = await fetchPaySchemeList(coId, { page_size: 200 });
      if (cancelled) return;
      if (error || !data) {
        notify(error || "Failed to load pay schemes", "error");
        return;
      }
      setPaySchemes(
        (data.data ?? [])
          // Same statuses the backend's own pay-scheme dropdown query keeps —
          // Active(1) and Locked(32). A deactivated scheme can't be processed.
          .filter((r: Record<string, unknown>) =>
            [1, 32].includes(Number(r.record_status)),
          )
          .map((r: Record<string, unknown>) => ({
            label: String(r.payscheme_name ?? r.payscheme_code ?? ""),
            value: String(r.payscheme_id),
          })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [coId, notify]);

  const schema = useMemo<Schema>(
    () => ({
      fields: [
        { name: "date_from", label: "From Date", type: "date", required: true, grid: { xs: 12, sm: 6, md: 3 } },
        { name: "date_to", label: "To Date", type: "date", required: true, grid: { xs: 12, sm: 6, md: 3 } },
        { name: "pay_scheme_id", label: "Pay Scheme", type: "select", options: paySchemes, required: true, grid: { xs: 12, sm: 6, md: 3 } },
        { name: "action", label: "Report", type: "select", options: ACTION_OPTIONS, grid: { xs: 12, sm: 6, md: 3 } },
        { name: "pay_register_type", label: "Pay Register / Pay Slip Type", type: "select", options: PAY_REGISTER_OPTIONS, grid: { xs: 12, sm: 6, md: 3 } },
        { name: "ot_data_for", label: "OT Data For", type: "select", options: OT_DATA_OPTIONS, grid: { xs: 12, sm: 6, md: 3 } },
      ] satisfies Field[],
    }),
    [paySchemes],
  );

  const handleValuesChange = useCallback((vals: Record<string, unknown>) => {
    setFilters((prev) => ({ ...prev, ...(vals as Partial<FilterValues>) }));
  }, []);

  /** Wages Data Process: the five collection steps in order, then the grid.
   *  1 Attendance Data Transfer  → attendance + night hours arms
   *  2 Leave Data Process        → STL days arm
   *  3 Holiday Data Process      → credit pending holidays in the period, then
   *                                the festival hours arm
   *  4 Incentive Data Process    → attendance incentive arm
   *  5 Cumulative Data Process   → previous-cumulative arm (calendar-year
   *                                work days, financial-year PF / bonus / FPF
   *                                from cumulative_data_table), then this
   *                                period's payroll into cumulative_data_table
   *                                when a pay period already exists
   *  6 Spreader Efficiency       → ejm_fne_wages_eff_data (EJM FACTORY only)
   *  7 Drawing Efficiency        → ejm_fne_wages_eff_data (EJM FACTORY only)
   *  8 Spinning Efficiency       → ejm_fne_wages_eff_data (EJM FACTORY only)
   *  9 Doff Mazdoor Efficiency   → ejm_fne_wages_eff_data (EJM FACTORY only)
   * 10 Loom Efficiency           → ejm_fne_wages_eff_data (EJM FACTORY only)
   * 11 Beaming Efficiency        → ejm_fne_wages_eff_data (EJM FACTORY only)
   * 12 Finishing Efficiency      → ejm_fne_wages_eff_data (EJM FACTORY only)
   * 13 Winding Efficiency        → ejm_fne_wages_eff_data incl. prod_amount (EJM FACTORY only)
   * 14 Press Efficiency          → ejm_fne_wages_eff_data incl. prod_amount (EJM FACTORY only)
   * 15 Apply Efficiency          → this scheme's rows: working_hours_eff, ot_hours_eff,
   *                                ns_hrs_eff, act_eff, prod_basic (legacy WGRPCALC)
   *  Stops at the first failure; whatever was collected is still listed. */
  const runWagesPipeline = useCallback(
    async (p: { date_from: string; date_to: string; pay_scheme_id: string }) => {
      if (branchId == null) {
        notify("Select a branch in the sidebar before processing", "error");
        return;
      }
      // From/To must be an existing pay period of this scheme — nothing runs otherwise.
      setSubmitting(true);
      const { error: periodError } = await fetchNjmPayPeriod({
        branchId,
        dateFrom: p.date_from,
        dateTo: p.date_to,
        paySchemeId: p.pay_scheme_id,
      });
      setSubmitting(false);
      if (periodError) {
        notify(
          `From/To dates do not match a pay period of this pay scheme — nothing processed. ${periodError}`,
          "error",
        );
        return;
      }

      // Rebuilding discards corrections made to the generated rows.
      const existing = result?.kind === "wages" ? result.rows.length : 0;
      if (
        existing > 0 &&
        !window.confirm(
          `Rebuild wages data? Any corrections made to the ${existing} existing record(s) will be lost.`,
        )
      ) {
        return;
      }

      const body = { branch_id: branchId, ...p };
      type Msg = { message: string };
      const unwrap = async (req: Promise<{ data: Msg | null; error: string | null }>) => {
        const { data, error } = await req;
        if (error || !data) throw new Error(error || "Request failed");
        return data;
      };
      const build = (arms: string[]) =>
        unwrap(fetchWithCookie<Msg>(apiRoutesPortalMasters.EJM_WAGES_DATA_BUILD, "POST", { ...body, arms }));

      const steps: { label: string; go: () => Promise<Msg & { skipped?: boolean }> }[] = [
        { label: "Attendance Data Transfer", go: () => build(["ATT", "NSH"]) },
        { label: "Leave Data Process", go: () => build(["STL"]) },
        {
          label: "Holiday Data Process",
          go: async () => {
            // No pay scheme here: a holiday is approved once, so it must credit
            // every scheme on the branch (as per-holiday Approve does); the
            // FES arm then collects only this scheme's hours.
            const h = await unwrap(
              fetchWithCookie<Msg>(apiRoutesPortalMasters.HOLIDAY_PROCESS_RANGE, "POST", {
                branch_id: branchId,
                date_from: p.date_from,
                date_to: p.date_to,
              }),
            );
            const f = await build(["FES"]);
            return { message: `${h.message}; ${f.message}` };
          },
        },
        { label: "Incentive Data Process", go: () => build(["INC"]) },
        {
          label: "Cumulative Data Process",
          go: async () => {
            // What each hand ran up before this period comes first; it only
            // reads past periods, so it never depends on this period's payroll.
            const c = await build(["CUM"]);
            const r = await fetchWithCookie<Msg>(apiRoutesPortalMasters.EJM_CUMULATIVE_TRANSFER, "POST", body);
            // The payroll for this period is normally run after this
            // collection, so "no pay period yet" is expected, not a failure.
            if (r.status === 404) return { message: `${c.message}; ${r.error ?? "No pay period yet"}` };
            const t = await unwrap(Promise.resolve(r));
            return { message: `${c.message}; ${t.message}` };
          },
        },
        ...Object.values(EFF_PROCESSES).map(({ label, route }) => ({
          label: `${label} Process`,
          go: async () => {
            // EJM FACTORY only — other branches have no spreader/drawing wages codes.
            if (branchId !== EJM_CASH_BRANCH_ID) {
              return { message: "EJM FACTORY (branch 29) only", skipped: true };
            }
            const s = await unwrap(
              fetchWithCookie<{ data: Msg }>(route, "POST", {
                branch_id: branchId,
                date_from: p.date_from,
                date_to: p.date_to,
              }).then((r) => ({ ...r, data: r.data?.data ?? null })),
            );
            return { message: s.message };
          },
        })),
        {
          // Last: put the efficiency results on this scheme's wages rows (legacy
          // WGRPCALC) — working_hours_eff, ot_hours_eff, ns_hrs_eff, prod_basic.
          label: "Apply Efficiency to Wages Data",
          go: async () => {
            if (branchId !== EJM_CASH_BRANCH_ID) {
              return { message: "EJM FACTORY (branch 29) only", skipped: true };
            }
            const s = await unwrap(
              fetchWithCookie<{ data: Msg }>(apiRoutesPortalMasters.EJM_WAGES_EFF_APPLY, "POST", body)
                .then((r) => ({ ...r, data: r.data?.data ?? null })),
            );
            return { message: s.message };
          },
        },
      ];

      const setStep = (i: number, patch: Partial<PipelineStep>) =>
        setPipeline((prev) => (prev ? prev.map((s, j) => (j === i ? { ...s, ...patch } : s)) : prev));

      setPipeline(steps.map((s) => ({ label: s.label, status: "pending" })));
      setResult(null);
      setSubmitting(true);
      try {
        for (let i = 0; i < steps.length; i++) {
          setStep(i, { status: "running" });
          try {
            const out = await steps[i].go();
            setStep(i, { status: out.skipped ? "skipped" : "done", message: out.message });
          } catch (err) {
            const message = err instanceof Error ? err.message : "Failed";
            setStep(i, { status: "failed", message });
            notify(`${steps[i].label} failed: ${message}`, "error");
            break;
          }
        }
        const { data: listed } = await fetchWithCookie<{ data: WagesDataRow[] }>(
          apiRoutesPortalMasters.EJM_WAGES_DATA_LIST,
          "POST",
          p,
        );
        setResult({ kind: "wages", rows: listed?.data ?? [] });
      } finally {
        setSubmitting(false);
      }
    },
    [branchId, notify, result],
  );

  /** Validate the shared header plus the picked code, then hand off to the
   *  backend. All three buttons funnel through here — they differ only in
   *  which select supplies the code. */
  const run = useCallback(async (kind: RunKind) => {
    // Cash/Outsider preparation is period-only — it never reads the pay
    // scheme, so an empty selection must not block it. The placeholder only
    // satisfies the schema; that branch never sends pay_scheme_id.
    // Spreader / drawing efficiency are period-only too.
    const periodOnly =
      kind === "action" &&
      (filters.action === ACTION_CASH_OUTSIDER || filters.action === ACTION_OT_ADVANCE ||
        filters.action in EFF_PROCESSES);
    const parsed = submitSchema.safeParse(
      periodOnly && !filters.pay_scheme_id
        ? { ...filters, pay_scheme_id: "-" }
        : filters,
    );
    if (!parsed.success) {
      notify(parsed.error.issues[0]?.message ?? "Invalid selection", "error");
      return;
    }
    const { options, field, what } = RUN_KINDS[kind];
    const code = filters[field];
    if (!code) {
      notify(`Please select ${what}`, "error");
      return;
    }
    const label = options.find((o) => o.value === code)?.label ?? code;
    // Only the "Report" list has ported actions; the other lists' codes overlap
    // with it, so they must never reach the dispatch below.
    const action = kind === "action" ? code : "";

    // Holiday Data is scoped to one branch's calendar, so it cannot run off the
    // company alone the way the legacy screen did.
    if (action === ACTION_HOLIDAY_DATA && branchId == null) {
      notify("Select a branch in the sidebar before processing", "error");
      return;
    }

    if (action === ACTION_WAGES_DATA) {
      await runWagesPipeline(parsed.data);
      return;
    }

    if (action === ACTION_OT_ADVANCE) {
      if (branchId == null) {
        notify("Select a branch in the sidebar before uploading OT advance", "error");
        return;
      }
      setOtAdvFile(null);
      setOtAdvOpen(true);
      return;
    }

    setSubmitting(true);
    // A stale grid under a different action's result would mislead; clear it
    // on every submit and repopulate only for the actions that produce one.
    setResult(null);
    setPipeline(null);
    try {
      // Pay Register / OT Register: one endpoint each, the legacy code picks
      // the report. Both hang off a pay period, which needs the branch.
      if (kind !== "action") {
        if (branchId == null) {
          notify("Select a branch in the sidebar before running this report", "error");
          return;
        }
        const { data, error } = await fetchWithCookie<ReportResponse>(
          kind === "payreg"
            ? apiRoutesPortalMasters.EJM_PAY_REGISTER_REPORT
            : apiRoutesPortalMasters.EJM_OT_REGISTER_REPORT,
          "POST",
          {
            branch_id: branchId,
            date_from: parsed.data.date_from,
            date_to: parsed.data.date_to,
            pay_scheme_id: parsed.data.pay_scheme_id,
            report: code,
          },
        );
        if (error || !data) {
          notify(error || `Failed to load ${label}`, "error");
          return;
        }
        setResult({
          kind: "report",
          title: data.title,
          columns: toGridColumns(data.columns),
          rows: data.data.map((r, id) => ({ ...r, id })),
        });
        if (data.data.length === 0) {
          notify(`No data for "${label}" in the selected period`, "info");
        }
        return;
      }

      if (action === ACTION_ATT_INCENTIVE) {
        // Incentive counts holidays and leave for the branch, so it cannot run
        // off the company alone the way the legacy screen did.
        if (branchId == null) {
          notify("Select a branch in the sidebar before running this report", "error");
          return;
        }
        const { data, error } = await fetchWithCookie<{ data: IncentiveRow[] }>(
          apiRoutesPortalMasters.EJM_ATT_INCENTIVE_REPORT,
          "POST",
          {
            branch_id: branchId,
            date_from: parsed.data.date_from,
            date_to: parsed.data.date_to,
            pay_scheme_id: parsed.data.pay_scheme_id,
          },
        );
        if (error || !data) {
          notify(error || "Failed to load attendance incentive", "error");
          return;
        }
        setResult({ kind: "incentive", rows: data.data });
        if (data.data.length === 0) {
          notify("No employee qualified for attendance incentive in this period", "info");
        }
        return;
      }

      if (action === ACTION_HOLIDAY_DATA) {
        // Pay scheme narrows who gets credited — a branch's workforce spans
        // several schemes and a wages run for one must not pay the others.
        const { data, error } = await fetchWithCookie<{ message: string }>(
          apiRoutesPortalMasters.HOLIDAY_PROCESS_RANGE,
          "POST",
          {
            branch_id: branchId,
            date_from: parsed.data.date_from,
            date_to: parsed.data.date_to,
            pay_scheme_id: parsed.data.pay_scheme_id,
          },
        );
        if (error || !data) {
          notify(error || "Holiday processing failed", "error");
          return;
        }
        notify(data.message, "success");
        return;
      }

      if (action === ACTION_CASH_OUTSIDER) {
        // EJM FACTORY only — T-numbered outsiders of branch 29.
        if (branchId !== EJM_CASH_BRANCH_ID) {
          notify("EJM Cash/Outsider Daily Payment runs only for EJM FACTORY (branch 29) — select it in the sidebar", "error");
          return;
        }
        const { data, error } = await fetchWithCookie<{ data: { message: string } }>(
          apiRoutesPortalMasters.EJM_CASH_OUTSIDER_PROCESS,
          "POST",
          {
            branch_id: branchId,
            date_from: parsed.data.date_from,
            date_to: parsed.data.date_to,
          },
        );
        if (error || !data) {
          notify(error || `"${label}" failed`, "error");
          return;
        }
        notify(data.data.message, "success");
        return;
      }

      const effProcess = EFF_PROCESSES[action];
      if (effProcess) {
        // EJM FACTORY only, and the dates must be a fortnight — the backend checks both.
        if (branchId !== EJM_CASH_BRANCH_ID) {
          notify(`${effProcess.label} runs only for EJM FACTORY (branch 29) — select it in the sidebar`, "error");
          return;
        }
        const { data, error } = await fetchWithCookie<{ data: { message: string; rows: number } }>(
          effProcess.route,
          "POST",
          {
            branch_id: branchId,
            date_from: parsed.data.date_from,
            date_to: parsed.data.date_to,
          },
        );
        if (error || !data) {
          notify(error || `"${label}" failed`, "error");
          return;
        }
        notify(data.data.message, data.data.rows > 0 ? "success" : "info");
        return;
      }

      if (action === ACTION_CUMULATIVE_TRANSFER) {
        const { data, error } = await fetchWithCookie<{ message: string; inserted: number }>(
          apiRoutesPortalMasters.EJM_CUMULATIVE_TRANSFER,
          "POST",
          {
            branch_id: branchId,
            date_from: parsed.data.date_from,
            date_to: parsed.data.date_to,
            pay_scheme_id: parsed.data.pay_scheme_id,
          },
        );
        if (error || !data) {
          notify(error || `"${label}" failed`, "error");
          return;
        }
        notify(data.message, data.inserted > 0 ? "success" : "info");
        return;
      }

      // ponytail: the remaining Report actions are not ported from
      // Ejmprocessdata.php yet. Swap each for its service call as the backend
      // lands; the validation above is the part that would otherwise get
      // rewritten.
      notify(`"${label}" is not wired to the backend yet`, "info");
    } finally {
      setSubmitting(false);
    }
  }, [filters, notify, branchId, runWagesPipeline]);

  /** OT Advance: the backend rejects the whole file on any bad row and
   *  replaces the period's previous OT advance rows otherwise. */
  const uploadOtAdvance = useCallback(async () => {
    if (!otAdvFile || branchId == null) return;
    const form = new FormData();
    form.append("file", otAdvFile);
    form.append("date_from", filters.date_from);
    form.append("date_to", filters.date_to);
    form.append("branch_id", String(branchId));
    setSubmitting(true);
    try {
      const { data, error } = await fetchWithCookie<{ message: string }>(
        apiRoutesPortalMasters.EJM_OT_ADVANCE_UPLOAD,
        "POST",
        form,
      );
      if (error || !data) {
        notify(error || "OT advance upload failed", "error");
        return;
      }
      setOtAdvOpen(false);
      notify(data.message, "success");
    } finally {
      setSubmitting(false);
    }
  }, [otAdvFile, branchId, filters.date_from, filters.date_to, notify]);

  /** Legacy dot-matrix .txt for whichever select the button belongs to —
   *  the "Print" (register) and text "Payslip" of each legacy screen. The
   *  backend decides which codes had a print and explains the rest. */
  const handlePrint = useCallback(
    async (kind: RunKind, txt: "register" | "payslip" | "statement") => {
      const parsed = submitSchema.safeParse(filters);
      if (!parsed.success) {
        notify(parsed.error.issues[0]?.message ?? "Invalid selection", "error");
        return;
      }
      const { options, field, what } = RUN_KINDS[kind];
      const code = filters[field];
      if (!code) {
        notify(`Please select ${what}`, "error");
        return;
      }
      const label = options.find((o) => o.value === code)?.label ?? code;
      if (branchId == null || !coId) {
        notify("Select a company and branch in the sidebar first", "error");
        return;
      }
      setSubmitting(true);
      try {
        const blob = await downloadEjmTextPrint({
          list: kind,
          kind: txt,
          report: code,
          coId: String(coId),
          branchId,
          dateFrom: parsed.data.date_from,
          dateTo: parsed.data.date_to,
          paySchemeId: parsed.data.pay_scheme_id,
        });
        saveAs(
          blob,
          `${label.replace(/[^A-Za-z0-9]+/g, "_")}_${txt}_${parsed.data.date_from}_to_${parsed.data.date_to}.txt`,
        );
        notify(`${label} ${txt === "payslip" ? "pay slips" : txt === "statement" ? "pay statement" : "print"} generated`, "success");
      } catch (err) {
        notify(err instanceof Error ? err.message : `"${label}" print failed`, "error");
      } finally {
        setSubmitting(false);
      }
    },
    [filters, notify, branchId, coId],
  );

  /** Pay Slip for the selected Pay Register type: the existing Main Pay Roll
   *  PDF, or the bank sheet workbook. Resolves the pay period first, the
   *  same way the NJM screen does. */
  const handlePaySlip = useCallback(async () => {
    const parsed = submitSchema.safeParse(filters);
    if (!parsed.success) {
      notify(parsed.error.issues[0]?.message ?? "Invalid selection", "error");
      return;
    }
    const code = filters.pay_register_type;
    if (!code) {
      notify("Please select the Pay Register / Pay Slip type", "error");
      return;
    }
    const label = PAY_REGISTER_OPTIONS.find((o) => o.value === code)?.label ?? code;
    const isBank = code === PAYREG_BANK_SHEET;
    if (!isBank && !PAYSLIP_PDF_CODES.has(code)) {
      notify(`"${label}" has no pay slip here — run Pay Register and export the grid`, "info");
      return;
    }
    if (branchId == null || !coId) {
      notify("Select a company and branch in the sidebar first", "error");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await fetchNjmPayPeriod({
        branchId,
        dateFrom: parsed.data.date_from,
        dateTo: parsed.data.date_to,
        paySchemeId: parsed.data.pay_scheme_id,
      });
      if (error || !data) {
        notify(error || "Could not find a pay period for this selection", "error");
        return;
      }
      const periodId = data.data.payperiod_id;
      const blob = isBank
        ? await exportBankSheet(String(coId), periodId)
        : await printPaySlips(String(coId), periodId);
      if (!blob || blob.size === 0) {
        notify(`No data to print for "${label}"`, "error");
        return;
      }
      saveAs(
        blob,
        `${isBank ? "BankSheet" : "PaySlips"}_${parsed.data.date_from}_to_${parsed.data.date_to}.${isBank ? "xlsx" : "pdf"}`,
      );
      notify(`${label} generated`, "success");
    } catch (err) {
      notify(err instanceof Error ? err.message : `"${label}" failed`, "error");
    } finally {
      setSubmitting(false);
    }
  }, [filters, notify, branchId, coId]);

  /** Excel for Pay Roll: the scheme's Pay Roll upload template filled from
   *  the collected wages — every hand on the scheme, zeros where nothing was
   *  collected — so it uploads through Pay Roll unchanged. */
  const handlePayrollExcel = useCallback(async () => {
    const parsed = submitSchema.safeParse(filters);
    if (!parsed.success) {
      notify(parsed.error.issues[0]?.message ?? "Invalid selection", "error");
      return;
    }
    setSubmitting(true);
    try {
      const blob = await downloadEjmWagesPayrollExcel({
        dateFrom: parsed.data.date_from,
        dateTo: parsed.data.date_to,
        paySchemeId: parsed.data.pay_scheme_id,
      });
      if (!blob || blob.size === 0) {
        notify("No data to export", "error");
        return;
      }
      saveAs(blob, `PayRoll_${parsed.data.pay_scheme_id}_${parsed.data.date_from}_to_${parsed.data.date_to}.xlsx`);
      notify("Excel for Pay Roll generated", "success");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Excel for Pay Roll failed", "error");
    } finally {
      setSubmitting(false);
    }
  }, [filters, notify]);

  // Edit-in-place: persist the corrected row, or throw so the grid reverts it.
  const handleWagesRowUpdate = useCallback(
    async (newRow: WagesDataRow) => {
      const payload: Record<string, unknown> = {
        shift: newRow.shift,
        mc_nos: newRow.mc_nos,
      };
      for (const f of EDITABLE_NUMERIC_FIELDS) payload[f] = newRow[f] ?? 0;

      const { error } = await fetchWithCookie<{ message: string }>(
        `${apiRoutesPortalMasters.EJM_WAGES_DATA_UPDATE}/${newRow.data_collection_id}`,
        "PUT",
        payload,
      );
      if (error) {
        notify(error, "error");
        throw new Error(error);
      }
      return newRow;
    },
    [notify],
  );

  return (
    // Same page shell as the other HRMS pages (attendance open/close, payroll).
    <Box className="flex min-h-screen flex-col gap-6 bg-gray-50 p-8">
      <Box className="flex flex-col gap-1">
        <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
          EJM Wages Data Preparation
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Select the wage period and pay scheme, then run a report, a pay
          register / pay slip, or an OT register
        </Typography>
      </Box>

      <Paper className="p-4">
        <MuiForm
          ref={formRef}
          schema={schema}
          mode="create"
          hideModeToggle
          hideSubmit
          onValuesChange={handleValuesChange}
        />
        {/* One button group per select, mirroring each legacy screen's
            Register / Payslip / Print row — the three lists reuse the same
            codes, so a single Submit could not tell which the operator meant.
            ".txt" buttons are the dot-matrix prints. */}
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 3, mt: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="caption" color="text.secondary">Report</Typography>
            <Button onClick={() => void run("action")} disabled={submitting}>
              {submitting ? "Processing..." : "Submit"}
            </Button>
            <Button variant="outline" onClick={() => void handlePrint("action", "register")} disabled={submitting}>
              Print .txt
            </Button>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="caption" color="text.secondary">Pay Register</Typography>
            <Button variant="outline" onClick={() => void run("payreg")} disabled={submitting}>
              Register
            </Button>
            <Button variant="outline" onClick={() => void handlePaySlip()} disabled={submitting}>
              Pay Slip PDF
            </Button>
            <Button variant="outline" onClick={() => void handlePrint("payreg", "payslip")} disabled={submitting}>
              Pay Slip .txt
            </Button>
            <Button variant="outline" onClick={() => void handlePrint("payreg", "register")} disabled={submitting}>
              Print .txt
            </Button>
            <Button variant="outline" onClick={() => void handlePrint("payreg", "statement")} disabled={submitting}>
              Pay Statement .txt
            </Button>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="caption" color="text.secondary">OT</Typography>
            <Button variant="outline" onClick={() => void run("ot")} disabled={submitting}>
              Register
            </Button>
            <Button variant="outline" onClick={() => void handlePrint("ot", "payslip")} disabled={submitting}>
              Pay Slip .txt
            </Button>
            <Button variant="outline" onClick={() => void handlePrint("ot", "register")} disabled={submitting}>
              Print .txt
            </Button>
          </Box>
        </Box>
      </Paper>

      {result !== null && (
        <Paper className="p-4">
          <Box className="mb-2 flex items-center justify-between gap-2">
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {result.kind === "wages"
                ? "Wages Data Process"
                : result.kind === "incentive"
                  ? "Main Payroll FN Attendance Incentive"
                  : result.title}{" "}
              — {result.rows.length} record{result.rows.length === 1 ? "" : "s"}
              {result.kind === "wages" &&
                result.rows.length > 0 &&
                " (double-click a cell to correct it)"}
            </Typography>
            {result.kind === "wages" && (
              <Box className="flex shrink-0 gap-2">
                <Button
                  variant="outline"
                  disabled={result.rows.length === 0}
                  onClick={async () => {
                    const { data: eff } = await fetchWithCookie<{
                      data: Record<string, unknown>[];
                    }>(apiRoutesPortalMasters.EJM_WAGES_EFF_DATA_LIST, "POST", {
                      date_from: filters.date_from,
                      date_to: filters.date_to,
                    });
                    await exportRowsToExcel(
                      WAGES_GRID_COLUMNS,
                      result.rows,
                      "ejm-wages-data-process",
                      {
                        companyName: selectedCompany?.co_name,
                        branchName: selectedCompany?.branches.find(
                          (b) => b.branch_id === branchId,
                        )?.branch_name,
                        reportName: "EJM Wages Data Process",
                        reportFor: `${filters.date_from} To ${filters.date_to}`,
                      },
                      undefined,
                      [{ name: "Efficiency Data", columns: EFF_DATA_COLUMNS, rows: eff?.data ?? [] }],
                    );
                  }}
                >
                  Export to Excel
                </Button>
                <Button
                  variant="outline"
                  disabled={submitting}
                  onClick={() => void handlePayrollExcel()}
                >
                  Excel for Pay Roll
                </Button>
              </Box>
            )}
            {/* The legacy "Print" was a dot-matrix text dump of these rows;
                the workbook is its replacement. */}
            {result.kind === "report" && (
              <Button
                variant="outline"
                className="shrink-0"
                disabled={result.rows.length === 0}
                onClick={() =>
                  void exportRowsToExcel(
                    result.columns,
                    result.rows,
                    result.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
                    {
                      companyName: selectedCompany?.co_name,
                      branchName: selectedCompany?.branches.find(
                        (b) => b.branch_id === branchId,
                      )?.branch_name,
                      reportName: result.title,
                      reportFor: `${filters.date_from} To ${filters.date_to}`,
                    },
                  )
                }
              >
                Export to Excel
              </Button>
            )}
          </Box>

          {result.kind === "wages" && pipeline && (
            <Box component="ol" sx={{ m: 0, mb: 2, pl: 2.5 }}>
              {pipeline.map((s) => (
                <Typography
                  key={s.label}
                  component="li"
                  variant="body2"
                  sx={{ color: STEP_COLOR[s.status] }}
                >
                  {s.label}: {STEP_TEXT[s.status]}
                  {s.message ? ` — ${s.message}` : ""}
                </Typography>
              ))}
            </Box>
          )}
          {result.kind === "wages" && result.rows.length === 0 && (
            <Alert severity="info" sx={{ mb: 2 }}>
              The processes found no attendance, leave, holiday or incentive
              data for this period, pay scheme and branch.
            </Alert>
          )}
          {result.kind === "report" && result.rows.length === 0 && (
            <Alert severity="info" sx={{ mb: 2 }}>
              No rows for this report in the selected period and pay scheme.
            </Alert>
          )}
          {result.kind === "incentive" && result.rows.length === 0 && (
            <Alert severity="info" sx={{ mb: 2 }}>
              No employee reached the {INCENTIVE_MIN_DAYS}-day eligibility
              threshold in this period, or none on this pay scheme is marked
              eligible for attendance incentive.
            </Alert>
          )}

          {result.kind === "wages" ? (
            <DataGrid
              rows={result.rows}
              columns={WAGES_GRID_COLUMNS}
              getRowId={(row) => row.data_collection_id}
              autoHeight
              density="compact"
              pageSizeOptions={[25, 50, 100]}
              initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
              disableRowSelectionOnClick
              processRowUpdate={handleWagesRowUpdate}
              // processRowUpdate already notified; this stops the console error.
              onProcessRowUpdateError={() => undefined}
            />
          ) : result.kind === "incentive" ? (
            // Read-only: the incentive is derived on every run, never stored.
            <DataGrid
              rows={result.rows}
              columns={INCENTIVE_GRID_COLUMNS}
              getRowId={(row) => row.eb_id}
              autoHeight
              density="compact"
              pageSizeOptions={[25, 50, 100]}
              initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
              disableRowSelectionOnClick
            />
          ) : (
            // Pay / OT Register: columns come from the backend per report
            // code; the last row is the grand total.
            <DataGrid
              rows={result.rows}
              columns={result.columns}
              autoHeight
              density="compact"
              pageSizeOptions={[25, 50, 100]}
              initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
              disableRowSelectionOnClick
            />
          )}
        </Paper>
      )}

      {/* A batch can walk a whole date range of holidays, so the wait is long
          enough to need a blocking spinner — the legacy screen did the same
          (showSpinnerCounter). It also stops a second Submit landing mid-run. */}
      <Backdrop
        open={submitting}
        sx={(theme) => ({
          zIndex: theme.zIndex.drawer + 1,
          color: theme.palette.common.white,
          flexDirection: "column",
          gap: 2,
        })}
      >
        <CircularProgress color="inherit" />
        <Typography variant="body2">
          {(() => {
            const i = pipeline?.findIndex((s) => s.status === "running") ?? -1;
            return i >= 0 && pipeline
              ? `Step ${i + 1} of ${pipeline.length}: ${pipeline[i].label}…`
              : "Processing…";
          })()}
        </Typography>
      </Backdrop>

      <Dialog open={otAdvOpen} onClose={() => setOtAdvOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>OT Advance Upload</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {filters.date_from} to {filters.date_to}. Excel (.xlsx): column A EB No, column B
            OT Advance, first row a header. Previous OT advance for this period is replaced.
          </Typography>
          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => setOtAdvFile(e.target.files?.[0] ?? null)}
          />
        </DialogContent>
        <DialogActions>
          <Button variant="outline" onClick={() => setOtAdvOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={uploadOtAdvance} disabled={!otAdvFile || submitting}>
            Upload
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          sx={{ width: "100%" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
