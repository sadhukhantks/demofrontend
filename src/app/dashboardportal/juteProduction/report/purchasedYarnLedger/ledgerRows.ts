/**
 * Pure helpers for the Purchased Yarn Ledger page — severity mapping of the
 * backend's exception codes, the flagged-item lookup that drives the red
 * difference colouring, client-side totals and the month-parameter helpers.
 * No React, no fetch: everything here is unit-tested in ledgerRows.test.ts.
 */

import type {
  LedgerException,
  LedgerExceptionCode,
  LedgerFigures,
  LedgerMeta,
  LedgerRow,
} from "./_service";

/** MUI Alert severities, in the order the strip shows them (worst first). */
export type ExceptionSeverity = "error" | "warning" | "info";

export const SEVERITY_ORDER: readonly ExceptionSeverity[] = ["error", "warning", "info"];

/**
 * Red: the ledger cannot be right (book stock below zero, count and book
 * disagree). Amber: the ledger is right but incomplete or built on a guess.
 * Blue: a stock-policy flag, not a data problem.
 */
export const EXCEPTION_SEVERITY: Record<LedgerExceptionCode, ExceptionSeverity> = {
  GODOWN_BOOK_NEGATIVE: "error",
  GODOWN_DIFF: "error",
  DEPT_NO_FLOOR_COUNT: "warning",
  LEGACY_STORES_RECEIPTS: "warning",
  ITEM_WITHOUT_YARN_MASTER: "warning",
  ITEM_IN_BOOK_NOT_COUNTED: "warning",
  FLOOR_DAYS_OVER: "info",
};

/** Human heading for each code, shown in bold before the backend's message. */
export const EXCEPTION_LABELS: Record<LedgerExceptionCode, string> = {
  GODOWN_BOOK_NEGATIVE: "Godown book stock negative",
  GODOWN_DIFF: "Godown count differs from book",
  DEPT_NO_FLOOR_COUNT: "Department has issues but no floor count",
  LEGACY_STORES_RECEIPTS: "Stores receipts without a Yarn Purchase",
  ITEM_WITHOUT_YARN_MASTER: "Purchased item has no yarn master",
  ITEM_IN_BOOK_NOT_COUNTED: "Item in the book but missing from the opening count",
  FLOOR_DAYS_OVER: "Floor stock above the days limit",
};

function isKnownCode(code: string): code is LedgerExceptionCode {
  return Object.prototype.hasOwnProperty.call(EXCEPTION_SEVERITY, code);
}

/** Unknown codes (a backend newer than this page) are shown, as warnings. */
export function severityOf(code: string): ExceptionSeverity {
  return isKnownCode(code) ? EXCEPTION_SEVERITY[code] : "warning";
}

export function labelOf(code: string): string {
  return isKnownCode(code) ? EXCEPTION_LABELS[code] : code;
}

export interface ExceptionGroup {
  severity: ExceptionSeverity;
  items: LedgerException[];
}

/**
 * Exceptions bucketed by severity, worst first, keeping the backend's order
 * inside each bucket. Empty buckets are dropped so the strip never renders a
 * heading with nothing under it.
 */
export function groupExceptions(exceptions: readonly LedgerException[]): ExceptionGroup[] {
  const buckets = new Map<ExceptionSeverity, LedgerException[]>();
  for (const e of exceptions) {
    const sev = severityOf(e.code);
    const list = buckets.get(sev);
    if (list) list.push(e);
    else buckets.set(sev, [e]);
  }
  return SEVERITY_ORDER.filter((s) => buckets.has(s)).map((s) => ({
    severity: s,
    items: buckets.get(s) ?? [],
  }));
}

/**
 * item_ids the backend flagged with `code` — e.g. the GODOWN_DIFF set. The
 * backend owns the count-vs-book tolerance (50 kg / 1%); the page colours a
 * difference red only for items in this set, so a red cell always has a
 * matching exception in the strip.
 */
export function flaggedItemIds(exceptions: readonly LedgerException[], code: string): Set<number> {
  const ids = new Set<number>();
  for (const e of exceptions) {
    if (e.code === code && e.item_id != null) ids.add(e.item_id);
  }
  return ids;
}

