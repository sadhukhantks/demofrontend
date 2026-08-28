/**
 * Service layer for the Jute Gain/Loss Sheet (monthly manual statement).
 *
 * Backend: /api/juteGainLoss (vowerp3be src/juteProduction/gain_loss.py).
 * One manually-entered sheet per (co, branch, month) renders three statements
 * — FNG (packed production), WVG (weaving production), WDG (winding→weaving
 * difference). Figure rows and process-stock departments come from tenant
 * masters, so their lists here are dynamic data, not constants.
 */

import { apiRoutesPortalMasters } from "@/utils/api";
import { fetchWithCookie } from "@/utils/apiClient2";

// ---------------------------------------------------------------------------
// Types — setup (masters)
// ---------------------------------------------------------------------------

export type GlStatementCode = "FNG" | "WVG" | "WDG";
/** Quality-wise production is captured only for FNG and WVG. */
export type GlProdStatement = "FNG" | "WVG";
/** 1 = Hessian, 2 = Sacking (mirrors jute_prod_finishing_quality.quality_type). */
export type GlQualityType = 1 | 2;

export interface GlFigureRowMst {
  gl_row_id: number;
  row_code: string;
  row_name: string;
  section: "INPUT" | "OUTPUT";
  calc_sign: number; // +1 Add, -1 Less
  in_fng: number;
  in_wvg: number;
  in_wdg: number;
  display_order: number;
}

export interface GlDeptMst {
  gl_dept_id: number;
  dept_code: string;
  dept_name: string;
  in_wvg: number;
  in_wdg: number;
  display_order: number;
}

export interface GlQualitySuggestion {
  quality_type: number;
  quality_name: string;
}

export interface GlSetup {
  figure_rows: GlFigureRowMst[];
  departments: GlDeptMst[];
  quality_suggestions: GlQualitySuggestion[];
  statements: GlStatementCode[];
}

// ---------------------------------------------------------------------------
// Types — sheet (entry)
// ---------------------------------------------------------------------------

export interface GlFigureValue {
  gl_row_id: number;
  hess_qty: number;
  sack_qty: number;
}

export interface GlProdLine {
  statement: GlProdStatement;
  quality_type: GlQualityType;
  quality_name: string;
  qty: number;
  display_order?: number;
}

export interface GlProcessStockLine {
  gl_dept_id: number;
  opening_hess: number;
  opening_sack: number;
  closing_hess: number;
  closing_sack: number;
}

export interface GlSheetHeader {
  gain_loss_id: number;
  month_date: string;
  remarks: string | null;
  is_locked: number;
}

export interface GlSheet {
  header: GlSheetHeader | null;
  figures: (GlFigureValue & { gain_loss_dtl_id: number })[];
  productions: (GlProdLine & { gain_loss_prod_id: number })[];
  process_stock: (GlProcessStockLine & { gain_loss_ps_id: number })[];
  prev_month: string;
  prev_month_exists: boolean;
  prev_closing: {
    gl_dept_id: number;
    closing_hess: number;
    closing_sack: number;
  }[];
}

export interface GlSheetSavePayload {
  co_id: number;
  branch_id: number;
  month: string; // YYYY-MM or YYYY-MM-DD
  remarks?: string | null;
  figures: GlFigureValue[];
  productions: GlProdLine[];
  process_stock: GlProcessStockLine[];
}

// ---------------------------------------------------------------------------
// Types — report
// ---------------------------------------------------------------------------

export interface GlReportRow {
  label: string;
  hess: number;
  sack: number;
  total: number;
  to_date: number | null;
  prev_hess: number;
  prev_sack: number;
  prev_total: number;
  sign?: number;
}

export interface GlPctRow {
  label: string;
  hess: number | null;
  sack: number | null;
  total: number | null;
  to_date: number | null;
  prev_hess: number | null;
  prev_sack: number | null;
  prev_total: number | null;
}

export interface GlProcessStockReportRow {
  dept_code: string;
  label: string;
  hess: number;
  sack: number;
  total: number;
  prev_hess: number;
  prev_sack: number;
  prev_total: number;
  diff: number;
  opening_mismatch?: boolean;
}

