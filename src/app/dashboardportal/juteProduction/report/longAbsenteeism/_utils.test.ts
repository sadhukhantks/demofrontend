import { describe, expect, it } from "vitest";
import type { LaEvent, LaLetter, LaListRow, LaSetup } from "@/utils/longAbsenteeismService";
import {
  BANDS,
  addDays,
  approvalBarStatus,
  approvalStatusLabel,
  buildHref,
  buildLetterHtml,
  buildLettersHtml,
  countByDept,
  defaultDispatchMode,
  deptSummary,
  dueText,
  escapeHtml,
  extraColumns,
  filterByDept,
  groupByBand,
  groupLettersDue,
  isDue,
  isUserEvent,
  letterCell,
  letterTitle,
  matchesQuery,
  nextLetterStage,
  NO_DEPARTMENT_LABEL,
  NO_DEPT_FILTER,
  parsePositiveId,
  parseTab,
  parseView,
  resolveBranchId,
  showsStruckOffPanel,
  sortEventsNewestFirst,
  sortLettersOldestFirst,
  stageColor,
  stageLabel,
  struckOffBarPermissions,
  visibleTabs,
  workerTitle,
} from "./_utils";

const SETUP: Pick<LaSetup, "stages" | "letter_stages"> = {
  stages: [
    { code: "DETECTED", label: "Detected", order: 0 },
    { code: "VERIFIED", label: "Verified", order: 1 },
    { code: "WARNING_1", label: "1st warning", order: 2 },
    { code: "WARNING_2", label: "2nd warning", order: 3 },
    { code: "WARNING_3", label: "3rd & last warning", order: 4 },
    { code: "SHOW_CAUSE", label: "Show cause", order: 5 },
    { code: "GATE_NOTICE", label: "Gate notice", order: 6 },
    { code: "STRUCK_OFF", label: "Struck off", order: 7 },
  ],
  letter_stages: ["WARNING_1", "WARNING_2", "WARNING_3", "SHOW_CAUSE", "GATE_NOTICE", "STRUCK_OFF"],
};

const row = (v: Partial<LaListRow>): LaListRow =>
  ({
    case_id: 1,
    branch_id: 12,
    eb_id: 1,
    stage_code: "VERIFIED",
    status: 1,
    due_band: "NONE",
    next_stage_code: null,
    next_stage_label: null,
    ...v,
  }) as LaListRow;

describe("URL params", () => {
  it("parses positive ids only", () => {
    expect(parsePositiveId("12")).toBe(12);
    expect(parsePositiveId("0")).toBeNull();
    expect(parsePositiveId("-3")).toBeNull();
    expect(parsePositiveId("1.5")).toBeNull();
    expect(parsePositiveId(" ")).toBeNull();
    expect(parsePositiveId(null)).toBeNull();
  });

  it("builds hrefs without empty params", () => {
    expect(buildHref("/p", { case_id: 4, branch_id: null, tab: "" })).toBe("/p?case_id=4");
    expect(buildHref("/p", {})).toBe("/p");
  });

  it("resolves the branch in sidebar scope", () => {
    const branches = [{ branch_id: 1 }, { branch_id: 2 }];
    expect(resolveBranchId(2, 1, branches)).toBe(2);
    expect(resolveBranchId(9, 1, branches)).toBe(1);
    expect(resolveBranchId(null, 9, branches)).toBeNull();
    expect(resolveBranchId(null, null, [{ branch_id: 5 }])).toBe(5);
    expect(resolveBranchId(null, 7, [])).toBe(7);
  });
});

describe("tabs and views", () => {
  it("hides the edit-only tabs without edit", () => {
    expect(visibleTabs(false).map((t) => t.value)).toEqual(["watchlist", "reports"]);
    expect(visibleTabs(true)).toHaveLength(5);
  });

  it("falls back to the watchlist for unknown or forbidden tabs", () => {
    expect(parseTab("reports", false)).toBe("reports");
    expect(parseTab("settings", false)).toBe("watchlist");
    expect(parseTab("settings", true)).toBe("settings");
    expect(parseTab("print", true)).toBe("watchlist");
    expect(parseTab(null, true)).toBe("watchlist");
  });

  it("defaults the view to Due today", () => {
    expect(parseView("parked")).toBe("parked");
    expect(parseView("x")).toBe("due");
    expect(parseView(null)).toBe("due");
  });
});

