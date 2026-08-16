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
