import { describe, expect, it } from "vitest";
import { stockMt, bucketTotals, grandTotal, roundMt } from "./stockCalc";

const row = (bucket: string, samples: number, wt: number) =>
  ({ bucket, no_of_samples: samples, wt_per_sample: wt }) as never;

describe("stockMt", () => {
  it("matches the mill sheet's first row: 185 x 14 kg = 2.590 MT", () => {
    expect(stockMt(185, 14)).toBe(2.59);
  });

  it("treats missing numbers as zero rather than NaN", () => {
    expect(stockMt(null, 14)).toBe(0);
    expect(stockMt(185, null)).toBe(0);
  });
});

describe("bucketTotals / grandTotal", () => {
  const rows = [
    row("MILL_USE", 185, 14),
    row("MILL_USE", 20116, 1),
    row("SALE_YARN", 230, 50),
    row("WASTE", 60, 1),
  ];

  it("sums per bucket", () => {
    const totals = bucketTotals(rows);
    expect(totals.MILL_USE).toBe(22.706);
    expect(totals.SALE_YARN).toBe(11.5);
    expect(totals.WASTE).toBe(0.06);
  });

  it("grand total equals the sum of the buckets", () => {
    expect(grandTotal(rows)).toBe(34.266);
  });
});

describe("roundMt", () => {
  it("does not leak float noise into the printed total", () => {
    expect(roundMt(0.1 + 0.2)).toBe(0.3);
  });
});