export interface GlStatement {
  code: GlStatementCode;
  title: string;
  input: {
    rows: GlReportRow[];
    opening_ps: GlReportRow;
    closing_ps: GlReportRow;
    net_consumed: GlReportRow;
  };
  output: {
    hessian_rows: GlReportRow[];
    hessian_total: GlReportRow;
    sacking_rows: GlReportRow[];
    sacking_total: GlReportRow;
    sub_total: GlReportRow;
    misc_rows: GlReportRow[];
    total_output: GlReportRow;
  };
  gain_loss: GlReportRow;
  gain_loss_pct: GlPctRow;
  process_stock: {
    rows: GlProcessStockReportRow[];
    total: Omit<GlProcessStockReportRow, "dept_code" | "opening_mismatch">;
  };
}

export interface GlReport {
  month: string;
  prev_month: string;
  prev_month_exists: boolean;
  fy_start: string;
  missing_months: string[];
  remarks: string | null;
  prev_remarks: string | null;
  is_locked: number;
  statements: Record<GlStatementCode, GlStatement>;
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export async function fetchGainLossSetup(params: {
  coId: number;
  branchId?: number;
}): Promise<GlSetup> {
  const qs = new URLSearchParams();
  qs.set("co_id", String(params.coId));
  if (params.branchId != null) qs.set("branch_id", String(params.branchId));
  const url = `${apiRoutesPortalMasters.JUTE_GAIN_LOSS_SETUP}?${qs.toString()}`;
  const res = await fetchWithCookie<{ data: GlSetup }>(url);
  if (res.error || !res.data) {
    throw new Error(res.error ?? "Failed to fetch the gain/loss setup data");
  }
  return res.data.data;
}

export async function fetchGainLossSheet(params: {
  coId: number;
  branchId: number;
  month: string;
}): Promise<GlSheet> {
  const qs = new URLSearchParams();
  qs.set("co_id", String(params.coId));
  qs.set("branch_id", String(params.branchId));
  qs.set("month", params.month);
  const url = `${apiRoutesPortalMasters.JUTE_GAIN_LOSS_SHEET}?${qs.toString()}`;
  const res = await fetchWithCookie<{ data: GlSheet }>(url);
  if (res.error || !res.data) {
    throw new Error(res.error ?? "Failed to fetch the gain/loss sheet");
  }
  return res.data.data;
}

export async function saveGainLossSheet(
  payload: GlSheetSavePayload,
): Promise<{ gain_loss_id: number }> {
  const res = await fetchWithCookie<{ data: { gain_loss_id: number } }>(
    apiRoutesPortalMasters.JUTE_GAIN_LOSS_SAVE,
    "POST",
    payload,
  );
  if (res.error || !res.data) {
    throw new Error(res.error ?? "Failed to save the gain/loss sheet");
  }
  return res.data.data;
}

async function setLock(
  url: string,
  params: { coId: number; branchId: number; month: string },
): Promise<{ is_locked: boolean }> {
  const res = await fetchWithCookie<{ data: { is_locked: boolean } }>(url, "POST", {
    co_id: params.coId,
    branch_id: params.branchId,
    month: params.month,
  });
  if (res.error || !res.data) {
    throw new Error(res.error ?? "Failed to change the month lock");
  }
  return res.data.data;
}

export async function lockGainLossSheet(params: {
  coId: number;
  branchId: number;
  month: string;
}): Promise<{ is_locked: boolean }> {
  return setLock(apiRoutesPortalMasters.JUTE_GAIN_LOSS_LOCK, params);
}

export async function unlockGainLossSheet(params: {
  coId: number;
  branchId: number;
  month: string;
}): Promise<{ is_locked: boolean }> {
  return setLock(apiRoutesPortalMasters.JUTE_GAIN_LOSS_UNLOCK, params);
}

export async function fetchGainLossReport(params: {
  coId: number;
  branchId: number;
  month: string;
}): Promise<GlReport> {
  const qs = new URLSearchParams();
  qs.set("co_id", String(params.coId));
  qs.set("branch_id", String(params.branchId));
  qs.set("month", params.month);
  const url = `${apiRoutesPortalMasters.JUTE_GAIN_LOSS_REPORT}?${qs.toString()}`;
  const res = await fetchWithCookie<{ data: GlReport }>(url);
  if (res.error || !res.data) {
    throw new Error(res.error ?? "Failed to fetch the gain/loss report");
  }
  return res.data.data;
}
