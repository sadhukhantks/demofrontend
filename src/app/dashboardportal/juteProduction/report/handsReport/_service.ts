/**
 * Hands Report service.
 *
 * Backend: GET /api/juteProductionReports/hands_report
 * (vowerp3be src/juteProduction/hands_report.py). Actual worker hands from
 * `daily_attendance` against the effective-dated manning norms in
 * `hands_norm_mst`, per designation per date.
 *
 * The endpoint rolls up server-side and returns ONE `rows` array per `view`, so
 * the view selector is a refetch, not a client-side regroup — the four views
 * are different grains of the same detail grid and re-deriving them here would
 * only let them drift.
 *
 * Kept next to the page rather than in utils/juteProductionReportService.ts:
 * these types are used by this route only.
 */

import { apiRoutesPortalMasters } from "@/utils/api";
import { fetchWithCookie } from "@/utils/apiClient2";

export type HandsView = "detailed" | "by_date" | "by_occupation" | "by_department";

export const HANDS_VIEWS: { value: HandsView; label: string }[] = [
  { value: "detailed", label: "Detailed" },
  { value: "by_date", label: "By Date" },
  { value: "by_occupation", label: "By Occupation" },
  { value: "by_department", label: "By Department" },
];

/**
 * One row of any view. Which identity fields are filled depends on the view
 * (detailed has all of them, by_date only `date`, by_department only the dept
 * pair) — the numeric columns are the same set throughout, which is what lets
 * one row type and one grid serve all four.
 *
 * A null target means the norm could not be resolved (no norm row, or a
 * variable norm with no machine link); it is NOT a zero target, and the
 * backend leaves excess/short null with it rather than inventing a shortfall.
 */
export interface HandsRow {
  date?: string;
  dept_id?: number | null;
  dept?: string | null;
  designation_id?: number | null;
  designation?: string | null;
  /** 'D' / 'I' — from the norm row, falling back to the designation master. */
  direct_indirect?: string | null;
  /** 'V' / 'F' — variable norms are targeted off machines that actually ran. */
  variable_fixed?: string | null;
  norms_text?: string | null;
  machine_type_id?: number | null;

  shift_a: number | null;
  shift_b: number | null;
  shift_c: number | null;
  shift_g: number | null;
  target_a: number | null;
  target_b: number | null;
  target_c: number | null;
  target_g: number | null;
  total_actual: number | null;
  total_target: number | null;
  excess: number | null;
  short: number | null;

  /** by_date only — the direct/indirect split of that day's hands. */
  direct_actual?: number | null;
  direct_target?: number | null;
  indirect_actual?: number | null;
  indirect_target?: number | null;
  /** Hands whose designation carries no D/I marking — shown, never dropped. */
  unclassified_actual?: number | null;
  unclassified_target?: number | null;
}

export interface HandsMeta {
  co_id: number;
  branch_id: number;
  date_from: string;
  date_to: string;
  view: HandsView;
  row_count: number;
  total_actual: number | null;
  total_target: number | null;
  total_excess: number | null;
  total_short: number | null;
  notes: string[];
}

export interface HandsReport {
  view: HandsView;
  rows: HandsRow[];
  /** by_department only — the GRAND TOTAL line, carried separately so it is
   * never sorted into the middle of the departments. */
  grand_total?: HandsRow;
  meta: HandsMeta;
}

export interface HandsReportFilters {
  coId: number;
  branchId: number;
  dateFrom: string;
  dateTo: string;
  view: HandsView;
  deptId?: string;
  directIndirect?: string;
}

export async function fetchHandsReport(f: HandsReportFilters): Promise<HandsReport> {
  const qs = new URLSearchParams();
  qs.set("co_id", String(f.coId));
  qs.set("branch_id", String(f.branchId));
  qs.set("date_from", f.dateFrom);
  qs.set("date_to", f.dateTo);
  qs.set("view", f.view);
  // Blank filters are omitted, not sent empty: the endpoint treats a present
  // param as a filter to apply.
  if (f.deptId?.trim()) qs.set("dept_id", f.deptId.trim());
  if (f.directIndirect?.trim()) qs.set("direct_indirect", f.directIndirect.trim());

  const url = `${apiRoutesPortalMasters.JP_HANDS_REPORT}?${qs.toString()}`;
  const res = await fetchWithCookie<{ data: HandsReport }>(url);
  if (res.error || !res.data) {
    throw new Error(res.error ?? "Failed to fetch the hands report");
  }
  return res.data.data;
}
