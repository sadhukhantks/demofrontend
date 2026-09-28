/**
 * Multi-grid report export: the sections a report page shows (each a DataGrid
 * with its own columns) become one worksheet each in a single workbook, or
 * one table each in a single print-out. Shared by the report pages that show
 * several grids at once (Doff Analysis) and by entry pages that want their
 * day's grid on paper (Spinning doff entries).
 */
import type { GridColDef, GridValidRowModel } from "@mui/x-data-grid";
import {
  buildReportSheet,
  type ReportExportHeader,
  type Worksheet,
} from "./exportExcel";
import { pdfCellText } from "./exportPdf";
import { isDataColumn, materializeGridRows } from "./gridExportRows";
import {
  gridPrintSection,
  printReportSections,
  type PrintReportOptions,
} from "./printReport";

export interface GridSection<T extends GridValidRowModel = GridValidRowModel> {
  title: string;
  subtitle?: string;
  columns: GridColDef<T>[];
  rows: T[];
}

/** Excel sheet names: max 31 chars, none of : \ / ? * [ ] */
export function sheetName(title: string, used: Set<string>): string {
  const base = title.replace(/[:\\/?*[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "Sheet";
  let name = base;
  let n = 2;
  while (used.has(name)) {
    const suffix = ` (${n++})`;
    name = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(name);
  return name;
}

/**
 * One workbook, one styled sheet per section (header block + blue column
 * band, via buildReportSheet), with every column materialised so pivot /
 * getter columns carry their values. exceljs + file-saver load dynamically so
 * the spreadsheet library stays out of the page bundle.
 */
export async function exportGridSectionsToExcel(
  sections: GridSection[],
  fileNamePrefix: string,
  header: ReportExportHeader,
): Promise<void> {
  const ExcelJS = await import("exceljs");
  const { saveAs } = await import("file-saver");

  const wb = new ExcelJS.Workbook();
  const used = new Set<string>();
  for (const s of sections) {
    const ws = wb.addWorksheet(sheetName(s.title, used)) as unknown as Worksheet;
    const { columns, rows } = materializeGridRows(s.columns, s.rows);
    buildReportSheet(ws, columns, rows, {
      ...header,
      reportName: header.reportName ? `${header.reportName} — ${s.title}` : s.title,
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  saveAs(
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${fileNamePrefix}-${Date.now()}.xlsx`,
  );
}

/**
 * One A4 landscape PDF, one autotable per section under its title — the
 * multi-grid counterpart of exportRowsToPdf (same letterhead, header colours,
 * right-aligned numbers, "Page n of m" footer). jspdf loads dynamically.
 */
export async function exportGridSectionsToPdf(
  sections: GridSection[],
  fileNamePrefix: string,
  header: ReportExportHeader,
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
  doc.text(header.reportName || fileNamePrefix, pageWidth / 2, y, { align: "center" });
  y += 5;
  const subtitle = [
    header.branchName ? `Branch: ${header.branchName}` : null,
    header.reportFor ? `Period: ${header.reportFor}` : null,
    `Generated: ${new Date().toLocaleString()}`,
  ]
    .filter(Boolean)
    .join("    ");
  doc.setFontSize(8);
  doc.text(subtitle, pageWidth / 2, y, { align: "center" });
  y += 6;

  for (const s of sections) {
    const cols = s.columns.filter((c) => isDataColumn(c, s.rows[0]));
    // Section title; start a new page when there is no room for it + a row.
    if (y > pageHeight - 25) {
      doc.addPage();
      y = 12;
    }
    doc.setFontSize(10);
    doc.text(s.title, marginX, y);
    y += 2;
    if (s.rows.length === 0) {
      doc.setFontSize(8);
      doc.text("No rows.", marginX, y + 4);
      y += 10;
      continue;
    }
    autoTable(doc, {
      startY: y,
      head: [cols.map((c) => c.headerName ?? String(c.field))],
      body: s.rows.map((r) => cols.map((c) => pdfCellText(c, r))),
      styles: { fontSize: 7, cellPadding: 1.2, overflow: "linebreak" },
      headStyles: { fillColor: [62, 166, 218], textColor: 255, fontStyle: "bold" },
      columnStyles: Object.fromEntries(
        cols.map((c, i) => [i, { halign: c.type === "number" ? "right" : "left" }]),
      ),
      margin: { left: marginX, right: marginX },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.text(`Page ${i} of ${pages}`, pageWidth - marginX, pageHeight - 5, { align: "right" });
  }
  doc.save(`${fileNamePrefix}-${Date.now()}.pdf`);
}

/** Letterhead lines for the print-out from the same header the sheet uses. */
export function printHeaderLines(header: ReportExportHeader): string[] {
  return [
    header.companyName ?? "",
    header.branchName ? `${header.branchName} (Branch)` : "",
    header.reportFor ? `Period: ${header.reportFor}` : "",
  ].filter(Boolean);
}

/** Print (or Save as PDF) every section as a bordered table. Returns false
 * when the popup was blocked. */
export function printGridSections(
  opts: PrintReportOptions,
  sections: GridSection[],
): boolean {
  return printReportSections(
    opts,
    sections.map((s) => gridPrintSection(s.title, s.columns, s.rows, s.subtitle)),
  );
}
