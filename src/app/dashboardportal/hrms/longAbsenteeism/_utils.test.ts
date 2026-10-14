import { describe, expect, it } from "vitest";
import type {
  LaCandidate,
  LaCase,
  LaCodeLabel,
  LaDueBand,
  LaEvent,
  LaLeaveOption,
  LaLetter,
  LaListRow,
  LaSetup,
} from "@/utils/longAbsenteeismService";
import {
  BANDS,
  addDays,
  approvalBarStatus,
  approvalStatusLabel,
  buildHref,
  buildLetterHtml,
  buildLettersHtml,
  candidateLeaveNotes,
  countByDept,
  decodeLeaveOption,
  defaultDispatchMode,
  deptSummary,
  dueText,
  encodeLeaveOption,
  escapeHtml,
  exitAsLeaveConfirmText,
  exitAsLeavePayload,
  exitLeaveText,
  extraColumns,
  filterByDept,
  findLeaveOption,
  groupByBand,
  groupLettersDue,
  hasModuleLeave,
  isDue,
  isLeaveCode,
  isUserEvent,
  leaveChipColor,
  leaveChipText,
  leaveChoices,
  leaveHeaderChip,
  leaveOptionLabel,
  leaveReturnDate,
  leaveStatusLine,
  letterCell,
  letterTitle,
  matchesQuery,
  moduleLeaveExitPreset,
  moduleLeaveRange,
  moduleLeaveState,
  needsLeaveType,
  nextLetterStage,
  NO_DEPARTMENT_LABEL,
  NO_DEPT_FILTER,
  normaliseLeaveChoice,
  parsePositiveId,
  parseTab,
  parseView,
  pendingLeaveText,
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
      row({ case_id: 2, due_band: "LETTER_DUE" }),
      row({ case_id: 3, due_band: "NONE" }),
      row({ case_id: 4, due_band: "APPROVAL" }),
      row({ case_id: 5, due_band: "STRUCK_OFF_DUE", stage_code: "GATE_NOTICE" }),
      row({ case_id: 6, due_band: "ON_LEAVE", status: 2 }),
    ]);
    expect(g.LETTER_DUE.map((r) => r.case_id)).toEqual([2]);
    expect(g.STRUCK_OFF_DUE.map((r) => r.case_id)).toEqual([5]);
    expect(g.APPROVAL.map((r) => r.case_id)).toEqual([4]);
    expect(g.ON_LEAVE.map((r) => r.case_id)).toEqual([6]);
    expect(g.MARKED_PRESENT).toEqual([]);
    expect(g.REPLY_REVIEW).toEqual([]);
    // Nothing of band NONE ends up anywhere.
    expect(Object.values(g).flat().map((r) => r.case_id)).not.toContain(3);
  });

  it("groups the ON_LEAVE band and keeps the rows of a band in the order given", () => {
    const g = groupByBand([
      row({ case_id: 9, due_band: "ON_LEAVE" }),
      row({ case_id: 3, due_band: "ON_LEAVE" }),
      row({ case_id: 7, due_band: "MARKED_PRESENT" }),
      row({ case_id: 5, due_band: "ON_LEAVE" }),
    ]);
    expect(g.ON_LEAVE.map((r) => r.case_id)).toEqual([9, 3, 5]);
    expect(g.MARKED_PRESENT.map((r) => r.case_id)).toEqual([7]);
  });

  it("skips a band the page does not show (an older server's VERIFY, an unknown one) without throwing", () => {
    const unknown = (case_id: number, band: string) => row({ case_id, due_band: band as LaDueBand });
    let g: ReturnType<typeof groupByBand> | undefined;
    expect(() => {
      g = groupByBand([
        unknown(1, "VERIFY"),
        unknown(2, "SOMETHING_NEW"),
        unknown(3, ""),
        // Names that exist on every object must not be mistaken for a band.
        unknown(4, "constructor"),
        unknown(5, "toString"),
        unknown(6, "__proto__"),
        row({ case_id: 7, due_band: "LETTER_DUE" }),
      ]);
    }).not.toThrow();
    expect(g?.LETTER_DUE.map((r) => r.case_id)).toEqual([7]);
    expect(Object.values(g ?? {}).flat().map((r) => r.case_id)).toEqual([7]);
    // No VERIFY bucket exists any more.
    expect(g).not.toHaveProperty("VERIFY");
  });

  it("returns every shown band, empty, for no rows", () => {
    const g = groupByBand([]);
    expect(Object.keys(g)).toEqual([
      "LETTER_DUE",
      "STRUCK_OFF_DUE",
      "MARKED_PRESENT",
      "ON_LEAVE",
      "REPLY_REVIEW",
      "APPROVAL",
    ]);
    expect(Object.values(g).every((rows) => rows.length === 0)).toBe(true);
  });

  it("has a bucket for every band the page lists after the candidates", () => {
    expect(Object.keys(groupByBand([]))).toEqual(BANDS.map((b) => b.key).filter((k) => k !== "CANDIDATES"));
  });

  it("orders the bands as the contract lists them: no VERIFY, ON_LEAVE after MARKED_PRESENT", () => {
    expect(BANDS.map((b) => b.key)).toEqual([
      "CANDIDATES",
      "LETTER_DUE",
      "STRUCK_OFF_DUE",
      "MARKED_PRESENT",
      "ON_LEAVE",
      "REPLY_REVIEW",
      "APPROVAL",
    ]);
    expect(BANDS.map((b) => b.title)).toEqual([
      "New candidates",
      "Letters due",
      "Struck off due",
      "Marked present",
      "On leave (leave module)",
      "Replies to review",
      "Awaiting approval",
    ]);
    expect(BANDS.map((b) => b.key)).not.toContain("VERIFY");
    expect(BANDS.every((b) => b.hint.length > 0)).toBe(true);
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
    // inside the print frame's table cell Chrome honours break-after; page-break-after is the fallback
    expect(html.match(/;break-after:page/g)).toHaveLength(2);
    expect(html.match(/class="la-letter"/g)).toHaveLength(3);
    expect(buildLettersHtml(head, [])).toBe("");
  });
});

