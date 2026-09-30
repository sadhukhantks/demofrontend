import type { StockLocation, WindingStockRow } from "@/utils/windingStockService";

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

export type LocationTotals = Record<StockLocation, number>;

/**
 * MT on hand per location (yarn-purchase design §3.3). Both keys are always
 * present so the footer can print "Godown 0.000" for a day with no godown
 * count. A row with no stock_loc (counted before the column existed, or
 * served by an older backend) is FLOOR — the same default the server applies.
 * Godown + Floor always equals grandTotal: the split never changes the day's
 * total the difference report uses.
 */
export function locationTotals(rows: ReadonlyArray<WindingStockRow>): LocationTotals {
  const totals: LocationTotals = { GODOWN: 0, FLOOR: 0 };
  rows.forEach((r) => {
    const loc: StockLocation = r.stock_loc === "GODOWN" ? "GODOWN" : "FLOOR";
    totals[loc] = roundMt(totals[loc] + stockMt(r.no_of_samples, r.wt_per_sample));
  });
  return totals;
}

/**
 * Whether the grid's row Edit/Delete actions should be disabled.
 *
 * A locked day is not a hard freeze (see winding_stock_lock.py): a user
 * holding Edit access for the Winding Stock menu must still be able to
 * correct a miscount. Blanket-disabling on `locked` alone (ignoring
 * `canEdit`) would silently take that away from every user, supervisors
 * included, and there would be no UI path left to fix a bad row short of a
 * direct API call.
 */
export function rowActionsDisabled(opts: {
  saving: boolean;
  deleting: boolean;
  locked: boolean;
  canEdit: boolean;
}): boolean {
  return opts.saving || opts.deleting || (opts.locked && !opts.canEdit);
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

export const LOCATION_LABELS: Record<StockLocation, string> = {
  GODOWN: "Godown",
  FLOOR: "Floor",
};

export const BUCKET_LABELS: Record<string, string> = {
  MILL_USE: "Yarn for Mill Use",
  PURCHASE: "Outside Purchase Yarn",
  SALE_YARN: "Sale Yarn Stock",
  BALL: "Ball Stock",
  WASTE: "Waste",
};