describe("stages", () => {
  it("labels from setup, code without it", () => {
    expect(stageLabel(SETUP, "SHOW_CAUSE")).toBe("Show cause");
    expect(stageLabel(null, "SHOW_CAUSE")).toBe("SHOW_CAUSE");
    expect(stageLabel(SETUP, null)).toBe("");
  });

  it("knows the next letter of each stage", () => {
    expect(nextLetterStage(SETUP, "DETECTED")).toBeNull();
    expect(nextLetterStage(SETUP, "VERIFIED")).toBe("WARNING_1");
    expect(nextLetterStage(SETUP, "WARNING_3")).toBe("SHOW_CAUSE");
    expect(nextLetterStage(SETUP, "SHOW_CAUSE")).toBe("GATE_NOTICE");
    // After the gate notice the next step is the approval, not a letter.
    expect(nextLetterStage(SETUP, "GATE_NOTICE")).toBeNull();
    expect(nextLetterStage(SETUP, "STRUCK_OFF")).toBeNull();
    expect(nextLetterStage(null, "WARNING_1")).toBe("WARNING_2");
  });

  it("colours the ladder", () => {
    expect(stageColor("WARNING_2")).toBe("warning");
    expect(stageColor("GATE_NOTICE")).toBe("error");
    expect(stageColor("nope")).toBe("default");
  });
});

describe("bands", () => {
  it("groups live rows by band and drops NONE", () => {
    const g = groupByBand([
      row({ case_id: 1, due_band: "VERIFY" }),
      row({ case_id: 2, due_band: "LETTER_DUE" }),
      row({ case_id: 3, due_band: "NONE" }),
      row({ case_id: 4, due_band: "APPROVAL" }),
      row({ case_id: 5, due_band: "STRUCK_OFF_DUE", stage_code: "GATE_NOTICE" }),
    ]);
    expect(g.VERIFY.map((r) => r.case_id)).toEqual([1]);
    expect(g.LETTER_DUE.map((r) => r.case_id)).toEqual([2]);
    expect(g.STRUCK_OFF_DUE.map((r) => r.case_id)).toEqual([5]);
    expect(g.APPROVAL.map((r) => r.case_id)).toEqual([4]);
    expect(g.MARKED_PRESENT).toEqual([]);
  });

  it("orders the bands as the contract lists them", () => {
    expect(BANDS.map((b) => b.key)).toEqual([
      "CANDIDATES",
      "VERIFY",
      "LETTER_DUE",
      "STRUCK_OFF_DUE",
      "MARKED_PRESENT",
      "REPLY_REVIEW",
      "APPROVAL",
    ]);
    expect(BANDS.map((b) => b.title)).toEqual([
      "New candidates",
      "Verification pending",
      "Letters due",
      "Struck off due",
      "Marked present",
      "Replies to review",
      "Awaiting approval",
    ]);
  });

  it("sub-groups letters due by the next letter, in ladder order", () => {
    const groups = groupLettersDue(
      [
        row({ case_id: 1, next_stage_code: "SHOW_CAUSE", next_stage_label: "Show cause" }),
        row({ case_id: 2, next_stage_code: "WARNING_1", next_stage_label: "1st warning" }),
        row({ case_id: 3, next_stage_code: "SHOW_CAUSE", next_stage_label: "Show cause" }),
      ],
      SETUP,
    );
    expect(groups.map((g) => [g.label, g.rows.map((r) => r.case_id)])).toEqual([
      ["1st warning", [2]],
      ["Show cause", [1, 3]],
    ]);
  });
});

describe("cells and columns", () => {
  it("shows a letter date with its sent date", () => {
    expect(letterCell("2026-10-06", "2026-10-07")).toBe("06-10-2026 · sent 07-10-2026");
    expect(letterCell("2026-10-06", null)).toBe("06-10-2026 · not sent");
    expect(letterCell(null, "2026-10-07")).toBe("");
  });

  it("only named extra columns appear", () => {
    expect(
      extraColumns({
        extra_1_label: "Phone",
        extra_2_label: "  ",
        extra_3_label: null,
        extra_4_label: " Union ",
        extra_5_label: null,
      }),
    ).toEqual([
      { key: "extra_1", label: "Phone" },
      { key: "extra_4", label: "Union" },
    ]);
    expect(extraColumns(null)).toEqual([]);
  });

  it("matches EB No or name", () => {
    const c = { emp_code: "T1234", emp_name: "Ram Kumar" };
    expect(matchesQuery(c, "")).toBe(true);
    expect(matchesQuery(c, "kum")).toBe(true);
    expect(matchesQuery(c, "t12")).toBe(true);
    expect(matchesQuery(c, "zz")).toBe(false);
  });
});

