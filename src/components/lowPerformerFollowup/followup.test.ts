import { describe, expect, it } from "vitest";
import {
  isFollowupEvent,
  isFollowupPerformance,
  isFollowupRow,
  isFollowupSetup,
  noticeFileProblem,
} from "@/utils/lowPerformerFollowupService";
import { deptOptions, isFollowupDeptCode, labelOf, spellLabel } from "./constants";
import { fmtDate, followupFieldIssues, isIsoDate, localTodayISO, makeAddFollowupSchema } from "./schemas";
import { parseWorkerLookup } from "./workerLookup";

const TODAY = "2026-10-07";

const row = {
  followup_id: 1,
  co_id: 2,
  branch_id: 2,
  eb_id: 55,
  eb_no: "10000",
  worker_name: "A B",
  dept_code: "WINDING",
  reason: null,
  start_date: "2026-10-01",
  review_date: null,
  status: 1,
  closed_date: null,
  close_reason: null,
  close_remarks: null,
  remark_count: 0,
  notice_count: 0,
  hours_cut_count: 0,
  total_hours_cut: 0,
  last_notice_type: null,
  last_event_date: null,
  review_due: false,
  days_tracked: 6,
  updated_date_time: null,
};

describe("dates", () => {
  it("accepts only real calendar dates", () => {
    expect(isIsoDate("2026-10-07")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("07-10-2026")).toBe(false);
  });

  it("formats local today and display dates", () => {
    expect(localTodayISO(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(fmtDate("2026-10-07")).toBe("07-10-2026");
    expect(fmtDate("2026-10-07T10:00:00")).toBe("07-10-2026");
    expect(fmtDate(null)).toBe("");
  });

  it("checks start and review dates", () => {
    expect(followupFieldIssues({ start_date: TODAY, review_date: "" }, TODAY)).toEqual([]);
    expect(followupFieldIssues({ start_date: "", review_date: "" }, TODAY)[0].path).toBe("start_date");
    expect(followupFieldIssues({ start_date: "2026-10-08", review_date: "" }, TODAY)[0].message).toMatch(/future/);
    expect(
      followupFieldIssues({ start_date: "2026-10-05", review_date: "2026-10-04" }, TODAY)[0].path,
    ).toBe("review_date");
    // A review date in the future is fine.
    expect(followupFieldIssues({ start_date: "2026-10-05", review_date: "2026-11-01" }, TODAY)).toEqual([]);
  });
});

describe("add follow-up schema", () => {
  const schema = makeAddFollowupSchema(TODAY);
  const base = { eb_no: "10000", dept_code: "WINDING" as const, reason: "", start_date: TODAY, review_date: "" };

  it("accepts a complete form", () => {
    expect(schema.safeParse(base).success).toBe(true);
  });

  it("requires EB No and department", () => {
    const res = schema.safeParse({ ...base, eb_no: "  ", dept_code: "" });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.map((i) => i.path[0]).sort()).toEqual(["dept_code", "eb_no"]);
    }
  });
});

describe("constants", () => {
  it("labels codes from setup with a code fallback", () => {
    const list = [{ code: "WEAVING", label: "Weaving" }];
    expect(labelOf(list, "WEAVING")).toBe("Weaving");
    expect(labelOf(list, "X")).toBe("X");
    expect(labelOf(null, null)).toBe("");
    expect(isFollowupDeptCode("SPINNING")).toBe(true);
    expect(isFollowupDeptCode("FINISHING")).toBe(false);
  });

  it("builds department options, falling back before setup loads", () => {
    expect(deptOptions(null).map((o) => o.value)).toEqual(["WEAVING", "SPINNING", "WINDING"]);
    expect(deptOptions([{ code: "WINDING", label: "Winding" }, { code: "BAD", label: "Bad" }])).toEqual([
      { value: "WINDING", label: "Winding" },
    ]);
  });

  it("labels spells with their hours", () => {
    expect(spellLabel({ spell_code: "A1", working_hours: 5 })).toBe("A1 (5 h)");
    expect(spellLabel({ spell_code: "A1", working_hours: null })).toBe("A1");
  });
});

describe("response guards", () => {
  it("recognises follow-up rows and events", () => {
    expect(isFollowupRow(row)).toBe(true);
    expect(isFollowupRow({ ...row, status: 2 })).toBe(false);
    expect(isFollowupRow(null)).toBe(false);
    expect(
      isFollowupEvent({ followup_event_id: 1, followup_id: 1, event_type: "NOTICE", event_date: TODAY }),
    ).toBe(true);
    expect(
      isFollowupEvent({ followup_event_id: 1, followup_id: 1, event_type: "OTHER", event_date: TODAY }),
    ).toBe(false);
  });

  it("recognises setup and performance payloads", () => {
    expect(
      isFollowupSetup({
        depts: [],
        notice_types: [],
        close_reasons: [],
        event_types: [],
        spells: [{ spell_id: 1, spell_code: "A1", spell_name: null, working_hours: 5 }],
        today: TODAY,
      }),
    ).toBe(true);
    expect(isFollowupSetup({ depts: [] })).toBe(false);
    const perf = {
      followup: row,
      date_from: "2026-09-01",
      date_to: "2026-09-30",
      max_days: 31,
      default_days: 14,
      clipped: false,
      person_rows: [],
      person_summary: { days_worked: 0, rows: 0, prod_kg: 0, std_kg: 0, avg_eff: null, kg_per_hr: null },
      same_machine: { summary: [], rows: [] },
      same_quality: [],
      weekly_trend: [],
      notes: [],
    };
    expect(isFollowupPerformance(perf)).toBe(true);
    expect(isFollowupPerformance({ ...perf, same_machine: [] })).toBe(false);
  });

  it("checks notice scans", () => {
    expect(noticeFileProblem(new File(["x"], "a.png", { type: "image/png" }))).toBeNull();
    expect(noticeFileProblem(new File(["x"], "a.doc", { type: "application/msword" }))).toMatch(/PDF/);
  });
});

describe("parseWorkerLookup", () => {
  it("reads the HRMS response", () => {
    expect(
      parseWorkerLookup({ data: { eb_id: 55, eb_no: "10000", branch_id: 2, worker_name: "Ram  Kumar ", emp_status: 1 } }),
    ).toEqual({ eb_id: 55, eb_no: "10000", worker_name: "Ram Kumar" });
    expect(parseWorkerLookup({ data: { eb_id: 55, eb_no: 10000, worker_name: "" } })).toEqual({
      eb_id: 55,
      eb_no: "10000",
      worker_name: null,
    });
    expect(parseWorkerLookup({ data: {} })).toBeNull();
    expect(parseWorkerLookup("nope")).toBeNull();
  });
});