const KG_DECIMALS = 3;
const round = (v: number): number => Number(v.toFixed(KG_DECIMALS));

/**
 * Totals across the item rows, computed the same way the backend does so the
 * page can fall back to (or cross-check against) the endpoint's `totals`.
 *
 * - Counted closing and the difference are null when NO row has a count;
 *   otherwise rows without a count contribute 0 (they have no counted stock).
 * - Days of stock needs the window length: total floor closing over the
 *   average daily consumption of the whole branch. Null without a window or
 *   when nothing was consumed.
 */
export function sumTotals(rows: readonly LedgerRow[], daysInWindow?: number): LedgerFigures {
  let godownOpening = 0;
  let purchases = 0;
  let issues = 0;
  let returns = 0;
  let bookClosing = 0;
  let countClosing = 0;
  let anyCount = false;
  let floorOpening = 0;
  let floorClosing = 0;
  let consumption = 0;
  for (const r of rows) {
    godownOpening += r.godown_opening_kg;
    purchases += r.purchases_kg;
    issues += r.issues_kg;
    returns += r.returns_kg;
    bookClosing += r.godown_book_closing_kg;
    if (r.godown_count_closing_kg != null) {
      anyCount = true;
      countClosing += r.godown_count_closing_kg;
    }
    floorOpening += r.floor_opening_kg;
    floorClosing += r.floor_closing_kg;
    consumption += r.consumption_kg;
  }
  const countTotal = anyCount ? round(countClosing) : null;
  const book = round(bookClosing);
  const cons = round(consumption);
  const floorClose = round(floorClosing);
  const days =
    daysInWindow && daysInWindow > 0 && cons > 0
      ? Number((floorClose / (cons / daysInWindow)).toFixed(1))
      : null;
  return {
    godown_opening_kg: round(godownOpening),
    purchases_kg: round(purchases),
    issues_kg: round(issues),
    returns_kg: round(returns),
    godown_book_closing_kg: book,
    godown_count_closing_kg: countTotal,
    godown_diff_kg: countTotal == null ? null : round(countTotal - book),
    floor_opening_kg: round(floorOpening),
    floor_closing_kg: floorClose,
    consumption_kg: cons,
    days_of_stock: days,
  };
}

/** Current month as the YYYY-MM the endpoint takes. */
export function currentMonthParam(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** "2026-09-18" (the hub's date param) -> "2026-09"; anything else -> null. */
export function monthFromDateParam(date: string | null | undefined): string | null {
  const m = /^(\d{4}-\d{2})(-\d{2})?$/.exec(date ?? "");
  return m ? m[1] : null;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "2026-09" -> "September 2026"; unparseable input is returned as-is. */
export function monthLabel(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return month;
  const idx = Number(m[2]) - 1;
  return idx >= 0 && idx < 12 ? `${MONTH_NAMES[idx]} ${m[1]}` : month;
}

/** Calendar days between two ISO dates, inclusive; null if either is bad. */
export function daysInclusive(from: string, to: string): number | null {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round((b - a) / 86_400_000) + 1;
}

export interface FloorCountEntry {
  dept_id: string;
  dept_desc: string;
  date: string;
}

/**
 * `meta.floor_count_dates` keyed by dept_id, resolved to department names
 * through the rows' dept breakdown. A department that has a count but no
 * movement in any row keeps its id as the label rather than being dropped.
 */
export function floorCountEntries(
  meta: Pick<LedgerMeta, "floor_count_dates">,
  rows: readonly LedgerRow[],
): FloorCountEntry[] {
  const names = new Map<string, string>();
  for (const r of rows) {
    for (const d of r.depts) {
      if (d.dept_desc != null && !names.has(String(d.dept_id))) {
        names.set(String(d.dept_id), d.dept_desc);
      }
    }
  }
  return Object.entries(meta.floor_count_dates ?? {})
    .map(([dept_id, date]) => ({
      dept_id,
      dept_desc: names.get(dept_id) ?? dept_id,
      date,
    }))
    .sort((a, b) => a.dept_desc.localeCompare(b.dept_desc));
}
