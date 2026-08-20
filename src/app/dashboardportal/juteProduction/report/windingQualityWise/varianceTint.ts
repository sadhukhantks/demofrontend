import type { WindingQualityGroupRow } from "@/utils/juteProductionReportService";

/** Variances are rounded floats, so they rarely land exactly on zero — a
 * `!== 0` test would tint rows on floating-point dust alone. */
export const VARIANCE_EPS = 0.001;

/**
 * True when winding and spinning disagree for this group in ANY shift or in
 * total. The legacy PHP sheet compared with a loose `!=` on strings and never
 * looked at Shift A at all — all four fields are checked here, numerically.
 */
export function variesFromSpinning(r: WindingQualityGroupRow): boolean {
  return [r.variance_A, r.variance_B, r.variance_C, r.variance_total].some(
    (v) => Math.abs(v) > VARIANCE_EPS,
  );
}
