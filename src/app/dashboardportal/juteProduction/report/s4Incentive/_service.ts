/**
 * S4 Incentive Report service.
 *
 * Backend: GET /api/juteProductionReports/s4_incentive
 * (vowerp3be src/juteProduction/s4_incentive.py).
 */

import { apiRoutesPortalMasters } from "@/utils/api";
import { fetchWithCookie } from "@/utils/apiClient2";

/** One weaver on the S4 looms over the range. */
export interface S4IncentiveRow {
  eb_id: number;
  eb_no: string | null;
  worker_name: string | null;
  /** ISO date -> that day's hour-weighted whole efficiency %. */
  days: Record<string, number>;
  /** ISO dates whose efficiency earned an incentive (highlighted green). */
  inc_dates: string[];
  total_days: number;
  avg_eff: number;
  total_inc_amt: number;
  inc_days: number;
}

export interface S4IncentiveReport {
  /** Every date in the range, in order — one grid column each. */
  dates: string[];
  rows: S4IncentiveRow[];
  total_inc_amt: number;
  notes: string[];
}

export interface S4IncentiveFilters {
  coId: number;
  branchId: number;
  dateFrom: string;
  dateTo: string;
  ebNo?: string;
}

export async function fetchS4Incentive(f: S4IncentiveFilters): Promise<S4IncentiveReport> {
  const qs = new URLSearchParams({
    co_id: String(f.coId),
    branch_id: String(f.branchId),
    date_from: f.dateFrom,
    date_to: f.dateTo,
  });
  if (f.ebNo?.trim()) qs.set("eb_no", f.ebNo.trim());
  const res = await fetchWithCookie<{ data: S4IncentiveReport }>(
    `${apiRoutesPortalMasters.JP_S4_INCENTIVE}?${qs.toString()}`,
  );
  if (res.error || !res.data) {
    throw new Error(res.error ?? "Failed to fetch the S4 incentive report");
  }
  return res.data.data;
}
