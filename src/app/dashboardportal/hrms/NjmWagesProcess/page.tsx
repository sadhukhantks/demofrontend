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
  TextField,
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
  downloadNjmReportPdf,
  downloadNjmPayslip,
  exportBankSheet,
  fetchNjmPayPeriod,
  fetchNjmReport,
  fetchPaySchemeList,
  runNjmContractorEsi,
  runNjmProcess,
  runNjmUpdate,
  type NjmReportRow,
} from "@/utils/hrmsService";
import { saveAs } from "file-saver";
import { fetchAttendancePayscheme } from "@/utils/hrmsReportService";
import { sizeColumnsToContent } from "@/components/ui/gridAutoSize";
import { apiRoutesPortalMasters } from "@/utils/api";
import { useRouter } from "next/navigation";
import { exportRowsToExcel } from "@/components/reports/exportExcel";

/**
 * NJM Wages Data Preparation.
 *
 * Ports the "Njm Wages Data Preparation1" modal from the legacy Data-Portal-Php
 * app (`views/modals/ejm_stl_modal.php`, driven from
 * `views/other_data_entry/holiday_att_incn_process.php` -> `Njmwagesprocess`).
 *
 * The Process and Checklist values are the legacy `hol_get` / `hol_get1` codes
 * verbatim so the backend port can dispatch on the same numbers.
 */

/** Legacy `$holget` — "Process/Report/Print For". */
const PROCESS_OPTIONS: Option[] = [
  { label: "Contractor Wages Process", value: "1" },
  { label: "Contractor Wages PayRoll Posting", value: "2" },
  { label: "Contractor Wages Excel for PayRoll", value: "3" },
  { label: "Contractor Wages Pay Register", value: "4" },
  { label: "Main Wages Process", value: "5" },
  { label: "Main Wages PayRoll Posting", value: "6" },
  { label: "Main Wages Excel for PayRoll", value: "7" },
  { label: "Main Wages Pay Register", value: "8" },
  // Legacy 9 printed both slips and picked the layout by pay scheme id; 13 is
  // ours so the screen splits Contractor / Main like every other action.
  { label: "Contractor Wages Pay Slip", value: "9" },
  { label: "Main Wages Pay Slip", value: "13" },
  { label: "Bank Statements", value: "10" },
  { label: "All Wages Break Up Summary", value: "11" },
  { label: "Contractor ESI File Generation", value: "12" },
];

/** Legacy `$holget1` — "Checklist For". Codes 2, 5 and 6 were listed but never
 *  wired in the legacy screen either; they stay so the numbering matches. */
const CHECKLIST_OPTIONS: Option[] = [
  { label: "Attendance With PaySchemes", value: "1" },
  { label: "Wages Checklist", value: "2" },
  { label: "Line Hours Checklist", value: "3" },
  { label: "Production Checklist", value: "4" },
  { label: "No Production Checklist", value: "5" },
  { label: "Leave Not Approved", value: "6" },
  { label: "Food Allowance Details", value: "7" },
  { label: "Advance Details", value: "8" },
  // 9 and 10 are ours: legacy served both off their own download modals
  // rather than this list, but they are checklists like the rest.
  { label: "Canteen Statement", value: "9" },
  { label: "STL Statement", value: "10" },
];

/** Checklists scoped by branch and period alone — meals and STL leave are
 *  recorded per employee, not per pay scheme, so the scheme never narrows
 *  them and an empty one must not block the run. */
const SCHEME_FREE_CHECKLISTS = new Set(["9", "10"]);

/** Contractor Wages Process refuses a period shorter than a wage month
 *  (legacy `desiredDiff`). */
const MIN_PROCESS_DAYS = 28;
const ACTION_CONTRACTOR_WAGES_PROCESS = "1";
/** Legacy `hol_get1` code for the attendance checklist. Shares the number "1"
 *  with Contractor Wages Process — the two lists are independent. */
const CHECKLIST_ATT_PAYSCHEME = "1";

/** Pay slips (Njmwagesprocess::njmcntwagespayslip), printed HERE, on this
 *  screen — never by sending the operator to Pay Register: Contractor as the
 *  legacy FPDF two-up PDF, Main as the dot-matrix .txt. The backend resolves
 *  the pay period from the period + scheme. */
