/**
 * Service layer for the daily Wastage Report.
 *
 * Backend: GET /api/juteProductionReports/wastage_report
 * (vowerp3be src/juteProduction/wastage_report.py). Fully DERIVED — waste kg
 * from the Waste Entry page, denominators from production entries; the
 * column/group layout comes from the tenant's jute_waste_report_map rows, so
 * groups and components here are dynamic data, not constants. Waste with no
 * mapping row arrives in the OTHER group — it must stay visible.
 */

import { apiRoutesPortalMasters } from "@/utils/api";
import { fetchWithCookie } from "@/utils/apiClient2";

export interface WastageComponent {
  /** "itemId:deptId" — the cell key used in day/totals `cells`. */
  key: string;
  label: string;
  group_code: string;
  order: number;
}

export interface WastageGroupColumn {
  group_code: string;
  group_name: string;
  /** WEAVING | SPINNING | BREAKER_FEED | SELECTION | NONE */
  day_denom: string;
  total_denom: string;
  display_order: number;
  components: WastageComponent[];
}

export interface WastageGroupValue {
  total: number;
  pct: number | null;
}

export interface WastageDayRow {
  date: string;
  hessian_looms: number;
  sacking_looms: number;
  frames_run: number;
  weaving_kg: number;
  spinning_kg: number;
  breaker_feed_kg: number;
  selection_wt: number;
  cells: Record<string, number>;
  groups: Record<string, WastageGroupValue>;
}

export type WastageTotalsRow = Omit<WastageDayRow, "date">;

export interface WastageReport {
  month: string;
  columns: WastageGroupColumn[];
  days: WastageDayRow[];
  totals: WastageTotalsRow | null;
}

export async function fetchWastageReport(params: {
  coId: number;
  branchId: number;
  month: string; // YYYY-MM
}): Promise<WastageReport> {
  const qs = new URLSearchParams();
  qs.set("co_id", String(params.coId));
  qs.set("branch_id", String(params.branchId));
  qs.set("month", params.month);
  const url = `${apiRoutesPortalMasters.JUTE_WASTAGE_REPORT}?${qs.toString()}`;
  const res = await fetchWithCookie<{ data: WastageReport }>(url);
  if (res.error || !res.data) {
    throw new Error(res.error ?? "Failed to fetch the wastage report");
  }
  return res.data.data;
}