// ─── Leave (leave-type master / leave module) ────────────────────────

const TODAY = "2026-10-11";

/** A case linked to an approved leave of the leave module that covers TODAY. */
const leaveCase = (v: Partial<LaCase> = {}): LaCase =>
  ({
    case_id: 41,
    status: 1,
    leave_transaction_id: 5001,
    leave_type_id: 24,
    leave_type_name: "STL LEAVE (L)",
    leave_from: "2026-10-08",
    leave_to: "2026-10-24",
    leave_parked: 0,
    on_leave_now: true,
    on_leave_label: null,
    pending_leave_since: null,
    esi_stl_result: null,
    esi_stl_result_label: null,
    exit_reason: null,
    exit_reason_label: null,
    expected_return_date: null,
    ...v,
  }) as LaCase;

/** A case whose module leave ended before TODAY. */
const endedLeave = (v: Partial<LaCase> = {}): LaCase =>
  leaveCase({ on_leave_now: false, leave_from: "2026-09-28", leave_to: "2026-10-05", ...v });

/** A case whose module leave starts after TODAY. */
const upcomingLeave = (v: Partial<LaCase> = {}): LaCase =>
  leaveCase({ on_leave_now: false, leave_from: "2026-10-15", leave_to: "2026-10-24", ...v });

/** A case with no leave at all. */
const noLeave = (v: Partial<LaCase> = {}): LaCase =>
  leaveCase({
    leave_transaction_id: null,
    leave_type_id: null,
    leave_type_name: null,
    leave_from: null,
    leave_to: null,
    on_leave_now: false,
    ...v,
  });

const OPTIONS: LaLeaveOption[] = [
  { code: "REJOINED", leave_type_id: null, label: "Rejoined", legacy_code: null, source: "builtin" },
  { code: "LEAVE", leave_type_id: 24, label: "STL LEAVE (L)", legacy_code: "STL", source: "master" },
  { code: "LEAVE", leave_type_id: 25, label: "ESI LEAVE", legacy_code: "ESI", source: "master" },
  { code: "MATERNITY", leave_type_id: null, label: "Maternity leave", legacy_code: null, source: "legacy" },
  { code: "RESIGNED", leave_type_id: null, label: "Resigned", legacy_code: null, source: "builtin" },
];

