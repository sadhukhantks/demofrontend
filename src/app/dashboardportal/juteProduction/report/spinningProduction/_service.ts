/**
 * Spinning Production Report service.
 *
 * Backend: GET /api/juteProductionReports/spinning_production_datewise
 * (vowerp3be src/juteProduction/spinning_prod_report.py).
 */

import { apiRoutesPortalMasters } from "@/utils/api";
import { fetchWithCookie } from "@/utils/apiClient2";

export type SpinningReportType = "quality" | "worker" | "total" | "side" | "machine";

export interface SpinningReportTypeOption {
  value: SpinningReportType;
  label: string;
}

export const SPINNING_REPORT_TYPES: readonly SpinningReportTypeOption[] = Object.freeze([
  { value: "quality", label: "Quality Wise Report" },
  { value: "worker", label: "Worker Wise Report" },
  { value: "total", label: "Total Prod Wise Report" },
  { value: "side", label: "Side Wise Report" },
  { value: "machine", label: "Machine Wise Report" },
]);

/** One pivot line of a group (or of its Total / the Grand Total). */
export interface SpinningDatewiseRow {
  /** First label, or "Grand Total". Null on the Total Prod Wise report. */
  label1: string | null;
  /** Second label, or "Total" on a subtotal. */
  label2: string | null;
  /** "Prod (kg)" | "Eff %" | "Frames Run" | "Avg Prod/Frame". */
  line: string;
  /** ISO date -> value. Days with nothing are absent. */
  days: Record<string, number>;
  /** Null on the lines that are not additive (Eff %, Avg Prod/Frame). */
  total: number | null;
  average: number | null;
}

export interface SpinningDatewiseReport {
  /** Every date in the period, in order — one grid column each. */
  dates: string[];
  /** Headers of the label columns for this report type (0, 1 or 2). */
  labels: string[];
  rows: SpinningDatewiseRow[];
}

export interface SpinningDatewiseFilters {
  coId: number;
  branchId: number;
  dateFrom: string;
  dateTo: string;
  reportType: SpinningReportType;
}

export async function fetchSpinningDatewise(
  f: SpinningDatewiseFilters,
): Promise<SpinningDatewiseReport> {
  const qs = new URLSearchParams({
    co_id: String(f.coId),
    branch_id: String(f.branchId),
    date_from: f.dateFrom,
    date_to: f.dateTo,
    report_type: f.reportType,
  });
  const res = await fetchWithCookie<{ data: SpinningDatewiseReport }>(
    `${apiRoutesPortalMasters.JUTE_PROD_SPINNING_DATEWISE}?${qs.toString()}`,
  );
  if (res.error || !res.data) {
    throw new Error(res.error ?? "Failed to fetch the spinning production report");
  }
  return res.data.data;
}
