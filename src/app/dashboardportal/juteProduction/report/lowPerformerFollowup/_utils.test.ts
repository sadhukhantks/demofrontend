import { describe, expect, it } from "vitest";
import type { FollowupEvent } from "@/utils/lowPerformerFollowupService";
import {
  buildHref,
  describeEvent,
  diffColor,
  earliestEventDate,
  fmtDiff,
  fmtHours,
  fmtNum,
  hourCutsLabel,
  hoursAlreadyCut,
  kgPerHr,
  latestEventDate,
  noticesLabel,
  numDiff,
  parsePositiveId,
  resolveBranchId,
  sortEventsNewestFirst,
  statusParam,
  trendMetric,
  weekLabels,
  windowDays,
} from "./_utils";

const ev = (v: Partial<FollowupEvent>): FollowupEvent => ({
  followup_event_id: 1,
  followup_id: 7,
  event_type: "REMARK",
  event_date: "2026-10-01",
  notice_type: null,
  notice_type_label: null,
  issued_by: null,
  spell_id: null,
  spell_code: null,
  hours_cut: null,
  remarks: null,
  attachment_id: null,
  attachment_filename: null,
  updated_by: null,
  updated_date_time: null,
  ...v,
});

describe("URL helpers", () => {
  it("parses positive integer ids only", () => {
    expect(parsePositiveId("12")).toBe(12);
    expect(parsePositiveId(null)).toBeNull();
    expect(parsePositiveId("")).toBeNull();
    expect(parsePositiveId("0")).toBeNull();
    expect(parsePositiveId("-3")).toBeNull();
    expect(parsePositiveId("1.5")).toBeNull();
    expect(parsePositiveId("abc")).toBeNull();
  });

  it("builds hrefs skipping empty params", () => {
    expect(buildHref("/p", { followup_id: 3, branch_id: 2 })).toBe("/p?followup_id=3&branch_id=2");
    expect(buildHref("/p", { branch_id: null, eb_no: "" })).toBe("/p");
  });

  it("resolves the branch within the sidebar scope", () => {
    const two = [{ branch_id: 1 }, { branch_id: 2 }];
    expect(resolveBranchId(2, 1, two)).toBe(2);
    expect(resolveBranchId(null, 1, two)).toBe(1);
    expect(resolveBranchId(9, 9, two)).toBeNull();
    expect(resolveBranchId(null, null, [{ branch_id: 5 }])).toBe(5);
    expect(resolveBranchId(9, null, [{ branch_id: 5 }])).toBe(5);
    // Sidebar still loading: trust the seed.
    expect(resolveBranchId(null, 4, [])).toBe(4);
  });

  it("maps the status filter to the query param", () => {
    expect(statusParam("open")).toBe(1);
    expect(statusParam("closed")).toBe(0);
    expect(statusParam("all")).toBeNull();
  });
});

describe("formatting", () => {
  it("leaves null blank, never 0", () => {
    expect(fmtNum(null)).toBe("");
    expect(fmtNum(undefined)).toBe("");
    expect(fmtNum(Number.NaN)).toBe("");
    expect(fmtNum(0)).toBe("0.00");
    expect(fmtNum(62.456, 1)).toBe("62.5");
  });

  it("signs and colours differences", () => {
    expect(fmtDiff(2.4)).toBe("+2.40");
    expect(fmtDiff(-5.1)).toBe("-5.10");
    expect(fmtDiff(null)).toBe("");
    expect(diffColor(1)).toBe("success.main");
    expect(diffColor(-1)).toBe("error.main");
    expect(diffColor(0)).toBeUndefined();
    expect(diffColor(null)).toBeUndefined();
    expect(numDiff(5, 3)).toBe(2);
    expect(numDiff(null, 3)).toBeNull();
  });

  it("formats hours and per-hour production", () => {
    expect(fmtHours(5)).toBe("5");
    expect(fmtHours(2.5)).toBe("2.5");
    expect(fmtHours(null)).toBe("");
    expect(kgPerHr(80, 8)).toBe(10);
    expect(kgPerHr(80, 0)).toBeNull();
    expect(kgPerHr(80, null)).toBeNull();
  });

  it("labels the counts of a list row", () => {
    expect(hourCutsLabel({ hours_cut_count: 0, total_hours_cut: 0 })).toBe("");
    expect(hourCutsLabel({ hours_cut_count: 2, total_hours_cut: 5.5 })).toBe("2 · 5.5 h");
    const types = [{ code: "WRITTEN_WARNING", label: "Written warning" }];
    expect(noticesLabel({ notice_count: 0, last_notice_type: null }, types)).toBe("");
    expect(noticesLabel({ notice_count: 2, last_notice_type: "WRITTEN_WARNING" }, types)).toBe(
      "2 · Written warning",
    );
    expect(noticesLabel({ notice_count: 1, last_notice_type: null }, types)).toBe("1");
  });
});

