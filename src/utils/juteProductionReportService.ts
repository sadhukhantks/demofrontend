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
import type { FinishingQualityType } from "@/utils/finishingStockService";

export interface DprShiftRow {
  shift: string;
  production_kg: number;
  production_mt: number;
  frame_runs: number;
  kg_per_frame: number;
  utilization_pct: number;
  /** null = no spinning standard configured for the quality (see
   * `DprSpinningSection.standards_missing`), not "zero efficiency". */
  eff_pct: number | null;
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
  eff_pct: number | null;
}

/** Mill average yarn count on three weightings (TKT-000173). The count averaged
 * is each quality's STANDARD count from the yarn master, so the three figures
 * differ only by what they are weighted with. */
export interface DprSpinningAvgCount {
  /** Σ(count × frame-shifts run) ÷ Σ frame-shifts run. */
  by_frames: number | null;
  frame_shifts: number;
  /** Σ(count × actual kg) ÷ Σ actual kg. */
  by_production: number | null;
  production_kg: number;
  /** Σ(count × std expected kg) ÷ Σ std expected kg, over the qualities that
   * HAVE a standard entered. null = none has one — blank, never zero. */
  by_std_production: number | null;
  std_production_kg: number;
  /** Qualities covered by the std-weighted figure, out of `qualities`. */
  std_qualities: number;
  qualities: number;
  /** Qualities with no count on the yarn master — left out of the std column. */
  count_missing: string[];
  /**
   * TKT-000201 — the same three weightings on the ACTUAL count entered in
   * Spinning SQC (the day's AVG observed count per quality, = the quality
   * table's Act Count). A quality with no SQC reading falls back to its std
   * count (named in act_fallback). Optional: absent from a backend that
   * predates the ticket, in which case only the std column is shown.
   */
  act_by_frames?: number | null;
  act_by_production?: number | null;
  act_by_std_production?: number | null;
  /** kg of the day's production whose quality had an SQC count reading. */
  act_measured_kg?: number;
  /** Qualities with no SQC count for the day — std count used instead. */
  act_fallback?: string[];
}

export interface DprSpinningSection {
  shifts: DprShiftRow[];
  total: {
    production_kg: number;
    production_mt: number;
    frame_runs: number;
    kg_per_frame: number;
    utilization_pct: number;
    eff_pct: number | null;
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
  /** Quality names that produced today but have no spinning standard
   * (TPI / efficiency) configured — their eff % is blank, not zero. */
  standards_missing: string[];
  avg_count: DprSpinningAvgCount;
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
  /** 1 = twisted (ply) yarn — re-wound single yarn, excluded from the total. */
  is_twisted: 0 | 1;
}

/** One totals line of the winder table (TKT-000174) — winding, twisting and
 * gross each carry the same four columns on their OWN basis. */
export interface DprWindingBlockTotal {
  production_kg: number;
  winders: number;
  kg_per_winder: number;
  mtd_production_kg: number;
}

export interface DprWindingSection {
  qualities: DprWindingQualityRow[];
  total: {
    /** Winding ALONE, net of twisting — twisted yarn is re-wound single yarn,
     * so counting it again would double count the winder output. */
    production_kg: number;
    /** Winders on the non-twisted qualities only (TKT-000174). */
    winders: number;
    /** production_kg ÷ winders — winding alone, not a gross figure. */
    kg_per_winder: number;
    mtd_production_kg: number;
    twisting_kg: number;
    mtd_twisting_kg: number;
    gross_production_kg: number;
    mtd_gross_production_kg: number;
    /** Twisting block total — shown after the winding Total, never inside it. */
    twisting: DprWindingBlockTotal;
    /** Winding + twisting: winder OUTPUT (wage basis), not production. */
    gross: DprWindingBlockTotal;
  };
  /** false when the tenant DB has no is_twisted yarn-master flag yet — then
   * twisting_kg is 0 and twisted yarn is still inside the winding total. */
  twisting_available: boolean;
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
  eff_pct: number | null;
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
    eff_pct: number | null;
    utilization_pct: number;
    mtd_production_mt: number;
  };
  total_looms: number;
  /** Quality names that wove today but have no weaving standard configured —
   * their eff % is blank, not zero. */
  standards_missing: string[];
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
  /** Process-waste item group (dust, caddies, thread waste …). */
  is_waste?: boolean;
  opening_weight: number;
  receipt_weight: number;
  issue_weight: number;
  sold_weight: number;
  closing_weight: number;
  mtd_receipt_weight: number;
  mtd_issue_weight: number;
}

