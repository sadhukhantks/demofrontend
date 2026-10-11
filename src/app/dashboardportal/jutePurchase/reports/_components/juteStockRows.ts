import {
  gridNumberComparator,
  gridStringOrNumberComparator,
  type GridColDef,
  type GridComparatorFn,
} from "@mui/x-data-grid";
import type { JuteStockReportRow } from "../types/reportTypes";

/** The weight columns of the Jute Stock report, in grid order. */
export const STOCK_WEIGHT_FIELDS = [
  "opening_weight",
  "receipt_weight",
  "issue_weight",
  "sold_weight",
  "closing_weight",
  "mtd_receipt_weight",
  "mtd_issue_weight",
] as const;

export type StockWeightField = (typeof STOCK_WEIGHT_FIELDS)[number];

/**
 * A row is kept when ANY column it prints is non-zero — all seven, the same
 * test the backend applies before suppressing an all-zero row.
 *
 * The two MTD columns used to be left out, here and in the backend. An item
 * used up earlier in the month (nothing in stock, nothing moving on the report
 * date) then lost its row, and its MTD receipt / issue dropped out of the
 * Grand Total and the summary cards with it — sls br 29 on 2026-09-30 printed
 * an MTD issue of 360,660 kg against 455,631 actually issued.
 */
const ROW_PRESENCE_FIELDS: readonly StockWeightField[] = STOCK_WEIGHT_FIELDS;

/** item_id / item_grp_id of the client-added Grand Total row. */
export const GRAND_TOTAL_ID = -1;

/** Grid row id of a stock row (item group + item). */
export const stockRowId = (r: JuteStockReportRow) => `${r.item_grp_id}-${r.item_id}`;

/** Grid row id of the client-added Grand Total row. */
export const GRAND_TOTAL_ROW_ID = `${GRAND_TOTAL_ID}-${GRAND_TOTAL_ID}`;

/**
 * Keep the Grand Total row at the bottom whatever column the grid is sorted
 * on, ascending or descending (TKT-000205).
 *
 * The row used to rely on `item_group_name: null` sorting last, but MUI's
 * comparators put null FIRST in ascending order — and the report opens sorted
 * ascending on Item Group, so the total landed on top. A per-column
 * getSortComparator pins it instead: the Grand Total compares greater than any
 * real row in BOTH directions, and real rows sort with the column's normal
 * comparator. (Pinned rows are a DataGrid Pro feature; this is the community
 * equivalent.) The row stays in the data, so the exports keep it last too.
 */
export function pinGrandTotalLast<T extends JuteStockReportRow>(
  col: GridColDef<T>,
): GridColDef<T> {
  const base: GridComparatorFn =
    col.sortComparator ??
    (col.type === "number" ? gridNumberComparator : gridStringOrNumberComparator);
  return {
    ...col,
    getSortComparator: (dir) => (v1, v2, p1, p2) => {
      const t1 = p1.id === GRAND_TOTAL_ROW_ID;
      const t2 = p2.id === GRAND_TOTAL_ROW_ID;
      if (t1 !== t2) return t1 ? 1 : -1;
      const r = base(v1, v2, p1, p2);
      return dir === "desc" ? -r : r;
    },
  };
}

/** Kilograms in a metric tonne. */
const KG_PER_MT = 1000;

/** Decimals the summary cards print MT with — 0.01 MT = 10 kg (TKT-000205). */
export const MT_DECIMALS = 2;

/** Whole-kg figure to MT for the summary cards (TKT-000205). */
export function kgToMt(kg: number): number {
  const f = 10 ** MT_DECIMALS;
  return Math.round(((Number(kg) || 0) / KG_PER_MT) * f) / f + 0;
}

/**
 * Round every weight column to whole kg (TKT-000155 — stock is reported in kg
 * with no decimals).
 *
 * Done on the ROW VALUES, not only in the grid formatter, so the grid, the
 * summary cards, the Grand Total row and the Excel/PDF exports all carry the
 * same number. Each column is rounded on its own from the true value: deriving
 * closing from the rounded parts would let three half-kg roundings surface as
 * a false "-1" on a line whose real closing is 0.
 *
 * A row whose seven weight columns ALL round to 0 is dropped — the backend
 * suppresses all-zero rows at 2 decimals, and a sub-half-kg residue would
 * otherwise print as a line of zeros. A row with only month-to-date figures
 * stays (see ROW_PRESENCE_FIELDS): the totals are summed off the rows shown.
 */
export function roundStockRowsToKg(
  rows: JuteStockReportRow[],
): JuteStockReportRow[] {
  return rows
    .map((r) => {
      const next = { ...r };
      for (const f of STOCK_WEIGHT_FIELDS) {
        // `+ 0` turns a rounded "-0" into "0" so a nil balance never prints "-0".
        next[f] = Math.round(Number(r[f]) || 0) + 0;
      }
      return next;
    })
    .filter((r) => ROW_PRESENCE_FIELDS.some((f) => r[f] !== 0));
}

/** Append a Grand Total row summing every weight column. */
export function withStockGrandTotal(
  rows: JuteStockReportRow[],
): JuteStockReportRow[] {
  if (rows.length === 0) return rows;
  const sum = (f: StockWeightField) =>
    Math.round(rows.reduce((acc, r) => acc + (Number(r[f]) || 0), 0) * 100) /
    100;
  return [
    ...rows,
    {
      item_grp_id: GRAND_TOTAL_ID,
      // Kept at the bottom of the grid by pinGrandTotalLast, not by this null
      // (MUI sorts null FIRST ascending — the TKT-000205 bug).
      item_group_name: null,
      item_id: GRAND_TOTAL_ID,
      item_name: "Grand Total",
      opening_weight: sum("opening_weight"),
      receipt_weight: sum("receipt_weight"),
      issue_weight: sum("issue_weight"),
      sold_weight: sum("sold_weight"),
      closing_weight: sum("closing_weight"),
      mtd_receipt_weight: sum("mtd_receipt_weight"),
      mtd_issue_weight: sum("mtd_issue_weight"),
      // Totals span both stock sources; the split lives on the real rows.
      is_waste: 0,
    },
  ];
}

/** One summary card's figures: the column total and its two stock sources. */
export interface StockSplit {
  total: number;
  raw: number;
  waste: number;
}

/**
 * Total one weight column, split into raw jute and jute waste (process waste
 * from the Waste Entry page plus PURCHASED waste — MR lines on a type-3 item).
 *
 * The appended Grand Total row is skipped, or every figure would double. The
 * waste share comes from `is_waste` — the item group's own item_type_id — not
 * from a name match on the group, which is also why purchased waste lands in
 * the waste bucket on receipt. `raw + waste === total` always holds, since
 * a row is one or the other.
 */
export function stockSplit(
  rows: JuteStockReportRow[],
  field: StockWeightField,
): StockSplit {
  let raw = 0;
  let waste = 0;
  for (const r of rows) {
    if (r.item_id === GRAND_TOTAL_ID) continue;
    const v = Number(r[field]) || 0;
    if (r.is_waste) waste += v;
    else raw += v;
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return { total: round(raw + waste), raw: round(raw), waste: round(waste) };
}