const PAYSLIPS: Record<string, { kind: "contractor" | "main"; fmt: "pdf" | "txt" }> = {
  "9": { kind: "contractor", fmt: "pdf" },
  "13": { kind: "main", fmt: "txt" },
};
/** Legacy `hol_get` codes backed by a pay period. All three resolve the screen's
 *  period + scheme to a payperiod_id first; they differ in what they do next. */
const PAY_PERIOD_DOWNLOADS: Record<
  string,
  { file: string; ext: string; get: (coId: string, id: number) => Promise<Blob> }
> = {
  "10": { file: "BankStatement", ext: "xlsx", get: (coId, id) => exportBankSheet(coId, id) },
};
// The register is an interactive screen, not a printout, so these two still open it.
const PAY_PERIOD_OPENS_REGISTER = new Set(["4", "8"]);
/** Contractor Wages Excel for PayRoll. */
const ACTION_CNT_WAGES_EXPORT = "3";
/** Write actions that build or post data rather than returning a grid. */
const ACTION_CNT_WAGES_PROCESS = "1";
const ACTION_MAIN_WAGES_PROCESS = "5";
const ACTION_CNT_PAYROLL_POSTING = "2";
const ACTION_MAIN_PAYROLL_POSTING = "6";
/** The ESI return needs the portal's template uploaded, so it runs from the
 *  Updates dialog set rather than the plain Action button. */
const UPDATE_CONTRACTOR_ESI = "contractorEsiFileGeneration";

const num = (field: string, headerName: string, width = 120): GridColDef => ({
  field, headerName, width, type: "number",
});


const ATT_PAYSCHEME_COLUMNS: GridColDef[] = [
  { field: "emp_code", headerName: "EB No", width: 100 },
  { field: "emp_name", headerName: "Employee", width: 200 },
  { field: "department", headerName: "Department", width: 170 },
  { field: "sub_department", headerName: "Sub Dept", width: 150 },
  { field: "category", headerName: "Category", width: 130 },
  { field: "status_name", headerName: "Status", width: 110 },
  { field: "pay_scheme", headerName: "Pay Scheme", width: 180 },
  { field: "work_hours", headerName: "Work Hrs", width: 110, type: "number" },
  { field: "date_of_join", headerName: "DOJ", width: 120 },
  { field: "pf_uan_no", headerName: "PF UAN", width: 150 },
  { field: "esi_no", headerName: "ESI No", width: 130 },
];

const LINE_HOURS_COLUMNS: GridColDef[] = [
  { field: "line_no", headerName: "Line No", width: 100 },
  { field: "sard_helper", headerName: "Sardar/Helper", width: 130 },
  { field: "wgroup", headerName: "Wage Group", width: 130 },
  num("running_hours", "Running Hrs"),
  num("lost_hours", "Lost Hrs"),
  num("no_of_looms", "No of Looms", 130),
  num("quantity", "Quantity"),
  num("pamount", "Amount"),
  // Per-loom-hour rate the legacy statement derived (sardars at 1.3x).
  num("rate", "Rate", 130),
];

const PRODUCTION_COLUMNS: GridColDef[] = [
  { field: "emp_code", headerName: "EB No", width: 100 },
  { field: "master_department", headerName: "Master Department", width: 180 },
  { field: "qualcode", headerName: "Quality Code", width: 130 },
  { field: "quality", headerName: "Quality", width: 200 },
  num("qual_rate", "Rate"),
  num("production", "Production"),
  num("act_prod_amount", "Prod Amount", 140),
];

// Headers keep the legacy sheet's column names verbatim.
const FOOD_ALLOWANCE_COLUMNS: GridColDef[] = [
  { field: "sno", headerName: "sno", width: 80 },
  { field: "ticket_no", headerName: "TICKET_NO", width: 110 },
  { field: "emp_name", headerName: "empname", width: 200 },
  num("da_rate", "da_rate"),
  num("fa_rate", "fa_rate"),
  num("fa_days", "fa_days"),
  num("amount", "AMOUNT"),
];

const ADVANCE_COLUMNS: GridColDef[] = [
  { field: "esi_no", headerName: "ESI No", width: 130 },
  { field: "emp_code", headerName: "EB No", width: 100 },
  { field: "empname", headerName: "Employee", width: 200 },
  { field: "advance_date", headerName: "Advance Date", width: 130 },
  num("advance_amount", "Advance", 120),
  num("installment_amount", "Installment", 130),
  num("adj_amount", "Adjustment", 130),
  { field: "date_from", headerName: "Period From", width: 130 },
  num("ded_amount", "Deducted", 120),
  num("cumulative_ded", "Cumulative", 130),
  num("balamt", "Balance", 120),
];

