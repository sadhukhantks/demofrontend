import { describe, expect, it } from "vitest";
import type { JuteStockReportRow } from "../types/reportTypes";
import {
  GRAND_TOTAL_ID,
  roundStockRowsToKg,
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

  it("drops a row that is all zero once rounded", () => {
    const out = roundStockRowsToKg([
      row({ item_id: 1, opening_weight: 0.3, closing_weight: 0.3 }),
      row({ item_id: 2, opening_weight: 0.3, closing_weight: 0.3, mtd_issue_weight: 40 }),
      row({ item_id: 3, opening_weight: 12, closing_weight: 12 }),
    ]);
    expect(out.map((r) => r.item_id)).toEqual([3]);
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
