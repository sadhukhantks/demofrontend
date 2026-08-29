/**
 * Service layer for Jute Production reports — Daily Production Report (DPR).
 *
 * Backend: GET /api/juteProductionReports/daily_production_report
 * (vowerp3be src/juteProduction/dpr_reports.py). The endpoint returns every DPR
 * section pre-aggregated for one report date + month-to-date context; sections
 * whose data the ERP does not capture yet arrive in `unavailable`.
 */

import { apiRoutesPortalMasters } from "@/utils/api";
import { fetchWithCookie } from "@/utils/apiClient2";

export interface DprShiftRow {
  shift: string;
  production_kg: number;
  production_mt: number;
  frame_runs: number;
  kg_per_frame: number;
  utilization_pct: number;
  eff_pct: number;
}

export interface DprSpinningQualityRow {
  item_id: number;
  item_code: string | null;
  item_name: string | null;
  act_count: number;
  std_count: number;
  production_kg: number;
  kg_per_frame_shift: number;
  target_per_frame_shift: number;
  winding_kg: number;
  eff_pct: number;
}

export interface DprSpinningSection {
  shifts: DprShiftRow[];
  total: {
    production_kg: number;
    production_mt: number;
    frame_runs: number;
    kg_per_frame: number;
    utilization_pct: number;
    eff_pct: number;
    avg_target_per_frame: number;
    avg_std_per_frame: number;
  };
  mtd: {
    production_kg: number;
    production_mt: number;
    frame_runs: number;
    kg_per_frame: number;
  };
  total_frames: number;
  quality: DprSpinningQualityRow[];
}

export interface DprWindingQualityRow {
  item_id: number | null;
  item_code: string | null;
  item_name: string | null;
  production_kg: number;
  winders: number;
  kg_per_winder: number;
  mtd_production_kg: number;
  mtd_kg_per_winder_shift: number;
}

export interface DprWindingSection {
  qualities: DprWindingQualityRow[];
  total: {
    production_kg: number;
    winders: number;
    kg_per_winder: number;
    mtd_production_kg: number;
  };
}

export interface DprWeavingQualityRow {
  weaving_quality_id: number;
  quality_code: string | null;
  quality_name: string | null;
  shift_A_mt: number;
  shift_B_mt: number;
  shift_C_mt: number;
  production_mt: number;
  looms_run: number;
  kg_per_loom: number;
  eff_pct: number;
  mtd_production_mt: number;
}

export interface DprWeavingSection {
  qualities: DprWeavingQualityRow[];
  shift_totals: Record<"A" | "B" | "C", number>;
  total: {
    production_mt: number;
    loom_runs: number;
    looms_run: number;
    kg_per_loom: number;
    eff_pct: number;
    utilization_pct: number;
    mtd_production_mt: number;
  };
  total_looms: number;
}

export interface DprFinishingRow {
  process: string;
  uom: string;
  day_qty: number;
  day_wt_kg: number;
  mtd_qty: number;
  mtd_wt_kg: number;
}

export interface DprYarnHeavyLightRow {
  item_id: number;
  item_code: string | null;
  item_name: string | null;
  std_count: number | null;
  obs_count: number | null;
  corr_count: number | null;
  day_tests: number;
  hy_lt_pct: number | null;
  remark: "HEAVY" | "LIGHT" | "OK" | null;
  mtd_obs_count: number | null;
  mtd_corr_count: number | null;
}

export interface DprJuteGroupRow {
  item_group_name: string;
  opening_weight: number;
  receipt_weight: number;
  issue_weight: number;
  sold_weight: number;
  closing_weight: number;
  mtd_receipt_weight: number;
  mtd_issue_weight: number;
}

export interface DprJuteSection {
  groups: DprJuteGroupRow[];
  totals: Omit<DprJuteGroupRow, "item_group_name">;
  days_stock: number | null; // null when nothing was issued MTD
}

export interface DprHandsShiftRow {
  shift: string;
  day_hours: number;
  day_hands: number;
  mtd_hours: number;
  mtd_hands: number;
}

export interface DprHandsSection {
  shifts: DprHandsShiftRow[];
  total: { day_hours: number; day_hands: number; mtd_hours: number; mtd_hands: number };
  hands_per_mt: number;
  /** The MT `hands_per_mt` was divided by, and what that MT is (TKT-000117) —
   * without it the ratio can't be checked against the figures on the page. */
  basis_mt: number;
  basis_label: string;
}