describe("leave codes", () => {
  it("knows the leave-like codes; only LEAVE carries a leave type", () => {
    for (const code of ["LEAVE", "ESI", "STL", "MATERNITY"]) expect(isLeaveCode(code)).toBe(true);
    for (const code of ["REJOINED", "MEDICAL", "RESIGNED", "", null, undefined]) expect(isLeaveCode(code)).toBe(false);
    expect(needsLeaveType("LEAVE")).toBe(true);
    for (const code of ["ESI", "STL", "MATERNITY", "RESIGNED", "", null, undefined]) expect(needsLeaveType(code)).toBe(false);
  });
});

describe("leave option encoding", () => {
  it("encodes a master option as CODE:id and a legacy one as CODE:", () => {
    expect(encodeLeaveOption({ code: "LEAVE", leave_type_id: 24 })).toBe("LEAVE:24");
    expect(encodeLeaveOption({ code: "ESI", leave_type_id: null })).toBe("ESI:");
  });

  it("decodes a master option into its code and leave type id", () => {
    expect(decodeLeaveOption("LEAVE:24")).toEqual({ code: "LEAVE", leave_type_id: 24 });
  });

  it("decodes a legacy option to a null leave type", () => {
    expect(decodeLeaveOption("ESI:")).toEqual({ code: "ESI", leave_type_id: null });
  });

  it("round-trips every option of a setup, the master and the legacy ones", () => {
    for (const o of OPTIONS) {
      expect(decodeLeaveOption(encodeLeaveOption(o))).toEqual({ code: o.code, leave_type_id: o.leave_type_id });
    }
  });

  it("nothing picked decodes to an empty code; a bare code has no leave type", () => {
    expect(decodeLeaveOption("")).toEqual({ code: "", leave_type_id: null });
    expect(decodeLeaveOption("RESIGNED")).toEqual({ code: "RESIGNED", leave_type_id: null });
  });

  it("a leave type id that is not a positive whole number decodes to null", () => {
    for (const bad of ["LEAVE:abc", "LEAVE:0", "LEAVE:-2", "LEAVE:2.5", "LEAVE: "]) {
      expect(decodeLeaveOption(bad)).toEqual({ code: "LEAVE", leave_type_id: null });
    }
  });
});

describe("finding a leave option", () => {
  it("matches the code and the leave type together", () => {
    expect(findLeaveOption(OPTIONS, "LEAVE", 24)?.label).toBe("STL LEAVE (L)");
    expect(findLeaveOption(OPTIONS, "LEAVE", 25)?.label).toBe("ESI LEAVE");
    expect(findLeaveOption(OPTIONS, "REJOINED", null)?.label).toBe("Rejoined");
    expect(findLeaveOption(OPTIONS, "REJOINED", undefined)?.label).toBe("Rejoined");
  });

  it("a bare legacy code resolves to the master type that stands in for it", () => {
    expect(findLeaveOption(OPTIONS, "STL", null)).toMatchObject({ code: "LEAVE", leave_type_id: 24 });
    expect(findLeaveOption(OPTIONS, "ESI", undefined)).toMatchObject({ code: "LEAVE", leave_type_id: 25 });
  });

  it("an exact legacy option wins over the stand-in lookup", () => {
    expect(findLeaveOption(OPTIONS, "MATERNITY", null)).toMatchObject({ code: "MATERNITY", source: "legacy" });
  });

  it("is null when nothing matches: unknown type, unknown code, no code, no options", () => {
    expect(findLeaveOption(OPTIONS, "LEAVE", 99)).toBeNull();
    // A typed code never falls back to a legacy stand-in.
    expect(findLeaveOption(OPTIONS, "STL", 99)).toBeNull();
    expect(findLeaveOption(OPTIONS, "LEAVE", null)).toBeNull();
    expect(findLeaveOption(OPTIONS, "OTHER", null)).toBeNull();
    expect(findLeaveOption(OPTIONS, null, 24)).toBeNull();
    expect(findLeaveOption(OPTIONS, "", 24)).toBeNull();
    expect(findLeaveOption(null, "LEAVE", 24)).toBeNull();
    expect(findLeaveOption(undefined, "LEAVE", 24)).toBeNull();
    expect(findLeaveOption([], "LEAVE", 24)).toBeNull();
  });

  it("labels the choice, falling back to the code, and to nothing without a code", () => {
    expect(leaveOptionLabel(OPTIONS, "LEAVE", 24)).toBe("STL LEAVE (L)");
    expect(leaveOptionLabel(OPTIONS, "STL", null)).toBe("STL LEAVE (L)");
    expect(leaveOptionLabel(OPTIONS, "OTHER", null)).toBe("OTHER");
    expect(leaveOptionLabel(OPTIONS, "LEAVE", 99)).toBe("LEAVE");
    expect(leaveOptionLabel(null, "LEAVE", 24)).toBe("LEAVE");
    expect(leaveOptionLabel(OPTIONS, null, 24)).toBe("");
    expect(leaveOptionLabel(OPTIONS, "", null)).toBe("");
  });
});

