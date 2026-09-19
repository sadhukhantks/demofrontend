/**
 * Bale Heavy/Light report — response contract.
 * Mirrors `docs/bale-production-spec-sheet.md` §6.3
 * (`GET /api/juteProductionReports/bale_heavy_light?co_id&branch_id&date_from&date_to`).
 * Every response is wrapped as `{ data: BaleHeavyLight }`.
 */

/** Where the row's avg MR % came from: a reading for the item itself, the
 * HESSIAN/SACKING group fallback, or nothing (corrected columns are null). */
export type MrSource = "item" | "group" | "none";

/** Quality type code shared with `jute_prod_finishing_quality.quality_type`. */
export const QUALITY_TYPE_HESSIAN = 1;
export const QUALITY_TYPE_SACKING = 2;

export interface BaleHeavyLightRow {
  finishing_quality_id: number;
  item_name: string;
  quality_type: number;
  bales: number;
  weft_count: number | null;
  avg_mr: number | null;
  mr_source: MrSource;
  std_bale_wt: number | null;
  std_mr_pct: number | null;
  obs_per_bale: number | null;
  corr_per_bale: number | null;
  obs_pct: number | null;
  corr_pct: number | null;
  total_std: number | null;
  total_obs: number | null;
  total_corr: number | null;
}

export type HeavyLightGroupLabel = "SACKING" | "HESSIAN" | "OVERALL";

export interface BaleHeavyLightGroup {
  label: HeavyLightGroupLabel;
  bales: number;
  total_std: number | null;
  total_obs: number | null;
  total_corr: number | null;
  obs_pct: number | null;
  corr_pct: number | null;
}

export interface BaleHeavyLight {
  date_from: string;
  date_to: string;
  rows: BaleHeavyLightRow[];
  groups: BaleHeavyLightGroup[];
  /** e.g. "2 qualities had no MR reading — corrected columns left blank" */
  notes: string[];
}

/** One grid line — a quality row or one of the SACKING / HESSIAN / OVERALL
 * group totals, both flattened to the same column set. `__`-prefixed keys are
 * ours (row identity + the total-row marker) and never become columns. */
export interface HeavyLightGridRow {
  __id: string;
  __kind: "quality" | "group";
  /** "Total" / "Grand Total" on group rows so the shared report kit (grid and
   * Excel export) styles them as summary rows; "" on quality rows. */
  __marker: string;
  quality: string;
  type: string;
  bales: number;
  weft_count: number | null;
  avg_mr: number | null;
  mr_source: MrSource | "";
  std_bale_wt: number | null;
  obs_per_bale: number | null;
  corr_per_bale: number | null;
  obs_pct: number | null;
  corr_pct: number | null;
  total_std: number | null;
  total_obs: number | null;
  total_corr: number | null;
}
