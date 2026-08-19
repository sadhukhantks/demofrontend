import type { WindingStockRow } from "@/utils/windingStockService";

/** The column scale the mill's sheet prints MT at. */
export const MT_SCALE = 3;

/** Round to the printed scale so float addition never leaks 0.30000000000000004. */
export function roundMt(value: number): number {
  const factor = 10 ** MT_SCALE;
  return Math.round(value * factor) / factor;
}

/**
 * MT for one counted line. Mirrors the server formula exactly
 * (no_of_samples * wt_per_sample / 1000) so the grid and the report agree.
 */
export function stockMt(
  samples: number | null | undefined,
  wt: number | null | undefined,
): number {
  const s = Number(samples);
  const w = Number(wt);
  if (!Number.isFinite(s) || !Number.isFinite(w)) return 0;
  return roundMt((s * w) / 1000);
}

export function bucketTotals(rows: ReadonlyArray<WindingStockRow>): Record<string, number> {
  const totals: Record<string, number> = {};
  rows.forEach((r) => {
    const mt = stockMt(r.no_of_samples, r.wt_per_sample);
    totals[r.bucket] = roundMt((totals[r.bucket] ?? 0) + mt);
  });
  return totals;
}

export function grandTotal(rows: ReadonlyArray<WindingStockRow>): number {
  return roundMt(
    Object.values(bucketTotals(rows)).reduce((sum, mt) => sum + mt, 0),
  );
}

export function formatMt(value: number | null | undefined): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(MT_SCALE) : "";
}

/** Local-time-safe today, matching wasteEntry's todayISO. */
export function todayISO(): string {
  const d = new Date();
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 10);
}

export const BUCKET_LABELS: Record<string, string> = {
  MILL_USE: "Yarn for Mill Use",
  PURCHASE: "Outside Purchase Yarn",
  SALE_YARN: "Sale Yarn Stock",
  BALL: "Ball Stock",
  WASTE: "Waste",
};