describe("leave choices", () => {
  const fallback: LaCodeLabel[] = [
    { code: "REJOINED", label: "Rejoined" },
    { code: "RESIGNED", label: "Resigned" },
  ];

  it("uses the server's choices when it sent any", () => {
    expect(leaveChoices(OPTIONS, fallback)).toBe(OPTIONS);
  });

  it("falls back to the older plain code list, as builtin choices without a leave type", () => {
    const expected = [
      { code: "REJOINED", leave_type_id: null, label: "Rejoined", legacy_code: null, source: "builtin" },
      { code: "RESIGNED", leave_type_id: null, label: "Resigned", legacy_code: null, source: "builtin" },
    ];
    expect(leaveChoices([], fallback)).toEqual(expected);
    expect(leaveChoices(null, fallback)).toEqual(expected);
    expect(leaveChoices(undefined, fallback)).toEqual(expected);
  });

  it("is empty when there is nothing at all", () => {
    expect(leaveChoices([], [])).toEqual([]);
    expect(leaveChoices(null, null)).toEqual([]);
    expect(leaveChoices(undefined, undefined)).toEqual([]);
  });
});

describe("normalising a stored leave choice for a form", () => {
  it("shows a legacy code as the master type that stands in for it", () => {
    expect(normaliseLeaveChoice(OPTIONS, "STL", "")).toEqual({ code: "LEAVE", leave_type_id: "24" });
    expect(normaliseLeaveChoice(OPTIONS, "ESI", "")).toEqual({ code: "LEAVE", leave_type_id: "25" });
  });

  it("keeps an exact choice as it is", () => {
    expect(normaliseLeaveChoice(OPTIONS, "LEAVE", "24")).toEqual({ code: "LEAVE", leave_type_id: "24" });
    expect(normaliseLeaveChoice(OPTIONS, "RESIGNED", "")).toEqual({ code: "RESIGNED", leave_type_id: "" });
    expect(normaliseLeaveChoice(OPTIONS, "MATERNITY", "")).toEqual({ code: "MATERNITY", leave_type_id: "" });
  });

  it("leaves a value that matches no choice unchanged", () => {
    expect(normaliseLeaveChoice(OPTIONS, "LEAVE", "99")).toEqual({ code: "LEAVE", leave_type_id: "99" });
    expect(normaliseLeaveChoice(OPTIONS, "LEAVE", "abc")).toEqual({ code: "LEAVE", leave_type_id: "abc" });
    expect(normaliseLeaveChoice(OPTIONS, "", "")).toEqual({ code: "", leave_type_id: "" });
    expect(normaliseLeaveChoice(null, "STL", "")).toEqual({ code: "STL", leave_type_id: "" });
    expect(normaliseLeaveChoice([], "STL", "")).toEqual({ code: "STL", leave_type_id: "" });
  });
});