/** The spinning production the jute days-of-cover divides by (TKT-000172):
 * the report date's own production, or — when the report date was a holiday /
 * part day — the average over the last producing days ending at it. */
export interface DprJuteCoverBasis {
  /** "report_date" = one day's kg; "average" = kg PER DAY over `days` days. */
  mode: "report_date" | "average";
  /** ISO date of the (last) production day used — same as `date_to`. */
  date: string;
  date_from: string;
  date_to: string;
  /** Producing days behind `production_kg` (1 for mode "report_date"). */
  days: number;
  production_kg: number;
  /** Shifts spinning ran on the day; null for an average. */
  shifts: number | null;
  /** false = the report date was a holiday or part day. */
  is_report_date: boolean;
  basis_label: string;
}

export interface DprJuteSection {
  groups: DprJuteGroupRow[];
  totals: Omit<DprJuteGroupRow, "item_group_name" | "is_waste">;
  /** Total closing stock ÷ `cover_basis.production_kg` (both kg). null when
   * spinning produced nothing in the look-back window. */
  days_stock: number | null;
  /** Same cover on purchased raw jute alone (process waste left out). */
  days_stock_raw_jute: number | null;
  raw_jute_closing_weight: number;
  waste_closing_weight: number;
  /** Cover on the process-waste stock alone, same divisor. */
  days_stock_waste?: number | null;
  /** Subtotals of the non-waste / waste item groups (they sum to `totals`). */
  jute_totals?: Omit<DprJuteGroupRow, "item_group_name" | "is_waste">;
  waste_totals?: Omit<DprJuteGroupRow, "item_group_name" | "is_waste">;
  cover_basis: DprJuteCoverBasis | null;
  /** Superseded basis (closing ÷ MTD jute issue per calendar day) — kept for
   * comparison only; it drifts whenever jute-issue entry lags production. */
  days_stock_mtd_issue: number | null;
}

export interface DprHandsShiftRow {
  shift: string;
  day_hours: number;
  day_hands: number;
  mtd_hours: number;
  mtd_hands: number;
}

/** One production stage of the hands/MT split (TKT-000185). */
export interface DprHandsStage {
  label: string;
  /** What `day_mt` / `mtd_mt` are: "spinning output" (yarn stage) or
   * "weaving output" (cloth stage). */
  basis_label: string;
  /** Departments (by name) that landed in this stage — the mapping is by
   * name, so the page lists it for checking. */
  depts: string[];
  direct_day_hands: number;
  direct_mtd_hands: number;
  /** Share of the common hands spread onto this stage. */
  common_day_hands: number;
  common_mtd_hands: number;
  day_hands: number;
  mtd_hands: number;
  day_mt: number;
  mtd_mt: number;
  /** null = the stage produced nothing that period (not 0 hands/MT). */
  hands_per_mt: number | null;
  mtd_hands_per_mt: number | null;
}

/** Hands per MT of cloth = yarn stage ÷ spinning MT + cloth stage ÷ weaving MT,
 * common hands spread pro-rata (TKT-000185). */
export interface DprHandsStages {
  /** false = no attendance row resolved to a department; the page shows the
   * TKT-000117 fallback (all hands ÷ spinning MT). */
  available: boolean;
  yarn: DprHandsStage;
  cloth: DprHandsStage;
  common: {
    label: string;
    depts: string[];
    day_hands: number;
    mtd_hands: number;
    /** % of the common hands given to the yarn stage (day / MTD). */
    yarn_share_pct: number;
    mtd_yarn_share_pct: number;
  };
  total: {
    day_hands: number;
    mtd_hands: number;
    hands_per_mt: number | null;
    mtd_hands_per_mt: number | null;
  };
}

export interface DprYarnBalancePeriod {
  spun_mt: number;
  /** Approved Yarn Issues net of returns; null when the tenant has no yarn
   * purchase tables. */
  purchased_issued_mt: number | null;
  woven_mt: number;
  /** spun + purchased − woven: yarn that went to stock or sale. */
  surplus_mt: number;
}

