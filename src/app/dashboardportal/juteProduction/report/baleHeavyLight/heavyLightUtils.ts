/**
 * Pure helpers for the Bale Heavy/Light report (no React, no fetch) so the
 * classification and the grid-row flattening can be unit-tested.
 *
 * Sign convention (spec §1.2 / §5): positive % = bale is HEAVY (over the
 * standard), negative % = LIGHT. Same as `bag_weight.py` and the DPR yarn HY/LT.
 */

import { alpha, type SxProps, type Theme } from "@mui/material/styles";
import { currentMonthRange, todayIso } from "@/components/reports/reportDates";
import {
  QUALITY_TYPE_HESSIAN,
  QUALITY_TYPE_SACKING,
  type BaleHeavyLight,
  type HeavyLightGridRow,
} from "./types";

export type DeviationKind = "heavy" | "light" | "level";

/** Positive → heavy, negative → light, zero / null / NaN → level (no tint). */
export function classifyDeviation(
  pct: number | string | null | undefined,
): DeviationKind {
  if (pct === null || pct === undefined || pct === "") return "level";
  const n = Number(pct);
  if (!Number.isFinite(n)) return "level";
  if (n > 0) return "heavy";
  if (n < 0) return "light";
  return "level";
}

/** Pill styling for a deviation % cell, tinted from the theme palette (never a
 * literal hex): heavy = error wash (material given away), light = warning wash
 * (short weight) — the same pairing the DPR's HEAVY / LIGHT verdict chip uses.
 * Level (zero / null) gets the plain pill with no tint. */
export function deviationSx(kind: DeviationKind): SxProps<Theme> {
  const pill = {
    display: "inline-block",
    px: 0.75,
    py: 0.125,
    borderRadius: 1,
    lineHeight: 1.6,
  } as const;
  if (kind === "heavy") {
    return (theme: Theme) => ({
      ...pill,
      bgcolor: alpha(theme.palette.error.main, 0.14),
      color: theme.palette.error.dark,
      fontWeight: 600,
    });
  }
  if (kind === "light") {
    return (theme: Theme) => ({
      ...pill,
      bgcolor: alpha(theme.palette.warning.main, 0.22),
      color: theme.palette.warning.dark,
      fontWeight: 600,
    });
  }
  return pill;
}

/** Signed 2-decimal percentage ("+2.08", "-0.59"); "" for null. */
export function fmtSignedPct(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  const s = n.toFixed(2);
  return n > 0 ? `+${s}` : s;
}

/** 1 → Hessian, 2 → Sacking (same codes as jute_prod_finishing_quality). */
export function qualityTypeLabel(qualityType: number | null | undefined): string {
  if (qualityType === QUALITY_TYPE_HESSIAN) return "Hessian";
  if (qualityType === QUALITY_TYPE_SACKING) return "Sacking";
  return "";
}

/** Month-to-date: first day of the current month → today. */
export function mtdRange(): { from: string; to: string } {
  return { from: currentMonthRange().from, to: todayIso() };
}

/**
 * Quality rows in backend order, then the SACKING / HESSIAN / OVERALL group
 * rows in backend order, flattened to one column set. Group rows carry the
 * summary marker: type groups as "Total" (group shade), OVERALL as "Grand
 * Total" — the lead column still reads "OVERALL", so the shared kit renders
 * both at the group level, which is what the sheet's three total lines look
 * like. Null corrected values pass through as null (blank cells).
 */
export function buildHeavyLightGridRows(data: BaleHeavyLight): HeavyLightGridRow[] {
  const qualityRows: HeavyLightGridRow[] = data.rows.map((r) => ({
    __id: `q:${r.finishing_quality_id}`,
    __kind: "quality",
    __marker: "",
    quality: r.item_name,
    type: qualityTypeLabel(r.quality_type),
    bales: r.bales,
    weft_count: r.weft_count,
    avg_mr: r.avg_mr,
    mr_source: r.mr_source,
    std_bale_wt: r.std_bale_wt,
    obs_per_bale: r.obs_per_bale,
    corr_per_bale: r.corr_per_bale,
    obs_pct: r.obs_pct,
    corr_pct: r.corr_pct,
    total_std: r.total_std,
    total_obs: r.total_obs,
    total_corr: r.total_corr,
  }));
  const groupRows: HeavyLightGridRow[] = data.groups.map((g) => ({
    __id: `g:${g.label}`,
    __kind: "group",
    __marker: g.label === "OVERALL" ? "Grand Total" : "Total",
    quality: g.label,
    type: "",
    bales: g.bales,
    weft_count: null,
    avg_mr: null,
    mr_source: "",
    std_bale_wt: null,
    obs_per_bale: null,
    corr_per_bale: null,
    obs_pct: g.obs_pct,
    corr_pct: g.corr_pct,
    total_std: g.total_std,
    total_obs: g.total_obs,
    total_corr: g.total_corr,
  }));
  return [...qualityRows, ...groupRows];
}
