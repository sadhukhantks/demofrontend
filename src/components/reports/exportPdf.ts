import type { GridColDef, GridValidRowModel } from "@mui/x-data-grid";
import type { ReportExportHeader } from "./exportExcel";

/** Loose view of the MUI cell callbacks — they all take (value, row, column,
 * apiRef).
 * ponytail: apiRef is passed as null behind a cast. The report column defs only
 * ever read `value`/`row`; give one of them an apiRef-using getter and this is
 * the line to fix. */
type CellFn<T> = (value: unknown, row: T, column: unknown, apiRef: unknown) => unknown;

/** Light green for highlighted cells — same shade as GOOD_FILL in exportExcel. */
const GOOD_FILL_RGB: [number, number, number] = [198, 239, 206];

/**
 * Render one cell exactly as the grid shows it — valueGetter, then
 * valueFormatter — so the PDF carries the displayed text (e.g. "Not synced",
 * "12.00") rather than the raw row field.
 */
export function pdfCellText<T extends GridValidRowModel>(
  column: GridColDef<T>,
  row: T,
): string {
  let value: unknown = (row as Record<string, unknown>)[column.field];
  if (column.valueGetter) {
    value = (column.valueGetter as unknown as CellFn<T>)(value, row, column, null);
  }
  if (column.valueFormatter) {
    value = (column.valueFormatter as unknown as CellFn<T>)(value, row, column, null);
  }
  return value == null ? "" : String(value);
}

/**
 * Download the loaded report rows as a print-ready A4 **landscape** PDF built
 * with jsPDF + autotable, using the grid's own column defs: same headers, same
 * displayed values, numeric columns right-aligned, long cells wrapped, the
 * header row repeated on every page and "Page n of m" in the footer.
 *
 * jspdf/jspdf-autotable are imported dynamically (same as the Excel export) so
 * they stay out of the page bundle until someone actually downloads.
 */
export async function exportRowsToPdf<T extends GridValidRowModel>(
  columns: GridColDef<T>[],
  rows: T[],
  fileNamePrefix = "report",
  header?: ReportExportHeader,
  /** Body cells to shade light green (e.g. a day that earned an incentive). */
  highlight?: (row: T, column: GridColDef<T>) => boolean,
): Promise<void> {
  if (typeof window === "undefined") return;
  const { jsPDF } = await import("jspdf");
  const { autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 8;
  let y = 12;

  if (header?.companyName) {
    doc.setFontSize(13);
    doc.text(header.companyName, pageWidth / 2, y, { align: "center" });
    y += 5;
  }
  doc.setFontSize(11);
  doc.text(header?.reportName || fileNamePrefix, pageWidth / 2, y, {
    align: "center",
  });
  y += 5;

  const subtitle = [
    header?.branchName ? `Branch: ${header.branchName}` : null,
    header?.reportFor ? `Period: ${header.reportFor}` : null,
    `Generated: ${new Date().toLocaleString()}`,
  ]
    .filter(Boolean)
    .join("    ");
  doc.setFontSize(8);
  doc.text(subtitle, pageWidth / 2, y, { align: "center" });
  y += 4;

  autoTable(doc, {
    startY: y,
    head: [columns.map((c) => c.headerName ?? String(c.field))],
    body: rows.map((r) => columns.map((c) => pdfCellText(c, r))),
    // linebreak = wrap inside the cell; autotable's auto column sizing then
    // gives the longest column (Remarks) the most width and fits the page.
    styles: { fontSize: 7, cellPadding: 1.2, overflow: "linebreak" },
    headStyles: { fillColor: [62, 166, 218], textColor: 255, fontStyle: "bold" },
    columnStyles: Object.fromEntries(
      columns.map((c, i) => [i, { halign: c.type === "number" ? "right" : "left" }]),
    ),
    margin: { left: marginX, right: marginX },
    didParseCell: highlight
      ? (data) => {
          if (data.section !== "body") return;
          const row = rows[data.row.index];
          const col = columns[data.column.index];
          if (row && col && highlight(row, col)) data.cell.styles.fillColor = GOOD_FILL_RGB;
        }
      : undefined,
  });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.text(`Page ${i} of ${pages}`, pageWidth - marginX, pageHeight - 5, {
      align: "right",
    });
  }

  doc.save(`${fileNamePrefix}-${Date.now()}.pdf`);
}