export interface DprYarnBalance {
  purchased_available: boolean;
  day: DprYarnBalancePeriod;
  mtd: DprYarnBalancePeriod;
}

/** The previous figure (TKT-000117): every hand in the mill ÷ spinning MT —
 * kept beside the stage-wise one for continuity with earlier sheets. */
export interface DprHandsSpinningBasis {
  label: string;
  day_hands: number;
  mtd_hands: number;
  day_mt: number;
  mtd_mt: number;
  hands_per_mt: number | null;
  mtd_hands_per_mt: number | null;
}

export interface DprHandsSection {
  shifts: DprHandsShiftRow[];
  total: { day_hours: number; day_hands: number; mtd_hours: number; mtd_hands: number };
  /** Hands per MT of cloth (TKT-000185); null when a stage produced nothing. */
  hands_per_mt: number | null;
  mtd_hands_per_mt: number | null;
  basis_label: string;
  stages: DprHandsStages;
  spinning_basis: DprHandsSpinningBasis;
  yarn_balance: DprYarnBalance;
}

/** Shifts the mill actually produced in — day and month-to-date (TKT-000152). */
export interface DprShiftsWorkedSection {
  section: string;
  day: number;
  mtd: number;
  day_shifts: string[];
}

export interface DprShiftsWorked {
  /** Distinct shifts worked on the report date, union over sections. */
  day: number;
  /** Distinct (date, shift) pairs over the MTD window, union over sections. */
  mtd: number;
  day_shifts: string[];
  sections: DprShiftsWorkedSection[];
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
  /** null = no spinning standard configured, not zero efficiency. */
  spinning_eff_pct: number | null;
  weaving_mt: number;
  weaving_mtd_mt: number;
  loom_utilization_pct: number;
  weaving_eff_pct: number | null;
  /** Net of twisting. */
  winding_kg: number | null;
  winding_mtd_kg: number | null;
  twisting_kg: number | null;
  /** Batching oil % in emulsion for the day. */
  jbo_pct: number | null;
  total_hands: number;
  /** Shifts worked on the day / MTD (union over sections) — TKT-000152. */
  shifts_worked: number;
  shifts_worked_mtd: number;
  /** Hands per MT of cloth = `hands_per_mt_yarn` + `hands_per_mt_cloth`
   * (TKT-000185); the addends and the MTD figure ride on the card so it
   * reconciles on screen. null when a stage produced nothing. */
  hands_per_mt: number | null;
  hands_per_mt_yarn: number | null;
  hands_per_mt_cloth: number | null;
  hands_per_mt_mtd: number | null;
  /** false = TKT-000117 fallback (all hands ÷ spinning MT): no department resolved. */
  hands_stage_basis: boolean;
  /** The previous figure, all hands ÷ spinning MT, kept beside the new one. */
  hands_per_mt_spinning_basis: number | null;
  /** Raw closing stock in the tenant's stored weight unit (kg on some
   * tenants, quintal on others) — deliberately NOT converted to MT. */
  jute_closing_weight: number | null;
  jute_days_stock: number | null;
  /** Divisor of `jute_days_stock` and its date (TKT-000172). */
  jute_cover_basis_kg: number | null;
  jute_cover_basis_date: string | null;
}

