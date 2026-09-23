/**
 * Selection vs Jute Issue — response contract.
 * Mirrors `docs/claude/modules/jute-production/selection-trolley-weight-spec.md` §3.3
 * (`GET /api/juteProductionReports/selection_vs_issue?co_id&branch_id&date_from&date_to`).
 * Every response is wrapped as `{ data: SelectionVsIssueReport }`.
 */

/** One raw-jute quality over the whole period (issue side vs selection side). */
export interface QualityRow {
  item_id: number;
  item_code: string | null;
  item_name: string;
  issue_kg: number;
  selection_kg: number;
  trolleys: number;
  /** selection_kg − issue_kg */
  diff_kg: number;
  /** diff_kg / issue_kg × 100, 2dp; null when issue_kg = 0. */
  diff_pct: number | null;
}

/** One (date, quality) cell — a quality on only one side still appears with 0 on the other. */
export interface DayRow {
  tran_date: string;
  item_id: number;
  item_name: string;
  issue_kg: number;
  selection_kg: number;
  trolleys: number;
  diff_kg: number;
}

/** Selection rows that carry a gate entry, grouped per (MR, quality), against
 * that MR's issued kg of the same quality in the range. */
export interface GateEntryRow {
  jute_mr_id: number;
  gate_entry_no: number | string | null;
  gate_entry_date: string | null;
  item_id: number;
  item_name: string;
  issue_kg: number;
  selection_kg: number;
  trolleys: number;
  diff_kg: number;
}

export interface ReportTotals {
  issue_kg: number;
  selection_kg: number;
  trolleys: number;
  diff_kg: number;
  diff_pct: number | null;
}

export interface SelectionVsIssueReport {
  date_from: string;
  date_to: string;
  branch_id: number;
  branch_name: string | null;
  by_quality: QualityRow[];
  by_day: DayRow[];
  /** Optional in the contract ("extra section"); treated as [] when absent. */
  by_gate_entry?: GateEntryRow[];
  /** Optional: when the backend omits it the KPI strip derives it from by_quality. */
  totals?: ReportTotals;
}

// ------------------------------------------------------------ grid rows ----

/** "By quality" grid row: the API rows plus the Grand Total line. */
export interface QualityGridRow extends QualityRow {
  id: string;
}

export interface DayGridRow extends DayRow {
  id: string;
}

export interface GateGridRow extends GateEntryRow {
  id: string;
}

/** One line of the flattened Excel export — the three grids stacked under a
 * `section` column so a single sheet is self-describing. Text columns hold ""
 * where a row has no value; numeric columns hold null so the sheet's number
 * format still applies. */
export interface ExportRow {
  id: string;
  section: string;
  tran_date: string;
  gate_entry_no: string;
  gate_entry_date: string;
  item_code: string;
  item_name: string;
  issue_kg: number | null;
  selection_kg: number | null;
  trolleys: number | null;
  diff_kg: number | null;
  diff_pct: number | null;
}
