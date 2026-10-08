import { describe, expect, it } from "vitest";
import type { JuteStockReportRow } from "../types/reportTypes";
import type { GridColDef, GridSortCellParams, GridSortDirection } from "@mui/x-data-grid";
import {
  GRAND_TOTAL_ID,
  GRAND_TOTAL_ROW_ID,
  kgToMt,
  pinGrandTotalLast,
  roundStockRowsToKg,
  stockRowId,
  stockSplit,
  withStockGrandTotal,
} from "./juteStockRows";

const row = (over: Partial<JuteStockReportRow>): JuteStockReportRow => ({
  item_grp_id: 1,
  item_group_name: "JUTE > DESI",
  item_id: 10,
  item_name: "D TD-5",
  opening_weight: 0,
  receipt_weight: 0,
  issue_weight: 0,
  sold_weight: 0,
  closing_weight: 0,
  mtd_receipt_weight: 0,
  mtd_issue_weight: 0,
  is_waste: 0,
  ...over,
});

describe("roundStockRowsToKg (TKT-000155)", () => {
  it("rounds every weight column to whole kg", () => {
    const [r] = roundStockRowsToKg([
      row({
        opening_weight: 1200.4,
        receipt_weight: 350.5,
        issue_weight: 99.49,
        sold_weight: 10.6,
        closing_weight: 1440.81,
        mtd_receipt_weight: 5000.999,
        mtd_issue_weight: 0.2,
      }),
    ]);
    expect(r).toMatchObject({
      opening_weight: 1200,
      receipt_weight: 351,
      issue_weight: 99,
      sold_weight: 11,
      closing_weight: 1441,
      mtd_receipt_weight: 5001,
      mtd_issue_weight: 0,
    });
  });

  it("rounds closing from its true value, never from the rounded parts", () => {
    // 10.4 + 10.4 - 20.8 = 0; rounded parts would give 10 + 10 - 21 = -1.
    const [r] = roundStockRowsToKg([
      row({
        opening_weight: 10.4,
        receipt_weight: 10.4,
        issue_weight: 20.8,
        closing_weight: 0,
      }),
    ]);
    expect(r.closing_weight).toBe(0);
  });

  it("never yields negative zero", () => {
    const [r] = roundStockRowsToKg([
      row({ opening_weight: 5, closing_weight: -0.2 }),
    ]);
    expect(Object.is(r.closing_weight, -0)).toBe(false);
    expect(r.closing_weight).toBe(0);
  });

  it("drops a row only when every column it prints is zero once rounded", () => {
    const out = roundStockRowsToKg([
      row({ item_id: 1, opening_weight: 0.3, closing_weight: 0.3 }),
      // Nothing in stock, but 40 kg issued earlier in the month: the row
      // stays, or that 40 kg goes missing from the MTD Issue total.
      row({ item_id: 2, opening_weight: 0.3, closing_weight: 0.3, mtd_issue_weight: 40 }),
      row({ item_id: 3, opening_weight: 12, closing_weight: 12 }),
      // Sub-half-kg residue in the MTD columns too -> still a line of zeros.
      row({ item_id: 4, mtd_receipt_weight: 0.4, mtd_issue_weight: 0.4 }),
    ]);
    expect(out.map((r) => r.item_id)).toEqual([2, 3]);
    expect(out[0]).toMatchObject({ opening_weight: 0, closing_weight: 0, mtd_issue_weight: 40 });
  });

  it("keeps an item received and used up earlier in the month", () => {
    // sls br 29, 2026-09-30: N TD-10 came in and went out before month end.
    const out = roundStockRowsToKg([
      row({ item_id: 7, item_name: "N TD-10", mtd_receipt_weight: 11190, mtd_issue_weight: 11190 }),
      row({ item_id: 8, item_name: "A TD-6 (L)", mtd_issue_weight: 14028 }),
      row({ item_id: 9, item_name: "MTD receipt only", mtd_receipt_weight: 500 }),
    ]);
    expect(out.map((r) => r.item_name)).toEqual(["N TD-10", "A TD-6 (L)", "MTD receipt only"]);
  });

  it("does not mutate its input and keeps non-weight fields", () => {
    const input = [row({ opening_weight: 1.6, is_waste: 1 })];
    const [r] = roundStockRowsToKg(input);
    expect(input[0].opening_weight).toBe(1.6);
    expect(r.is_waste).toBe(1);
    expect(r.item_name).toBe("D TD-5");
  });
});

describe("withStockGrandTotal", () => {
  it("returns an empty list untouched", () => {
    expect(withStockGrandTotal([])).toEqual([]);
  });

  it("appends a Grand Total row that sums the rows it was given", () => {
    const rows = roundStockRowsToKg([
      row({ item_id: 1, opening_weight: 100.6, closing_weight: 100.6 }),
      row({ item_id: 2, opening_weight: 50.6, closing_weight: 50.6 }),
    ]);
    const out = withStockGrandTotal(rows);
    expect(out).toHaveLength(3);
    const total = out[2];
    expect(total.item_id).toBe(GRAND_TOTAL_ID);
    expect(total.item_name).toBe("Grand Total");
    expect(total.item_group_name).toBeNull();
    // Sum of the DISPLAYED whole-kg rows (101 + 51), so the grid adds up.
    expect(total.opening_weight).toBe(152);
    expect(total.closing_weight).toBe(152);
  });

  it("MTD totals include items with no position left on the report date", () => {
    // One item still in stock, one used up earlier in the month. Hiding the
    // second printed an MTD issue of 300 against 14,328 actually issued.
    const rows = roundStockRowsToKg([
      row({ item_id: 1, opening_weight: 900, issue_weight: 300, closing_weight: 600, mtd_receipt_weight: 900, mtd_issue_weight: 300 }),
      row({ item_id: 2, mtd_receipt_weight: 0, mtd_issue_weight: 14028 }),
    ]);
    const total = withStockGrandTotal(rows)[2];
    expect(total.mtd_issue_weight).toBe(14328);
    expect(total.mtd_receipt_weight).toBe(900);
    // The day figures and the position are untouched by the extra row.
    expect(total.issue_weight).toBe(300);
    expect(total.closing_weight).toBe(600);
    // The cards read the same rows, so they carry the same MTD figure.
    expect(stockSplit(withStockGrandTotal(rows), "mtd_issue_weight").total).toBe(14328);
  });
});