describe("timeline", () => {
  it("sorts newest first, later entry first on the same day", () => {
    const sorted = sortEventsNewestFirst([
      ev({ followup_event_id: 1, event_date: "2026-10-01" }),
      ev({ followup_event_id: 3, event_date: "2026-10-03" }),
      ev({ followup_event_id: 2, event_date: "2026-10-01" }),
    ]);
    expect(sorted.map((e) => e.followup_event_id)).toEqual([3, 2, 1]);
  });

  it("finds the earliest event date", () => {
    expect(earliestEventDate([])).toBeNull();
    expect(
      earliestEventDate([ev({ event_date: "2026-10-04" }), ev({ event_date: "2026-09-30" })]),
    ).toBe("2026-09-30");
  });

  it("finds the latest event date", () => {
    expect(latestEventDate([])).toBeNull();
    expect(
      latestEventDate([ev({ event_date: "2026-09-30" }), ev({ event_date: "2026-10-04" })]),
    ).toBe("2026-10-04");
  });

  it("totals the other hour cuts of a date + spell", () => {
    const events = [
      ev({ followup_event_id: 1, event_type: "HOURS_CUT", spell_id: 4, hours_cut: 2 }),
      ev({ followup_event_id: 2, event_type: "HOURS_CUT", spell_id: 4, hours_cut: 1.5 }),
      ev({ followup_event_id: 3, event_type: "HOURS_CUT", spell_id: 5, hours_cut: 3 }),
      ev({ followup_event_id: 4, event_type: "HOURS_CUT", spell_id: 4, hours_cut: 3, event_date: "2026-10-02" }),
      ev({ followup_event_id: 5, event_type: "REMARK", spell_id: 4 }),
    ];
    expect(hoursAlreadyCut(events, "2026-10-01", 4)).toBe(3.5);
    expect(hoursAlreadyCut(events, "2026-10-01", 4, 2)).toBe(2);
    expect(hoursAlreadyCut(events, "2026-10-03", 4)).toBe(0);
  });

  it("describes notices and hour cuts", () => {
    expect(
      describeEvent(
        ev({ event_type: "NOTICE", notice_type: "SHOW_CAUSE", notice_type_label: "Show-cause notice", issued_by: "HR" }),
        [],
      ),
    ).toBe("Show-cause notice · issued by HR");
    expect(
      describeEvent(ev({ event_type: "NOTICE", notice_type: "OTHER" }), [{ code: "OTHER", label: "Other" }]),
    ).toBe("Other");
    expect(describeEvent(ev({ event_type: "HOURS_CUT", hours_cut: 2, spell_code: "A1" }), [])).toBe(
      "2 h in spell A1",
    );
    expect(describeEvent(ev({ event_type: "REMARK", remarks: "x" }), [])).toBe("");
  });
});

describe("trend", () => {
  it("labels weeks, numbering the ones before marking when there are several", () => {
    expect(weekLabels([{ week_no: 0 }, { week_no: 1 }, { week_no: 2 }])).toEqual(["Before", "Wk 1", "Wk 2"]);
    expect(weekLabels([{ week_no: -1 }, { week_no: 0 }, { week_no: 1 }])).toEqual([
      "Before (wk -2)",
      "Before (wk -1)",
      "Wk 1",
    ]);
    expect(weekLabels([])).toEqual([]);
  });

  it("charts kg/hr only when no week has an efficiency", () => {
    expect(trendMetric([{ avg_eff: null, peer_avg_eff: 60 }])).toBe("eff");
    expect(trendMetric([{ avg_eff: null, peer_avg_eff: null }])).toBe("kg_per_hr");
    expect(trendMetric([])).toBe("kg_per_hr");
  });
});

describe("windowDays", () => {
  it("counts both ends of an ISO window", () => {
    expect(windowDays("2026-09-26", "2026-10-06")).toBe(11);
    expect(windowDays("2026-10-06", "2026-10-06")).toBe(1);
    expect(windowDays("2026-02-27", "2026-03-02")).toBe(4);
    expect(windowDays("2026-10-06", "2026-10-01")).toBeNull();
    expect(windowDays("", "2026-10-01")).toBeNull();
  });
});