describe("module leave state", () => {
  it("hasModuleLeave is the leave transaction link", () => {
    expect(hasModuleLeave({ leave_transaction_id: 5001 })).toBe(true);
    expect(hasModuleLeave({ leave_transaction_id: null })).toBe(false);
  });

  it("is now when the server says the leave covers today", () => {
    expect(moduleLeaveState(leaveCase(), TODAY)).toBe("now");
    // The server's flag wins over the dates.
    expect(moduleLeaveState(leaveCase({ leave_from: "2026-10-20", leave_to: "2026-10-24" }), TODAY)).toBe("now");
  });

  it("is now when the dates cover today even if the flag is off", () => {
    expect(moduleLeaveState(leaveCase({ on_leave_now: false }), TODAY)).toBe("now");
    // The last day of the leave is still on leave.
    expect(moduleLeaveState(leaveCase({ on_leave_now: false, leave_to: TODAY }), TODAY)).toBe("now");
    // The first day too.
    expect(moduleLeaveState(leaveCase({ on_leave_now: false, leave_from: TODAY }), TODAY)).toBe("now");
    // Open-ended on either side.
    expect(moduleLeaveState(leaveCase({ on_leave_now: false, leave_to: null }), TODAY)).toBe("now");
    expect(moduleLeaveState(leaveCase({ on_leave_now: false, leave_from: null }), TODAY)).toBe("now");
  });

  it("is upcoming when the leave starts after today", () => {
    expect(moduleLeaveState(upcomingLeave(), TODAY)).toBe("upcoming");
    expect(moduleLeaveState(upcomingLeave({ leave_from: "2026-10-12" }), TODAY)).toBe("upcoming");
  });

  it("is ended when the leave ended before today", () => {
    expect(moduleLeaveState(endedLeave(), TODAY)).toBe("ended");
    expect(moduleLeaveState(endedLeave({ leave_to: "2026-10-10" }), TODAY)).toBe("ended");
    expect(moduleLeaveState(endedLeave({ leave_from: null }), TODAY)).toBe("ended");
  });

  it("reads the date part of a date-time", () => {
    expect(moduleLeaveState(endedLeave({ leave_to: "2026-10-05T00:00:00" }), TODAY)).toBe("ended");
    expect(moduleLeaveState(upcomingLeave({ leave_from: "2026-10-15T00:00:00" }), TODAY)).toBe("upcoming");
    expect(moduleLeaveState(leaveCase({ on_leave_now: false, leave_to: "2026-10-11T00:00:00" }), TODAY)).toBe("now");
  });

  it("is null without a leave transaction, whatever the dates or the flag say", () => {
    expect(moduleLeaveState(noLeave(), TODAY)).toBeNull();
    expect(moduleLeaveState(noLeave({ leave_from: "2026-10-08", leave_to: "2026-10-24" }), TODAY)).toBeNull();
    expect(moduleLeaveState(noLeave({ on_leave_now: true }), TODAY)).toBeNull();
  });

  it("is null for a linked leave with no dates at all and no flag", () => {
    expect(moduleLeaveState(leaveCase({ on_leave_now: false, leave_from: null, leave_to: null }), TODAY)).toBeNull();
  });
});

describe("pending leave request", () => {
  it("says since when, or nothing", () => {
    expect(pendingLeaveText({ pending_leave_since: "2026-10-09" })).toBe("Leave request pending since 09-10-2026");
    expect(pendingLeaveText({ pending_leave_since: null })).toBeNull();
    expect(pendingLeaveText({ pending_leave_since: "" })).toBeNull();
  });
});

