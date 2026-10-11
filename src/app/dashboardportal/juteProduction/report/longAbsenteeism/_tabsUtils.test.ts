/**
 * Pure helpers of the FE-2 tabs: dispatch batches + the printable register,
 * stage summary bars / totals, monthly trend labels and totals.
 */
import { describe, expect, it } from "vitest";
import type { LaDispatchRow, LaSetup } from "@/utils/longAbsenteeismService";
import {
  batchTitle,
  dispatchPrintSections,
  fmtDateTime,
  groupByBatch,
  monthLabel,
  sentText,
  stageBars,
  stageSummaryTotals,
  trendTotals,
} from "./_tabsUtils";

const STAGES = [
  ["DETECTED", "Detected"],
  ["VERIFIED", "Verified"],
  ["WARNING_1", "1st warning"],
  ["WARNING_2", "2nd warning"],
  ["WARNING_3", "3rd & last warning"],
  ["SHOW_CAUSE", "Show cause"],
  ["GATE_NOTICE", "Gate notice"],
  ["STRUCK_OFF", "Struck off"],
].map(([code, label], order) => ({ code, label, order }));
const SETUP = { stages: STAGES } as Pick<LaSetup, "stages">;

const letter = (v: Partial<LaDispatchRow>): LaDispatchRow =>
  ({
    letter_id: 1,
    case_id: 41,
    case_no: "LA/12/26/0001",
    emp_code: "1234",
    emp_name: "RAM KUMAR",
    dept_desc: "WEAVING",
    address: "Vill. X, P.O. Y",
    stage_code: "WARNING_1",
    stage_label: "1st warning",
    issue_date: "2026-10-11",
    sent_date: null,
    ad_no: null,
    batch_ref: null,
    ...v,
  }) as LaDispatchRow;

describe("dispatch", () => {
  const rows = [
    letter({ letter_id: 1, batch_ref: "B20261011-1030-5", emp_code: "1" }),
    letter({ letter_id: 2, batch_ref: null, emp_code: "2" }),
    letter({ letter_id: 3, batch_ref: "B20261011-1030-5", emp_code: "3", ad_no: "RA9" }),
    letter({ letter_id: 4, batch_ref: "B20261009-0900-5", emp_code: "4" }),
  ];

  it("groups by batch in the order the batches come", () => {
    const g = groupByBatch(rows);
    expect(g.map((x) => x.batchRef)).toEqual(["B20261011-1030-5", null, "B20261009-0900-5"]);
    expect(g[0].rows.map((r) => r.letter_id)).toEqual([1, 3]);
    expect(batchTitle(null)).toBe("Issued one by one");
    expect(batchTitle("B1")).toBe("Batch B1");
    expect(sentText(null)).toBe("Not sent");
    expect(sentText("2026-10-12")).toBe("12-10-2026");
  });

  it("prints one section per batch with batch, EB, name, address, stage, issue date, A.D. no", () => {
    const sections = dispatchPrintSections(rows);
    expect(sections).toHaveLength(3);
    expect(sections[0].title).toBe("Batch B20261011-1030-5");
    expect(sections[0].subtitle).toBe("2 letters");
    expect(sections[0].columns.map((c) => c.header)).toEqual([
      "SL",
      "Batch",
      "EB No",
      "Name",
      "Address",
      "Stage",
      "Issue date",
      "A.D. no",
    ]);
    expect(sections[0].rows[1]).toEqual([
      2,
      "B20261011-1030-5",
      "3",
      "RAM KUMAR",
      "Vill. X, P.O. Y",
      "1st warning",
      "11-10-2026",
      "RA9",
    ]);
    expect(sections[1].title).toBe("Issued one by one");
    expect(sections[1].rows[0][1]).toBe("");
  });
});

describe("stage summary", () => {
  it("bars in ladder order with the share of the card's live cases", () => {
    const bars = stageBars({ WARNING_1: 1, DETECTED: 3, SHOW_CAUSE: 0, STRUCK_OFF: 0 }, 4, SETUP);
    expect(bars.map((b) => [b.code, b.label, b.count, b.pct])).toEqual([
      ["DETECTED", "Detected", 3, 75],
      ["WARNING_1", "1st warning", 1, 25],
    ]);
    expect(bars[1].color).toBe("warning");
  });

  it("the whole ladder for the totals card, but never a zero struck off", () => {
    const bars = stageBars({ VERIFIED: 2 }, 2, SETUP, true);
    expect(bars.map((b) => b.code)).toEqual([
      "DETECTED",
      "VERIFIED",
      "WARNING_1",
      "WARNING_2",
      "WARNING_3",
      "SHOW_CAUSE",
      "GATE_NOTICE",
    ]);
    expect(bars.find((b) => b.code === "VERIFIED")?.pct).toBe(100);
    // Unknown codes still show (after the ladder); no total -> 0 %.
    expect(stageBars({ ODD: 1 }, 0, SETUP).map((b) => [b.code, b.pct])).toEqual([["ODD", 0]]);
  });

  it("adds the departments up", () => {
    const t = stageSummaryTotals({
      by_dept: [
        { dept_desc: "WEAVING", counts: { DETECTED: 2, WARNING_1: 1 }, parked: 1, total_live: 3 },
        { dept_desc: "SPINNING", counts: { DETECTED: 1, GATE_NOTICE: 2 }, parked: 0, total_live: 3 },
      ],
    });
    expect(t).toEqual({
      dept_desc: "All departments",
      counts: { DETECTED: 3, WARNING_1: 1, GATE_NOTICE: 2 },
      parked: 1,
      total_live: 6,
    });
  });
});

describe("monthly trend", () => {
  it("labels months short and long", () => {
    expect(monthLabel("2026-10")).toBe("Oct 26");
    expect(monthLabel("2026-01", true)).toBe("Jan 2026");
    expect(monthLabel("2026-13")).toBe("2026-13");
    expect(monthLabel("bad")).toBe("bad");
  });

  it("totals each series", () => {
    expect(
      trendTotals([
        { month: "2026-09", opened: 4, struck_off: 1, rejoined: 2, other_exits: 0 },
        { month: "2026-10", opened: 3, struck_off: 0, rejoined: 1, other_exits: 1 },
      ]),
    ).toEqual({ opened: 7, struck_off: 1, rejoined: 3, other_exits: 1 });
  });
});

describe("template saved time", () => {
  it("formats a date-time as DD-MM-YYYY HH:MM", () => {
    expect(fmtDateTime("2026-10-11T14:05:09")).toBe("11-10-2026 14:05");
    expect(fmtDateTime("2026-10-11 09:30:00")).toBe("11-10-2026 09:30");
    expect(fmtDateTime("2026-10-11")).toBe("11-10-2026");
    expect(fmtDateTime(null)).toBe("");
  });
});
