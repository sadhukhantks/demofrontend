/**
 * Finishing Checklist Excel export — one workbook with TWO sheets (TKT-000130):
 *
 *   1. "Finishing Checklist" — the grid rows as loaded.
 *   2. "Production"          — worker × day pivot of production qty:
 *                              EB No / Name / Spell / Quality, one column per
 *                              calendar day of the report period, a Grand
 *                              Total column per line and a Grand Total row.
 *
 * Sheet 2 has a two-tier header ("Date" merged over the day columns) that the
 * generic single-header writer cannot express, so it is laid out here with the
 * shared styling helpers. The pivot itself lives in ./finishingPivot.ts.
 */
import type { GridColDef, GridValidRowModel } from "@mui/x-data-grid";
import {
  addBodyRow,
  buildReportSheet,
  styleHeaderRow,
  writeReportHeaderBlock,
  type ReportExportHeader,
  type Worksheet,
} from "@/components/reports/exportExcel";
import type { FinishingChecklistRow } from "@/utils/juteProductionReportService";
import { buildFinishingPivot, type FinishingPivot } from "./finishingPivot";

const LEAD_COLS = ["EB No", "Name", "Spell", "Quality"];

function buildProductionSheet(
  ws: Worksheet,
  pivot: FinishingPivot,
  header: ReportExportHeader,
): void {
  const width = LEAD_COLS.length + pivot.days.length + 1;
  if (writeReportHeaderBlock(ws, header, width)) ws.addRow([]);

  // Two-tier header: lead columns and Grand Total span both rows, "Date"
  // spans the day columns on the top row with the day labels beneath.
  const top = ws.addRow([
    ...LEAD_COLS,
    ...pivot.days.map((_, i) => (i === 0 ? "Date" : "")),
    "Grand Total",
  ]);
  const sub = ws.addRow([...LEAD_COLS.map(() => ""), ...pivot.dayLabels, ""]);
  styleHeaderRow(top);
  styleHeaderRow(sub);
  for (const c of [1, 2, 3, 4, width]) ws.mergeCells(top.number, c, sub.number, c);
  if (pivot.days.length > 1) {
    ws.mergeCells(top.number, 5, top.number, width - 1);
  }

  for (const l of pivot.lines) {
    addBodyRow(
      ws,
      [l.eb_no, l.name, l.spell, l.quality, ...l.cells.map((v) => v ?? ""), l.total],
      false,
    );
  }
  addBodyRow(
    ws,
    ["", "Grand Total", "", "", ...pivot.dayTotals, pivot.grandTotal],
    true,
  );

  [10, 28, 8, 24, ...pivot.days.map(() => 7), 12].forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
  ws.views = [{ state: "frozen", xSplit: LEAD_COLS.length, ySplit: sub.number }];
}

/**
 * Builds and downloads the two-sheet Finishing Checklist workbook. `gridRows`
 * feed sheet 1 as shown; `allRows` (rtype=all) feed the production pivot so it
 * covers every worker, not only the anomalies; `dateFrom`/`dateTo` (ISO) set
 * the pivot's day columns to the full report period. exceljs + file-saver
 * load dynamically so the spreadsheet library stays out of the page bundle.
 */
export async function exportFinishingChecklistWorkbook<T extends GridValidRowModel>(
  columns: GridColDef<T>[],
  gridRows: T[],
  allRows: FinishingChecklistRow[],
  fileNamePrefix: string,
  header: ReportExportHeader,
  dateFrom: string,
  dateTo: string,
): Promise<void> {
  const ExcelJS = await import("exceljs");
  const { saveAs } = await import("file-saver");

  const wb = new ExcelJS.Workbook();
  buildReportSheet(
    wb.addWorksheet("Finishing Checklist") as unknown as Worksheet,
    columns,
    gridRows,
    header,
  );
  buildProductionSheet(
    wb.addWorksheet("Production") as unknown as Worksheet,
    buildFinishingPivot(allRows, dateFrom, dateTo),
    { ...header, reportName: "Finishing Production" },
  );

  const buf = await wb.xlsx.writeBuffer();
  saveAs(
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${fileNamePrefix}-${Date.now()}.xlsx`,
  );
}