export interface DprMachineRunRow {
  section: string;
  basis: "std" | "target";
  avg_per_machine: number;
  avg_act_per_machine: number;
  total_prod_kg: number;
  should_run: number;
  act_run: number;
  excess_machines: number | null;
}

export interface DprKpi {
  spinning_mt: number;
  spinning_mtd_mt: number;
  frame_utilization_pct: number;
  spinning_eff_pct: number;
  weaving_mt: number;
  weaving_mtd_mt: number;
  loom_utilization_pct: number;
  weaving_eff_pct: number;
  winding_kg: number | null;
  total_hands: number;
  hands_per_mt: number;
  /** The MT the ratio was divided by (TKT-000117) — shown on the KPI card so
   * hands ÷ MT reconciles without hunting for the basis further down the page. */
  hands_basis_mt: number;
  /** Raw closing stock in the tenant's stored weight unit (kg on some
   * tenants, quintal on others) — deliberately NOT converted to MT. */
  jute_closing_weight: number | null;
  jute_days_stock: number | null;
}

export interface DprUnavailableSection {
  section: string;
  reason: string;
}

export interface DailyProductionReport {
  report_date: string;
  date_from: string;
  kpi: DprKpi;
  spinning: DprSpinningSection;
  winding: DprWindingSection | null;
  weaving: DprWeavingSection;
  finishing: { processes: DprFinishingRow[] };
  yarn_heavy_light: DprYarnHeavyLightRow[];
  jute: DprJuteSection | null;
  hands: DprHandsSection;
  machine_run: DprMachineRunRow[];
  unavailable: DprUnavailableSection[];
}

/** Fetch the whole-mill Daily Production Report for one date. */
export async function fetchDailyProductionReport(params: {
  coId: number;
  branchId?: number | null;
  reportDate: string;
}): Promise<DailyProductionReport> {
  const qs = new URLSearchParams();
  qs.set("co_id", String(params.coId));
  qs.set("report_date", params.reportDate);
  if (params.branchId != null) qs.set("branch_id", String(params.branchId));
  const url = `${apiRoutesPortalMasters.JUTE_PROD_DPR}?${qs.toString()}`;
  const result = await fetchWithCookie<{ data: DailyProductionReport }>(url);
  if (result.error || !result.data) {
    throw new Error(result.error ?? "Failed to fetch daily production report");
  }
  return result.data.data;
}

export interface WwdReconciliation {
  opening_mt: number;
  winding_mt: number;
  /** Twisted (3-ply) yarn consumed out of net winding — subtracted line. */
  twisting_mt: number;
  weaving_mt: number;
  purchase_mt: number;
  sale_mt: number;
  should_be_closing_mt: number;
  actual_closing_mt: number;
  difference_mt: number;
  /** null when winding production is zero — a percentage of nothing. */
  difference_pct: number | null;
  jute_issue_mt: number;
}

export interface WwdStockRow {
  bucket: string;
  item_code: string | null;
  item_name: string | null;
  quality_name: string | null;
  yarn_count: number | null;
  package_label: string;
  area_name: string | null;
  no_of_samples: number;
  wt_per_sample: number;
  prvs_stock_mt: number;
  stock_mt: number;
}

export interface WindingWeavingDifference {
  report_date: string;
  date_from: string;
  stock: Record<string, { rows: WwdStockRow[]; subtotal_mt: number } | number> & {
    grand_total_mt: number;
  };
  production: { day: WwdReconciliation; mtd: WwdReconciliation };
  cloth_split: {
    day: Record<string, number>;
    mtd: Record<string, number>;
  };
  chain: {
    ok: boolean;
    prev_entry_date: string | null;
    month_opening_date: string | null;
  };
  warnings: {
    purchase_unknown_uoms: string[];
    /** Weaving rows (cuts > 0) whose quality did not resolve to an active
     * weaving quality — excluded from weaving production, so should-be
     * closing stock reads high by however much they'd have subtracted. */
    weaving_unresolved_day: number;
    weaving_unresolved_mtd: number;
  };
  note: string;
}

/** Counted winding stock reconciled against book stock, day and month-to-date. */
export async function fetchWindingWeavingDifference(params: {
  coId: number;
  branchId: number;
  reportDate: string;
}): Promise<WindingWeavingDifference> {
  const qs = new URLSearchParams();
  qs.set("co_id", String(params.coId));
  qs.set("branch_id", String(params.branchId));
  qs.set("report_date", params.reportDate);
  const url = `${apiRoutesPortalMasters.WINDING_WEAVING_DIFFERENCE}?${qs.toString()}`;
  const res = await fetchWithCookie<{ data: WindingWeavingDifference }>(url);
  if (res.error || !res.data) {
    throw new Error(res.error ?? "Failed to fetch the winding & weaving difference report");
  }
  return res.data.data;
}

