import { describe, expect, it } from "vitest";
import { stockMt, bucketTotals, grandTotal, roundMt, rowActionsDisabled } from "./stockCalc";

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

describe("rowActionsDisabled", () => {
  // A locked day is not a hard freeze: a supervisor holding Edit on the
  // Winding Stock menu must still be able to correct a miscount (mirrors the
  // backend's require_edit_if_locked). The grid must not blanket-disable
  // row actions for every user just because the day is locked.
  it("stays enabled for a locked day when the user holds Edit access", () => {
    expect(
      rowActionsDisabled({ saving: false, deleting: false, locked: true, canEdit: true })
    ).toBe(false);
  });

  it("disables row actions on a locked day for a user without Edit access", () => {
    expect(
      rowActionsDisabled({ saving: false, deleting: false, locked: true, canEdit: false })
    ).toBe(true);
  });

  it("stays enabled on an unlocked day regardless of access level", () => {
    expect(
      rowActionsDisabled({ saving: false, deleting: false, locked: false, canEdit: false })
    ).toBe(false);
  });

  it("disables while a save or delete is in flight, locked or not", () => {
    expect(
      rowActionsDisabled({ saving: true, deleting: false, locked: false, canEdit: true })
    ).toBe(true);
    expect(
      rowActionsDisabled({ saving: false, deleting: true, locked: false, canEdit: true })
    ).toBe(true);
  });
});