describe("department summary", () => {
  const w = { dept_id: 4, dept_desc: "WEAVING" };
  const sp = { dept_id: 7, dept_desc: "SPINNING" };

  it("counts rows per department, biggest first", () => {
    expect(countByDept([sp, w, w, w, sp])).toEqual([
      { dept_id: 4, dept_desc: "WEAVING", count: 3 },
      { dept_id: 7, dept_desc: "SPINNING", count: 2 },
    ]);
  });

  it("breaks ties by department name", () => {
    expect(countByDept([w, sp]).map((d) => d.dept_desc)).toEqual(["SPINNING", "WEAVING"]);
    expect(countByDept([{ dept_id: 1, dept_desc: "batching" }, { dept_id: 2, dept_desc: "Beaming" }]).map((d) => d.dept_desc)).toEqual([
      "batching",
      "Beaming",
    ]);
  });

  it("collects rows without a department under one 'No department' bucket", () => {
    const out = countByDept([{}, { dept_id: null, dept_desc: null }, { dept_id: null, dept_desc: "  " }, w]);
    expect(out).toEqual([
      { dept_id: null, dept_desc: NO_DEPARTMENT_LABEL, count: 3 },
      { dept_id: 4, dept_desc: "WEAVING", count: 1 },
    ]);
  });

  it("groups by id, using the first department text seen; a missing text falls back to the id", () => {
    expect(countByDept([{ dept_id: 4, dept_desc: null }, w])).toEqual([{ dept_id: 4, dept_desc: "WEAVING", count: 2 }]);
    expect(countByDept([{ dept_id: 9, dept_desc: null }])).toEqual([{ dept_id: 9, dept_desc: "Dept 9", count: 1 }]);
  });

  it("groups by id only: a department text without an id still counts as 'No department'", () => {
    expect(countByDept([{ dept_id: null, dept_desc: "STORES" }, {}])).toEqual([
      { dept_id: null, dept_desc: NO_DEPARTMENT_LABEL, count: 2 },
    ]);
  });

  it("is empty for no rows, and the total is the number of rows", () => {
    expect(countByDept([])).toEqual([]);
    expect(deptSummary([])).toEqual({ items: [], total: 0 });
    const sum = deptSummary([w, w, sp, {}]);
    expect(sum.total).toBe(4);
    expect(sum.items.reduce((n, d) => n + d.count, 0)).toBe(sum.total);
  });
});

describe("department filter", () => {
  const rows = [
    { id: 1, dept_id: 4 },
    { id: 2, dept_id: 7 },
    { id: 3, dept_id: null },
    { id: 4 },
    { id: 5, dept_id: 4 },
  ];

  it("null keeps every row (a copy)", () => {
    const out = filterByDept(rows, null);
    expect(out).toEqual(rows);
    expect(out).not.toBe(rows);
  });

  it("filters on a department id", () => {
    expect(filterByDept(rows, 4).map((r) => r.id)).toEqual([1, 5]);
    expect(filterByDept(rows, 99)).toEqual([]);
  });

  it("the no-department sentinel keeps the rows without a department id", () => {
    expect(NO_DEPT_FILTER).toBeLessThan(0);
    expect(filterByDept(rows, NO_DEPT_FILTER).map((r) => r.id)).toEqual([3, 4]);
  });

  it("filtering by a counted department gives as many rows as its chip says", () => {
    for (const d of countByDept(rows)) {
      expect(filterByDept(rows, d.dept_id ?? NO_DEPT_FILTER)).toHaveLength(d.count);
    }
  });
});

describe("dates", () => {
  it("adds days across month ends", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("bad", 1)).toBe("");
  });

  it("says when the next step is due", () => {
    expect(isDue("2026-10-11", "2026-10-11")).toBe(true);
    expect(isDue("2026-10-12", "2026-10-11")).toBe(false);
    expect(isDue(null, "2026-10-11")).toBe(false);
    expect(dueText("2026-10-11", "2026-10-11")).toBe("Due today");
    expect(dueText("2026-10-01", "2026-10-11")).toBe("Overdue since 01-10-2026");
    expect(dueText("2026-10-20", "2026-10-11")).toBe("Due 20-10-2026");
    expect(dueText(null, "2026-10-11")).toBe("");
  });
});

