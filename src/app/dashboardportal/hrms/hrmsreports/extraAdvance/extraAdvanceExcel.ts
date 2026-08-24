/**
 * Daily Extra Advance Payment Excel export — the legacy Data-Portal signature
 * sheet (Data_entry::extraadvancepayexcel), reproduced cell for cell.
 *
 * It is a shop-floor form, not a data dump: each worker takes two rows (name
 * then occupation) with a tall blank Signature column to sign in, and the sheet
 * is protected so the printed amounts cannot be edited before it circulates.
 *
 * The legacy screen filtered to one department and one shift, so a workbook was
 * a single sheet. This report covers every department at once, so it writes one
 * sheet per department + shift — each one is a separate form for a separate
 * incharge to sign.
 */
import type { ReportExportHeader } from "@/components/reports/exportExcel";
import type { ExtraAdvancePaymentRow } from "@/utils/hrmsReportService";

/** Password the legacy sheet used — kept so the same people can unlock it. */
const SHEET_PASSWORD = "edpemp1234";

const THIN = { style: "thin" } as const;
const ALL_BORDERS = {
  top: THIN,
  left: THIN,
  bottom: THIN,
  right: THIN,
} as const;
const BOLD = { bold: true, size: 12 } as const;
const COL_WIDTHS = [9, 9, 25, 10, 15, 25];
const HEADERS = [
  "Sl No",
  "EB No",
  "Name/Occupation",
  "Att Hours",
  "Adv Amount",
  "Signature",
];

/** dd-mm-yyyy, the format the legacy heading and file name use. */
function dmy(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

/** dd/Mon/yyyy for the "Print On" line. */
function printedOn(): string {
  const d = new Date();
  const mon = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ][d.getMonth()];
  return `${String(d.getDate()).padStart(2, "0")}/${mon}/${d.getFullYear()}`;
}

/** Excel rejects []:*?/\ in sheet names and truncates past 31 chars; names
 * must also be unique, hence the numeric suffix on a collision. */
function sheetName(base: string, taken: Set<string>): string {
  const clean = base.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Sheet";
  let name = clean;
  for (let i = 2; taken.has(name); i++) {
    name = `${clean.slice(0, 31 - String(i).length - 1)} ${i}`;
  }
  taken.add(name);
  return name;
}

interface SheetGroup {
  department: string;
  shift: string;
  rows: ExtraAdvancePaymentRow[];
}

/** Builds the workbook. Split from the download so the layout can be checked
 * headlessly against the legacy sample (see checkExtraAdvanceExcel.mjs). */
export async function buildExtraAdvanceWorkbook(
  rows: ExtraAdvancePaymentRow[],
  header: ReportExportHeader,
  reportDate: string,
) {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();

  // One form per department + shift, in the order the backend returned them.
  // Keyed via JSON so a department name containing spaces cannot split wrong.
  const groups = new Map<string, SheetGroup>();
  for (const r of rows) {
    const department = r.department ?? "";
    const shift = r.shift ?? "";
    const key = JSON.stringify([department, shift]);
    const g = groups.get(key);
    if (g) g.rows.push(r);
    else groups.set(key, { department, shift, rows: [r] });
  }

  const taken = new Set<string>();
  const company = header.companyName ?? "";
  const printed = printedOn();

  for (const { department, shift, rows: groupRows } of groups.values()) {
    const ws = wb.addWorksheet(
      sheetName(`${department}${shift ? ` ${shift}` : ""}`, taken),
    );
    // ExcelJS drops a <col> entry whose width equals its own default of 9, and
    // Excel then falls back to 8.43 — so declare 9 as the sheet default to keep
    // the narrow Sl No / EB No columns exactly the legacy width.
    ws.properties.defaultColWidth = 9;
    COL_WIDTHS.forEach((w, i) => {
      ws.getColumn(i + 1).width = w;
    });

    const banner = (text: string) => {
      const row = ws.addRow([text]);
      ws.mergeCells(row.number, 1, row.number, 6);
      for (let c = 1; c <= 6; c++) ws.getCell(row.number, c).border = ALL_BORDERS;
      const cell = ws.getCell(row.number, 1);
      cell.font = BOLD;
      cell.alignment = { horizontal: "center", vertical: "middle" };
    };
    banner(company);
    banner(
      `Extra Advance Payment Sheet for Deapartment ${department}` +
        `${shift ? ` Shift ${shift}` : ""} Dated ${dmy(reportDate)}`,
    );

    const head = ws.addRow(HEADERS);
    head.eachCell((cell) => {
      cell.border = ALL_BORDERS;
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });

    let sl = 1;
    let totalHours = 0;
    let totalAmount = 0;
    for (const r of groupRows) {
      // Row one: the worker and the amount, tall enough to sign in.
      const line = ws.addRow([
        sl++,
        r.eb_no ?? "",
        r.worker_name ?? "",
        r.work_hours,
        r.advance_amount,
        "",
      ]);
      line.height = 40;
      line.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = ALL_BORDERS;
      });
      // Row two: the occupation, under the name.
      const occ = ws.addRow(["", "", r.occupation ?? "", "", "", ""]);
      occ.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = ALL_BORDERS;
      });
      totalHours += r.work_hours;
      totalAmount += r.advance_amount;
    }

    const total = ws.addRow([
      "",
      "",
      "Total",
      Math.round(totalHours * 100) / 100,
      totalAmount,
      "",
    ]);
    total.height = 40;
    total.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = ALL_BORDERS;
      cell.font = BOLD;
    });

    ws.addRow([`Print On ${printed}`]);
    // Three blank rows of clearance, then the sign-off line.
    for (let i = 0; i < 3; i++) ws.addRow([]);
    ws.addRow(["Time Keeper", "", "Shift Incharge", "", "HOD", "Comm Manager"]);

    await ws.protect(SHEET_PASSWORD, {});
  }

  return wb;
}

export async function exportExtraAdvanceWorkbook(
  rows: ExtraAdvancePaymentRow[],
  header: ReportExportHeader,
  reportDate: string,
): Promise<void> {
  const wb = await buildExtraAdvanceWorkbook(rows, header, reportDate);
  const { saveAs } = await import("file-saver");
  const buf = await wb.xlsx.writeBuffer();
  saveAs(
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `payroll_${dmy(reportDate)}.xlsx`,
  );
}
