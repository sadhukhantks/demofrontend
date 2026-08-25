/**
 * Weaving Low Producer report service.
 *
 * Backend: GET /api/juteProductionReports/weaving_low_producer
 * (vowerp3be src/juteProduction/lowprod_weaving.py). One call returns all four
 * views of the report — the raw loom-spell rows plus the worker, day and
 * loom-group rollups — because every rollup is computed from the same filtered
 * row set server-side.
 *
 * Kept next to the page rather than in utils/juteProductionReportService.ts:
 * these types are used by this route only.
 */

import { apiRoutesPortalMasters } from "@/utils/api";
import { fetchWithCookie } from "@/utils/apiClient2";

/** One loom + spell + date row of the day slice. */
export interface WeavingLowProdBaseRow {
  tran_date: string;
  /** A / B / C (or G for anything else) — first char of spell_code. */
  shift: string;
  spell_code: string | null;
  machine_id: number | null;
  loom: string | null;
  eb_id: number | null;
  worker_name: string | null;
  quality_id: number | null;
  quality_name: string | null;
  /** Band of 6 looms by the numeric tail of the loom name, e.g. "7to12". */
  loom_group: string | null;
  act_prod_kg: number;
  prod_100_kg: number;
  eff_pct: number;
  hours: number;
}

/** Per-worker rollup, sorted worst average efficiency first. */
export interface WeavingLowProdWorkerRow {
  eb_id: number | null;
  worker_name: string | null;
  days_attended: number;
  avg_looms_run: number;
  eff_a: number | null;
  eff_b: number | null;
  eff_c: number | null;
  avg_eff: number | null;
}

/** Per-date rollup, shift-wise. avg_eff_total is count-weighted. */
export interface WeavingLowProdDayRow {
  date: string;
  act_prod_a: number;
  act_prod_b: number;
  act_prod_c: number;
  act_prod_total: number;
  avg_eff_a: number | null;
  avg_eff_b: number | null;
  avg_eff_c: number | null;
  avg_eff_total: number | null;
  looms_run_a: number;
  looms_run_b: number;
  looms_run_c: number;
  looms_run_total: number;
  kg_per_loom_a: number;
  kg_per_loom_b: number;
  kg_per_loom_c: number;
  kg_per_loom_total: number;
}

/** Per loom-band rollup — finds a bad stretch of the shed. */
export interface WeavingLowProdLoomGroupRow {
  loom_group: string;
  avg_eff_a: number | null;
  avg_eff_b: number | null;
  avg_eff_c: number | null;
  avg_eff: number | null;
  max_eff: number | null;
  min_eff: number | null;
}

export interface WeavingLowProdMeta {
  co_id: number;
  branch_id: number;
  date_from: string;
  date_to: string;
  /** Average over rows with a non-zero efficiency ("shed average"). */
  filtered_avg_eff: number | null;
  /** Average over every row in the range, zeros included. */
  overall_avg_eff: number | null;
  notes: string[];
}

export interface WeavingLowProducerReport {
  base_rows: WeavingLowProdBaseRow[];
  worker_summary: WeavingLowProdWorkerRow[];
  day_summary: WeavingLowProdDayRow[];
  loom_group_summary: WeavingLowProdLoomGroupRow[];
  meta: WeavingLowProdMeta;
}

/** Filter state as the page holds it — empty string means "not applied". */
export interface WeavingLowProducerFilters {
  coId: number;
  branchId: number;
  dateFrom: string;
  dateTo: string;
  qualityId?: string;
  shift?: string;
  ebNo?: string;
  loom?: string;
  minDays?: string;
  maxDays?: string;
  minEff?: string;
  maxEff?: string;
}

/** Optional filters, in the query-param names the endpoint expects. */
const OPTIONAL_PARAMS: [keyof WeavingLowProducerFilters, string][] = [
  ["qualityId", "quality_id"],
  ["shift", "shift"],
  ["ebNo", "eb_no"],
  ["loom", "loom"],
  ["minDays", "min_days"],
  ["maxDays", "max_days"],
  ["minEff", "min_eff"],
  ["maxEff", "max_eff"],
];

/** Loom-spell efficiency rows plus the worker / day / loom-group rollups. */
export async function fetchWeavingLowProducer(
  f: WeavingLowProducerFilters,
): Promise<WeavingLowProducerReport> {
  const qs = new URLSearchParams();
  qs.set("co_id", String(f.coId));
  qs.set("branch_id", String(f.branchId));
  qs.set("date_from", f.dateFrom);
  qs.set("date_to", f.dateTo);
  for (const [key, param] of OPTIONAL_PARAMS) {
    const value = f[key];
    // Blank filters are omitted, not sent empty: the endpoint treats a present
    // param as a filter to apply.
    if (typeof value === "string" && value.trim() !== "") {
      qs.set(param, value.trim());
    }
  }
  const url = `${apiRoutesPortalMasters.JP_WEAVING_LOW_PRODUCER}?${qs.toString()}`;
  const res = await fetchWithCookie<{ data: WeavingLowProducerReport }>(url);
  if (res.error || !res.data) {
    throw new Error(res.error ?? "Failed to fetch the weaving low producer report");
  }
  return res.data.data;
}

export interface QualityOption {
  quality_id: number;
  quality_name: string;
}

/**
 * The qualities actually present in the loaded rows, deduped and sorted by
 * name. Feeds the Quality filter — no separate master fetch, and no options for
 * qualities the shed never ran in the selected range.
 */
export function qualitiesOf(rows: WeavingLowProdBaseRow[]): QualityOption[] {
  const seen = new Map<number, string>();
  for (const r of rows) {
    if (r.quality_id != null && !seen.has(r.quality_id)) {
      // A row can carry an id with no name (quality deleted since entry) —
      // fall back to the id so the option is still selectable.
      seen.set(r.quality_id, r.quality_name ?? String(r.quality_id));
    }
  }
  return [...seen]
    .map(([quality_id, quality_name]) => ({ quality_id, quality_name }))
    .sort((a, b) => a.quality_name.localeCompare(b.quality_name));
}
