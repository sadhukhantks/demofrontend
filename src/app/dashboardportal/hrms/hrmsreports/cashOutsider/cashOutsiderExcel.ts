/**
 * Daily Cash Outsider Payment export — a department-wise summary sheet plus
 * one sheet per department. Every sheet goes through the shared report sheet
 * writer, so they all carry the same header block, styled header band and
 * Total-row shading as the rest of the reports.
 */
import { GridColDef } from "@mui/x-data-grid";
import {
  buildReportSheet,
  type ReportExportHeader,
  type Worksheet,
} from "@/components/reports/exportExcel";
import { isReportTotalRow } from "@/components/reports/ReportGrid";
import type { CashHandsRow } from "@/utils/hrmsReportService";

type Row = CashHandsRow;

const r2 = (n: number) => Math.round(n * 100) / 100;

const sum = (list: Row[], pick: (r: Row) => number) =>
  r2(list.reduce((a, r) => a + pick(r), 0));

/**
 * A Total / Grand Total line, shared by the on-screen grid and every sheet
 * below. The toolkit detects a summary row by an EXACT "Total" / "Grand Total"
 * cell, and reads its level off the leading column — so the group name stays
 * in `department` and the literal label rides in `contractor`, which is also
 * the first column the per-department sheets keep.
 */
export function totalRow(
  id: number,
  department: string,
  list: Row[],
  label = "Total",
): Row {
  return {
    id,
    eb_id: null,
    eb_no: null,
    worker_name: null,
    pay_date: null,
    shift: null,
    dept_code: null,
    department,
    occupation: null,
    working_hours: sum(list, (r) => r.working_hours),
    rate: 0,
    oth_rate: 0,
    amount: sum(list, (r) => r.amount),
    master_department: null,
    contractor: label,
  };
}

interface SummaryRow {
  id: number;
  department: string;
  dept_code: string | null;
  hands: number;
  working_hours: number;
  amount: number;
}

const summaryColumns: GridColDef<SummaryRow>[] = [
  { field: "department", headerName: "Department", width: 200 },
  { field: "dept_code", headerName: "Dept Code", width: 100 },
  { field: "hands", headerName: "No of Hands", width: 120, type: "number" },
  { field: "working_hours", headerName: "Work Hours", width: 120, type: "number" },
  { field: "amount", headerName: "Amount", width: 130, type: "number" },
];

/** Excel caps sheet names at 31 chars and rejects \ / ? * [ ] — and two
 *  departments can still collide once truncated, so names are de-duplicated. */
function sheetName(dept: string, used: Set<string>): string {
  const base =
    dept.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31) || "GENERAL";
  let name = base;
  for (let n = 2; used.has(name); n++) name = `${base.slice(0, 27)} (${n})`;
  used.add(name);
  return name;
}

const titled = (header: ReportExportHeader, suffix: string) => ({
  ...header,
  reportName: header.reportName ? `${header.reportName} — ${suffix}` : suffix,
});

export async function exportCashOutsiderWorkbook(
  rows: Row[],
  columns: GridColDef<Row>[],
  header: ReportExportHeader,
): Promise<void> {
  const ExcelJS = await import("exceljs");
  const { saveAs } = await import("file-saver");

  // The grid's own Total lines are dropped and rebuilt per sheet.
  const data = rows.filter((r) => !isReportTotalRow(r));

  const byDept = new Map<string, Row[]>();
  for (const r of data) {
    const dept = (r.department ?? "").trim() || "GENERAL";
    byDept.set(dept, [...(byDept.get(dept) ?? []), r]);
  }

  const wb = new ExcelJS.Workbook();

  // Department-wise summary. Hands = attended hours / 8, the way the shop
  // floor counts a full shift.
  let id = 0;
  const summaryRows: SummaryRow[] = [...byDept].map(([department, list]) => ({
    id: id++,
    department,
    dept_code: list[0].dept_code,
    hands: r2(sum(list, (r) => r.working_hours) / 8),
    working_hours: sum(list, (r) => r.working_hours),
    amount: sum(list, (r) => r.amount),
  }));
  summaryRows.push({
    id: id++,
    department: "Grand Total",
    dept_code: "",
    hands: r2(summaryRows.reduce((a, r) => a + r.hands, 0)),
    working_hours: r2(summaryRows.reduce((a, r) => a + r.working_hours, 0)),
    amount: r2(summaryRows.reduce((a, r) => a + r.amount, 0)),
  });
  buildReportSheet(
    wb.addWorksheet("Summary") as unknown as Worksheet,
    summaryColumns,
    summaryRows,
    titled(header, "Department Summary"),
  );

  // Department and Dept Code are dropped from the per-department sheets — the
  // sheet IS the department — and a blank column is added for each hand to
  // sign against.
  const sheetColumns: GridColDef<Row>[] = [
    ...columns.filter(
      (c) => c.field !== "department" && c.field !== "dept_code",
    ),
    { field: "signature", headerName: "Signature", width: 160 },
  ];

  // One sheet per department, each ending in its own Total line. The Total
  // label rides in Contractor, the first column these sheets keep.
  const used = new Set<string>();
  let totalId = data.length;
  for (const [department, list] of byDept) {
    const sheetTotal = totalRow(totalId++, "", list);
    buildReportSheet(
      wb.addWorksheet(sheetName(department, used)) as unknown as Worksheet,
      sheetColumns,
      [...list, sheetTotal],
      // The department names the sheet in its header block, since the column
      // is gone: "... — Department : SACK SEWING For the Period <date>".
      titled(header, `Department : ${department}`),
    );
  }

  const buf = await wb.xlsx.writeBuffer();
  saveAs(
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `daily-cash-outsider-payment-${Date.now()}.xlsx`,
  );
}
