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

/** Same five columns the backend tests before suppressing an all-zero row. */
const ROW_PRESENCE_FIELDS: readonly StockWeightField[] = [
  "opening_weight",
  "receipt_weight",
  "issue_weight",
  "sold_weight",
  "closing_weight",
];

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
 * A row whose opening, receipt, issue, sold and closing all round to 0 is
 * dropped — the backend suppresses all-zero rows at 2 decimals, and a
 * sub-half-kg residue would otherwise print as a line of zeros.
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
