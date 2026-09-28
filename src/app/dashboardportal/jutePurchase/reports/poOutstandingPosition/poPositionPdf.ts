/**
 * PDF download for the Outstanding PO Position page: one A4 landscape document
 * with the tab currently shown (PO-wise, Supplier-wise or Quality-wise) as one
 * table under a heading, cells rendered exactly as the grid displays them
 * (valueFormatter / string fields, so MT is whole and the lorry cells read
 * "5 (70)"), the Grand Total row shaded like the Excel export, the header row
 * repeated on every page and "Page n of m" in the footer.
 *
 * The shared kit's `exportRowsToPdf` / `exportGridSectionsToPdf`
 * (src/components/reports/) have no total-row shading or report number, so the
 * document is assembled here with the same fonts, sizes and letterhead layout.
 * jspdf + jspdf-autotable are imported dynamically so they stay out of the page
 * bundle until someone downloads.
 */
import type { GridColDef, GridValidRowModel } from "@mui/x-data-grid";
import type { ReportExportHeader } from "@/components/reports/exportExcel";
import { pdfCellText } from "@/components/reports/exportPdf";
import { isDataColumn } from "@/components/reports/gridExportRows";

/** One on-screen grid to print: its title, the grid's own column defs and rows. */
export interface PdfSection<T extends GridValidRowModel = GridValidRowModel> {
  title: string;
  columns: GridColDef<T>[];
  rows: T[];
  /** Marks summary rows to shade (the Grand Total line). */
  isTotalRow?: (row: T) => boolean;
}

/** A section reduced to plain strings, ready for autotable. */
export interface PdfTable {
  title: string;
  head: string[];
  body: string[][];
  /** Body row indexes to shade as totals. */
  totalRows: number[];
  /** Per column: numbers right, text left. */
  aligns: ("left" | "right")[];
}

/**
 * Fields the owner does not want on the print (2026-09-25): rupee balance and
 * the two settlement flags, on every tab where they appear. Screen and Excel
 * keep them.
 */
export const PDF_EXCLUDED_FIELDS: ReadonlySet<string> = new Set([
  "balance_value",
  "stale_label",
  "settle_label",
]);

/**
 * Columns worth printing: drops widget-only columns (the checkbox and Close
 * action have no field on the row and no valueGetter), then the excluded
 * fields. Pure; tested.
 */
export function pdfDataColumns<T extends GridValidRowModel>(
  columns: GridColDef<T>[],
  sample?: T,
  excluded: ReadonlySet<string> = PDF_EXCLUDED_FIELDS,
): GridColDef<T>[] {
  return columns.filter(
    (c) => !c.field.startsWith("__") && isDataColumn(c, sample) && !excluded.has(c.field),
  );
}

/**
 * Section → strings, using the grid's own display resolution (valueGetter,
 * then valueFormatter) so the PDF matches the screen cell for cell. Pure.
 */
export function pdfTableFromSection<T extends GridValidRowModel>(s: PdfSection<T>): PdfTable {
  const cols = pdfDataColumns(s.columns, s.rows[0]);
  const totalRows: number[] = [];
  const body = s.rows.map((r, i) => {
    if (s.isTotalRow?.(r)) totalRows.push(i);
    return cols.map((c) => pdfCellText(c, r));
  });
  return {
    title: s.title,
    head: cols.map((c) => c.headerName ?? String(c.field)),
    body,
    totalRows,
    aligns: cols.map((c) => (c.type === "number" ? "right" : "left")),
  };
}

/** Letterhead lines under the report title (same content as the Excel header block). */
export function pdfSubtitle(header: ReportExportHeader, now: Date = new Date()): string {
  return [
    header.branchName ? `Branch: ${header.branchName}` : null,
    header.reportFor ? `Period: ${header.reportFor}` : null,
    header.reportNo != null && header.reportNo !== "" ? `Report No: ${header.reportNo}` : null,
    `Generated: ${now.toLocaleString()}`,
  ]
    .filter(Boolean)
    .join("    ");
}

const BLUE: [number, number, number] = [62, 166, 218];

/**
 * Build and download the document for one section (the current tab). A long
 * table spans pages with the header row repeated on each.
 */
export async function exportPoPositionPdf<T extends GridValidRowModel>(
  section: PdfSection<T>,
  header: ReportExportHeader,
  fileName: string,
): Promise<void> {
  if (typeof window === "undefined") return;
  const { jsPDF } = await import("jspdf");
  const { autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 8;
  let y = 12;

  if (header.companyName) {
    doc.setFontSize(13);
    doc.text(header.companyName, pageWidth / 2, y, { align: "center" });
    y += 5;
  }
  doc.setFontSize(11);
  doc.text(header.reportName || fileName, pageWidth / 2, y, { align: "center" });
  y += 5;
  doc.setFontSize(8);
  doc.text(pdfSubtitle(header), pageWidth / 2, y, { align: "center" });
  y += 6;

  const t = pdfTableFromSection(section);
  doc.setFontSize(10);
  doc.setFont(doc.getFont().fontName, "bold");
  doc.text(t.title, marginX, y);
  doc.setFont(doc.getFont().fontName, "normal");
  y += 2;

  if (t.body.length === 0) {
    doc.setFontSize(8);
    doc.text("No rows.", marginX, y + 4);
  } else {
    const totals = new Set(t.totalRows);
    autoTable(doc, {
      startY: y,
      head: [t.head],
      body: t.body,
      styles: { fontSize: 7, cellPadding: 1.2, overflow: "linebreak" },
      headStyles: { fillColor: BLUE, textColor: 255, fontStyle: "bold" },
      columnStyles: Object.fromEntries(t.aligns.map((a, i) => [i, { halign: a }])),
      margin: { left: marginX, right: marginX },
      // Grand Total row shaded like the Excel export: blue band, white bold.
      didParseCell: (data) => {
        if (data.section === "body" && totals.has(data.row.index)) {
          data.cell.styles.fillColor = BLUE;
          data.cell.styles.textColor = 255;
          data.cell.styles.fontStyle = "bold";
        }
      },
    });
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.text(`Page ${i} of ${pages}`, pageWidth - marginX, pageHeight - 5, { align: "right" });
  }
  doc.save(fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`);
}