describe("leave chip", () => {
  it("on leave: names the type and when it ends", () => {
    expect(leaveChipText(leaveCase(), TODAY)).toBe("On leave: STL LEAVE (L) till 24-10-2026");
  });

  it("on leave: leaves out what is not known", () => {
    expect(leaveChipText(leaveCase({ leave_type_name: null }), TODAY)).toBe("On leave till 24-10-2026");
    expect(leaveChipText(leaveCase({ leave_type_name: "  " }), TODAY)).toBe("On leave till 24-10-2026");
    expect(leaveChipText(leaveCase({ leave_to: null }), TODAY)).toBe("On leave: STL LEAVE (L)");
  });

  it("ended: names the type and the end date", () => {
    expect(leaveChipText(endedLeave(), TODAY)).toBe("Leave STL LEAVE (L) ended 05-10-2026");
    expect(leaveChipText(endedLeave({ leave_type_name: null }), TODAY)).toBe("Leave ended 05-10-2026");
  });

  it("upcoming: names the type and the start date", () => {
    expect(leaveChipText(upcomingLeave(), TODAY)).toBe("Leave STL LEAVE (L) from 15-10-2026");
    expect(leaveChipText(upcomingLeave({ leave_type_name: null }), TODAY)).toBe("Leave from 15-10-2026");
  });

  it("a pending request alone: since when", () => {
    expect(leaveChipText(noLeave({ pending_leave_since: "2026-10-09" }), TODAY)).toBe(
      "Leave request pending since 09-10-2026",
    );
  });

  it("an approved module leave wins over a pending request", () => {
    expect(leaveChipText(leaveCase({ pending_leave_since: "2026-10-09" }), TODAY)).toBe(
      "On leave: STL LEAVE (L) till 24-10-2026",
    );
  });

  it("no leave and no request: no chip", () => {
    expect(leaveChipText(noLeave(), TODAY)).toBeNull();
  });

  it("a leave-like exit reason reads as the server's label, else the reason with its expected return", () => {
    const stl = noLeave({ exit_reason: "STL", exit_reason_label: "Short-term leave", status: 0 });
    expect(leaveChipText(stl, TODAY)).toBe("Short-term leave");
    expect(leaveChipText({ ...stl, expected_return_date: "2026-10-20" }, TODAY)).toBe("Short-term leave till 20-10-2026");
    expect(leaveChipText({ ...stl, on_leave_label: " STL LEAVE (L) till 24.10.2026 " }, TODAY)).toBe(
      "STL LEAVE (L) till 24.10.2026",
    );
    // Without a label the code stands in.
    expect(leaveChipText(noLeave({ exit_reason: "MATERNITY", exit_reason_label: null }), TODAY)).toBe("MATERNITY");
    // Exit LEAVE names the leave type.
    expect(leaveChipText(noLeave({ exit_reason: "LEAVE", leave_type_name: "STL LEAVE (L)" }), TODAY)).toBe(
      "On leave: STL LEAVE (L)",
    );
    // Not a leave exit.
    expect(leaveChipText(noLeave({ exit_reason: "RESIGNED", exit_reason_label: "Resigned" }), TODAY)).toBeNull();
  });

  it("an old verification result of ESI / STL still reads as a leave", () => {
    expect(leaveChipText(noLeave({ esi_stl_result: "ESI", esi_stl_result_label: "On ESI" }), TODAY)).toBe("On ESI");
    expect(leaveChipText(noLeave({ esi_stl_result: "NONE", esi_stl_result_label: "Not on ESI / STL" }), TODAY)).toBeNull();
  });

  it("colours the chip: info on leave, amber once ended, grey otherwise", () => {
    expect(leaveChipColor(leaveCase(), TODAY)).toBe("info");
    expect(leaveChipColor(endedLeave(), TODAY)).toBe("warning");
    expect(leaveChipColor(upcomingLeave(), TODAY)).toBe("default");
    expect(leaveChipColor(noLeave(), TODAY)).toBe("default");
    expect(leaveChipColor(noLeave({ pending_leave_since: "2026-10-09" }), TODAY)).toBe("default");
  });
});

describe("case header leave chip", () => {
  it("on leave: info, marked as the leave module's", () => {
    expect(leaveHeaderChip(leaveCase(), TODAY)).toEqual({
      label: "On leave: STL LEAVE (L) till 24-10-2026 (leave module)",
      color: "info",
    });
  });

  it("ended on a live case: amber, not returned; on a closed case: grey", () => {
    expect(leaveHeaderChip(endedLeave(), TODAY)).toEqual({
      label: "Leave STL LEAVE (L) ended 05-10-2026 — not returned",
      color: "warning",
    });
    expect(leaveHeaderChip(endedLeave({ status: 2 }), TODAY)?.color).toBe("warning");
    expect(leaveHeaderChip(endedLeave({ status: 0 }), TODAY)).toEqual({
      label: "Leave STL LEAVE (L) ended 05-10-2026 (leave module)",
      color: "default",
    });
  });

  it("upcoming: grey", () => {
    expect(leaveHeaderChip(upcomingLeave(), TODAY)).toEqual({
      label: "Leave STL LEAVE (L) from 15-10-2026",
      color: "default",
    });
  });

  it("no module leave: no chip", () => {
    expect(leaveHeaderChip(noLeave(), TODAY)).toBeNull();
    expect(leaveHeaderChip(noLeave({ pending_leave_since: "2026-10-09" }), TODAY)).toBeNull();
  });
});