describe("stockSplit — raw jute vs jute waste on every column", () => {
  const rows = [
    row({ item_id: 10, opening_weight: 1200, sold_weight: 100, closing_weight: 900 }),
    row({ item_id: 11, opening_weight: 300, sold_weight: 0, closing_weight: 250 }),
    row({
      item_id: 12,
      item_grp_id: 2,
      item_group_name: "JUTE WASTE",
      is_waste: 1,
      opening_weight: 500,
      sold_weight: 40,
      closing_weight: 420,
    }),
  ];

  it("splits the position columns, not only the movements", () => {
    expect(stockSplit(rows, "opening_weight")).toEqual({ total: 2000, raw: 1500, waste: 500 });
    expect(stockSplit(rows, "closing_weight")).toEqual({ total: 1570, raw: 1150, waste: 420 });
  });

  it("splits Sold — waste is sold on raw-jute invoices too", () => {
    expect(stockSplit(rows, "sold_weight")).toEqual({ total: 140, raw: 100, waste: 40 });
  });

  it("skips the appended Grand Total row so nothing is counted twice", () => {
    const withTotal = withStockGrandTotal(rows);
    expect(withTotal).toHaveLength(4);
    expect(stockSplit(withTotal, "opening_weight")).toEqual(stockSplit(rows, "opening_weight"));
  });

  it("keeps raw + waste equal to the total", () => {
    for (const f of ["opening_weight", "sold_weight", "closing_weight"] as const) {
      const { total, raw, waste } = stockSplit(rows, f);
      expect(raw + waste).toBe(total);
    }
  });

  it("reports zeros for an empty report", () => {
    expect(stockSplit([], "closing_weight")).toEqual({ total: 0, raw: 0, waste: 0 });
  });
});

/**
 * Sort rows the way the DataGrid does: through the column's
 * getSortComparator for the given direction, cell params carrying the row id.
 */
function gridSort(
  col: GridColDef<JuteStockReportRow>,
  rows: JuteStockReportRow[],
  dir: GridSortDirection,
): string[] {
  const cmp = col.getSortComparator?.(dir);
  if (!cmp) throw new Error("column has no getSortComparator");
  const params = (r: JuteStockReportRow) =>
    ({ id: stockRowId(r), field: col.field }) as unknown as GridSortCellParams;
  const field = col.field as keyof JuteStockReportRow;
  return [...rows]
    .sort((a, b) => cmp(a[field], b[field], params(a), params(b)))
    .map((r) => String(r.item_name));
}

describe("pinGrandTotalLast (TKT-000205)", () => {
  const rows = withStockGrandTotal([
    row({ item_id: 1, item_group_name: "JUTE > TOSSA", item_name: "T-4", closing_weight: 300 }),
    row({ item_id: 2, item_group_name: "JUTE > DESI", item_name: "D-5", closing_weight: 100 }),
    row({ item_id: 3, item_group_name: "WASTE", item_name: "Caddis", closing_weight: 200 }),
  ]);

  it("is the id the grid gives the Grand Total row", () => {
    expect(stockRowId(rows[rows.length - 1])).toBe(GRAND_TOTAL_ROW_ID);
  });

  it("keeps the total at the bottom on the default Item Group ascending sort", () => {
    // The bug: the total's null item_group_name sorted FIRST ascending.
    const col = pinGrandTotalLast<JuteStockReportRow>({ field: "item_group_name" });
    expect(gridSort(col, rows, "asc")).toEqual(["D-5", "T-4", "Caddis", "Grand Total"]);
  });

  it("keeps the total at the bottom when sorted descending", () => {
    const col = pinGrandTotalLast<JuteStockReportRow>({ field: "item_group_name" });
    expect(gridSort(col, rows, "desc")).toEqual(["Caddis", "T-4", "D-5", "Grand Total"]);
  });

  it("keeps the total at the bottom on a numeric column, both ways", () => {
    // The total (600) is the largest value — it must not jump to the top on desc.
    const col = pinGrandTotalLast<JuteStockReportRow>({
      field: "closing_weight",
      type: "number",
    });
    expect(gridSort(col, rows, "asc")).toEqual(["D-5", "Caddis", "T-4", "Grand Total"]);
    expect(gridSort(col, rows, "desc")).toEqual(["T-4", "Caddis", "D-5", "Grand Total"]);
  });
});

describe("kgToMt (TKT-000205)", () => {
  it("converts whole kg to MT at 2 decimals", () => {
    expect(kgToMt(455631)).toBe(455.63);
    expect(kgToMt(1000)).toBe(1);
    expect(kgToMt(5)).toBe(0.01);
  });

  it("never prints -0 and treats junk as 0", () => {
    expect(Object.is(kgToMt(-2), 0)).toBe(true);
    expect(kgToMt(Number.NaN)).toBe(0);
  });
});
