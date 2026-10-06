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
      // null (not "") so the grid's null-last sorting keeps this row at the bottom
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
