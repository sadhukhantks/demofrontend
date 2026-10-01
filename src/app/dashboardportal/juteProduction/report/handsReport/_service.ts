/**
 * Hands Report service.
 *
 * Backend: GET /api/juteProductionReports/hands_report
 * (vowerp3be src/juteProduction/hands_report.py). Actual worker hands from
 * `daily_attendance` against the effective-dated manning norms in
 * `hands_norm_mst`, per designation per date.
 *
 * The endpoint rolls up server-side and returns ONE `rows` array per `view`, so
 * the view selector is a refetch, not a client-side regroup — the four manning
 * views are different grains of the same detail grid and re-deriving them here
 * would only let them drift.
 *
 * The fifth view, "Machines Run", is the machine-wise sheet behind the variable
 * targets: one row per date x shift x machine, deduplicated across every
 * machine-keyed entry, with a per-type summary block.
 *
 * Kept next to the page rather than in utils/juteProductionReportService.ts:
 * these types are used by this route only.
 */

import { apiRoutesPortalMasters } from "@/utils/api";
import { fetchWithCookie } from "@/utils/apiClient2";

export type HandsView =
  | "detailed"
  | "by_date"
  | "by_occupation"
  | "by_department"
  | "machines_run";

export const HANDS_VIEWS: { value: HandsView; label: string }[] = [
  { value: "detailed", label: "Detailed" },
  { value: "by_date", label: "By Date" },
  { value: "by_occupation", label: "By Occupation" },
  { value: "by_department", label: "By Department" },
  { value: "machines_run", label: "Machines Run" },
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
  /** 'V' / 'F' — legacy flag (V = machine / production based). Kept for
   * pre-v2 backends; `norm_kind` is the real kind when present. */
  variable_fixed?: string | null;
  /** Hands Norms v2: F fixed, M machine-based, P production-based, N no norm
   * (target blank, out of excess/short), A as actual (target = hands). */
  norm_kind?: string | null;
  norms_text?: string | null;
  machine_type_id?: number | null;
  machine_group_id?: number | null;
  machine_group?: string | null;
  /** M: group / type / department units one hand covers. */
  units_per_hand?: number | null;
  /** P: production per hand per shift, in qty_uom ('kg' | 'cuts'). */
  qty_per_hand?: number | null;
  qty_uom?: string | null;

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

  /** Month-to-date (TKT-000154): the 1st of the To Date's month up to the To
   * Date on the rollup views; on Detailed / By Date each row runs up to its
   * own date. Same per-day excess/short rule, summed — never netted. */
  mtd_actual?: number | null;
  mtd_target?: number | null;
  mtd_excess?: number | null;
  mtd_short?: number | null;

  /** by_date only — the direct/indirect split of that day's hands. */
  direct_actual?: number | null;
  direct_target?: number | null;
  indirect_actual?: number | null;
  indirect_target?: number | null;
  /** Hands whose designation carries no D/I marking — shown, never dropped. */
  unclassified_actual?: number | null;
  unclassified_target?: number | null;
}

/**
 * One machine-shift of the Machines Run view. `sources` is the comma-joined
 * list of entries the machine was seen in (e.g. "Weaving, Attendance,
 * Stoppage") — kept as a string so the Excel export and the auto-sized column
 * see the same text the chips render. `counted` is false when the only
 * evidence is a stoppage / breakdown entry: listed, never counted as run.
 */
export interface MachineRunRow {
  date: string;
  shift: string;
  dept_id?: number | null;
  dept?: string | null;
  machine_type_id?: number | null;
  machine_type?: string | null;
  machine_id: number;
  machine: string;
  mech_code?: string | null;
  sources: string;
  /** Distinct workers marked on the machine in attendance; null if none marked. */
  hands: number | null;
  stoppage_hours: number | null;
  breakdown_min: number | null;
  counted: boolean;
  /** v2: production the machine-shift carried on its run-source legs (null when none). */
  prod_kg?: number | null;
  prod_cuts?: number | null;
}

/** Counted machines per date x machine type, by shift — the variable-norm
 * multiplier read straight off the sheet. */
export interface MachineTypeSummaryRow {
  date: string;
  machine_type_id?: number | null;
  machine_type?: string | null;
  run_a: number;
  run_b: number;
  run_c: number;
  run_g: number;
  /** Sum of the shift counts. */
  machine_shifts: number;
  /** Distinct machines that day — a loom in A and B is one here, two above. */
  machines: number;
  /** v2: production summed over the type's counted machine-shifts. */
  prod_kg?: number | null;
  prod_cuts?: number | null;
}

export type NormKind = "F" | "M" | "P" | "N" | "A";

/** Short code the Kind column shows, and its full name for the tooltip / legend. */
export const NORM_KIND_NAMES: Record<NormKind, string> = {
  F: "Fixed",
  M: "Machine-based",
  P: "Production-based",
  N: "No norm",
  A: "As actual",
};

