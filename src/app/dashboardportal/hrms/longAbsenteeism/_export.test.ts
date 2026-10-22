/**
 * Excel exports: the watchlist sheet keeps the Personnel office's column
 * order (spec section 8) with the extra columns after it, dates as
 * DD-MM-YYYY and REPORT = exit reason / Parked / Open; the dispatch and
 * struck-off registers flatten their rows the same way. exportRowsToExcel
 * (exceljs + file-saver) is mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/reports/exportExcel", () => ({
  exportRowsToExcel: vi.fn(async () => undefined),
}));

import { exportRowsToExcel } from "@/components/reports/exportExcel";
import type { LaDispatchRow, LaListRow, LaRegisterRow, LaSetup } from "@/utils/longAbsenteeismService";
import {
  DISPATCH_FILE_PREFIX,
  REGISTER_FILE_PREFIX,
  WATCHLIST_FILE_PREFIX,
  dispatchExportRows,
  exportDispatchToExcel,
  exportRegisterToExcel,
  exportWatchlistToExcel,
  registerExportRows,
  reportCell,
  watchlistExportColumns,
  watchlistExportRows,
} from "./_export";

const SHEET_ORDER = [
  "SL NO",
  "EB No",
  "Name",
  "DEPT",
  "Occupation",
  "Last Working/Leave Date",
  "Absent Days",
  "1ST LETTER",
  "1ST SENT",
  "2ND LETTER",
  "2ND SENT",
  "3rd & Last Warning Letter",
  "3RD SENT",
  "SHOW CAUSE",
  "NOTICE FOR STRUCK OFF",
  "STRUCK OFF",
  "REMARKS",
  "REPORT",
];

const RULE: LaSetup["rule"] = {
  detect_days: 10,
  lookback_days: 90,
  wait_w2_days: 10,
  wait_w3_days: 10,
  wait_sc_days: 15,
  sc_reply_days: 3,
  notice_reply_days: 7,
  dismiss_snooze_days: 30,
  exclude_prefixes: "T,C,R,L",
  clause_text: null,
  signatory: null,
  extra_1_label: "Union",
  extra_2_label: null,
  extra_3_label: "  Time keeper  ",
  extra_4_label: "",
  extra_5_label: null,
};

const SETUP = {
  rule: RULE,
  all_exit_reasons: [
    { code: "REJOINED", label: "Rejoined" },
    { code: "STRUCK_OFF", label: "Struck off" },
  ],
} as Pick<LaSetup, "rule" | "all_exit_reasons">;

const row = (v: Partial<LaListRow>): LaListRow =>
  ({
    case_id: 41,
    eb_id: 7001,
    emp_code: "1234",
    emp_name: "RAM KUMAR",
    dept_desc: "WEAVING",
    designation: "WEAVER",
    last_working_date: "2026-09-20",
    absent_days: 21,
    w1_date: "2026-10-01",
    w1_sent: "2026-10-02",
    w2_date: null,
    w2_sent: null,
    w3_date: null,
    w3_sent: null,
    sc_date: null,
    sc_sent: null,
    gn_date: null,
    gn_sent: null,
    struck_off_date: null,
    remarks: "Went home",
    status: 1,
    status_label: "Open",
    exit_reason: null,
    exit_reason_label: null,
    extra_1: "CITU",
    extra_2: "not shown",
    extra_3: null,
    ...v,
  }) as LaListRow;

beforeEach(() => {
  vi.mocked(exportRowsToExcel).mockClear();
});

describe("watchlist export", () => {
  it("keeps the sheet's column order, then the named extra columns", () => {
    const cols = watchlistExportColumns(SETUP);
    expect(cols.map((c) => c.headerName)).toEqual([...SHEET_ORDER, "Union", "Time keeper"]);
    expect(cols.slice(-2).map((c) => c.field)).toEqual(["extra_1", "extra_3"]);
    expect(cols.find((c) => c.headerName === "SL NO")?.type).toBe("number");
    expect(cols.find((c) => c.headerName === "Absent Days")?.type).toBe("number");
    expect(watchlistExportColumns(null).map((c) => c.headerName)).toEqual(SHEET_ORDER);
  });

  it("maps a row: DD-MM-YYYY dates, serial numbers, extras, REPORT", () => {
    const rows = watchlistExportRows(
      [
        row({}),
        row({
          case_id: 42,
          emp_code: null,
          eb_id: 9001,
          status: 0,
          status_label: "Closed",
          exit_reason: "STRUCK_OFF",
          exit_reason_label: null,
          w2_date: "2026-10-12",
          w2_sent: "2026-10-13",
          w3_date: "2026-10-23",
          w3_sent: "2026-10-24",
          sc_date: "2026-11-08",
          gn_date: "2026-11-12",
          struck_off_date: "2026-11-20",
          remarks: null,
          extra_1: null,
        }),
      ],
      SETUP,
    );
    expect(rows[0]).toMatchObject({
      sl_no: 1,
      eb_no: "1234",
      name: "RAM KUMAR",
      dept: "WEAVING",
      occupation: "WEAVER",
      last_working: "20-09-2026",
      absent_days: 21,
      w1_date: "01-10-2026",
      w1_sent: "02-10-2026",
      w2_date: "",
      remarks: "Went home",
      report: "Open",
      extra_1: "CITU",
      extra_3: "",
    });
    expect(rows[0]).not.toHaveProperty("extra_2");
    expect(rows[1]).toMatchObject({
      sl_no: 2,
      eb_no: "9001",
      w3_date: "23-10-2026",
      w3_sent: "24-10-2026",
      show_cause: "08-11-2026",
      notice: "12-11-2026",
      struck_off: "20-11-2026",
      remarks: "",
      report: "Struck off",
      extra_1: "",
    });
    // Every exported field has a column.
    const fields = new Set(watchlistExportColumns(SETUP).map((c) => c.field));
    for (const key of Object.keys(rows[0]).filter((k) => k !== "id")) expect(fields.has(key)).toBe(true);
  });

  it("REPORT reads the exit reason, else Parked / Open", () => {
    expect(reportCell({ status: 2, status_label: "Parked", exit_reason: null, exit_reason_label: null }, SETUP)).toBe(
      "Parked",
    );
    expect(reportCell({ status: 1, status_label: "", exit_reason: null, exit_reason_label: null }, SETUP)).toBe("Open");
    expect(
      reportCell({ status: 0, status_label: "Closed", exit_reason: "REJOINED", exit_reason_label: "Rejoined" }, SETUP),
    ).toBe("Rejoined");
  });

  it("writes the workbook through exportRowsToExcel with the header", async () => {
    const header = { companyName: "EMPIRE JUTE", branchName: "FACTORY", reportName: "Long Absent Report", reportNo: 77 };
    await exportWatchlistToExcel([row({})], SETUP, header);
    expect(exportRowsToExcel).toHaveBeenCalledTimes(1);
    const [cols, rows, prefix, hdr] = vi.mocked(exportRowsToExcel).mock.calls[0];
    expect(cols.map((c) => c.headerName)).toEqual([...SHEET_ORDER, "Union", "Time keeper"]);
    expect(rows).toHaveLength(1);
    expect(prefix).toBe(WATCHLIST_FILE_PREFIX);
    expect(prefix).toBe("long-absent-report");
    expect(hdr).toEqual(header);
  });
});

describe("dispatch and register exports", () => {
  it("flattens dispatch rows", async () => {
    const d = {
      letter_id: 301,
      case_id: 41,
      case_no: "LA/12/26/0001",
      emp_code: "1234",
      emp_name: "RAM KUMAR",
      dept_desc: "WEAVING",
      address: "Vill. X",
      stage_code: "WARNING_2",
      stage_label: "2nd warning",
      issue_date: "2026-10-11",
      sent_date: null,
      dispatch_mode: "REG_POST_AD",
      dispatch_mode_label: "Registered post with AD",
      ad_no: "RA123",
      delivery_status: null,
      delivery_status_label: null,
      delivery_date: null,
      batch_ref: "B20261011-1030-5",
    } as LaDispatchRow;
    expect(dispatchExportRows([d])[0]).toMatchObject({
      sl_no: 1,
      batch_ref: "B20261011-1030-5",
      eb_no: "1234",
      address: "Vill. X",
      stage: "2nd warning",
      issue_date: "11-10-2026",
      sent_date: "",
      dispatch_mode: "Registered post with AD",
      ad_no: "RA123",
    });
    await exportDispatchToExcel([d], { reportName: "x" });
    expect(vi.mocked(exportRowsToExcel).mock.calls[0][2]).toBe(DISPATCH_FILE_PREFIX);
  });

  it("flattens register rows in the register's column order", async () => {
    const r: LaRegisterRow = {
      case_id: 41,
      case_no: "LA/12/26/0001",
      emp_code: "1234",
      emp_name: "RAM KUMAR",
      dept_desc: "WEAVING",
      designation: "WEAVER",
      last_working_date: "2026-06-01",
      warning1_date: "2026-06-15",
      warning1_sent: "2026-06-16",
      warning2_date: "2026-06-27",
      warning2_sent: null,
      warning3_date: null,
      warning3_sent: null,
      show_cause_date: null,
      gate_notice_date: "2026-08-01",
      struck_off_date: "2026-08-10",
      remarks: null,
    };
    expect(registerExportRows([r])[0]).toMatchObject({
      case_no: "LA/12/26/0001",
      last_working: "01-06-2026",
      w1_date: "15-06-2026",
      w1_sent: "16-06-2026",
      w2_sent: "",
      gate_notice: "01-08-2026",
      struck_off: "10-08-2026",
      remarks: "",
    });
    await exportRegisterToExcel([r], { reportName: "x" });
    const [cols, , prefix] = vi.mocked(exportRowsToExcel).mock.calls[0];
    expect(prefix).toBe(REGISTER_FILE_PREFIX);
    expect(cols.map((c) => c.headerName).slice(0, 7)).toEqual([
      "SL NO",
      "Case No",
      "EB No",
      "Name",
      "Dept",
      "Designation",
      "Last Working Date",
    ]);
  });
});