// Both statements are day-wise: their columns depend on the period, so they
// arrive with the data instead of being fixed here.

// Headers are the payroll-upload column names, exactly as legacy's sheet had
// them — the file is uploaded as-is, so the names are the contract.
const CNT_WAGES_EXPORT_COLUMNS: GridColDef[] = [
  { field: "emp_code", headerName: "Employee Id", width: 110 },
  { field: "emp_name", headerName: "Employee_Name", width: 200 },
  { field: "pay_scheme", headerName: "PayScheme", width: 170 },
  num("c_working_days", "C_WORKING_DAYS_", 150),
  num("c_pwage_amt", "C_Pwage_amt_", 140),
  num("c_exadvance", "C_exadvance_", 140),
  num("c_arramtplus", "C_ARRAMTPLUS_", 150),
  num("c_arramtminus", "C_ARRAMTMINUS_", 150),
  num("c_rate1otdays", "C_RATE1OTDAYS_", 150),
  num("c_rate2otdays", "C_RATE2OTDAYS_", 150),
  num("c_rate1regdays", "C_RATE1REGDAYS_", 160),
  num("c_rate2regdays", "C_RATE2REGDAYS_", 160),
  num("c_canteen", "C_canteen_", 120),
  num("c_esi_days", "C_esi_days_", 120),
];

const BREAKUP_COLUMNS: GridColDef[] = [
  { field: "ticket_no", headerName: "Ticket No", width: 110 },
  { field: "emp_name", headerName: "Employee", width: 190 },
  { field: "payscheme_name", headerName: "Pay Scheme", width: 170 },
  num("gross_earn", "Gross Earn", 130),
  num("pf", "PF", 100), num("esi", "ESI", 100), num("p_tax", "P.Tax", 100),
  num("rent", "Rent", 100), num("land_rent", "Land Rent", 120),
  num("advance", "Advance", 110), num("rsd", "RSD", 100),
  num("canteen", "Canteen", 110), num("net", "Net", 110),
  num("death", "Death", 100), num("net_pay", "Net Pay", 120),
  num("employer_pf", "Employer PF", 140),
  num("employer_esi", "Employer ESI", 140),
  { field: "bank_acc_no", headerName: "Bank A/C", width: 150 },
  { field: "ifsc_code", headerName: "IFSC", width: 120 },
];

const ESI_COLUMNS: GridColDef[] = [
  { field: "ip_number", headerName: "IP Number", width: 140 },
  { field: "ip_name", headerName: "IP Name", width: 200 },
  { field: "emp_code", headerName: "EB No", width: 110 },
  num("no_of_days", "No of Days", 130),
  num("total_wages", "Total Wages", 140),
  num("reason_code", "Reason Code", 140),
  { field: "last_working_day", headerName: "Last Working Day", width: 160 },
];

const EMPTY_OPTIONS = Object.freeze([]) as unknown as Option[];

/** The legacy modal's Cad/Vard/GWF row and its four wage-period file uploads.
 *  They are one select here instead of six scattered controls; picking an entry
 *  opens the same inputs in a dialog. Values are the legacy handler names so the
 *  backend port can be dropped in per entry. */
const UPDATE_OPTIONS: Option[] = [
  { label: "Cad/Vard/GWF", value: "njmwrkvardupdate" },
  { label: "Contractor Upload File", value: "cntexlupload" },
  { label: "Upload FA File", value: "njmwrkfauploadjs" },
  { label: "Upload Other/Adjs File", value: "njmwrkothadjsuploadjs" },
  { label: "Upload Line Hours", value: "wrklinehoursupload" },
  // Contractor ESI takes the ESI portal's template as its input file.
  { label: "Contractor ESI File", value: UPDATE_CONTRACTOR_ESI },
];

/** Only Cad/Vard/GWF takes typed amounts; the other four take a file. */
const UPDATE_CADVARD = "njmwrkvardupdate";

/** Cad/Vard/GWF deduction inputs, in the order the legacy modal showed them. */
const DED_FIELDS = [
  { name: "cad_ded", label: "Cad Ded" },
  { name: "vard_ded", label: "Vard Ded" },
  { name: "gwf_ded", label: "GWF Ded" },
] as const;

type DedValues = Record<(typeof DED_FIELDS)[number]["name"], string>;