describe("module leave range and status line", () => {
  it("joins the type name and the dates", () => {
    expect(moduleLeaveRange(leaveCase())).toBe("STL LEAVE (L) 08-10-2026 – 24-10-2026");
    expect(moduleLeaveRange(leaveCase({ leave_type_name: null }))).toBe("08-10-2026 – 24-10-2026");
    expect(moduleLeaveRange(leaveCase({ leave_to: null }))).toBe("STL LEAVE (L) 08-10-2026");
    expect(moduleLeaveRange(leaveCase({ leave_from: null, leave_to: null }))).toBe("STL LEAVE (L)");
    expect(moduleLeaveRange(noLeave())).toBe("");
  });

  it("on leave: the range, and that the leave module parked the live case", () => {
    expect(leaveStatusLine(leaveCase({ leave_parked: 1, status: 2 }), TODAY)).toEqual({
      text: "On leave: STL LEAVE (L) 08-10-2026 – 24-10-2026 (leave module) — case parked automatically",
      state: "now",
    });
    // Parked by hand, or not parked: no such note.
    expect(leaveStatusLine(leaveCase({ leave_parked: 0, status: 2 }), TODAY).text).toBe(
      "On leave: STL LEAVE (L) 08-10-2026 – 24-10-2026 (leave module)",
    );
    // A closed case is not parked by anything.
    expect(leaveStatusLine(leaveCase({ leave_parked: 1, status: 0 }), TODAY).text).toBe(
      "On leave: STL LEAVE (L) 08-10-2026 – 24-10-2026 (leave module)",
    );
  });

  it("ended: says so, and that a live case resumed because the worker is still absent", () => {
    expect(leaveStatusLine(endedLeave(), TODAY)).toEqual({
      text: "Leave STL LEAVE (L) ended 05-10-2026 — still absent, case resumed",
      state: "ended",
    });
    expect(leaveStatusLine(endedLeave({ status: 0 }), TODAY).text).toBe("Leave STL LEAVE (L) ended 05-10-2026");
  });

  it("upcoming: from and to", () => {
    expect(leaveStatusLine(upcomingLeave(), TODAY)).toEqual({
      text: "STL LEAVE (L) from 15-10-2026 to 24-10-2026 (leave module)",
      state: "upcoming",
    });
    expect(leaveStatusLine(upcomingLeave({ leave_to: null, leave_type_name: null }), TODAY).text).toBe(
      "Leave from 15-10-2026 (leave module)",
    );
  });

  it("no module leave: only approved leave counts", () => {
    expect(leaveStatusLine(noLeave(), TODAY)).toEqual({
      text: "No approved leave in the leave module after the last working date",
      state: null,
    });
  });
});

describe("exit leave text", () => {
  it("LEAVE names the leave type; the legacy codes use their label; the expected return is appended", () => {
    expect(exitLeaveText(leaveCase({ exit_reason: "LEAVE", expected_return_date: "2026-10-24" }))).toBe(
      "On leave: STL LEAVE (L), expected back 24-10-2026",
    );
    expect(exitLeaveText(leaveCase({ exit_reason: "LEAVE" }))).toBe("On leave: STL LEAVE (L)");
    expect(exitLeaveText(noLeave({ exit_reason: "ESI", exit_reason_label: "On ESI", expected_return_date: "2026-11-01" }))).toBe(
      "On ESI, expected back 01-11-2026",
    );
    expect(exitLeaveText(noLeave({ exit_reason: "LEAVE", exit_reason_label: "On leave" }))).toBe("On leave");
  });

  it("is null for a reason that is not a leave", () => {
    expect(exitLeaveText(noLeave({ exit_reason: "RESIGNED", exit_reason_label: "Resigned" }))).toBeNull();
    expect(exitLeaveText(noLeave({ exit_reason: null }))).toBeNull();
  });
});

describe("candidate leave notes", () => {
  const cand = (v: Partial<LaCandidate>) => ({ leave_type_name: null, leave_to: null, pending_leave_since: null, ...v });

  it("an approved leave that ended on the last seen day", () => {
    expect(candidateLeaveNotes(cand({ leave_type_name: "STL LEAVE (L)", leave_to: "2026-10-05" }))).toEqual([
      "Leave STL LEAVE (L) ended 05-10-2026 (leave module)",
    ]);
    expect(candidateLeaveNotes(cand({ leave_to: "2026-10-05" }))).toEqual(["Leave ended 05-10-2026 (leave module)"]);
  });

  it("a request awaiting approval", () => {
    expect(candidateLeaveNotes(cand({ pending_leave_since: "2026-10-09" }))).toEqual([
      "Leave request pending since 09-10-2026",
    ]);
  });

  it("both, the ended leave first", () => {
    expect(
      candidateLeaveNotes(cand({ leave_type_name: "STL LEAVE (L)", leave_to: "2026-10-05", pending_leave_since: "2026-10-09" })),
    ).toEqual(["Leave STL LEAVE (L) ended 05-10-2026 (leave module)", "Leave request pending since 09-10-2026"]);
  });

  it("neither: no notes", () => {
    expect(candidateLeaveNotes(cand({}))).toEqual([]);
  });
});