/** One quality's day figures (and the grand-total row, which shares the shape). */
export interface WindingQualityWiseRow {
  item_id: number | null;
  item_code: string | null;
  item_name: string | null;
  winders_A: number;
  winders_B: number;
  winders_C: number;
  winders_total: number;
  prod_A: number;
  prod_B: number;
  prod_C: number;
  prod_total: number;
  target_A: number;
  target_B: number;
  target_C: number;
  target_total: number;
  difference: number;
  prod_per_winder_A: number;
  prod_per_winder_B: number;
  prod_per_winder_C: number;
  prod_per_winder_avg: number;
  mtd_prod: number;
  mtd_winders: number;
  mtd_prod_per_winder: number;
}

export interface WindingQualityWise {
  report_date: string;
  mtd_from: string;
  shifts: string[];
  rows: WindingQualityWiseRow[];
  grand_total: WindingQualityWiseRow;
  note: string;
}

/** Winders / production / target per winding quality, pivoted A-B-C, plus MTD. */
export async function fetchWindingQualityWise(params: {
  branchId: number;
  reportDate: string;
}): Promise<WindingQualityWise> {
  const qs = new URLSearchParams();
  qs.set("branch_id", String(params.branchId));
  qs.set("report_date", params.reportDate);
  const url = `${apiRoutesPortalMasters.WINDING_QUALITY_WISE_REPORT}?${qs.toString()}`;
  const res = await fetchWithCookie<{ data: WindingQualityWise }>(url);
  if (res.error || !res.data) {
    throw new Error(res.error ?? "Failed to fetch the winding quality wise report");
  }
  return res.data.data;
}

/** One item group's winding-vs-spinning figures (and the grand-total row). */
export interface WindingQualityGroupRow {
  item_grp_id: number | null;
  item_grp_name: string;
  wnd_winders_A: number;
  wnd_winders_B: number;
  wnd_winders_C: number;
  wnd_winders_total: number;
  wnd_prod_A: number;
  wnd_prod_B: number;
  wnd_prod_C: number;
  wnd_prod_total: number;
  spg_winding_qty: number;
  spg_prod_A: number;
  spg_prod_B: number;
  spg_prod_C: number;
  spg_prod_total: number;
  /** Winding minus spinning per shift — nonzero means the two departments
   * booked different quantities for the same yarn. */
  variance_A: number;
  variance_B: number;
  variance_C: number;
  variance_total: number;
}

export interface WindingQualityGroupWise {
  report_date: string;
  shifts: string[];
  rows: WindingQualityGroupRow[];
  grand_total: WindingQualityGroupRow;
  note: string;
}

/** Winding vs spinning production per item group, pivoted A-B-C. */
export async function fetchWindingQualityGroupWise(params: {
  branchId: number;
  reportDate: string;
}): Promise<WindingQualityGroupWise> {
  const qs = new URLSearchParams();
  qs.set("branch_id", String(params.branchId));
  qs.set("report_date", params.reportDate);
  const url = `${apiRoutesPortalMasters.WINDING_QUALITY_GROUP_WISE_REPORT}?${qs.toString()}`;
  const res = await fetchWithCookie<{ data: WindingQualityGroupWise }>(url);
  if (res.error || !res.data) {
    throw new Error(res.error ?? "Failed to fetch the winding quality group wise report");
  }
  return res.data.data;
}

/** One weaving-daily row of the Loom Checklist, with its anomaly remarks. */
export interface LoomChecklistRow {
  weaving_daily_id: number;
  tran_date: string;
  spell_id: number;
  spell_code: string | null;
  branch_id: number | null;
  mech_code: string | null;
  machine_name: string | null;
  weaving_quality_id: number | null;
  weaving_quality_code: string | null;
  weaving_quality_name: string | null;
  eb_id: number | null;
  eb_no: string | null;
  open_jugar: number;
  cuts: number;
  close_jugar: number;
  jugar: number;
  production_yds: number;
  production_kg: number;
  less_production: number;
  efficiency: number;
  std_eff: number;
  working_hours: number;
  sync_state: "not_synced" | "synced" | "locked" | "stale";
  remarks: string;
}