/**
 * The row's norm kind: `norm_kind` when the backend sends one (v2), else the
 * legacy reading — V or a machine link is M, F is F, nothing is nothing. Total
 * rows and designations without a norm carry no kind.
 */
export function normKindOf(
  row: Pick<HandsRow, "norm_kind" | "variable_fixed" | "machine_type_id" | "machine_group_id">,
): NormKind | null {
  const k = (row.norm_kind ?? "").trim().toUpperCase();
  if (k === "F" || k === "M" || k === "P" || k === "N" || k === "A") return k;
  const vf = (row.variable_fixed ?? "").trim().toUpperCase();
  if (vf === "V" || row.machine_type_id != null || row.machine_group_id != null) return "M";
  return vf === "F" ? "F" : null;
}

/** Cell text of the Kind column: the letter, "" when the row has no norm. */
export function normKindLabel(row: Parameters<typeof normKindOf>[0]): string {
  return normKindOf(row) ?? "";
}

export function isMachineRunRow(row: HandsRow | MachineRunRow): row is MachineRunRow {
  return typeof (row as MachineRunRow).machine_id === "number" && "sources" in row;
}

/** "Weaving, Attendance" -> ["Weaving", "Attendance"]; blanks dropped. */
export function splitSources(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
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
  /** Month-to-date as at date_to, from mtd_from (the 1st of its month). */
  mtd_from?: string;
  mtd_actual?: number | null;
  mtd_target?: number | null;
  mtd_excess?: number | null;
  mtd_short?: number | null;
  /** Machines Run figures for the whole window, present on every view. */
  machine_shifts_run?: number;
  machines_run?: number;
  stopped_only_rows?: number;
  notes: string[];
}

export interface HandsReport {
  view: HandsView;
  /** HandsRow[] for the manning views, MachineRunRow[] for machines_run. */
  rows: Array<HandsRow | MachineRunRow>;
  /** by_department only — the GRAND TOTAL line, carried separately so it is
   * never sorted into the middle of the departments. */
  grand_total?: HandsRow;
  /** machines_run only. */
  type_summary?: MachineTypeSummaryRow[];
  /** detailed only (TKT-000167) — one total per date x department, and one
   * per date, rolled up server-side; placed by `withDetailedTotals`. */
  dept_totals?: HandsRow[];
  day_totals?: HandsRow[];
  meta: HandsMeta;
}

/** Label of a department subtotal whose rows carry no department. */
export const NO_DEPARTMENT = "(No department)";

/**
 * Detailed view (TKT-000167): puts the department subtotals and day totals the
 * endpoint returns beside `rows` where a printed sheet has them, so each
 * department closes with its Total line and each date with the day's Total.
 * Pure placement: every figure comes from the server, nothing is summed here.
 * Relies on the endpoint's date -> department -> occupation row order.
 *
 * The labels are what ReportGrid and the Excel export detect: a cell reading
 * "Total" marks a total row, and its level comes from the Date column, so the
 * department line (Date blank) shades as an inner subtotal and the day line
 * (Date filled) as the group total above it.
 */
export function withDetailedTotals(
  rows: HandsRow[],
  deptTotals: HandsRow[],
  dayTotals: HandsRow[],
): HandsRow[] {
  const deptKey = (date?: string, deptId?: number | null) => `${date ?? ""}|${deptId ?? ""}`;
  const byDept = new Map(deptTotals.map((t) => [deptKey(t.date, t.dept_id), t]));
  const byDay = new Map(dayTotals.map((t) => [t.date ?? "", t]));
  const out: HandsRow[] = [];
  rows.forEach((row, i) => {
    out.push(row);
    const next: HandsRow | undefined = rows[i + 1];
    const dateEnds = next === undefined || next.date !== row.date;
    const deptEnds = dateEnds || (next?.dept_id ?? null) !== (row.dept_id ?? null);
    if (deptEnds) {
      const t = byDept.get(deptKey(row.date, row.dept_id));
      if (t) out.push({ ...t, date: "", dept: t.dept || NO_DEPARTMENT, designation: "Total" });
    }
    if (dateEnds) {
      const t = byDay.get(row.date ?? "");
      if (t) out.push({ ...t, dept: "Total", designation: "" });
    }
  });
  return out;
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
  // Machines have no direct/indirect side; the endpoint ignores it on that
  // view, so it is simply not sent.
  if (f.view !== "machines_run" && f.directIndirect?.trim()) {
    qs.set("direct_indirect", f.directIndirect.trim());
  }

  const url = `${apiRoutesPortalMasters.JP_HANDS_REPORT}?${qs.toString()}`;
  const res = await fetchWithCookie<{ data: HandsReport }>(url);
  if (res.error || !res.data) {
    throw new Error(res.error ?? "Failed to fetch the hands report");
  }
  return res.data.data;
}
