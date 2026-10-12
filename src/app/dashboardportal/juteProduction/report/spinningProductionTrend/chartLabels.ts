/**
 * Value labels on the Spinning Production Trend charts (TKT-000222: "add
 * data point in graphs so that numbers are visible"). On a phone there is
 * no hover, so the figures are printed at the data points. A dense range
 * cannot carry a number on every point, so the labels are thinned to every
 * k-th point, counted back from the latest point — the most recent figure
 * is always shown. Pure helpers; the SVG lives in `_components/TrendCharts`.
 */

/** Font size of every value label (px). */
export const LABEL_FONT_PX = 10;

/** Rough rendered width of a numeric label at `fontPx`. Digits in a UI
 * sans sit near 0.6 em; commas and points are narrower, so this errs wide,
 * which is the safe side for collision budgeting. */
export function estimateLabelWidth(text: string, fontPx = LABEL_FONT_PX): number {
  return Math.ceil(text.length * fontPx * 0.6);
}

/** Step between labelled points so labels `labelPx` wide fit `slotPx` apart
 * with `gapPx` of breath. 1 means every point. A non-positive or unknown
 * slot (chart not yet measured) labels every point rather than none. */
export function labelStep(slotPx: number, labelPx: number, gapPx = 6): number {
  if (!Number.isFinite(slotPx) || slotPx <= 0) return 1;
  return Math.max(1, Math.ceil((labelPx + gapPx) / slotPx));
}

/** Indices to label: every `step`-th point counted back from the last
 * non-null value, so the latest figure always carries a label; nulls (a day
 * the quality did not run) are never labelled. Ascending. */
export function labelledIndices(values: readonly (number | null)[], step: number): number[] {
  const safeStep = Math.max(1, Math.floor(step));
  let last = values.length - 1;
  while (last >= 0 && values[last] == null) last -= 1;
  const out: number[] = [];
  for (let i = last; i >= 0; i -= safeStep) {
    if (values[i] != null) out.push(i);
  }
  return out.reverse();
}

/** Right (or top) margin a horizontal bar chart needs so an `outside` label
 * past its longest bar is not clipped: the widest label plus a gap. */
export function outsideLabelRoom(labels: readonly string[], fontPx = LABEL_FONT_PX): number {
  return labels.reduce((w, l) => Math.max(w, estimateLabelWidth(l, fontPx)), 0) + 10;
}
