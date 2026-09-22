/**
 * Pure helpers for the Selection vs Jute Issue report (no React, no fetch):
 * KPI totals derived from the by-quality rows, the Grand Total row builder,
 * grid-row id-ing and the three-grid → one-sheet flattening the Excel export
 * uses. Unit-tested in ./selectionVsIssueUtils.test.ts.
 */

import type { GridColDef } from "@mui/x-data-grid";
import type {
  DayGridRow,
  DayRow,
  ExportRow,
  GateEntryRow,
  GateGridRow,
  QualityGridRow,
  QualityRow,
  ReportTotals,
  SelectionVsIssueReport,
} from "./types";

export const GRAND_TOTAL_LABEL = "Grand Total";
export const GRAND_TOTAL_ID = "grand-total";

/** Longest range the backend accepts (spec §3.1). */
export const MAX_RANGE_DAYS = 366;

const round = (n: number, dp: number): number => {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
};

/** Weights to 3dp, matching the backend rounding. */
export const round3 = (n: number): number => round(n, 3);

/** diff_kg / issue_kg × 100 rounded to 2dp; null when there is no issue. */
export function diffPct(diffKg: number, issueKg: number): number | null {
  if (!issueKg) return null;
  return round((diffKg / issueKg) * 100, 2);
}

/**
 * KPI totals summed from the by-quality rows. `diff_kg` is recomputed from
 * the summed sides (not summed from the rows) so a rounding drift in one row
 * cannot make the strip disagree with itself; `diff_pct` is null when nothing
 * was issued.
 */
export function totalsFromByQuality(rows: readonly QualityRow[]): ReportTotals {
  let issue = 0;
  let selection = 0;
  let trolleys = 0;
  for (const r of rows) {
    issue += Number(r.issue_kg) || 0;
    selection += Number(r.selection_kg) || 0;
    trolleys += Number(r.trolleys) || 0;
  }
  const issueKg = round3(issue);
  const selectionKg = round3(selection);
  const diffKg = round3(selectionKg - issueKg);
  return {
    issue_kg: issueKg,
    selection_kg: selectionKg,
    trolleys,
    diff_kg: diffKg,
    diff_pct: diffPct(diffKg, issueKg),
  };
}

/** The API's totals when present, else derived from by_quality. */
export function resolveTotals(data: SelectionVsIssueReport): ReportTotals {
  return data.totals ?? totalsFromByQuality(data.by_quality);
}

/** The Grand Total line appended to the "By quality" grid. Its `item_name` is
 * the marker the shared report kit recognises for bold/shaded total rows. */
export function buildGrandTotalRow(rows: readonly QualityRow[]): QualityGridRow {
  const t = totalsFromByQuality(rows);
  return {
    id: GRAND_TOTAL_ID,
    item_id: 0,
    item_code: "",
    item_name: GRAND_TOTAL_LABEL,
    issue_kg: t.issue_kg,
    selection_kg: t.selection_kg,
    trolleys: t.trolleys,
    diff_kg: t.diff_kg,
    diff_pct: t.diff_pct,
  };
}

export const isGrandTotalRow = (row: { id: string }): boolean =>
  row.id === GRAND_TOTAL_ID;

/** By-quality grid rows + Grand Total (empty input → empty output, no lone total). */
export function buildQualityGridRows(rows: readonly QualityRow[]): QualityGridRow[] {
  if (rows.length === 0) return [];
  const out: QualityGridRow[] = rows.map((r) => ({ ...r, id: `q:${r.item_id}` }));
  out.push(buildGrandTotalRow(rows));
  return out;
}

export function buildDayGridRows(rows: readonly DayRow[]): DayGridRow[] {
  return rows.map((r) => ({ ...r, id: `d:${r.tran_date}:${r.item_id}` }));
}

export function buildGateGridRows(rows: readonly GateEntryRow[]): GateGridRow[] {
  return rows.map((r) => ({ ...r, id: `g:${r.jute_mr_id}:${r.item_id}` }));
}

// -------------------------------------------------------------- export ----

export const SECTION_QUALITY = "By quality";
export const SECTION_DAY = "Day-wise";
export const SECTION_GATE = "By gate entry";

const text = (v: string | number | null | undefined): string =>
  v === null || v === undefined ? "" : String(v);

