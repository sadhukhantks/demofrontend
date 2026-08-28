/**
 * Worker × day pivot behind the Finishing Checklist "Production" sheet
 * (TKT-000130). Pure data shaping, no exceljs — kept apart from the sheet
 * writer so it stays unit-testable without loading the DataGrid stack.
 */
import type { FinishingChecklistRow } from "@/utils/juteProductionReportService";

export interface FinishingPivotLine {
  eb_no: string;
  name: string;
  spell: string;
  quality: string;
  /** One slot per entry of `days`; null = no production that day. */
  cells: (number | null)[];
  total: number;
}

export interface FinishingPivot {
  /** ISO dates, ascending: every calendar day of the report range when one
   * is given, otherwise only the dates carrying production. */
  days: string[];
  /** Header label per day: day-of-month within one month, else MM-DD. */
  dayLabels: string[];
  lines: FinishingPivotLine[];
  dayTotals: number[];
  grandTotal: number;
}

/** Every ISO date from `from` to `to` inclusive (UTC arithmetic — no DST
 * drift). Empty when either bound is missing or the range is inverted. */
function calendarDays(from: string, to: string): string[] {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || start > end) return [];
  const out: string[] = [];
  for (let t = start; t <= end; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/** Pivots checklist rows (any rtype) into the Production sheet layout. Rows
 * without production (attendance-only) are dropped; a worker doing several
 * qualities gets one line per quality. With `dateFrom`/`dateTo` the day
 * columns span the whole report period (blank days included); without them
 * only dates that carry production appear. */
export function buildFinishingPivot(
  rows: FinishingChecklistRow[],
  dateFrom = "",
  dateTo = "",
): FinishingPivot {
  const prod = rows.filter((r) => r.prod_qty > 0);
  const range = calendarDays(dateFrom, dateTo);
  const days = range.length
    ? range
    : [...new Set(prod.map((r) => r.tran_date))].sort();
  const sameMonth = new Set(days.map((d) => d.slice(0, 7))).size <= 1;
  const dayLabels = days.map((d) =>
    sameMonth ? String(Number(d.slice(8, 10))) : d.slice(5),
  );

  const byKey = new Map<string, FinishingPivotLine>();
  for (const r of prod) {
    const eb_no = r.eb_no ?? (r.eb_id != null ? String(r.eb_id) : "");
    const name = r.worker_name ?? "";
    const spell = r.spell_code ?? "";
    const quality = r.quality ?? "";
    const key = [eb_no, name, spell, quality].join("|");
    let line = byKey.get(key);
    if (!line) {
      line = { eb_no, name, spell, quality, cells: days.map(() => null), total: 0 };
      byKey.set(key, line);
    }
    const i = days.indexOf(r.tran_date);
    if (i < 0) continue; // production outside the requested range
    line.cells[i] = (line.cells[i] ?? 0) + r.prod_qty;
    line.total += r.prod_qty;
  }

  const lines = [...byKey.values()].sort(
    (a, b) =>
      a.name.localeCompare(b.name) ||
      a.spell.localeCompare(b.spell) ||
      a.quality.localeCompare(b.quality),
  );
  const dayTotals = days.map((_, i) =>
    lines.reduce((s, l) => s + (l.cells[i] ?? 0), 0),
  );
  return {
    days,
    dayLabels,
    lines,
    dayTotals,
    grandTotal: dayTotals.reduce((s, v) => s + v, 0),
  };
}