/** Shared filters of every checklist report. */
interface ChecklistParams {
  coId: number;
  branchId: number;
  dateFrom: string;
  dateTo: string;
  /** "chk" = anomalous rows only, "all" = every entry. Attendance has none. */
  rtype?: string;
  /** Winding only: which side of the sheet to check. */
  direction?: "attendance" | "production";
}

/** All checklist endpoints share the same query string and {data: Row[]} shape. */
async function fetchChecklist<TRow>(
  base: string,
  params: ChecklistParams,
  label: string,
): Promise<TRow[]> {
  const qs = new URLSearchParams();
  qs.set("co_id", String(params.coId));
  qs.set("branch_id", String(params.branchId));
  qs.set("date_from", params.dateFrom);
  qs.set("date_to", params.dateTo);
  if (params.rtype) qs.set("rtype", params.rtype);
  if (params.direction) qs.set("direction", params.direction);
  const res = await fetchWithCookie<{ data: TRow[] }>(`${base}?${qs.toString()}`);
  if (res.error || !res.data) {
    throw new Error(res.error ?? `Failed to fetch the ${label}`);
  }
  return res.data.data;
}

/** Loom Checklist — rtype "chk" = anomalous rows only, "all" = every entry. */
export function fetchLoomChecklist(
  params: ChecklistParams,
): Promise<LoomChecklistRow[]> {
  return fetchChecklist(
    apiRoutesPortalMasters.LOOM_CHECKLIST,
    params,
    "loom checklist",
  );
}

/** One winder-spell row of the Winding Checklist, with its anomaly remarks. */
export interface WindingChecklistRow {
  row_id: string;
  tran_date: string;
  spell_id: number;
  spell_code: string | null;
  eb_id: number | null;
  eb_no: string | null;
  worker_name: string | null;
  designation: string | null;
  quality?: string | null;
  net_hours: number;
  doff_count: number;
  production_qty: number;
  remarks: string;
}

/** Winding Checklist — direction "attendance" (who was present) vs "production". */
export function fetchWindingChecklist(
  params: ChecklistParams & { direction: "attendance" | "production" },
): Promise<WindingChecklistRow[]> {
  return fetchChecklist(
    apiRoutesPortalMasters.WINDING_CHECKLIST,
    params,
    "winding checklist",
  );
}

/** One beaming machine-spell row, with its anomaly remarks. */
export interface BeamingChecklistRow {
  row_id: string;
  tran_date: string;
  spell_id: number;
  spell_code: string | null;
  machine_id: number | null;
  mech_code: string | null;
  machine_name: string | null;
  quality?: string | null;
  workers: string | null;
  net_hours: number;
  cuts: number;
  remarks: string;
}

export function fetchBeamingChecklist(
  params: ChecklistParams,
): Promise<BeamingChecklistRow[]> {
  return fetchChecklist(
    apiRoutesPortalMasters.BEAMING_CHECKLIST,
    params,
    "beaming checklist",
  );
}

/** One finishing worker-spell row, with its anomaly remarks. */
export interface FinishingChecklistRow {
  row_id: string;
  tran_date: string;
  spell_id: number;
  spell_code: string | null;
  eb_id: number | null;
  eb_no: string | null;
  worker_name: string | null;
  designation: string | null;
  quality?: string | null;
  net_hours: number;
  prod_qty: number;
  prod_wt_kg: number;
  remarks: string;
}

export function fetchFinishingChecklist(
  params: ChecklistParams,
): Promise<FinishingChecklistRow[]> {
  return fetchChecklist(
    apiRoutesPortalMasters.FINISHING_CHECKLIST,
    params,
    "finishing checklist",
  );
}

/** One attendance row (no remarks — this sheet is the raw attendance list). */
export interface AttendanceChecklistRow {
  row_id: string;
  tran_date: string;
  spell_id: number;
  spell_code: string | null;
  eb_id: number | null;
  eb_no: string | null;
  worker_name: string | null;
  department: string | null;
  designation: string | null;
  attendance_type: string | null;
  net_hours: number;
  machines: string | null;
}

/** Attendance Checklist — server caps the date range at 31 days. */
export function fetchAttendanceChecklist(
  params: ChecklistParams,
): Promise<AttendanceChecklistRow[]> {
  return fetchChecklist(
    apiRoutesPortalMasters.ATTENDANCE_CHECKLIST,
    params,
    "attendance checklist",
  );
}