describe("exit as on leave", () => {
  it("returns the leave end only while it is today or later", () => {
    expect(leaveReturnDate("2026-10-24", TODAY)).toBe("2026-10-24");
    expect(leaveReturnDate(TODAY, TODAY)).toBe(TODAY);
    expect(leaveReturnDate("2026-10-10", TODAY)).toBeNull();
    expect(leaveReturnDate("2026-10-05", TODAY)).toBeNull();
  });

  it("returns null without a leave end", () => {
    expect(leaveReturnDate(null, TODAY)).toBeNull();
    expect(leaveReturnDate(undefined, TODAY)).toBeNull();
    expect(leaveReturnDate("", TODAY)).toBeNull();
  });

  it("returns the leave end as it is when today is not given", () => {
    expect(leaveReturnDate("2026-10-05")).toBe("2026-10-05");
  });

  it("payload of a running leave: reason LEAVE, its type, exit today, expected back at the leave end", () => {
    expect(exitAsLeavePayload(leaveCase(), 9, TODAY)).toEqual({
      co_id: 9,
      case_id: 41,
      exit_reason: "LEAVE",
      leave_type_id: 24,
      exit_date: TODAY,
      expected_return_date: "2026-10-24",
      exit_remarks: "Approved leave in the leave module: STL LEAVE (L) 08-10-2026 – 24-10-2026",
    });
  });

  it("payload of an ended leave: no expected return (the server refuses one before the exit date)", () => {
    const payload = exitAsLeavePayload(endedLeave(), 9, TODAY);
    expect(payload).toMatchObject({ exit_reason: "LEAVE", leave_type_id: 24, exit_date: TODAY, expected_return_date: null });
    expect(payload?.exit_remarks).toBe("Approved leave in the leave module: STL LEAVE (L) 28-09-2026 – 05-10-2026");
  });

  it("payload of an upcoming leave: expected back at its end", () => {
    expect(exitAsLeavePayload(upcomingLeave(), 9, TODAY)).toMatchObject({
      exit_reason: "LEAVE",
      exit_date: TODAY,
      expected_return_date: "2026-10-24",
    });
  });

  it("no payload without a module leave", () => {
    expect(exitAsLeavePayload(noLeave(), 9, TODAY)).toBeNull();
    expect(exitAsLeavePayload(noLeave({ leave_from: "2026-10-08", leave_to: "2026-10-24" }), 9, TODAY)).toBeNull();
  });

  it("the Exit dialog preset follows the same rule", () => {
    expect(moduleLeaveExitPreset(leaveCase(), TODAY)).toEqual({
      exit_reason: "LEAVE",
      leave_type_id: 24,
      expected_return_date: "2026-10-24",
    });
    expect(moduleLeaveExitPreset(endedLeave(), TODAY)).toEqual({
      exit_reason: "LEAVE",
      leave_type_id: 24,
      expected_return_date: null,
    });
    expect(moduleLeaveExitPreset(noLeave(), TODAY)).toBeNull();
    // Without today the end date is passed on as it is.
    expect(moduleLeaveExitPreset(endedLeave())).toMatchObject({ expected_return_date: "2026-10-05" });
  });

  it("the confirmation names the leave and, for a running one, when the worker is expected back", () => {
    expect(exitAsLeaveConfirmText(leaveCase(), TODAY)).toBe(
      "Close this case as on leave: STL LEAVE (L) 08-10-2026 – 24-10-2026 (leave module), expected back 24-10-2026?",
    );
  });

  it("the confirmation leaves out 'expected back' for an ended leave", () => {
    const text = exitAsLeaveConfirmText(endedLeave(), TODAY);
    expect(text).toBe("Close this case as on leave: STL LEAVE (L) 28-09-2026 – 05-10-2026 (leave module)?");
    expect(text).not.toContain("expected back");
  });

  it("the confirmation reads the same as the payload: the date it shows is the date it sends", () => {
    for (const c of [leaveCase(), endedLeave(), upcomingLeave()]) {
      const sent = exitAsLeavePayload(c, 9, TODAY)?.expected_return_date ?? null;
      expect(exitAsLeaveConfirmText(c, TODAY).includes("expected back")).toBe(sent != null);
    }
  });
});
