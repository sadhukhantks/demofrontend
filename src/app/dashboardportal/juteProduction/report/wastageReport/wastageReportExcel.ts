/**
 * Wastage Report Excel export (TKT-000176) — the on-screen sheet as one
 * worksheet: DATE + the 7 PRODUCTION context columns, then one band per waste
 * group (component columns, TOTAL, %), day rows and the monthly TOTAL row.
 *
 * The two-tier header (group names merged over their columns) is beyond the
 * generic single-header writer, so the sheet is laid out here with the shared
 * styling helpers — same approach as the Finishing Checklist workbook.
 * `buildWastageSheetLayout` is pure and unit-tested; the workbook I/O sits in
 * `exportWastageReportWorkbook`.
 */
import {
  addBodyRow,
  styleHeaderRow,
  writeReportHeaderBlock,
  type ReportExportHeader,
  type Worksheet,
} from "@/components/reports/exportExcel";
import type {
  WastageDayRow,
  WastageGroupColumn,
  WastageReport,
  WastageTotalsRow,
} from "@/utils/wastageReportService";

export const PRODUCTION_HEADERS = [
  "HESS LOOMS",
  "SACK (S4) LOOMS",
  "FRAMES RUN",
  "WEAVING KG",
  "SPINNING KG",
  "BREAKER FEED KG",
  "JUTE SELECTION",
] as const;

export type SheetCell = string | number | null;

export interface WastageSheetLayout {
  /** Top header row: DATE, PRODUCTION (merged), one merged cell per group. */
  top: SheetCell[];
  /** Second header row: blank under DATE, the production and component labels. */
  sub: SheetCell[];
  /** 1-based [from, to] column spans merged on the top row. */
  merges: [number, number][];
  rows: SheetCell[][];
  total: SheetCell[] | null;
  width: number;
}

function bandCells(
  row: WastageDayRow | WastageTotalsRow,
  groups: WastageGroupColumn[],
): SheetCell[] {
  const out: SheetCell[] = [
    row.hessian_looms,
    row.sacking_looms,
    row.frames_run,
    row.weaving_kg,
    row.spinning_kg,
    row.breaker_feed_kg,
    row.selection_wt,
  ];
  for (const g of groups) {
    const gv = row.groups[g.group_code];
    for (const c of g.components) out.push(row.cells[c.key] ?? 0);
    out.push(gv?.total ?? 0);
    out.push(gv?.pct ?? null);
  }
  return out;
}

/**
 * Lays the sheet out from the report data and the groups in display order
 * (the page's `orderedGroups`, OTHER last). `dayLabel` is the page's
 * "01 Wed" formatter so the sheet reads like the screen.
 */
export function buildWastageSheetLayout(
  data: WastageReport,
  groups: WastageGroupColumn[],
  dayLabel: (date: string) => string,
): WastageSheetLayout {
  const top: SheetCell[] = ["DATE", "PRODUCTION"];
  const sub: SheetCell[] = ["", ...PRODUCTION_HEADERS];
  const merges: [number, number][] = [[2, 1 + PRODUCTION_HEADERS.length]];
  for (let i = 1; i < PRODUCTION_HEADERS.length; i++) top.push("");

  let col = top.length; // 1-based index of the last filled column
  for (const g of groups) {
    const span = g.components.length + 2;
    top.push(g.group_name);
    for (let i = 1; i < span; i++) top.push("");
    merges.push([col + 1, col + span]);
    col += span;
    for (const c of g.components) sub.push(c.label);
    sub.push("TOTAL", "%");
  }

  return {
    top,
    sub,
    merges,
    rows: data.days.map((d) => [dayLabel(d.date), ...bandCells(d, groups)]),
    total: data.totals ? ["TOTAL", ...bandCells(data.totals, groups)] : null,
    width: top.length,
  };
}

/** Writes the laid-out sheet with the shared header/body styling. */
export function writeWastageSheet(
  ws: Worksheet,
  layout: WastageSheetLayout,
  header: ReportExportHeader,
): void {
  if (writeReportHeaderBlock(ws, header, layout.width)) ws.addRow([]);
  const top = ws.addRow(layout.top);
  const sub = ws.addRow(layout.sub);
  styleHeaderRow(top);
  styleHeaderRow(sub);
  ws.mergeCells(top.number, 1, sub.number, 1); // DATE spans both header rows
  for (const [c1, c2] of layout.merges) {
    if (c2 > c1) ws.mergeCells(top.number, c1, top.number, c2);
  }
  for (const r of layout.rows) addBodyRow(ws, r, false);
  if (layout.total) addBodyRow(ws, layout.total, true);
  ws.getColumn(1).width = 10;
  for (let c = 2; c <= layout.width; c++) ws.getColumn(c).width = 11;
  ws.views = [{ state: "frozen", xSplit: 1, ySplit: sub.number }];
}

/**
 * Builds and downloads the workbook. exceljs + file-saver load dynamically so
 * the spreadsheet library stays out of the page bundle.
 */
export async function exportWastageReportWorkbook(
  data: WastageReport,
  groups: WastageGroupColumn[],
  header: ReportExportHeader,
  dayLabel: (date: string) => string,
): Promise<void> {
  const ExcelJS = await import("exceljs");
  const { saveAs } = await import("file-saver");

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Wastage Report") as unknown as Worksheet;
  writeWastageSheet(ws, buildWastageSheetLayout(data, groups, dayLabel), header);

  const buf = await wb.xlsx.writeBuffer();
  saveAs(
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `wastage-report-${data.month}-${Date.now()}.xlsx`,
  );
}
