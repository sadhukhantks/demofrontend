/**
 * Deep links from a frame (or one frame-shift) on the trend report into the
 * reports that hold the detail behind it:
 *   - Doff Analysis / Frame Analysis: that frame's day-by-shift weights and
 *     the doff events per spinner behind them (range capped at 31 days there);
 *   - Doff Analysis / Doff Details: one production date, every doff;
 *   - Spinning Low Producer: spinner-level efficiency on that frame, with the
 *     same shift / quality filter (range capped at 62 days there).
 * Both target pages read these query params on load.
 */

const HUB = "/dashboardportal/juteProduction/report";
const MS_PER_DAY = 86_400_000;

export const DOFF_ANALYSIS_CAP_DAYS = 31;
export const LOW_PRODUCER_CAP_DAYS = 62;

/** The same window, shortened from the start to fit `maxDays` ending on `to`. */
export function clampRange(from: string, to: string, maxDays: number): { from: string; to: string; clamped: boolean } {
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (Number.isNaN(start) || Number.isNaN(end)) return { from, to, clamped: false };
  const days = (end - start) / MS_PER_DAY + 1;
  if (days <= maxDays) return { from, to, clamped: false };
  const newStart = new Date(end - (maxDays - 1) * MS_PER_DAY);
  return { from: newStart.toISOString().slice(0, 10), to, clamped: true };
}

function qs(params: Record<string, string | number | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== "") p.set(k, String(v));
  }
  return p.toString();
}

export interface DrillScope {
  branchId: number;
  dateFrom: string;
  dateTo: string;
  shift?: string | null;
  itemId?: number | null;
}

/** Doff Analysis, Frame Analysis tab, with the frame's drill-down open. */
export function doffAnalysisFrameUrl(scope: DrillScope, frame: string): { url: string; clamped: boolean } {
  const r = clampRange(scope.dateFrom, scope.dateTo, DOFF_ANALYSIS_CAP_DAYS);
  return {
    url: `${HUB}/doffAnalysis?${qs({ branch_id: scope.branchId, tab: "frames", frame, date_from: r.from, date_to: r.to, item_id: scope.itemId })}`,
    clamped: r.clamped,
  };
}

/** Doff Analysis, Doff Details tab, for one production date. */
export function doffAnalysisDayUrl(branchId: number, date: string): string {
  return `${HUB}/doffAnalysis?${qs({ branch_id: branchId, tab: "details", date })}`;
}

/** Spinning Low Producer filtered to the frame (and the active shift /
 * quality); `date` narrows it to one day. */
export function lowProducerUrl(
  scope: DrillScope,
  frame: string,
  opts: { date?: string | null; shift?: string | null } = {},
): { url: string; clamped: boolean } {
  const r = opts.date
    ? { from: opts.date, to: opts.date, clamped: false }
    : clampRange(scope.dateFrom, scope.dateTo, LOW_PRODUCER_CAP_DAYS);
  return {
    url: `${HUB}/spinningLowProducer?${qs({
      branch_id: scope.branchId,
      date_from: r.from,
      date_to: r.to,
      frame,
      shift: opts.shift ?? scope.shift,
      item_id: scope.itemId,
    })}`,
    clamped: r.clamped,
  };
}
