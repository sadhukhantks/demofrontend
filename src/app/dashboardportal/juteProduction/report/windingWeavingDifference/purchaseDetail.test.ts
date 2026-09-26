import { describe, expect, it } from "vitest";
import type { WwdPurchaseDetailRow } from "@/utils/juteProductionReportService";
import {
  purchaseDetailMatches,
  purchaseDetailTotalKg,
  purchaseDetailTotalMt,
} from "./purchaseDetail";

const line = (over: Partial<WwdPurchaseDetailRow>): WwdPurchaseDetailRow => ({
  yarn_purchase_id: 1,
  purchase_no: "YP/26-27/0001",
  tran_date: "2026-09-03",
  item_id: 335556,
  item_name: "13 LBS SKWP",
  yarn_count: 13,
  kg: 0,
  ...over,
});

describe("purchase-detail totals (Winding & Weaving Difference)", () => {
  it("sums the document lines in kg and in 3-dp MT", () => {
    const rows = [
      line({ yarn_purchase_id: 1, kg: 1250 }),
      line({ yarn_purchase_id: 2, kg: 3400.4 }),
      line({ yarn_purchase_id: 3, kg: 0.6 }),
    ];
    expect(purchaseDetailTotalKg(rows)).toBeCloseTo(4651, 6);
    expect(purchaseDetailTotalMt(rows)).toBe(4.651);
  });

  it("is zero for no documents", () => {
    expect(purchaseDetailTotalKg([])).toBe(0);
    expect(purchaseDetailTotalMt([])).toBe(0);
  });

  it("ignores a non-finite kg rather than poisoning the total", () => {
    const rows = [line({ kg: 1000 }), line({ yarn_purchase_id: 2, kg: Number.NaN })];
    expect(purchaseDetailTotalMt(rows)).toBe(1);
  });

  it("matches mtd.purchase_mt within 1 kg and flags anything further", () => {
    const rows = [line({ kg: 1250 }), line({ yarn_purchase_id: 2, kg: 3400.4 })];
    // 4650.4 kg = 4.6504 MT, printed as 4.650
    expect(purchaseDetailMatches(rows, 4.65)).toBe(true);
    expect(purchaseDetailMatches(rows, 4.6504)).toBe(true);
    // One document missing on the reconciliation side.
    expect(purchaseDetailMatches(rows, 3.4)).toBe(false);
    // The legacy Stores route still feeding the figure.
    expect(purchaseDetailMatches(rows, 4.652)).toBe(false);
  });

  it("does not mistake the backend's half-even MT rounding for a mismatch", () => {
    // 4062.5 kg: the backend prints 4.062 (half-even), toFixed gives 4.063.
    const rows = [line({ kg: 4000 }), line({ yarn_purchase_id: 2, kg: 62.5 })];
    expect(purchaseDetailTotalMt(rows)).toBe(4.063);
    expect(purchaseDetailMatches(rows, 4.062)).toBe(true);
    expect(purchaseDetailMatches(rows, 4.063)).toBe(true);
    // A real gap of more than a kg is still a mismatch.
    expect(purchaseDetailMatches(rows, 4.061)).toBe(false);
  });
});
