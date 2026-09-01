/**
 * Cash Hands Report Excel export — one workbook with the detail sheet and the
 * department/shift summary, mirroring the two sections of the legacy PDF.
 * Both sheets reuse the shared report sheet writer, so they carry the same
 * header block and styling as every other report export.
 */
import { GridColDef, GridValidRowModel } from "@mui/x-data-grid";
import type { Worksheet as XlsxWorksheet } from "exceljs";
import {
  buildReportSheet,
  type ReportExportHeader,
  type Worksheet,
} from "@/components/reports/exportExcel";

export async function exportCashHandsWorkbook<
  TDetail extends GridValidRowModel,
  TSummary extends GridValidRowModel,
>(
  detailColumns: GridColDef<TDetail>[],
  detailRows: TDetail[],
  summaryColumns: GridColDef<TSummary>[],
  summaryRows: TSummary[],
  header: ReportExportHeader,
): Promise<void> {
  const ExcelJS = await import("exceljs");
  const { saveAs } = await import("file-saver");

  const wb = new ExcelJS.Workbook();
  buildReportSheet(
    wb.addWorksheet("Cash Hands") as unknown as Worksheet,
    detailColumns,
    detailRows,
    header,
  );
  buildReportSheet(
    wb.addWorksheet("Summary") as unknown as Worksheet,
    summaryColumns,
    summaryRows,
    { ...header, reportName: "Cash Hands Summary" },
  );

  const buf = await wb.xlsx.writeBuffer();
  saveAs(
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `cash-hands-report-${Date.now()}.xlsx`,
  );
}

/** The fields the daily paysheet needs from a processed cash-payment row. */
export interface PaysheetRow {
  eb_no: string | null;
  worker_name: string | null;
  shift: string | null;
  occupation: string | null;
  working_hours: number;
  rate: number;
  amount: number;
  master_department: string | null;
  contractor: string | null;
}

const PAYSHEET_HEADERS = [
  "Sl No", "Remarks", "EB No", "NAME/OCCUPATION", "SHIFT", "ATT HRS",
  "RATE", "AMOUNT", "OTHERS", "NET PAY", "SIGNATURE",
];
const PAYSHEET_WIDTHS = [6, 10, 10, 24, 7, 9, 9, 10, 9, 10, 14];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** dd/mm/yyyy for the sheet titles; dd/Mon/yyyy for the Print On line. */
function paysheetDates(isoDate: string): { title: string; printed: string } {
  const [y, m, d] = isoDate.split("-");
  const now = new Date();
  return {
    title: `${d}/${m}/${y}`,
    printed: `${String(now.getDate()).padStart(2, "0")}/${MONTHS[now.getMonth()]}/${now.getFullYear()}`,
  };
}

// ponytail: legacy remarks were CONTRACTOR/SUBLOCATION short codes (JHA/LL);
// the tenant keeps no sub-location and no short-code column, so this prints
// the contractor name's first three letters. Add codes to contractor_mst if
// the exact legacy codes matter.
function remarks(contractor: string | null): string {
  return contractor ? contractor.trim().slice(0, 3).toUpperCase() : "";
}

function footer(ws: XlsxWorksheet, printed: string): void {
  ws.addRow([`Print On ${printed}`]);
  ws.addRow([]);
  ws.addRow([]);
  ws.addRow([]);
  const sig = ws.addRow(["Time Keeper", "", "Shift Incharge", "", "HOD", "Comm Manager"]);
  sig.font = { bold: true };
}

/**
 * The shop-floor daily PaySheet, mirroring the legacy workbook: a Summary
 * sheet (department → hands / wages) and one sheet per department where each
 * worker takes two rows — the pay line, then the occupation under the name.
 * One DAY per workbook; hands = attended hours / 8.
 */
export async function exportCashHandsPaysheet(
  rows: PaysheetRow[],
  isoDate: string,
): Promise<void> {
  const ExcelJS = await import("exceljs");
  const { saveAs } = await import("file-saver");
  const { title, printed } = paysheetDates(isoDate);

  const byDept = new Map<string, PaysheetRow[]>();
  for (const r of rows) {
    const dept = (r.master_department ?? "GENERAL").trim() || "GENERAL";
    const list = byDept.get(dept) ?? [];
    list.push(r);
    byDept.set(dept, list);
  }

  const wb = new ExcelJS.Workbook();

  const summary = wb.addWorksheet("Summary Sheet");
  PAYSHEET_WIDTHS.slice(0, 6).forEach((w, i) => { summary.getColumn(i + 1).width = w + 8; });
  summary.addRow([`PaySheet Summary Date : ${title}`]).font = { bold: true };
  summary.addRow(["Department", "No of hands", "Wages Amount", "Rev Wages Amount"]).font = { bold: true };
  let grandHands = 0;
  let grandAmount = 0;
  for (const [dept, list] of byDept) {
    const hands = list.reduce((s, r) => s + r.working_hours, 0) / 8;
    const amount = list.reduce((s, r) => s + r.amount, 0);
    grandHands += hands;
    grandAmount += amount;
    summary.addRow([dept, hands, amount, ""]);
  }
  summary.addRow(["Grand Total", grandHands, grandAmount, ""]).font = { bold: true };
  footer(summary, printed);

  for (const [dept, list] of byDept) {
    // Sheet names cap at 31 chars and reject \ / ? * [ ] :
    const ws = wb.addWorksheet(dept.replace(/[\\/?*[\]:]/g, " ").slice(0, 31));
    PAYSHEET_WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    ws.addRow([`PaySheet for Department : ${dept}  Date : ${title}`]).font = { bold: true };
    ws.mergeCells(1, 1, 1, PAYSHEET_HEADERS.length);
    ws.addRow(PAYSHEET_HEADERS).font = { bold: true };
    let hours = 0;
    let amount = 0;
    list.forEach((r, i) => {
      hours += r.working_hours;
      amount += r.amount;
      ws.addRow([
        i + 1, remarks(r.contractor), r.eb_no ?? "", r.worker_name ?? "",
        r.shift ?? "", r.working_hours, r.rate, r.amount, 0, r.amount, "",
      ]);
      ws.addRow(["", "", "", r.occupation ?? "", "", "", "", "", "", "", ""]);
    });
    const total = ws.addRow(["", "", "Total", "", "", hours / 8, "", amount, 0, amount, ""]);
    total.font = { bold: true };
    footer(ws, printed);
  }

  const buf = await wb.xlsx.writeBuffer();
  const [y, m, d] = isoDate.split("-");
  saveAs(
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `Paysheet_${d}-${m}-${y}.xlsx`,
  );
}