describe("case helpers", () => {
  it("titles", () => {
    expect(workerTitle({ emp_name: "Ram", emp_code: "12", eb_id: 1 })).toBe("Ram (EB 12)");
    expect(workerTitle({ emp_name: null, emp_code: null, eb_id: 7 })).toBe("(no name) (EB 7)");
    expect(letterTitle({ stage_label: "1st warning", letter_no: 1 })).toBe("1st warning · letter 1");
    expect(letterTitle({ stage_label: "Show cause", letter_no: null })).toBe("Show cause");
  });

  it("only user entries are editable", () => {
    expect(isUserEvent({ event_type: "REPLY" })).toBe(true);
    expect(isUserEvent({ event_type: "STAGE" })).toBe(false);
  });

  it("sorts events newest first and letters oldest first", () => {
    const ev = (event_id: number, event_date: string) => ({ event_id, event_date }) as LaEvent;
    expect(sortEventsNewestFirst([ev(1, "2026-10-01"), ev(3, "2026-10-02"), ev(2, "2026-10-02")]).map((e) => e.event_id)).toEqual([3, 2, 1]);
    const l = (letter_id: number, issue_date: string) => ({ letter_id, issue_date }) as LaLetter;
    expect(sortLettersOldestFirst([l(5, "2026-10-09"), l(2, "2026-10-01"), l(1, "2026-10-01")]).map((x) => x.letter_id)).toEqual([1, 2, 5]);
  });

  it("defaults the dispatch mode per stage", () => {
    const modes = [
      { code: "REG_POST_AD", label: "Post" },
      { code: "HAND", label: "Hand" },
      { code: "GATE_BOARD", label: "Gate" },
    ];
    expect(defaultDispatchMode("WARNING_2", modes)).toBe("REG_POST_AD");
    expect(defaultDispatchMode("GATE_NOTICE", modes)).toBe("GATE_BOARD");
    expect(defaultDispatchMode("STRUCK_OFF", modes)).toBe("HAND");
    expect(defaultDispatchMode("GATE_NOTICE", [{ code: "X", label: "X" }])).toBe("X");
    expect(defaultDispatchMode("GATE_NOTICE", [])).toBe("");
  });
});

describe("struck-off approval bar", () => {
  const perms = { canApprove: true, canReject: true, canReopen: true, can_send: true };

  it("maps the case status_id to the bar status", () => {
    expect(approvalBarStatus(null)).toBe(1);
    expect(approvalBarStatus(20)).toBe(20);
    expect(approvalBarStatus(99)).toBe(1);
    expect(approvalStatusLabel(null)).toBe("Not sent for approval");
    expect(approvalStatusLabel(3)).toBe("Struck off (approved)");
  });

  it("not started: only Send, and only with edit", () => {
    expect(struckOffBarPermissions(null, perms, true)).toEqual({ canSendForApproval: true });
    expect(struckOffBarPermissions(null, perms, false)).toEqual({ canSendForApproval: false });
    expect(struckOffBarPermissions(null, { ...perms, can_send: false }, true)).toEqual({ canSendForApproval: false });
  });

  it("pending: the engine's approve / reject", () => {
    expect(struckOffBarPermissions(20, { ...perms, canApprove: false }, true)).toEqual({
      canApprove: false,
      canReject: true,
    });
  });

  it("rejected: re-open with edit; approved: nothing", () => {
    expect(struckOffBarPermissions(4, perms, true)).toEqual({ canReopen: true });
    expect(struckOffBarPermissions(4, perms, false)).toEqual({ canReopen: false });
    expect(struckOffBarPermissions(3, perms, true)).toEqual({});
    expect(struckOffBarPermissions(20, null, true)).toEqual({});
  });

  it("panel shows from the gate notice on or once started", () => {
    expect(showsStruckOffPanel({ stage_code: "SHOW_CAUSE", status_id: null })).toBe(false);
    expect(showsStruckOffPanel({ stage_code: "GATE_NOTICE", status_id: null })).toBe(true);
    expect(showsStruckOffPanel({ stage_code: "STRUCK_OFF", status_id: 3 })).toBe(true);
  });
});

describe("print HTML", () => {
  const head = { coName: "Empire <Jute>", address: "1 Mill Rd & Co", logoBase64: "data:image/png;base64,AA\"" };

  it("escapes everything", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
    expect(escapeHtml(null)).toBe("");
  });

  it("prints letterhead, subject and the stored body pre-wrapped", () => {
    const html = buildLetterHtml(head, { subject: " NOTICE ", body: "Line 1\n<b>Line 2</b>" });
    expect(html).toContain("Empire &lt;Jute&gt;");
    expect(html).toContain("1 Mill Rd &amp; Co");
    expect(html).toContain('src="data:image/png;base64,AA&quot;"');
    expect(html).toContain('<div class="la-subject">NOTICE</div>');
    expect(html).toContain("white-space:pre-wrap");
    expect(html).toContain("Line 1\n&lt;b&gt;Line 2&lt;/b&gt;");
  });

  it("omits the logo and subject when there are none", () => {
    const html = buildLetterHtml({ coName: "X", address: "" }, { subject: null, body: "B" });
    expect(html).not.toContain("<img");
    expect(html).not.toContain("la-subject");
  });

  it("puts a page break after every letter but the last", () => {
    const html = buildLettersHtml(head, [
      { subject: "A", body: "1" },
      { subject: "B", body: "2" },
      { subject: "C", body: "3" },
    ]);
    expect(html.match(/page-break-after:always/g)).toHaveLength(2);
    expect(html.match(/class="la-letter"/g)).toHaveLength(3);
    expect(buildLettersHtml(head, [])).toBe("");
  });
});