const INITIAL_DEDS: DedValues = { cad_ded: "0", vard_ded: "0", gwf_ded: "0" };

interface FilterValues {
  date_from: string;
  date_to: string;
  update_for: string;
  pay_scheme_id: string;
  action: string;
  checklist: string;
}

const INITIAL_FILTERS: FilterValues = {
  date_from: "",
  date_to: "",
  update_for: "",
  pay_scheme_id: "",
  action: "",
  checklist: "",
};

/** Shared by both buttons — the legacy screen validated the same three things
 *  before every action; only the selected code differs. */
const baseSchema = z
  .object({
    date_from: z.string().min(1, "Please select the From Date"),
    date_to: z.string().min(1, "Please select the To Date"),
    pay_scheme_id: z.string().min(1, "Please select the Pay Scheme"),
  })
  .refine((v) => v.date_to >= v.date_from, {
    message: "To Date cannot be earlier than From Date",
    path: ["date_to"],
  });

/** Last day of the month a YYYY-MM-DD date falls in.
 *  Day 0 of the next month is the last day of this one, and the Date is built
 *  from parts so a UTC/local shift can never roll it into a neighbouring month. */
const monthEndIso = (iso: string): string | null => {
  const [y, m] = iso.split("-").map(Number);
  if (!y || !m) return null;
  const end = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(end).padStart(2, "0")}`;
};

/** Inclusive day count, matching the legacy `diffDays` calculation. */
const dayCount = (from: string, to: string) =>
  Math.ceil(
    (new Date(to).getTime() - new Date(from).getTime()) / (1000 * 3600 * 24),
  ) + 1;

export default function NjmWagesProcessPage() {
  const { coId } = useSelectedCompanyCoId();
  // Every action here processes one branch's data — the legacy screen used the
  // logged-in company, this uses the sidebar branch selection.
  const { selectedBranches, selectedCompany } = useSidebarContext();
  const branchId = selectedBranches.length > 0 ? selectedBranches[0] : undefined;
  const formRef = useRef<MuiFormHandle>(null);
  // onValuesChange fires with the whole form on every keystroke, so the last
  // From Date is tracked to tell a real change from a re-render.
  const lastFromRef = useRef<string>("");
  const router = useRouter();

  const [filters, setFilters] = useState<FilterValues>(INITIAL_FILTERS);
  const [paySchemes, setPaySchemes] = useState<Option[]>(EMPTY_OPTIONS);
  // null = no dialog; otherwise the UPDATE_OPTIONS value being run.
  const [updateFor, setUpdateFor] = useState<string | null>(null);
  const [deds, setDeds] = useState<DedValues>(INITIAL_DEDS);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // null = nothing run yet (grid hidden); rows [] = ran, found nothing.
  const [report, setReport] = useState<
    { title: string; columns: GridColDef[]; rows: NjmReportRow[] } | null
  >(null);
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
    lastFromRef.current = today;
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
          // Active(1) and Locked(32) only — a deactivated scheme can't be run.
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
        { name: "update_for", label: "Updates", type: "select", options: UPDATE_OPTIONS, grid: { xs: 12, sm: 6, md: 3 } },
        { name: "action", label: "Process/Report/Print For", type: "select", options: PROCESS_OPTIONS, grid: { xs: 12, md: 6 } },
        { name: "checklist", label: "Checklist For", type: "select", options: CHECKLIST_OPTIONS, grid: { xs: 12, md: 6 } },
      ] satisfies Field[],
    }),
    [paySchemes],
  );

  const handleValuesChange = useCallback((vals: Record<string, unknown>) => {
    setFilters((prev) => ({ ...prev, ...(vals as Partial<FilterValues>) }));

    // A wage period runs to the end of the month, so picking the From Date
    // fills the To Date in. It is only a default — the operator can still type
    // a shorter period over it afterwards.
    const from = vals.date_from;
    if (typeof from === "string" && from && from !== lastFromRef.current) {
      lastFromRef.current = from;
      const end = monthEndIso(from);
      if (end) formRef.current?.setValue("date_to", end);
    }

    const picked = vals.update_for;
    if (typeof picked === "string" && picked) {
      setDeds(INITIAL_DEDS);
      setFile(null);
      setUpdateFor(picked);
      // Clear the select so picking the same entry again reopens the dialog.
      // The empty value is falsy, so this callback re-entering is harmless.
      formRef.current?.setValue("update_for", "");
    }
  }, []);

  /** Validate the shared header plus the picked code, then hand off to the
   *  backend. Both buttons funnel through here — they differ only in which
   *  select supplies the code. */
  const run = useCallback(
    async (kind: "process" | "checklist") => {
      const isChecklist = kind === "checklist";
      const code = isChecklist ? filters.checklist : filters.action;
      const options = isChecklist ? CHECKLIST_OPTIONS : PROCESS_OPTIONS;

      // The placeholder only satisfies the shared schema — neither of these
      // two sends a pay scheme.
      const schemeFree = isChecklist && SCHEME_FREE_CHECKLISTS.has(code);
      const parsed = baseSchema.safeParse(
        schemeFree && !filters.pay_scheme_id
          ? { ...filters, pay_scheme_id: "-" }
          : filters,
      );
      if (!parsed.success) {
        notify(parsed.error.issues[0]?.message ?? "Invalid selection", "error");
        return;
      }
      if (!code) {
        notify(`Please select a ${kind}`, "error");
        return;
      }
      if (branchId == null) {
        notify("Select a branch in the sidebar before processing", "error");
        return;
      }
      // Guard on !isChecklist: the checklist list reuses the code "1" for
      // Attendance With PaySchemes, which has no minimum period.
      if (
        !isChecklist &&
        code === ACTION_CONTRACTOR_WAGES_PROCESS &&
        dayCount(parsed.data.date_from, parsed.data.date_to) < MIN_PROCESS_DAYS
      ) {
        notify(
          `Contractor Wages Process needs a period of at least ${MIN_PROCESS_DAYS} days`,
          "error",
        );
        return;
      }

      const label = options.find((o) => o.value === code)?.label ?? code;
      const { date_from: dateFrom, date_to: dateTo, pay_scheme_id: scheme } =
        parsed.data;

      setSubmitting(true);
      // A stale grid under a different selection's result would mislead.
      setReport(null);
      try {
        // Attendance With PaySchemes — the one report that takes every
        // selected scheme at once.
        if (isChecklist && code === CHECKLIST_ATT_PAYSCHEME) {
          const rows = await fetchAttendancePayscheme({
            branchId,
            dateFrom,
            dateTo,
            paySchemeId: scheme,
          });
          setReport({ title: label, columns: ATT_PAYSCHEME_COLUMNS, rows });
          if (rows.length === 0) {
            notify("No attendance found for the selected period and pay schemes", "info");
          }
          return;
        }

        const slip = !isChecklist ? PAYSLIPS[code] : undefined;
        if (slip) {
          if (!coId) {
            notify("Select a company in the sidebar first", "error");
            return;
          }
          const blob = await downloadNjmPayslip({
            ...slip,
            coId: String(coId),
            branchId,
            dateFrom,
            dateTo,
            paySchemeId: scheme,
          });
          saveAs(blob, `payslip.${slip.fmt}`);
          notify(`${label} generated`, "success");
          return;
        }

        // Bank statements and the register hang off a pay period, so resolve
        // that first from the period + scheme on screen.
        const download = !isChecklist ? PAY_PERIOD_DOWNLOADS[code] : undefined;
        if (!isChecklist && (download || PAY_PERIOD_OPENS_REGISTER.has(code))) {
          const { data, error } = await fetchNjmPayPeriod({
            branchId,
            dateFrom,
            dateTo,
            paySchemeId: scheme,
          });
          if (error || !data) {
            notify(error || "Could not find a pay period for this selection", "error");
            return;
          }
          const periodId = data.data.payperiod_id;

          if (download) {
            // Printed here, on this screen — the operator never leaves NJM
            // Wages Process to get a pay slip.
            if (!coId) {
              notify("Select a company in the sidebar first", "error");
              return;
            }
            const blob = await download.get(String(coId), periodId);
            if (!blob || blob.size === 0) {
              notify(`No data to print for "${label}"`, "error");
              return;
            }
            saveAs(blob, `${download.file}_${dateFrom}_to_${dateTo}.${download.ext}`);
            notify(`${label} generated`, "success");
            return;
          }

          notify(`Opening Pay Register for ${data.data.payscheme_name ?? label}`, "success");
          router.push(
            `/dashboardportal/hrms/payRegister/viewPayRegister?id=${periodId}`,
          );
          return;
        }

        // Build / post actions: these write, so they report a count rather
        // than filling the grid.
        if (!isChecklist && code === ACTION_CNT_WAGES_PROCESS) {
          const { data, error } = await runNjmProcess(
            apiRoutesPortalMasters.NJM_CNT_WAGES_PROCESS,
            { branch_id: branchId, date_from: dateFrom, date_to: dateTo },
          );
          if (error || !data) {
            notify(error || `"${label}" failed`, "error");
            return;
          }
          notify(data.data.message, "success");
          return;
        }

        // Main Wages Process builds per pay scheme, so it needs exactly one.
        if (!isChecklist && code === ACTION_MAIN_WAGES_PROCESS) {
          const { data, error } = await runNjmProcess(
            apiRoutesPortalMasters.NJM_WAGES_PROCESS,
            {
              branch_id: branchId,
              date_from: dateFrom,
              date_to: dateTo,
              pay_scheme_id: scheme,
            },
          );
          if (error || !data) {
            notify(error || `"${label}" failed`, "error");
            return;
          }
          notify(data.data.message, "success");
          return;
        }

        if (!isChecklist &&
            (code === ACTION_CNT_PAYROLL_POSTING || code === ACTION_MAIN_PAYROLL_POSTING)) {
          const { data, error } = await runNjmProcess(
            apiRoutesPortalMasters.NJM_PAYROLL_POSTING,
            {
              branch_id: branchId,
              date_from: dateFrom,
              date_to: dateTo,
              pay_scheme_id: scheme,
              source: code === ACTION_CNT_PAYROLL_POSTING ? "contractor" : "main",
            },
          );
          if (error || !data) {
            notify(error || `"${label}" failed`, "error");
            return;
          }
          notify(data.data.message, "success");
          return;
        }

        // The remaining wired reports: one GET each, straight into the grid.
        const wired: Record<string, {
          url: string;
          columns: GridColDef[];
          params: Record<string, string | number | undefined>;
          /** Save the sheet as soon as it arrives, as legacy did. */
          download?: string;
          /** Field the saved sheet breaks pages on, repeating the header. */
          groupBy?: string;
          /** Same endpoint with `fmt=pdf`: the legacy PDF statement, saved on
           *  arrival alongside the grid. */
          pdf?: string;
        }> = isChecklist
          ? {
              // Legacy njmlinehrschecklist: grid here, LINE HOURS STATEMENT PDF saved.
              "3": {
                url: apiRoutesPortalMasters.NJM_LINE_HOURS_CHECKLIST,
                columns: LINE_HOURS_COLUMNS,
                params: { date_from: dateFrom, date_to: dateTo },
                pdf: `line-hours-statement-${dateFrom}-to-${dateTo}`,
              },
              "4": {
                url: apiRoutesPortalMasters.NJM_PRODUCTION_CHECKLIST,
                columns: PRODUCTION_COLUMNS,
                params: {
                  date_from: dateFrom,
                  date_to: dateTo,
                  pay_scheme_id: scheme,
                },
                    },
              "7": {
                url: apiRoutesPortalMasters.NJM_FOOD_ALLOWANCE_DETAILS,
                columns: FOOD_ALLOWANCE_COLUMNS,
                params: { branch_id: branchId, date_from: dateFrom, date_to: dateTo },
              },
              // Advances span wage periods, so this one takes no period at all.
              "8": {
                url: apiRoutesPortalMasters.NJM_ADVANCE_DETAILS,
                columns: ADVANCE_COLUMNS,
                params: {},
              },
              // Day columns come back with the data — the period decides them.
              "9": {
                url: apiRoutesPortalMasters.NJM_CANTEEN_STATEMENT,
                columns: [],
                params: { branch_id: branchId, date_from: dateFrom, date_to: dateTo },
                download: `canteen-statement-${dateFrom}-to-${dateTo}`,
                groupBy: "dept_desc",
              },
              "10": {
                url: apiRoutesPortalMasters.NJM_STL_STATEMENT,
                columns: [],
                params: { branch_id: branchId, date_from: dateFrom, date_to: dateTo },
                download: `stl-statement-${dateFrom}-to-${dateTo}`,
                groupBy: "dept_desc",
              },
            }
          : {
              [ACTION_CNT_WAGES_EXPORT]: {
                url: apiRoutesPortalMasters.NJM_CNT_WAGES_EXPORT,
                columns: CNT_WAGES_EXPORT_COLUMNS,
                params: {
                  branch_id: branchId,
                  date_from: dateFrom,
                  date_to: dateTo,
                  pay_scheme_id: scheme,
                },
                download: `contractor-wages-payroll-${dateFrom}-to-${dateTo}`,
              },
              // Main Wages Excel — columns come from the scheme's payroll map,
              // headed by pay component codes, and the sheet saves on arrival
              // like the contractor one.
              "7": {
                url: apiRoutesPortalMasters.NJM_WAGES_EXPORT,
                columns: [],
                params: {
                  date_from: dateFrom,
                  date_to: dateTo,
                  pay_scheme_id: scheme,
                },
                download: `main-wages-payroll-${dateFrom}-to-${dateTo}`,
              },
              "11": {
                url: apiRoutesPortalMasters.NJM_WAGES_BREAKUP_SUMMARY,
                columns: BREAKUP_COLUMNS,
                params: {
                  date_from: dateFrom,
                  date_to: dateTo,
                  pay_scheme_id: scheme,
                },
              },
            };

        const target = wired[code];
        if (target) {
          const { data, error } = await fetchNjmReport(target.url, target.params);
          if (error || !data) {
            notify(error || `"${label}" failed`, "error");
            return;
          }
          // Main Wages Excel's columns are whatever the scheme maps, so they
          // come back with the data instead of being fixed here.
          // No widths on the dynamic set: sizeColumnsToContent only sizes the
          // columns a page has not pinned, and a fixed width would waste half
          // the screen on the canteen statement's thirty-odd day columns.
          const columns = target.columns.length
            ? target.columns
            : sizeColumnsToContent<NjmReportRow>(
                [
                  { field: "emp_code", headerName: "EB No" },
                  { field: "emp_name", headerName: "Employee" },
                  // A backend-supplied list can carry a label column (the
                  // canteen statement leads with the department), so only the
                  // numeric ones get the numeric treatment.
                  ...(data.columns ?? []).map((c) =>
                    typeof data.data[0]?.[c] === "number"
                      ? { field: c, headerName: c, type: "number" as const }
                      : { field: c, headerName: c },
                  ),
                ],
                data.data,
              );
          // sno is a plain row field so the Excel export picks it up too.
          setReport({ title: label, columns, rows: data.data.map((r, i) => ({ ...r, sno: i + 1 })) });
          if (data.data.length === 0) {
            notify(`No rows for "${label}"`, "info");
            return;
          }
          // Plain sheet — header row then data, no report banner — so it
          // uploads to payroll unchanged. The statements break per department
          // instead, each on its own page under a repeated header.
          if (target.download) {
            void exportRowsToExcel(
              columns, data.data, target.download, undefined, target.groupBy,
            );
          }
          if (target.pdf) {
            const blob = await downloadNjmReportPdf(target.url, {
              ...target.params,
              co_id: coId ? String(coId) : undefined,
            });
            saveAs(blob, `${target.pdf}.pdf`);
          }
          return;
        }

        // Every legacy code is wired above; only an unknown one lands here.
        notify(`"${label}" is not wired to the backend yet`, "info");
      } catch (err) {
        notify(err instanceof Error ? err.message : `Failed to run "${label}"`, "error");
      } finally {
        setSubmitting(false);
      }
    },
    [filters, branchId, coId, notify, router],
  );

  /** Submit whichever Updates dialog is open. Every legacy handler demanded the
   *  same header — a period and a pay scheme — before it would accept anything,
   *  and the uploads additionally need a file. */
  const runUpdate = useCallback(async () => {
    if (!updateFor) return;
    const parsed = baseSchema.safeParse(filters);
    if (!parsed.success) {
      notify(parsed.error.issues[0]?.message ?? "Invalid selection", "error");
      return;
    }
    if (branchId == null) {
      notify("Select a branch in the sidebar before processing", "error");
      return;
    }
    const isFileUpload = updateFor !== UPDATE_CADVARD;
    if (isFileUpload && !file) {
      notify("Please choose a file first", "error");
      return;
    }
    const label = UPDATE_OPTIONS.find((o) => o.value === updateFor)?.label ?? updateFor;

    setSubmitting(true);
    try {
      const { data, error } = await runNjmUpdate(
        updateFor,
        {
          branchId,
          dateFrom: parsed.data.date_from,
          dateTo: parsed.data.date_to,
          paySchemeId: parsed.data.pay_scheme_id,
        },
        isFileUpload ? { file } : { deds },
      );
      if (error || !data) {
        notify(error || `"${label}" failed`, "error");
        return;
      }
      notify(data.data.message, "success");
      setUpdateFor(null);
    } finally {
      setSubmitting(false);
    }
  }, [updateFor, filters, branchId, file, deds, notify]);

  return (
    // Same page shell as the other HRMS pages (EJM wages process, payroll).
    <Box className="flex min-h-screen flex-col gap-6 bg-gray-50 p-8">
      <Box className="flex flex-col gap-1">
        <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
          NJM Wages Data Preparation
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Select the wage period and pay schemes, then run an update, a process
          or a checklist
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
        <Box sx={{ display: "flex", gap: 2, mt: 2 }}>
          <Button
            onClick={() => void run("process")}
            disabled={submitting}
          >
            {submitting ? "Processing..." : "Process"}
          </Button>
          <Button
            variant="outline"
            onClick={() => void run("checklist")}
            disabled={submitting}
          >
            Checklist
          </Button>
        </Box>
      </Paper>

      {report !== null && (
        <Paper className="p-2">
          <Box
            sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", p: 1 }}
          >
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {report.title} ({report.rows.length})
            </Typography>
            <Button
              variant="outline"
              disabled={report.rows.length === 0}
              onClick={() =>
                void exportRowsToExcel(
                  report.columns,
                  report.rows,
                  report.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
                  {
                    companyName: selectedCompany?.co_name,
                    branchName: selectedCompany?.branches.find(
                      (b) => b.branch_id === branchId,
                    )?.branch_name,
                    reportName: report.title,
                    reportFor: `${filters.date_from} To ${filters.date_to}`,
                  },
                )
              }
            >
              Export to Excel
            </Button>
          </Box>
          <DataGrid
            rows={report.rows}
            columns={report.columns}
            density="compact"
            autoHeight
            disableRowSelectionOnClick
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
            pageSizeOptions={[25, 50, 100]}
          />
        </Paper>
      )}

      <Alert severity="info">
        Live: every Updates action, Contractor Wages Process (attendance,
        piece production + canteen), Main Wages Process (attendance, advance,
        leave, beaming, winding, finishing and weaving piece wages, loom line
        pools and sardar/helper), both payroll postings, both payroll exports,
        the break-up summary, the Contractor ESI file, and all five checklists.
        Contractor (PDF) and Main (dot-matrix text) Wages Pay Slips and Bank
        Statements download from this screen; Pay Register opens the register. Piece wages price through the Production
        Quality to Wages Quality link; an unlinked quality earns nothing.
      </Alert>

      {/* One dialog for all five Updates entries — Cad/Vard/GWF types three
          amounts, the other four pick a file. Same shape as the legacy modal's
          row of inputs, just gathered behind the select. */}
      <Dialog
        open={updateFor !== null}
        onClose={() => setUpdateFor(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>
          {UPDATE_OPTIONS.find((o) => o.value === updateFor)?.label ?? ""}
        </DialogTitle>
        <DialogContent>
          {updateFor === UPDATE_CADVARD ? (
            <Box sx={{ display: "flex", gap: 2, pt: 1 }}>
              {DED_FIELDS.map((f) => (
                <TextField
                  key={f.name}
                  label={f.label}
                  type="number"
                  size="small"
                  value={deds[f.name]}
                  onChange={(e) =>
                    setDeds((prev) => ({ ...prev, [f.name]: e.target.value }))
                  }
                  fullWidth
                />
              ))}
            </Box>
          ) : (
            <Box sx={{ pt: 1 }}>
              <TextField
                type="file"
                size="small"
                fullWidth
                // Legacy accepted the wage-period workbook only.
                slotProps={{ htmlInput: { accept: ".xls,.xlsx,.csv" } }}
                onChange={(e) =>
                  setFile(
                    (e.target as HTMLInputElement).files?.[0] ?? null,
                  )
                }
              />
              {file && (
                <Typography variant="caption" color="text.secondary">
                  {file.name}
                </Typography>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button variant="outline" onClick={() => setUpdateFor(null)}>
            Close
          </Button>
          <Button onClick={() => void runUpdate()} disabled={submitting}>
            {updateFor === UPDATE_CADVARD ? "Update" : "Upload"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* A wages run walks a whole month of attendance, so the wait is long
          enough to need a blocking spinner — the legacy screen did the same
          (showSpinnerCounter). It also stops a second run landing mid-process. */}
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
