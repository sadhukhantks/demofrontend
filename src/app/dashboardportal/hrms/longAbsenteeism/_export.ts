/**
 * Excel exports of the Long Absenteeism page, through the shared
 * exportRowsToExcel (src/components/reports/exportExcel.ts: blue header band,
 * Company / Branch / Report No header block).
 *
 *  - the watchlist, in the Personnel office's "Long Absent Report" column
 *    order (spec section 8), then the extra columns named in Settings;
 *  - the dispatch register (Dispatch tab);
 *  - the struck-off register (Reports tab).
 *
 * exportRowsToExcel reads `row[column.field]` as is, so every row is flattened
 * here first: dates as DD-MM-YYYY strings, counts as numbers. The column /
 * row builders are pure and covered by _export.test.ts.
 */

import type { GridColDef } from "@mui/x-data-grid";
import { exportRowsToExcel, type ReportExportHeader } from "@/components/reports/exportExcel";
import { fmtDate } from "@/components/lowPerformerFollowup/schemas";
import type { LaDispatchRow, LaListRow, LaRegisterRow, LaSetup } from "@/utils/longAbsenteeismService";
import { extraColumns, labelOf } from "./_utils";
import { dispatchStageText } from "./_tabsUtils";

/** One flattened sheet row. */
export type ExportRow = Record<string, string | number>;

interface SheetColumn {
  field: string;
  headerName: string;
  numeric?: boolean;
}

function toGridColumns(cols: ReadonlyArray<SheetColumn>): GridColDef<ExportRow>[] {
  return cols.map((c) => ({ field: c.field, headerName: c.headerName, type: c.numeric ? "number" : "string" }));
}

// ─── Watchlist ("Long Absent Report") ────────────────────────────────

export const WATCHLIST_FILE_PREFIX = "long-absent-report";
export const WATCHLIST_REPORT_NAME = "Long Absent Report";

/** The sheet's own columns, in the office's order (the extra columns follow). */
export const WATCHLIST_BASE_COLUMNS: ReadonlyArray<SheetColumn> = Object.freeze([
  { field: "sl_no", headerName: "SL NO", numeric: true },
  { field: "eb_no", headerName: "EB No" },
  { field: "name", headerName: "Name" },
  { field: "dept", headerName: "DEPT" },
  { field: "occupation", headerName: "Occupation" },
  { field: "last_working", headerName: "Last Working/Leave Date" },
  { field: "absent_days", headerName: "Absent Days", numeric: true },
  { field: "w1_date", headerName: "1ST LETTER" },
  { field: "w1_sent", headerName: "1ST SENT" },
  { field: "w2_date", headerName: "2ND LETTER" },
  { field: "w2_sent", headerName: "2ND SENT" },
  { field: "w3_date", headerName: "3rd & Last Warning Letter" },
  { field: "w3_sent", headerName: "3RD SENT" },
  { field: "show_cause", headerName: "SHOW CAUSE" },
  { field: "notice", headerName: "NOTICE FOR STRUCK OFF" },
  { field: "struck_off", headerName: "STRUCK OFF" },
  { field: "remarks", headerName: "REMARKS" },
  { field: "report", headerName: "REPORT" },
]);

/** The base columns + one per extra column whose label is set in Settings (header = the label). */
export function watchlistExportColumns(setup: Pick<LaSetup, "rule"> | null | undefined): GridColDef<ExportRow>[] {
  return toGridColumns([
    ...WATCHLIST_BASE_COLUMNS,
    ...extraColumns(setup?.rule).map((c) => ({ field: c.key, headerName: c.label })),
  ]);
}

/** REPORT cell: the exit reason of a closed case, else Parked / Open. */
export function reportCell(
  row: Pick<LaListRow, "status" | "status_label" | "exit_reason" | "exit_reason_label">,
  setup: Pick<LaSetup, "all_exit_reasons"> | null | undefined,
): string {
  if (row.status === 0) {
    return row.exit_reason_label || labelOf(setup?.all_exit_reasons, row.exit_reason) || row.status_label || "Closed";
  }
  if (row.status === 2) return row.status_label || "Parked";
  return row.status_label || "Open";
}

/** The watchlist rows as sheet rows (SL NO from 1, in the order shown). */
export function watchlistExportRows(
  rows: ReadonlyArray<LaListRow>,
  setup: Pick<LaSetup, "rule" | "all_exit_reasons"> | null | undefined,
): ExportRow[] {
  const extras = extraColumns(setup?.rule);
  return rows.map((r, i) => {
    const out: ExportRow = {
      id: r.case_id,
      sl_no: i + 1,
      eb_no: r.emp_code ?? String(r.eb_id),
      name: r.emp_name ?? "",
      dept: r.dept_desc ?? "",
      occupation: r.designation ?? "",
      last_working: fmtDate(r.last_working_date),
      absent_days: r.absent_days,
      w1_date: fmtDate(r.w1_date),
      w1_sent: fmtDate(r.w1_sent),
      w2_date: fmtDate(r.w2_date),
      w2_sent: fmtDate(r.w2_sent),
      w3_date: fmtDate(r.w3_date),
      w3_sent: fmtDate(r.w3_sent),
      show_cause: fmtDate(r.sc_date),
      notice: fmtDate(r.gn_date),
      struck_off: fmtDate(r.struck_off_date),
      remarks: r.remarks ?? "",
      report: reportCell(r, setup),
    };
    for (const c of extras) out[c.key] = r[c.key] ?? "";
    return out;
  });
}

