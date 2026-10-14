/**
 * Print frame: keeps the paper margin on EVERY printed page while the page
 * itself has `@page { margin: 0 }`.
 *
 * Why: a zero `@page` margin is what makes Chrome / Edge omit their own
 * header and footer (date, title, URL, page number) - see CLAUDE.md
 * "Printing". But a margin put on `body { padding }` only exists once, at the
 * top of the first page and the bottom of the last. Chrome repeats a table's
 * `thead` / `tfoot` on every printed page, so the content is wrapped in a
 * one-cell table whose `thead` and `tfoot` each hold an empty spacer `div`
 * (the top / bottom margin). Only the left / right margin stays on `body`.
 *
 * Pure string helpers (no DOM, no React) so the HTML-string print builders can
 * share them; the React twin is `src/components/reports/PrintFrame.tsx`.
 */

export interface PrintFrameMargins {
  /**
   * Left / right paper margin, mm, applied as `body` horizontal padding.
   * Omit when the printed element is not the document body (live-page prints
   * that isolate a root with `visibility`) and position / pad it yourself.
   */
  sideMm?: number;
  /** Top margin repeated on every page, mm. */
  topMm: number;
  /** Bottom margin repeated on every page, mm. Defaults to `topMm`. */
  bottomMm?: number;
}

/**
 * Wraps already-rendered HTML in the print frame table. The frame has no
 * visible styling of its own - see {@link printFrameCss}.
 */
export function wrapInPrintFrame(contentHtml: string): string {
  return (
    `<table class="print-frame">` +
    `<thead><tr><td><div class="print-frame-top"></div></td></tr></thead>` +
    `<tfoot><tr><td><div class="print-frame-bottom"></div></td></tr></tfoot>` +
    `<tbody><tr><td>${contentHtml}</td></tr></tbody>` +
    `</table>`
  );
}

/**
 * CSS for {@link wrapInPrintFrame}. Selectors use child combinators so they
 * out-rank (and stay immune to) a host document's blanket `table`, `th, td`,
 * `tr` or `thead` rules. `table-layout: fixed` keeps a wide child (e.g. a
 * scrolling MUI table container) from stretching the frame past its parent.
 * The spacers are 0-high on screen and only take their height in print; add
 * this AFTER the host stylesheet so its body padding is replaced by the
 * horizontal-only one (when `sideMm` is given).
 */
export function printFrameCss({ sideMm, topMm, bottomMm }: PrintFrameMargins): string {
  const bottom = bottomMm ?? topMm;
  const bodyRule = sideMm == null ? "" : `body { padding: 0 ${sideMm}mm; }`;
  return `
    .print-frame { width: 100%; table-layout: fixed; border-collapse: collapse; border: 0; margin: 0; }
    .print-frame > thead > tr > td,
    .print-frame > tfoot > tr > td,
    .print-frame > tbody > tr > td { padding: 0; border: 0; background: none; }
    .print-frame > tbody > tr { break-inside: auto; page-break-inside: auto; }
    .print-frame-top, .print-frame-bottom { height: 0; }
    @media print {
      .print-frame-top { height: ${topMm}mm; }
      .print-frame-bottom { height: ${bottom}mm; }
      ${bodyRule}
    }
  `;
}
