/**
 * Purchased Yarn Ledger service.
 *
 * Backend: GET /api/juteProductionReports/purchased_yarn_ledger
 * (vowerp3be, yarn purchase / issue / consumption feature, design doc
 * docs/superpowers/specs/2026-09-25-yarn-purchase-issue-consumption-design.md §3.5).
 *
 * Per branch and month, one row per purchased yarn item: godown movement
 * (opening + purchases − issues + returns = book closing, checked against the
 * counted closing) and floor movement per department (floor opening + issues −
 * returns − floor closing = consumption). Everything is in kg; the backend
 * derives all of it, the page only formats and flags.
 *
 * Kept next to the page rather than in utils/juteProductionReportService.ts:
 * these types are used by this route only.
 */

import { apiRoutesPortalMasters } from "@/utils/api";
import { fetchWithCookie } from "@/utils/apiClient2";

/** Exception codes the backend raises. Anything else is shown as a warning. */
export type LedgerExceptionCode =
  | "GODOWN_BOOK_NEGATIVE"
  | "GODOWN_DIFF"
  | "DEPT_NO_FLOOR_COUNT"
  | "FLOOR_DAYS_OVER"
  | "LEGACY_STORES_RECEIPTS"
  | "ITEM_WITHOUT_YARN_MASTER"
  | "ITEM_IN_BOOK_NOT_COUNTED";

export interface LedgerException {
  code: LedgerExceptionCode | string;
  message: string;
  item_id?: number | null;
  dept_id?: number | null;
  /** The offending figure (kg, days, ...) — meaning depends on the code. */
  value?: number | null;
}

/** One department's share of an item's floor movement. */
export interface LedgerDeptRow {
  dept_id: number;
  /** null when the department master has no description. */
  dept_desc: string | null;
  floor_opening_kg: number;
  issues_kg: number;
  returns_kg: number;
  floor_closing_kg: number;
  /** floor opening + issues − returns − floor closing. */
  consumption_kg: number;
}

/** The numeric columns shared by every item row and the totals line. */
export interface LedgerFigures {
  godown_opening_kg: number;
  purchases_kg: number;
  issues_kg: number;
  returns_kg: number;
  /** opening + purchases − issues + returns. */
  godown_book_closing_kg: number;
  /** Winding Stock count at GODOWN on the closing date; null when none. */
  godown_count_closing_kg: number | null;
  /** count − book; null when there is no count. */
  godown_diff_kg: number | null;
  floor_opening_kg: number;
  floor_closing_kg: number;
  consumption_kg: number;
  /** floor closing / average daily consumption; null when consumption is 0. */
  days_of_stock: number | null;
}

export interface LedgerRow extends LedgerFigures {
  item_id: number;
  /** null when the item master has no description (see ITEM_WITHOUT_YARN_MASTER). */
  item_name: string | null;
  item_code: string | null;
  yarn_count: number | null;
  depts: LedgerDeptRow[];
}

export type LedgerTotals = LedgerFigures;

export interface LedgerMeta {
  /** Date of the godown count the opening was taken from; null = book. */
  godown_opening_count_date: string | null;
  /** Date of the godown count used for the counted closing; null = none. */
  godown_closing_count_date: string | null;
  /** Floor count date per department, keyed by dept_id (as a string). */
  floor_count_dates: Record<string, string>;
  opening_basis: "count" | "book";
  /** Days the consumption rate is spread over: up to the last in-period count, or today. */
  days_in_window: number;
}

export interface PurchasedYarnLedger {
  /** YYYY-MM */
  month: string;
  from_date: string;
  to_date: string;
  meta: LedgerMeta;
  rows: LedgerRow[];
  totals: LedgerTotals;
  exceptions: LedgerException[];
}

export interface PurchasedYarnLedgerFilters {
  coId: number;
  branchId: number;
  /** YYYY-MM */
  month: string;
}

export async function fetchPurchasedYarnLedger(
  f: PurchasedYarnLedgerFilters,
): Promise<PurchasedYarnLedger> {
  const qs = new URLSearchParams();
  qs.set("co_id", String(f.coId));
  qs.set("branch_id", String(f.branchId));
  qs.set("month", f.month);
  const url = `${apiRoutesPortalMasters.PURCHASED_YARN_LEDGER}?${qs.toString()}`;
  const res = await fetchWithCookie<{ data: PurchasedYarnLedger }>(url);
  if (res.error || !res.data) {
    throw new Error(res.error ?? "Failed to fetch the purchased yarn ledger");
  }
  return res.data.data;
}
