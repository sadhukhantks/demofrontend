"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Backdrop,
  Box,
  CircularProgress,
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
import { useSelectedCompanyCoId } from "@/hooks/use-selected-company-coid";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import { todayIso } from "@/components/reports/reportDates";
import {
  downloadEjmTextPrint,
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
/** Legacy `hol_get` code for Main Payroll FN Attendance Incentive. */
const ACTION_ATT_INCENTIVE = "2";
/** New (not a legacy code): browse/correct tbl_ejm_wages_data_collection. */
const ACTION_WAGES_DATA = "27";

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
  { label: "Wages Data Process", value: ACTION_WAGES_DATA },
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
  dept_code: string | null;
  occu_code: string | null;
  shift: string | null;
  t_p: string | null;
  mc_nos: string | null;
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
  misc_earn: number;
  misc_ded: number;
  misc_ot_earn: number;
  misc_ot_ded: number;
  update_for: string | null;
}

/** The hour/advance fields the grid lets the operator correct — must stay a
 *  subset of the backend's EDITABLE_FIELDS whitelist. */
const EDITABLE_NUMERIC_FIELDS = [
  "working_hours", "ot_hours", "ns_hours", "ot_ns_hours", "fest_hours",
  "stl_days", "production", "puja_advance", "ot_advance", "stl_advance",
  "installment_advance", "co_loan", "misc_earn", "misc_ded",
  "misc_ot_earn", "misc_ot_ded",
] as const;

const numCol = (field: string, headerName: string): GridColDef => ({
  field,
  headerName,
  width: 100,
  type: "number",
  editable: true,
});

const WAGES_GRID_COLUMNS: GridColDef[] = [
  { field: "eb_no", headerName: "EB No", width: 90 },
  { field: "emp_name", headerName: "Employee", width: 180 },
  { field: "dept_code", headerName: "Dept", width: 70 },
  { field: "occu_code", headerName: "Occu", width: 70 },
  { field: "shift", headerName: "Shift", width: 60, editable: true },
  { field: "mc_nos", headerName: "MC Nos", width: 90, editable: true },
  numCol("working_hours", "Work Hrs"),
  numCol("ot_hours", "OT Hrs"),
  numCol("ns_hours", "NS Hrs"),
  numCol("ot_ns_hours", "OT NS Hrs"),
  numCol("fest_hours", "Fest Hrs"),
  numCol("stl_days", "STL Days"),
  numCol("production", "Production"),
  numCol("puja_advance", "Puja Adv"),
  numCol("ot_advance", "OT Adv"),
  numCol("stl_advance", "STL Adv"),
  numCol("installment_advance", "Inst Adv"),
  numCol("co_loan", "CO Loan"),
  numCol("misc_earn", "Misc Earn"),
  numCol("misc_ded", "Misc Ded"),
  numCol("misc_ot_earn", "Misc OT Earn"),
  numCol("misc_ot_ded", "Misc OT Ded"),
  { field: "update_for", headerName: "Source", width: 80 },
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
  const { coId } = useSelectedCompanyCoId();
  // Every action here processes one branch's data — the legacy screen used the
  // logged-in company, this uses the sidebar branch selection.
  const { selectedBranches, selectedCompany } = useSidebarContext();
  const branchId = selectedBranches.length > 0 ? selectedBranches[0] : undefined;
  const formRef = useRef<MuiFormHandle>(null);

  const [filters, setFilters] = useState<FilterValues>(INITIAL_FILTERS);
  const [paySchemes, setPaySchemes] = useState<Option[]>([]);
  const [submitting, setSubmitting] = useState(false);
  // null = nothing run yet (grid hidden); rows [] = ran, found nothing.
  const [result, setResult] = useState<ReportResult | null>(null);
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

  /** Validate the shared header plus the picked code, then hand off to the
   *  backend. All three buttons funnel through here — they differ only in
   *  which select supplies the code. */
  const run = useCallback(async (kind: RunKind) => {
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
    // Only the "Report" list has ported actions; the other lists' codes overlap
    // with it, so they must never reach the dispatch below.
    const action = kind === "action" ? code : "";

    // Holiday Data is scoped to one branch's calendar, so it cannot run off the
    // company alone the way the legacy screen did.
    if (action === ACTION_HOLIDAY_DATA && branchId == null) {
      notify("Select a branch in the sidebar before processing", "error");
      return;
    }

    setSubmitting(true);
    // A stale grid under a different action's result would mislead; clear it
    // on every submit and repopulate only for the actions that produce one.
    setResult(null);
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

      if (action === ACTION_WAGES_DATA) {
        const { data, error } = await fetchWithCookie<{ data: WagesDataRow[] }>(
          apiRoutesPortalMasters.EJM_WAGES_DATA_LIST,
          "POST",
          {
            date_from: parsed.data.date_from,
            date_to: parsed.data.date_to,
            pay_scheme_id: parsed.data.pay_scheme_id,
          },
        );
        if (error || !data) {
          notify(error || "Failed to load wages data", "error");
          return;
        }
        setResult({ kind: "wages", rows: data.data });
        if (data.data.length === 0) {
          notify("No wages data found for the selected period and pay scheme", "info");
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

      // ponytail: the remaining Report actions are not ported from
      // Ejmprocessdata.php yet. Swap each for its service call as the backend
      // lands; the validation above is the part that would otherwise get
      // rewritten.
      notify(`"${label}" is not wired to the backend yet`, "info");
    } finally {
      setSubmitting(false);
    }
  }, [filters, notify, branchId]);

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

  /** Build the collected wages rows for the selected period, then reload.
   *  Separate from Submit so viewing the data can never overwrite it. */
  const handleBuildFromAttendance = useCallback(async () => {
    const parsed = submitSchema.safeParse(filters);
    if (!parsed.success) {
      notify(parsed.error.issues[0]?.message ?? "Invalid selection", "error");
      return;
    }
    if (filters.action !== ACTION_WAGES_DATA) {
      notify("Select Wages Data Process as the Report first", "error");
      return;
    }
    if (branchId == null) {
      notify("Select a branch in the sidebar before processing", "error");
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

    setSubmitting(true);
    try {
      const body = {
        branch_id: branchId,
        date_from: parsed.data.date_from,
        date_to: parsed.data.date_to,
        pay_scheme_id: parsed.data.pay_scheme_id,
      };
      const { data, error } = await fetchWithCookie<{
        message: string;
        inserted: number;
      }>(apiRoutesPortalMasters.EJM_WAGES_DATA_BUILD, "POST", body);
      if (error || !data) {
        notify(error || "Build failed", "error");
        return;
      }
      notify(data.message, data.inserted > 0 ? "success" : "info");

      const { data: listed } = await fetchWithCookie<{ data: WagesDataRow[] }>(
        apiRoutesPortalMasters.EJM_WAGES_DATA_LIST,
        "POST",
        body,
      );
      setResult({ kind: "wages", rows: listed?.data ?? [] });
    } finally {
      setSubmitting(false);
    }
  }, [filters, notify, branchId, result]);

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
              <Button
                onClick={() => void handleBuildFromAttendance()}
                disabled={submitting}
                className="shrink-0"
              >
                Build Wages Data
              </Button>
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

          {result.kind === "wages" && result.rows.length === 0 && (
            <Alert severity="info" sx={{ mb: 2 }}>
              No wages data collected for this period yet. Use{" "}
              <strong>Build Wages Data</strong> to generate it for the selected
              branch from attendance, night shifts, approved holidays and STL
              leave.
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
        <Typography variant="body2">Processing…</Typography>
      </Backdrop>

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