/** Batching-oil emulsion — day reading plus the month's running totals. */
export interface DprEmulsion {
  day: {
    entry_date: string | null;
    jbo_ltr: number | null;
    eco_fin_ltr: number | null;
    oil_used_ltr: number | null;
    tank_capacity_ltr: number | null;
    /** Measured oil % in emulsion. */
    oil_pct: number | null;
    /** oil_used / tank_capacity * 100. */
    derived_oil_pct: number | null;
    std_low: number | null;
    std_high: number | null;
    status: "OK" | "LOW" | "HIGH" | null;
  } | null;
  mtd: {
    jbo_ltr: number;
    eco_fin_ltr: number;
    avg_oil_pct: number | null;
    days: number;
  };
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
  /** null when the tenant logged no emulsion rows in the window. */
  emulsion: DprEmulsion | null;
  yarn_heavy_light: DprYarnHeavyLightRow[];
  jute: DprJuteSection | null;
  hands: DprHandsSection;
  shifts_worked: DprShiftsWorked;
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
  /** Spinning department's own production from weighed doffs
   *  (daily_doff_tbl.net_weight), NOT the planning snapshot. Context only —
   *  upstream of winding, so it never enters should_be_closing_mt or
   *  difference_mt. */
  spinning_mt: number;
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

/** One yarn quality's consolidated position inside a single stock block
 *  (TKT-000182 — MILL_USE only). `total_mt` is 0 for a quality that was counted
 *  in that block yesterday but not today. */
export interface WwdQualitySummaryRow {
  item_id: number | null;
  item_code: string | null;
  item_name: string | null;
  quality_name: string | null;
  yarn_count: number | null;
  total_mt: number;
  /** Previous counted day's position for this quality IN THE SAME BLOCK, summed
   *  from that day's own lines — NOT from the detail rows' repeated prvs
   *  column, and never from another block. */
  prvs_stock_mt: number;
  /** How many detail lines of that block this row collapses. */
  line_count: number;
}

export interface WwdStockSummary {
  /** The block this summary covers — "MILL_USE" today. */
  bucket: string;
  rows: WwdQualitySummaryRow[];
  /** Ties to that block's printed subtotal, NOT to stock.grand_total_mt. */
  total_mt: number;
  prvs_total_mt: number;
}

/** One approved Yarn Purchase line inside the MTD window — the documents
 *  behind `production.mtd.purchase_mt`, so the figure can be audited. */
export interface WwdPurchaseDetailRow {
  yarn_purchase_id: number;
  purchase_no: string;
  /** ISO date; null when the document carries no transaction date. */
  tran_date: string | null;
  item_id: number;
  item_name: string | null;
  yarn_count: number | null;
  kg: number;
}

export interface WindingWeavingDifference {
  report_date: string;
  date_from: string;
  stock: Record<string, { rows: WwdStockRow[]; subtotal_mt: number } | number> & {
    grand_total_mt: number;
  };
  /** Consolidated quality-wise position for ONE block of `stock` (mill use);
   *  its total equals that block's subtotal, not `stock.grand_total_mt`. */
  stock_summary: WwdStockSummary;
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
    /** Approved Stores receipts of the legacy purchased-yarn item in the MTD
     * window (MT). Purchase Yarn (MT) now reads Yarn Purchase documents only,
     * so this is a transition cross-check: quantity still arriving through
     * Stores is NOT in the figures above. Absent on backends predating the
     * Yarn Purchase document. */
    legacy_stores_yarn_mt?: number;
    /** Set when Stores receipts exist in the window but no Yarn Purchase does. */
    legacy_stores_yarn_warning?: string;
  };
  /** MTD purchase documents (absent on backends predating Yarn Purchase);
   *  sum(kg) / 1000 equals `production.mtd.purchase_mt`. */
  purchase_detail?: WwdPurchaseDetailRow[];
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
  /** Aligned with `quality` — both comma lists are ordered by quality code. */
  quality_code?: string | null;
  quality?: string | null;
  workers: string | null;
  net_hours: number;
  cuts: number;
  beams: number;
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

// ------------------------------------------------------------------------
// Bale Register — opening / pressed / repacked out / despatched / closing,
// day by day for a date range, per quality or per sacking series.
// Backend: GET /api/juteProductionReports/bale_register
// (vowerp3be src/juteProduction/bale_register.py). Contract: spec
// docs/superpowers/specs/2026-10-12-bale-stock-inspection-design.md §7c.
// No inspection figures — the Finishing Stock report carries them.
// ------------------------------------------------------------------------

/** One calendar day of a register group. Every day of the range is listed,
 * zero-movement days included — it is a register. `closing(d)` = opening(d+1). */
export interface BaleRegisterDay {
  date: string;
  opening: number;
  /** Bale entries dated the day — PROD and REPACK alike (a REPACK row is a new bale). */
  pressed: number;
  /** Bales consumed by a REPACK dated the day. */
  repacked_out: number;
  /** Despatch rows dated the day against a live invoice. */
  despatched_invoice: number;
  /** Despatch rows dated the day without an invoice (challan / DO / transfer / sample). */
  despatched_no_invoice: number;
  /** despatched_invoice + despatched_no_invoice. */
  despatched: number;
  closing: number;
}

/** Period figures of a group or a quality-type total: opening = opening of
 * date_from, movements summed over the range, closing = closing of date_to.
 * `*_kg` / `*_mt` are the Σ net_wt of the bales in stock (MT at 3 dp). */
export interface BaleRegisterPeriod {
  opening: number;
  opening_kg: number;
  opening_mt: number;
  pressed: number;
  repacked_out: number;
  despatched_invoice: number;
  despatched_no_invoice: number;
  despatched: number;
  closing: number;
  closing_kg: number;
  closing_mt: number;
}

export type BaleRegisterGroupBy = "quality" | "series";

/** One register card: a quality (`group_by=quality`, key "q:<fq>") or a
 * series × quality (`group_by=series`, key "s:<series>:<fq>"). Groups with no
 * activity and zero opening are omitted by the backend. */
export interface BaleRegisterGroup {
  key: string;
  finishing_quality_id: number;
  item_name: string | null;
  /** 1 = Hessian, 2 = Sacking. */
  quality_type: FinishingQualityType;
  /** Set when grouped by series; null when grouped by quality. */
  bale_series_id: number | null;
  series_name: string | null;
  days: BaleRegisterDay[];
  period: BaleRegisterPeriod;
}

/** One despatch line: the despatches of one day × series × quality × (invoice
 * or reason/ref), bale numbers compressed ("601, 603-604"). Either the invoice
 * fields or `despatch_reason_label` / `despatch_ref` are filled, never both. */
export interface BaleRegisterDespatchDetail {
  date: string;
  series_name: string | null;
  item_name: string | null;
  quality_type: FinishingQualityType;
  bale_nos: string;
  count: number;
  invoice_id: number | null;
  invoice_no: string | null;
  invoice_date: string | null;
  party_name: string | null;
  /** "Delivery challan", "Delivery order", … for a no-invoice despatch (spec §7b). */
  despatch_reason_label: string | null;
  despatch_ref: string | null;
  remarks: string | null;
}

export interface BaleRegisterReport {
  date_from: string;
  date_to: string;
  group_by: BaleRegisterGroupBy;
  co_name: string | null;
  branch_name: string | null;
  /** Ordered quality_type, item_name, series_name. */
  groups: BaleRegisterGroup[];
  totals: {
    hessian: BaleRegisterPeriod;
    sacking: BaleRegisterPeriod;
    all: BaleRegisterPeriod;
  };
  despatch_detail: BaleRegisterDespatchDetail[];
}

export interface BaleRegisterParams {
  coId: number;
  branchId: number;
  dateFrom: string;
  dateTo: string;
  /** 1 = Hessian, 2 = Sacking; omit for both. */
  qualityType?: FinishingQualityType;
  finishingQualityId?: number;
  baleSeriesId?: number;
  groupBy: BaleRegisterGroupBy;
}

/** Bale Register for a date range — the server caps the range at 92 days and
 * refuses `date_to` after today or `date_from` after `date_to` (400). */
export async function fetchBaleRegister(
  params: BaleRegisterParams,
): Promise<BaleRegisterReport> {
  const qs = new URLSearchParams();
  qs.set("co_id", String(params.coId));
  qs.set("branch_id", String(params.branchId));
  qs.set("date_from", params.dateFrom);
  qs.set("date_to", params.dateTo);
  if (params.qualityType != null) qs.set("quality_type", String(params.qualityType));
  if (params.finishingQualityId != null) {
    qs.set("finishing_quality_id", String(params.finishingQualityId));
  }
  if (params.baleSeriesId != null) qs.set("bale_series_id", String(params.baleSeriesId));
  qs.set("group_by", params.groupBy);
  const url = `${apiRoutesPortalMasters.BALE_REPORT_REGISTER}?${qs.toString()}`;
  const res = await fetchWithCookie<{ data: BaleRegisterReport }>(url);
  if (res.error || !res.data) {
    throw new Error(res.error ?? "Failed to fetch the Bale Register");
  }
  return res.data.data;
}