/**
 * Flattens the three grids into one row list for the Excel export. Each row
 * is tagged with its section; the by-quality block ends with the Grand Total
 * (bold/shaded by the shared kit), and blank spacer rows separate sections.
 */
export function flattenForExcel(data: SelectionVsIssueReport): ExportRow[] {
  const out: ExportRow[] = [];
  const blank = (id: string): ExportRow => ({
    id,
    section: "",
    tran_date: "",
    gate_entry_no: "",
    gate_entry_date: "",
    item_code: "",
    item_name: "",
    issue_kg: null,
    selection_kg: null,
    trolleys: null,
    diff_kg: null,
    diff_pct: null,
  });

  for (const r of buildQualityGridRows(data.by_quality)) {
    out.push({
      ...blank(`x${r.id}`),
      section: SECTION_QUALITY,
      item_code: text(r.item_code),
      item_name: r.item_name,
      issue_kg: r.issue_kg,
      selection_kg: r.selection_kg,
      trolleys: r.trolleys,
      diff_kg: r.diff_kg,
      diff_pct: r.diff_pct,
    });
  }

  if (data.by_day.length) {
    if (out.length) out.push(blank("sep:day"));
    for (const r of buildDayGridRows(data.by_day)) {
      out.push({
        ...blank(`x${r.id}`),
        section: SECTION_DAY,
        tran_date: r.tran_date,
        item_name: r.item_name,
        issue_kg: r.issue_kg,
        selection_kg: r.selection_kg,
        trolleys: r.trolleys,
        diff_kg: r.diff_kg,
      });
    }
  }

  const gate = data.by_gate_entry ?? [];
  if (gate.length) {
    if (out.length) out.push(blank("sep:gate"));
    for (const r of buildGateGridRows(gate)) {
      out.push({
        ...blank(`x${r.id}`),
        section: SECTION_GATE,
        gate_entry_no: text(r.gate_entry_no),
        gate_entry_date: text(r.gate_entry_date),
        item_name: r.item_name,
        issue_kg: r.issue_kg,
        selection_kg: r.selection_kg,
        trolleys: r.trolleys,
        diff_kg: r.diff_kg,
      });
    }
  }
  return out;
}

/** Column defs driving the Excel export (header text + numeric formats). */
export const EXPORT_COLUMNS: GridColDef<ExportRow>[] = [
  { field: "section", headerName: "Section", width: 120 },
  { field: "tran_date", headerName: "Date", width: 110 },
  { field: "gate_entry_no", headerName: "Gate Entry No", width: 110 },
  { field: "gate_entry_date", headerName: "Gate Entry Date", width: 120 },
  { field: "item_code", headerName: "Item Code", width: 110 },
  { field: "item_name", headerName: "Quality", width: 200 },
  { field: "issue_kg", headerName: "Issued (kg)", width: 110, type: "number" },
  { field: "selection_kg", headerName: "Selected (kg)", width: 110, type: "number" },
  { field: "trolleys", headerName: "Trolleys", width: 90, type: "number" },
  { field: "diff_kg", headerName: "Difference (kg)", width: 120, type: "number" },
  { field: "diff_pct", headerName: "Difference %", width: 110, type: "number" },
];

// ------------------------------------------------------------- filters ----

/** Client-side mirror of the backend's range check. Returns a message or null. */
export function validateRange(dateFrom: string, dateTo: string): string | null {
  if (!dateFrom || !dateTo) return "Both From and To dates are required.";
  const from = new Date(`${dateFrom}T00:00:00`);
  const to = new Date(`${dateTo}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return "Enter valid dates.";
  }
  if (to < from) return "To date must be on or after From date.";
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  if (days > MAX_RANGE_DAYS) return `The range cannot exceed ${MAX_RANGE_DAYS} days.`;
  return null;
}

/** Fixed-decimal number; "" for null so blanks stay blank. */
export function fmtKg(value: number | null | undefined, digits = 3): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "";
  return Number(value).toLocaleString("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Signed 2dp percentage ("+2.08 %" / "-0.59 %"); "—" for null. */
export function fmtSignedPct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  const s = n.toFixed(2);
  return `${n > 0 ? `+${s}` : s} %`;
}
