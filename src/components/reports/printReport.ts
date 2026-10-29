/**
 * Print / Save-as-PDF for report pages.
 *
 * Builds a self-contained HTML document — a letterhead plus one bordered table
 * per section — opens it in a new window and hands it to the browser's print
 * dialog, where "Save as PDF" lives. Used instead of printing the page itself
 * because the report grids are virtualised and paginated: `window.print()` on
 * the page only prints the rows currently in view.
 *
 * `buildPrintHtml` is pure (unit-tested); `printReportSections` is the only
 * function that touches `window`.
 */
import type { GridColDef, GridValidRowModel } from "@mui/x-data-grid";
import { printFrameCss, wrapInPrintFrame } from "@/utils/printFrame";
import { gridCellText, isDataColumn } from "./gridExportRows";

export interface PrintColumn {
  header: string;
  align?: "left" | "right" | "center";
}

export interface PrintSection {
  title: string;
  subtitle?: string;
  columns: PrintColumn[];
  rows: (string | number | null | undefined)[][];
}

export interface PrintReportOptions {
  /** Document title and first letterhead line. */
  title: string;
  /** Extra letterhead lines under the title: company, branch, period... */
  headerLines?: string[];
  /** Wide sheets print landscape; default portrait. */
  landscape?: boolean;
  /** Small-print note under the last table. */
  footnote?: string;
}

export function escapeHtml(v: unknown): string {
  if (v == null) return "";
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** A grid's rows as a print section — every column resolved the way the grid
 * shows it (valueGetter, then valueFormatter); numeric columns right-aligned;
 * widget-only columns (edit/delete buttons) dropped. */
export function gridPrintSection<T extends GridValidRowModel>(
  title: string,
  columns: GridColDef<T>[],
  rows: T[],
  subtitle?: string,
): PrintSection {
  const cols = columns.filter((c) => isDataColumn(c, rows[0]));
  return {
    title,
    subtitle,
    columns: cols.map((c) => ({
      header: c.headerName ?? c.field,
      align: c.type === "number" ? "right" : "left",
    })),
    rows: rows.map((r) => cols.map((c) => gridCellText(c, r))),
  };
}

const CSS = `
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; margin: 0; padding: 12mm; }
  h1 { font-size: 16px; margin: 0 0 2px; }
  .hl { font-size: 12px; margin: 0; }
  .section { margin-top: 14px; break-inside: avoid; }
  .section h2 { font-size: 13px; margin: 0 0 2px; }
  .section .sub { color: #555; margin: 0 0 6px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #999; padding: 3px 5px; vertical-align: top; }
  th { background: #1b2a4e; color: #fff; text-align: left; }
  tr { break-inside: avoid; }
  thead { display: table-header-group; }
  .r { text-align: right; } .c { text-align: center; }
  .empty { color: #777; font-style: italic; }
  .foot { margin-top: 12px; color: #555; font-size: 10px; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
`;

/** Paper margin of the printout, mm. @page margin is 0 (see buildPrintHtml) so
 * the browser omits its own header/footer (date, title, URL, page number); the
 * margin is applied by the print frame so it repeats on every printed page. */
const PRINT_MARGIN_MM = 10;

export function buildPrintHtml(
  opts: PrintReportOptions,
  sections: PrintSection[],
): string {
  const head = [
    `<h1>${escapeHtml(opts.title)}</h1>`,
    ...(opts.headerLines ?? [])
      .filter((l) => l != null && l !== "")
      .map((l) => `<p class="hl">${escapeHtml(l)}</p>`),
  ].join("");

  const body = sections
    .map((s) => {
      const ths = s.columns
        .map((c) => `<th class="${c.align === "right" ? "r" : c.align === "center" ? "c" : ""}">${escapeHtml(c.header)}</th>`)
        .join("");
      const trs = s.rows
        .map(
          (row) =>
            `<tr>${row
              .map((v, i) => {
                const a = s.columns[i]?.align;
                const cls = a === "right" ? "r" : a === "center" ? "c" : "";
                return `<td class="${cls}">${escapeHtml(v)}</td>`;
              })
              .join("")}</tr>`,
        )
        .join("");
      const table = s.rows.length
        ? `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`
        : `<p class="empty">No rows.</p>`;
      return `<div class="section"><h2>${escapeHtml(s.title)}</h2>${
        s.subtitle ? `<p class="sub">${escapeHtml(s.subtitle)}</p>` : ""
      }${table}</div>`;
    })
    .join("");

  const foot = opts.footnote ? `<p class="foot">${escapeHtml(opts.footnote)}</p>` : "";
  const page = `@page { size: ${opts.landscape ? "landscape" : "portrait"}; margin: 0; }`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(
    opts.title,
  )}</title><style>${page}${CSS}${printFrameCss({
    sideMm: PRINT_MARGIN_MM,
    topMm: PRINT_MARGIN_MM,
  })}</style></head><body>${wrapInPrintFrame(`${head}${body}${foot}`)}</body></html>`;
}

/**
 * Opens the print-out in a new window and triggers the print dialog. Returns
 * false when the popup was blocked so the caller can tell the user.
 */
export function printReportSections(
  opts: PrintReportOptions,
  sections: PrintSection[],
): boolean {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.open();
  w.document.write(buildPrintHtml(opts, sections));
  w.document.close();
  // document.write is synchronous, but give the window a tick to lay out
  // before the dialog freezes it — otherwise some browsers print a blank page.
  w.setTimeout(() => {
    w.focus();
    w.print();
  }, 300);
  return true;
}
