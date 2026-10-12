/**
 * Quality x Shift pivot of the Frame Analysis tab (pure — no React / MUI so it
 * can be unit-tested).
 *
 * The server sends one row per (quality, shift): the average doff weight per
 * frame-shift and, since TKT-000212, the average STANDARD per frame-shift (Std
 * Prod from the Spinning Standards master) with the deviation from it. The
 * sheet reads it wide: one row per quality, four cells per shift.
 *
 * Std / Diff / Diff % are averaged over the frame-shifts that HAVE a standard
 * only; when that is not all of them the coverage ("1/2") is kept beside the
 * cell so the grid can say so. No standard at all -> the three stay null
 * (blank), never zero.
 */

import type { QualityShiftAvgRow } from "./doffAnalysisService";

export interface QualityShiftPivotRow {
  id: number;
  label: string;
  [key: string]: string | number | null;
}

export const qsKey = {
  actual: (s: string) => `shift_${s}`,
  std: (s: string) => `std_${s}`,
  diff: (s: string) => `diff_${s}`,
  diffPct: (s: string) => `dpct_${s}`,
  coverage: (s: string) => `cov_${s}`,
};

const NO_LABEL = "—";

/** "covered/total" when only part of the frame-shifts had a standard. */
function coverage(r: QualityShiftAvgRow): string | null {
  const cells = r.cells ?? 0;
  const covered = r.target_cells ?? 0;
  return r.target_wt != null && covered < cells ? `${covered}/${cells}` : null;
}

export function pivotQualityShiftRows(rows: QualityShiftAvgRow[]): {
  shifts: string[];
  rows: QualityShiftPivotRow[];
} {
  const shifts = Array.from(new Set(rows.map((r) => r.shift ?? NO_LABEL))).sort();
  const byQuality = new Map<string, QualityShiftPivotRow>();
  rows.forEach((r) => {
    const label = r.quality_name ?? NO_LABEL;
    const s = r.shift ?? NO_LABEL;
    const acc = byQuality.get(label) ?? { id: byQuality.size, label };
    acc[qsKey.actual(s)] = r.avg_net_wt;
    acc[qsKey.std(s)] = r.target_wt ?? null;
    acc[qsKey.diff(s)] = r.diff_wt ?? null;
    acc[qsKey.diffPct(s)] = r.diff_pct ?? null;
    acc[qsKey.coverage(s)] = coverage(r);
    byQuality.set(label, acc);
  });
  return { shifts, rows: Array.from(byQuality.values()) };
}
