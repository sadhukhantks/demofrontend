/**
 * Excel + PDF exports for the S4 Incentive Report.
 *
 * Both reuse the shared report builders and add the two things this report
 * needs: day columns sized to their content (the shared sheet builder floors
 * every column at 10 chars, far too wide for "01/09") and the light-green
 * shading on days at or above the incentive floor, as the grid shows it.
 */

import type { GridColDef } from "@mui/x-data-grid";
import {
  buildReportSheet,
  GOOD_FILL,
  type ReportExportHeader,
  type Worksheet,
} from "@/components/reports/exportExcel";
import { exportRowsToPdf } from "@/components/reports/exportPdf";

export type S4GridRow = Record<string, string | number | null> & { row_id: number };

export const dayField = (iso: string) => `d_${iso}`;

/** Legacy colour bands for a day's efficiency: 60+ green, 1..39 red. */
export const GOOD_EFF = 60;
export const BAD_EFF = 40;

/** True for a day cell at or above the incentive floor. */
function isIncentiveCell(row: S4GridRow, column: GridColDef<S4GridRow>): boolean {
  return column.field.startsWith("d_") && Number(row[column.field] ?? 0) >= GOOD_EFF;
}

export async function exportS4Excel(
  columns: GridColDef<S4GridRow>[],
  rows: S4GridRow[],
  header: ReportExportHeader,
): Promise<void> {
  const ExcelJS = await import("exceljs");
  const { saveAs } = await import("file-saver");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Report");
  buildReportSheet(ws as unknown as Worksheet, columns, rows, header);

  // The builder freezes the column-header row, so data starts right under it.
  const firstDataRow = ((ws.views[0] as { ySplit?: number })?.ySplit ?? 0) + 1;
  columns.forEach((c, i) => {
    if (!c.field.startsWith("d_")) return;
    const colNo = i + 1;
    let width = (c.headerName ?? c.field).length;
    rows.forEach((r, ri) => {
      width = Math.max(width, String(r[c.field] ?? "").length);
      if (isIncentiveCell(r, c)) {
        ws.getRow(firstDataRow + ri).getCell(colNo).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: GOOD_FILL },
        };
      }
    });
    ws.getColumn(colNo).width = width + 2;
    ws.getColumn(colNo).alignment = { horizontal: "center", vertical: "top" };
  });

  // Fit all columns to one A4 landscape page width when printed from Excel.
  ws.pageSetup = {
    paperSize: 9, // A4
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
  };

  const buf = await wb.xlsx.writeBuffer();
  saveAs(
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `s4-incentive-${Date.now()}.xlsx`,
  );
}

/** A4 landscape PDF (shared builder fits every column to the page width). */
export function exportS4Pdf(
  columns: GridColDef<S4GridRow>[],
  rows: S4GridRow[],
  header: ReportExportHeader,
): Promise<void> {
  return exportRowsToPdf(columns, rows, "s4-incentive", header, isIncentiveCell);
}
