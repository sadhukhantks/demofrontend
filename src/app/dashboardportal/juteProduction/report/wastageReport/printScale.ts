/**
 * Fit-to-width printing for the Wastage Report (TKT-000183).
 *
 * The sheet is far wider than a landscape page and a scrolling table cannot
 * scroll on paper, so the print root is scaled down to the printable width.
 * Kept out of page.tsx because the app router forbids extra exports there.
 */

/** @page margin used by the report's print stylesheet. */
export const PRINT_PAGE_MARGIN_MM = 8;

/** Printable width of an A4 landscape page (297mm) inside the margins, in
 * CSS px (96 per inch). */
export const A4_LANDSCAPE_PRINTABLE_PX = Math.floor(
  ((297 - 2 * PRINT_PAGE_MARGIN_MM) / 25.4) * 96,
);

/** Scale factor that fits a table of `tableWidthPx` onto the printable page
 * width; never enlarges (max 1), 3 decimals so the CSS value stays tidy. An
 * unmeasurable width (0 / NaN — no table rendered yet) leaves the sheet at 1. */
export function printScaleFor(
  tableWidthPx: number,
  pageWidthPx: number = A4_LANDSCAPE_PRINTABLE_PX,
): number {
  if (!Number.isFinite(tableWidthPx) || tableWidthPx <= 0) return 1;
  return Math.min(1, Math.round((pageWidthPx / tableWidthPx) * 1000) / 1000);
}
