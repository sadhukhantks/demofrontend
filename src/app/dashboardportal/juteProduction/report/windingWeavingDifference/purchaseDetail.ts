/**
 * Pure helpers for the "Purchase yarn (documents)" block of the Winding &
 * Weaving Difference report — the approved Yarn Purchase lines behind the
 * month-to-date Purchase Yarn (MT) figure.
 *
 * Kept out of page.tsx so the reconciliation rule (documents must add up to
 * `production.mtd.purchase_mt`) is unit-testable without rendering.
 */

import type { WwdPurchaseDetailRow } from "@/utils/juteProductionReportService";

/** Rounding used for every MT figure on the sheet (3 dp = 1 kg). */
const MT_DECIMALS = 3;

/**
 * Tolerance for the documents-vs-`mtd.purchase_mt` check, in kg. The check is
 * done in kg, not on the printed MT: the backend rounds MT half-even while
 * `toFixed` rounds half-up, so a kg total that is an exact multiple of 62.5 kg
 * (e.g. 4062.5 kg -> BE 4.062, FE 4.063) would otherwise look like a mismatch.
 */
export const PURCHASE_MATCH_TOLERANCE_KG = 1;

/** Sum of the document lines in kg. */
export function purchaseDetailTotalKg(rows: readonly WwdPurchaseDetailRow[]): number {
  return rows.reduce((acc, r) => acc + (Number.isFinite(r.kg) ? r.kg : 0), 0);
}

/** Sum of the document lines in MT, rounded to the sheet's 3 dp. */
export function purchaseDetailTotalMt(rows: readonly WwdPurchaseDetailRow[]): number {
  const mt = purchaseDetailTotalKg(rows) / 1000;
  return Number(mt.toFixed(MT_DECIMALS));
}

/**
 * True when the documents' kg total equals the reconciliation's Purchase Yarn
 * (MTD, a 3-dp MT figure) within 1 kg. A mismatch means the two were built
 * from different windows or one side dropped a line — either way the page must
 * say so rather than show two "totals" that disagree.
 */
export function purchaseDetailMatches(
  rows: readonly WwdPurchaseDetailRow[],
  mtdPurchaseMt: number,
): boolean {
  return Math.abs(purchaseDetailTotalKg(rows) - mtdPurchaseMt * 1000) < PURCHASE_MATCH_TOLERANCE_KG;
}
