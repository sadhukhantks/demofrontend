/**
 * Chart colours for the Spinning Production Trend report.
 *
 * Categorical slots in FIXED order (validated with the dataviz palette
 * checker on a white surface: lightness band, chroma floor, adjacent-pair CVD
 * separation and normal-vision floor all pass; aqua / yellow / magenta sit
 * below 3:1 contrast, which is why every chart on the page has a table twin).
 * Slots are assigned to qualities by period volume and never recycled — a
 * 9th quality folds into "Other", it never gets a generated hue.
 */

export const SERIES_COLORS = [
  "#2a78d6", // 1 blue
  "#eb6834", // 2 orange
  "#1baf7a", // 3 aqua
  "#eda100", // 4 yellow
  "#e87ba4", // 5 magenta
  "#008300", // 6 green
  "#4a3aa7", // 7 violet
  "#e34948", // 8 red
] as const;

/** Qualities past this many get folded into one "Other" series. */
export const QUALITY_SLOT_CAP = 7;

/** The folded "Other" series and any de-emphasised context series. */
export const OTHER_COLOR = "#898781";

/** Reference lines — ink, not a series colour. */
export const REFERENCE_COLOR = "#52514e";

/** The standard (dashed) and the target (dotted) lines: context in ink
 * greys so the solid actual stays the emphasis. */
export const STD_COLOR = "#52514e";
export const TGT_COLOR = "#898781";

/** Hairline grid, one step off the surface. */
export const GRID_COLOR = "#e1e0d9";

/** Shift letters keep a fixed slot each so a filter that drops a shift never
 * repaints the survivors. */
export const SHIFT_ORDER = ["A", "B", "C", "G"] as const;
export const SHIFT_LABEL: Record<string, string> = {
  A: "Shift A",
  B: "Shift B",
  C: "Shift C",
  G: "Other shift",
};