/** Writes the watchlist workbook (`long-absent-report-<ts>.xlsx`). */
export async function exportWatchlistToExcel(
  rows: ReadonlyArray<LaListRow>,
  setup: Pick<LaSetup, "rule" | "all_exit_reasons"> | null | undefined,
  header: ReportExportHeader,
): Promise<void> {
  await exportRowsToExcel(
    watchlistExportColumns(setup),
    watchlistExportRows(rows, setup),
    WATCHLIST_FILE_PREFIX,
    header,
  );
}

// ─── Dispatch register ───────────────────────────────────────────────

export const DISPATCH_FILE_PREFIX = "long-absent-dispatch";
export const DISPATCH_REPORT_NAME = "Long Absenteeism Dispatch Register";

export const DISPATCH_EXPORT_COLUMNS: ReadonlyArray<SheetColumn> = Object.freeze([
  { field: "sl_no", headerName: "SL NO", numeric: true },
  { field: "batch_ref", headerName: "Batch" },
  { field: "case_no", headerName: "Case No" },
  { field: "eb_no", headerName: "EB No" },
  { field: "name", headerName: "Name" },
  { field: "dept", headerName: "Dept" },
  { field: "address", headerName: "Address" },
  { field: "stage", headerName: "Letter" },
  { field: "issue_date", headerName: "Issue Date" },
  { field: "sent_date", headerName: "Sent Date" },
  { field: "dispatch_mode", headerName: "Dispatch Mode" },
  { field: "ad_no", headerName: "A.D. No" },
  { field: "delivery_status", headerName: "Delivery Status" },
  { field: "delivery_date", headerName: "Delivery Date" },
]);

export function dispatchExportRows(rows: ReadonlyArray<LaDispatchRow>): ExportRow[] {
  return rows.map((r, i) => ({
    id: r.letter_id,
    sl_no: i + 1,
    batch_ref: r.batch_ref ?? "",
    case_no: r.case_no ?? "",
    eb_no: r.emp_code ?? "",
    name: r.emp_name ?? "",
    dept: r.dept_desc ?? "",
    address: r.address ?? "",
    stage: dispatchStageText(r),
    issue_date: fmtDate(r.issue_date),
    sent_date: fmtDate(r.sent_date),
    dispatch_mode: r.dispatch_mode_label ?? r.dispatch_mode ?? "",
    ad_no: r.ad_no ?? "",
    delivery_status: r.delivery_status_label ?? r.delivery_status ?? "",
    delivery_date: fmtDate(r.delivery_date),
  }));
}

export async function exportDispatchToExcel(
  rows: ReadonlyArray<LaDispatchRow>,
  header: ReportExportHeader,
): Promise<void> {
  await exportRowsToExcel(toGridColumns(DISPATCH_EXPORT_COLUMNS), dispatchExportRows(rows), DISPATCH_FILE_PREFIX, header);
}

// ─── Struck-off register ─────────────────────────────────────────────

export const REGISTER_FILE_PREFIX = "long-absent-struck-off-register";
export const REGISTER_REPORT_NAME = "Struck-off Register";

export const REGISTER_EXPORT_COLUMNS: ReadonlyArray<SheetColumn> = Object.freeze([
  { field: "sl_no", headerName: "SL NO", numeric: true },
  { field: "case_no", headerName: "Case No" },
  { field: "eb_no", headerName: "EB No" },
  { field: "name", headerName: "Name" },
  { field: "dept", headerName: "Dept" },
  { field: "designation", headerName: "Designation" },
  { field: "last_working", headerName: "Last Working Date" },
  { field: "w1_date", headerName: "1st Letter" },
  { field: "w1_sent", headerName: "1st Sent" },
  { field: "w2_date", headerName: "2nd Letter" },
  { field: "w2_sent", headerName: "2nd Sent" },
  { field: "w3_date", headerName: "3rd Letter" },
  { field: "w3_sent", headerName: "3rd Sent" },
  { field: "show_cause", headerName: "Show Cause" },
  { field: "gate_notice", headerName: "Gate Notice" },
  { field: "struck_off", headerName: "Struck Off Date" },
  { field: "remarks", headerName: "Remarks" },
]);

export function registerExportRows(rows: ReadonlyArray<LaRegisterRow>): ExportRow[] {
  return rows.map((r, i) => ({
    id: r.case_id ?? i,
    sl_no: i + 1,
    case_no: r.case_no ?? "",
    eb_no: r.emp_code ?? "",
    name: r.emp_name ?? "",
    dept: r.dept_desc ?? "",
    designation: r.designation ?? "",
    last_working: fmtDate(r.last_working_date),
    w1_date: fmtDate(r.warning1_date),
    w1_sent: fmtDate(r.warning1_sent),
    w2_date: fmtDate(r.warning2_date),
    w2_sent: fmtDate(r.warning2_sent),
    w3_date: fmtDate(r.warning3_date),
    w3_sent: fmtDate(r.warning3_sent),
    show_cause: fmtDate(r.show_cause_date),
    gate_notice: fmtDate(r.gate_notice_date),
    struck_off: fmtDate(r.struck_off_date),
    remarks: r.remarks ?? "",
  }));
}

export async function exportRegisterToExcel(
  rows: ReadonlyArray<LaRegisterRow>,
  header: ReportExportHeader,
): Promise<void> {
  await exportRowsToExcel(toGridColumns(REGISTER_EXPORT_COLUMNS), registerExportRows(rows), REGISTER_FILE_PREFIX, header);
}
