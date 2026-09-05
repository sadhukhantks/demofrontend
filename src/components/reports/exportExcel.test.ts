import { describe, expect, it } from "vitest";
import type { GridColDef } from "@mui/x-data-grid";
import { buildReportSheet, type Worksheet } from "./exportExcel";

/** Records what buildReportSheet writes, so the grouping and number-format
 *  decisions can be asserted without exceljs or a real workbook. */
function fakeSheet() {
  const rows: { number: number; values: unknown[]; header: boolean; break: boolean }[] = [];
  const columns: Record<string, unknown>[] = [];
  const ws = {
    addRow(values: unknown[]) {
      const entry = { number: rows.length + 1, values, header: false, break: false };
      rows.push(entry);
      return {
        number: entry.number,
        getCell: () => ({}),
        eachCell(optsOrCb: unknown, cb?: (cell: Record<string, unknown>) => void) {
          const fn = (typeof optsOrCb === "function" ? optsOrCb : cb) as
            | ((cell: Record<string, unknown>) => void)
            | undefined;
          // The header band is the only styling that fills every cell blue.
          const cell: Record<string, unknown> = {};
          fn?.(cell);
          const fill = cell.fill as { fgColor?: { argb?: string } } | undefined;
          if (fill?.fgColor?.argb === "FF3EA6DA") entry.header = true;
        },
        addPageBreak() {
          entry.break = true;
        },
      };
    },
    mergeCells: () => {},
    getColumn(i: number) {
      columns[i - 1] ??= {};
      return columns[i - 1];
    },
    views: [] as unknown[],
  };
  return { ws: ws as unknown as Worksheet, rows, columns };
}

const COLS: GridColDef[] = [
  { field: "dept_desc", headerName: "Department", width: 100 },
  { field: "emp_code", headerName: "EB No", width: 100 },
  { field: "amount", headerName: "Amount", width: 100, type: "number" },
];

describe("buildReportSheet", () => {
  it("repeats the header and breaks the page on each new group", () => {
    const { ws, rows } = fakeSheet();
    buildReportSheet(
      ws,
      COLS,
      [
        { id: 1, dept_desc: "BATCHING", emp_code: "1", amount: 80 },
        { id: 2, dept_desc: "BATCHING", emp_code: "2", amount: 40 },
        { id: 3, dept_desc: "WEAVING", emp_code: "3", amount: 120 },
      ],
      undefined,
      "dept_desc",
    );

    // One header for BATCHING, one for WEAVING.
    expect(rows.filter((r) => r.header)).toHaveLength(2);
    // The break falls on the last BATCHING row, not on the last row overall.
    expect(rows.filter((r) => r.break).map((r) => r.values[1])).toEqual(["2"]);
  });

  it("writes one header and no breaks when ungrouped", () => {
    const { ws, rows } = fakeSheet();
    buildReportSheet(ws, COLS, [
      { id: 1, dept_desc: "BATCHING", emp_code: "1", amount: 80 },
      { id: 2, dept_desc: "WEAVING", emp_code: "2", amount: 40 },
    ]);

    expect(rows.filter((r) => r.header)).toHaveLength(1);
    expect(rows.some((r) => r.break)).toBe(false);
  });

  it("formats whole-number columns without decimals", () => {
    const whole = fakeSheet();
    buildReportSheet(whole.ws, COLS, [
      { id: 1, dept_desc: "BATCHING", emp_code: "1", amount: 80 },
    ]);
    expect(whole.columns[2].numFmt).toBe("0");

    const fractional = fakeSheet();
    buildReportSheet(fractional.ws, COLS, [
      { id: 1, dept_desc: "BATCHING", emp_code: "1", amount: 80.5 },
    ]);
    expect(fractional.columns[2].numFmt).toBe("0.00");
  });
});

describe("buildReportSheet at report scale", () => {
  // Regression, TKT-000141: the column-width pass used
  // `Math.max(name.length, ...rows.map(...))`, and a spread of >~125k arguments
  // throws RangeError. sls br 29 Full Attendance is 382k rows for one financial
  // year, so Export to Excel died there with no file and no message.
  it("sizes columns without spreading every row onto the stack", () => {
    const { ws, columns } = fakeSheet();
    const rows = Array.from({ length: 130_000 }, (_, i) => ({
      id: i,
      dept_desc: "BATCHING",
      emp_code: String(i),
      amount: i,
    }));

    expect(() => buildReportSheet(ws, COLS, rows)).not.toThrow();
    // Widest EB No is "129999" (6) + 2 padding, floored at the 10-char minimum.
    expect(columns[1].width).toBe(10);
  });
});
