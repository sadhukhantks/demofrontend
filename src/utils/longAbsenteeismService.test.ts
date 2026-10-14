import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.mock("@/utils/apiClient2", () => ({
  fetchWithCookie: (...args: unknown[]) => fetchMock(...args),
}));

import {
  approveLaStruckOff,
  createLaEvent,
  createLaReceipt,
  deactivateLaEvent,
  deactivateLaReceipt,
  dismissLaCandidate,
  exitLaCase,
  extractCase,
  fetchLaCandidates,
  fetchLaCase,
  fetchLaDispatch,
  fetchLaEvents,
  fetchLaLetters,
  fetchLaLettersDue,
  fetchLaList,
  fetchLaMonthlyTrend,
  fetchLaPerformance,
  fetchLaRule,
  fetchLaSetup,
  fetchLaStageSummary,
  fetchLaStruckOffPermissions,
  fetchLaStruckOffRegister,
  fetchLaTemplates,
  fetchLaUnionNames,
  isLaCase,
  isLaEvent,
  isLaLetter,
  isLaRule,
  isLaSetup,
  issueLaLetter,
  LA_DUE_BANDS,
  issueLaLetterBatch,
  openLaCase,
  parkLaCase,
  previewLaLetter,
  qs,
  rejectLaStruckOff,
  reopenLaCase,
  reopenLaStruckOff,
  resetLaTemplate,
  resumeLaCase,
  saveLaRule,
  saveLaTemplate,
  sendLaStruckOff,
  updateLaCase,
  updateLaEvent,
  updateLaLetter,
  updateLaReceipt,
  verifyLaCase,
} from "./longAbsenteeismService";

const ok = (data: unknown) => ({ data: { data }, error: null, status: 200 });
const fail = (error: string, status = 400) => ({ data: null, error, status });

const RULE = {
  co_id: 9,
  detect_days: 10,
  lookback_days: 90,
  wait_w2_days: 10,
  wait_w3_days: 10,
  wait_sc_days: 15,
  sc_reply_days: 3,
  notice_reply_days: 7,
  dismiss_snooze_days: 30,
  exclude_t_codes: 1,
  exclude_prefixes: "T,C,R,L",
  clause_text: "Clause 14(C)(V)",
  signatory: "Personnel Manager",
  extra_1_label: "Phone",
  extra_2_label: null,
  extra_3_label: null,
  extra_4_label: null,
  extra_5_label: null,
};

const CODE = (code: string, label = code) => ({ code, label });

const SETUP = {
  stages: [
    { code: "DETECTED", label: "Detected", order: 0 },
    { code: "VERIFIED", label: "Verified", order: 1 },
    { code: "WARNING_1", label: "1st warning", order: 2 },
  ],
  letter_stages: ["WARNING_1", "WARNING_2"],
  template_codes: [CODE("WARNING_1", "1st warning letter"), CODE("WARNING_2", "2nd warning letter")],
  statuses: [{ code: 1, label: "Open" }],
  exit_reasons: [CODE("REJOINED", "Rejoined")],
  all_exit_reasons: [CODE("REJOINED", "Rejoined"), CODE("STRUCK_OFF", "Struck off")],
  esi_stl_results: [CODE("NONE", "Not on ESI / STL")],
  event_types: [CODE("REMARK", "Remark")],
  user_event_types: ["REMARK", "FEEDBACK", "REPLY"],
  reply_channels: [CODE("PHONE", "Phone")],
  dispatch_modes: [CODE("REG_POST_AD", "Registered post with AD")],
  delivery_statuses: [CODE("PENDING", "Pending")],
  placeholders: [CODE("name", "Worker's name")],
  depts: [{ dept_id: 4, dept_desc: "WEAVING" }, { dept_id: 5, dept_desc: null }, { dept_desc: "no id" }],
  rule: RULE,
  today: "2026-10-11",
  access_level: 4,
};

const CASE = {
  case_id: 41,
  co_id: 9,
  branch_id: 12,
  eb_id: 7001,
  case_no: "LA/12/26/0001",
  emp_code: "1234",
  emp_name: "RAM KUMAR",
  last_working_date: "2026-09-20",
  detected_date: "2026-10-05",
  stage_code: "WARNING_1",
  stage_date: "2026-10-06",
  next_due_date: "2026-10-16",
  status: 1,
  habitual: 0,
  timekeeper_confirmed: 1,
  status_id: null,
  approval_level: null,
  perf_avg_eff: "61.50",
  remarks: null,
  stage_label: "1st warning",
  stage_order: 2,
  status_label: "Open",
  exit_reason_label: null,
  absent_days: 21,
};

const LETTER = {
  letter_id: 301,
  case_id: 41,
  stage_code: "WARNING_1",
  letter_no: 1,
  template_code: "WARNING_1",
  issue_date: "2026-10-06",
  subject: "NOTICE",
  body: "Dear …",
  reply_due_date: "2026-10-13",
  dispatch_mode: "REG_POST_AD",
  sent_date: null,
  forced: 0,
  stage_label: "1st warning",
  receipts: [{ receipt_id: 1, letter_id: 301, union_name: "INTUC" }, { bad: true }],
  attachments: { signed_copy: { attachment_id: 5, filename: "a.pdf" }, ad_card: null },
};

const EVENT = {
  event_id: 77,
  case_id: 41,
  event_type: "REPLY",
  event_date: "2026-10-07",
  channel: "PHONE",
  text: "Called",
  event_type_label: "Reply / contact",
  channel_label: "Phone",
  attachment_id: null,
};

beforeEach(() => {
  fetchMock.mockReset();
});

function lastCall(): { url: string; method: string; body: unknown } {
  const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [string, string | undefined, unknown];
  return { url: call[0], method: call[1] ?? "GET", body: call[2] };
}

function params(url: string): URLSearchParams {
  return new URLSearchParams(url.split("?")[1] ?? "");
}

describe("qs", () => {
  it("drops null / undefined / empty and keeps 0", () => {
    expect(qs({ a: 1, b: null, c: undefined, d: "", e: 0, f: "x y" })).toBe("a=1&e=0&f=x+y");
  });
});

describe("guards", () => {
  it("accepts a case and rejects one without a stage or with an unknown status", () => {
    expect(isLaCase(CASE)).toBe(true);
    expect(isLaCase({ ...CASE, stage_code: null })).toBe(false);
    expect(isLaCase({ ...CASE, status: 5 })).toBe(false);
    expect(isLaCase([CASE])).toBe(false);
  });

  it("accepts a letter and an event", () => {
    expect(isLaLetter(LETTER)).toBe(true);
    expect(isLaLetter({ ...LETTER, body: null })).toBe(false);
    expect(isLaEvent(EVENT)).toBe(true);
    expect(isLaEvent({ ...EVENT, event_date: 3 })).toBe(false);
  });

  it("needs the rule ints and today on setup", () => {
    expect(isLaSetup(SETUP)).toBe(true);
    expect(isLaSetup({ ...SETUP, today: null })).toBe(false);
    expect(isLaSetup({ ...SETUP, rule: { ...RULE, detect_days: null } })).toBe(false);
  });

  it("the rule no longer needs the retired exclude_t_codes and carries exclude_prefixes", () => {
    const { exclude_t_codes: _retired, ...withoutFlag } = RULE;
    expect(isLaRule(withoutFlag)).toBe(true);
    expect(isLaSetup({ ...SETUP, rule: { ...withoutFlag, exclude_prefixes: null } })).toBe(true);
  });

  it("extractCase reads the case itself or {case}", () => {
    expect(extractCase(CASE)?.case_id).toBe(41);
    expect(extractCase({ case: CASE, approval: {} })?.case_id).toBe(41);
    expect(extractCase({ nope: 1 })).toBeNull();
  });
});

describe("transport", () => {
  it("throws the backend detail", async () => {
    fetchMock.mockResolvedValueOnce(fail("You need view access to Long Absenteeism for this branch", 403));
    await expect(fetchLaSetup(9, 12)).rejects.toThrow("You need view access");
  });

  it("throws on a missing {data} envelope", async () => {
    fetchMock.mockResolvedValueOnce({ data: [CASE], error: null, status: 200 });
    await expect(fetchLaList({ coId: 9, branchId: 12, view: "due" })).rejects.toThrow(
      "Failed to load the long absenteeism list",
    );
  });

  it("throws on contract drift", async () => {
    fetchMock.mockResolvedValueOnce(ok([{ case_id: "x" }]));
    await expect(fetchLaList({ coId: 9, branchId: 12, view: "open" })).rejects.toThrow("Unexpected response");
  });
});

describe("setup / list / case", () => {
  it("loads the setup and normalises departments", async () => {
    fetchMock.mockResolvedValueOnce(ok(SETUP));
    const s = await fetchLaSetup(9, 12);
    const { url, method } = lastCall();
    expect(url).toContain("/longAbsenteeism/setup?");
    expect(method).toBe("GET");
    expect(params(url).get("co_id")).toBe("9");
    expect(params(url).get("branch_id")).toBe("12");
    expect(s.depts).toEqual([
      { dept_id: 4, dept_desc: "WEAVING" },
      { dept_id: 5, dept_desc: "Dept 5" },
    ]);
    expect(s.rule.extra_1_label).toBe("Phone");
    expect(s.access_level).toBe(4);
  });

  it("sends the candidate filters and fills closed_cases", async () => {
    fetchMock.mockResolvedValueOnce(ok([{ eb_id: 5, emp_code: "88", absent_days: 12 }]));
    const rows = await fetchLaCandidates({ coId: 9, branchId: 12, deptId: 4, asOn: "2026-10-10" });
    const p = params(lastCall().url);
    expect(lastCall().url).toContain("/longAbsenteeism/candidates?");
    expect(p.get("dept_id")).toBe("4");
    expect(p.get("as_on")).toBe("2026-10-10");
    expect(rows[0].closed_cases).toBe(0);
  });

  it("lists with view / dept / q and defaults the band and letter dates", async () => {
    fetchMock.mockResolvedValueOnce(ok([{ ...CASE, due_band: "LETTER_DUE", w1_date: "2026-10-06" }, CASE]));
    const rows = await fetchLaList({ coId: 9, branchId: 12, view: "due", deptId: null, q: "  ram " });
    const p = params(lastCall().url);
    expect(p.get("view")).toBe("due");
    expect(p.get("q")).toBe("ram");
    expect(p.has("dept_id")).toBe(false);
    expect(rows[0].due_band).toBe("LETTER_DUE");
    expect(rows[0].w1_date).toBe("2026-10-06");
    expect(rows[0].w1_sent).toBeNull();
    expect(rows[1].due_band).toBe("NONE");
    // DECIMAL that arrives as text becomes a number.
    expect(rows[0].perf_avg_eff).toBe(61.5);
  });

  it("keeps the struck-off-due band and drops unknown bands to NONE", async () => {
    fetchMock.mockResolvedValueOnce(
      ok([
        { ...CASE, stage_code: "GATE_NOTICE", due_band: "STRUCK_OFF_DUE" },
        { ...CASE, due_band: "SOMETHING_NEW" },
      ]),
    );
    const rows = await fetchLaList({ coId: 9, branchId: 12, view: "due", deptId: null, q: "" });
    expect(rows[0].due_band).toBe("STRUCK_OFF_DUE");
    expect(rows[1].due_band).toBe("NONE");
    expect(LA_DUE_BANDS).toContain("STRUCK_OFF_DUE");
  });

  it("loads one case with letters, events and earlier cases", async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ case: CASE, letters: [LETTER], events: [EVENT], earlier_cases: [{ case_id: 3 }, { bad: 1 }] }),
    );
    const d = await fetchLaCase(9, 41);
    expect(lastCall().url).toContain("/longAbsenteeism/get?");
    expect(params(lastCall().url).get("case_id")).toBe("41");
    expect(d.letters[0].receipts).toHaveLength(1);
    expect(d.letters[0].attachments.signed_copy?.attachment_id).toBe(5);
    expect(d.letters[0].attachments.ad_card).toBeNull();
    expect(d.events[0].channel_label).toBe("Phone");
    expect(d.earlier_cases).toEqual([{ case_id: 3 }]);
  });
});

describe("case actions POST JSON and return the case", () => {
  const cases: Array<[string, () => Promise<unknown>, string, Record<string, unknown>]> = [
    ["open", () => openLaCase({ co_id: 9, branch_id: 12, eb_id: 7001, last_working_date: null }), "/open", { eb_id: 7001 }],
    ["dismiss", () => dismissLaCandidate({ co_id: 9, branch_id: 12, eb_id: 7001, reason: "leave" }), "/dismiss", { reason: "leave" }],
    [
      "verify",
      () =>
        verifyLaCase({ co_id: 9, case_id: 41, esi_stl_result: "NONE", timekeeper_confirmed: true, habitual: false }),
      "/verify",
      { esi_stl_result: "NONE", timekeeper_confirmed: true },
    ],
    ["update", () => updateLaCase({ co_id: 9, case_id: 41, remarks: "x" }), "/update", { remarks: "x" }],
    ["park", () => parkLaCase({ co_id: 9, case_id: 41, note: "reply" }), "/park", { note: "reply" }],
    ["resume", () => resumeLaCase({ co_id: 9, case_id: 41 }), "/resume", { case_id: 41 }],
    [
      "exit",
      () => exitLaCase({ co_id: 9, case_id: 41, exit_reason: "REJOINED", exit_date: "2026-10-10" }),
      "/exit",
      { exit_reason: "REJOINED" },
    ],
    ["reopen", () => reopenLaCase({ co_id: 9, case_id: 41, note: "back" }), "/reopen", { note: "back" }],
  ];

  it.each(cases)("%s", async (_name, call, path, expectBody) => {
    fetchMock.mockResolvedValueOnce(ok(CASE));
    const res = (await call()) as { case_id: number };
    const { url, method, body } = lastCall();
    expect(url.endsWith(`/longAbsenteeism${path}`)).toBe(true);
    expect(method).toBe("POST");
    expect(body).toMatchObject({ co_id: 9, ...expectBody });
    expect(res.case_id).toBe(41);
  });

  it("refuses a response that is not a case", async () => {
    fetchMock.mockResolvedValueOnce(ok({ ok: true }));
    await expect(parkLaCase({ co_id: 9, case_id: 41, note: "x" })).rejects.toThrow("Unexpected response");
  });
});

describe("events", () => {
  it("lists events", async () => {
    fetchMock.mockResolvedValueOnce(ok([EVENT]));
    const list = await fetchLaEvents(9, 41);
    expect(lastCall().url).toContain("/longAbsenteeism/events?");
    expect(list[0].event_id).toBe(77);
  });

  it("creates an event and returns the parked case", async () => {
    fetchMock.mockResolvedValueOnce(ok({ event: EVENT, case: { ...CASE, status: 2 } }));
    const res = await createLaEvent({
      co_id: 9,
      case_id: 41,
      event_type: "REPLY",
      event_date: "2026-10-07",
      text: "Called",
      park: true,
    });
    expect(lastCall().url.endsWith("/longAbsenteeism/event_create")).toBe(true);
    expect(lastCall().body).toMatchObject({ park: true, event_type: "REPLY" });
    expect(res.event.event_id).toBe(77);
    expect(res.case?.status).toBe(2);
  });

  it("updates and removes an event", async () => {
    fetchMock.mockResolvedValueOnce(ok(EVENT));
    expect((await updateLaEvent({ co_id: 9, event_id: 77, text: "x" })).event_id).toBe(77);
    expect(lastCall().url.endsWith("/longAbsenteeism/event_update")).toBe(true);
    fetchMock.mockResolvedValueOnce(ok({ event_id: 77, active: 0 }));
    expect(await deactivateLaEvent(9, 77)).toEqual({ event_id: 77, active: 0 });
    expect(lastCall().body).toEqual({ co_id: 9, event_id: 77 });
  });
});

describe("performance", () => {
  it("returns the not-available reason", async () => {
    fetchMock.mockResolvedValueOnce(ok({ available: false, reason: "Only weavers" }));
    const p = await fetchLaPerformance(9, 41);
    expect(p).toEqual({ available: false, reason: "Only weavers" });
  });

  it("normalises the summary and rows", async () => {
    fetchMock.mockResolvedValueOnce(
      ok({
        available: true,
        dept: "WEAVING",
        date_from: "2026-08-21",
        date_to: "2026-09-20",
        summary: { days_worked: 20, rows: 40, prod_kg: 900, std_kg: 1000, avg_eff: 61.2, kg_per_hr: 4.1 },
        rows: [{ tran_date: "2026-09-01", prod_kg: "45.5", eff_pct: null }],
      }),
    );
    const p = await fetchLaPerformance(9, 41);
    expect(p.available).toBe(true);
    if (p.available) {
      expect(p.summary.avg_eff).toBe(61.2);
      expect(p.rows[0].prod_kg).toBe(45.5);
      expect(p.rows[0].eff_pct).toBeNull();
    }
  });
});

describe("rule / templates", () => {
  it("reads and saves the rule", async () => {
    fetchMock.mockResolvedValueOnce(ok(RULE));
    const rule = await fetchLaRule(9);
    expect(rule.detect_days).toBe(10);
    expect(rule.exclude_prefixes).toBe("T,C,R,L");
    const { exclude_t_codes: _retired, ...withoutFlag } = RULE;
    fetchMock.mockResolvedValueOnce(ok({ ...withoutFlag, exclude_prefixes: null }));
    const bare = await fetchLaRule(9);
    expect(bare.exclude_prefixes).toBeNull();
    expect(bare.exclude_t_codes).toBeUndefined();
    fetchMock.mockResolvedValueOnce(ok({ ...RULE, exclude_prefixes: "T" }));
    expect((await saveLaRule({ co_id: 9, exclude_prefixes: "t" })).exclude_prefixes).toBe("T");
    expect(lastCall().body).toEqual({ co_id: 9, exclude_prefixes: "t" });
    fetchMock.mockResolvedValueOnce(ok({ ...RULE, detect_days: 12 }));
    expect((await saveLaRule({ co_id: 9, detect_days: 12 })).detect_days).toBe(12);
    expect(lastCall().url.endsWith("/longAbsenteeism/rule_save")).toBe(true);
  });

  it("reads templates with placeholders", async () => {
    fetchMock.mockResolvedValueOnce(
      ok({
        templates: [
          { template_code: "WARNING_1", label: "1st warning letter", lang: "en", subject: null, body: "B", is_default: true },
        ],
        placeholders: [CODE("name")],
      }),
    );
    const t = await fetchLaTemplates(9);
    expect(t.templates[0].subject).toBe("");
    expect(t.templates[0].is_default).toBe(true);
    expect(t.placeholders).toHaveLength(1);
  });

  it("saves and resets a template", async () => {
    fetchMock.mockResolvedValueOnce(ok({ template_code: "WARNING_3", body: "New", subject: "S", is_default: false }));
    expect((await saveLaTemplate({ co_id: 9, template_code: "WARNING_3", subject: "S", body: "New" }))?.body).toBe("New");
    fetchMock.mockResolvedValueOnce(ok({ template_code: "WARNING_3", body: "Default", is_default: true }));
    expect((await resetLaTemplate(9, "WARNING_3"))?.is_default).toBe(true);
    expect(lastCall().body).toEqual({ co_id: 9, template_code: "WARNING_3" });
  });
});

describe("letters", () => {
  it("lists letters and letters due (due_date fallback)", async () => {
    fetchMock.mockResolvedValueOnce(ok([LETTER]));
    expect((await fetchLaLetters(9, 41))[0].letter_id).toBe(301);
    fetchMock.mockResolvedValueOnce(ok([{ case_id: 41, next_stage_code: "WARNING_2", due_date: "2026-10-16" }]));
    const due = await fetchLaLettersDue({ coId: 9, branchId: 12, stageCode: "WARNING_2" });
    expect(params(lastCall().url).get("stage_code")).toBe("WARNING_2");
    expect(due[0].next_due_date).toBe("2026-10-16");
  });

  it("previews the next stage (no stage_code) and maps the gate fields", async () => {
    fetchMock.mockResolvedValueOnce(
      ok({
        case_id: 41,
        stage_code: "WARNING_2",
        stage_label: "2nd warning",
        template_code: "WARNING_2",
        template_label: "2nd warning letter",
        subject: "S",
        body: "B",
        editable: false,
        blocked_reason: "Record the sent date of the 1st warning first",
        blocked_code: "NOT_SENT",
        can_force: true,
        issue_date: "2026-10-11",
        dispatch_mode: "REG_POST_AD",
      }),
    );
    const p = await previewLaLetter(9, 41);
    expect(lastCall().body).toEqual({ co_id: 9, case_id: 41 });
    expect(p.blocked_reason).toContain("sent date");
    expect(p.can_force).toBe(true);
    expect(p.dispatch_mode).toBe("REG_POST_AD");
    expect(p.template_code).toBe("WARNING_2");
    expect(p.template_label).toBe("2nd warning letter");
    expect(p.editable).toBe(false);
  });

  it("previews by case number with unsaved template text", async () => {
    fetchMock.mockResolvedValueOnce(ok({ stage_code: "SHOW_CAUSE", subject: "S", body: "B", can_force: false }));
    const p = await previewLaLetter(9, null, "SHOW_CAUSE", { caseNo: " LA/12/26/0001 ", templateBody: "{name}" });
    // a missing flag reads as not editable, a missing label as null
    expect(p.editable).toBe(false);
    expect(p.template_label).toBeNull();
    expect(lastCall().body).toEqual({
      co_id: 9,
      case_no: "LA/12/26/0001",
      stage_code: "SHOW_CAUSE",
      template_body: "{name}",
    });
  });

  it("issues one letter (force) without any text and returns letter + case", async () => {
    fetchMock.mockResolvedValueOnce(ok({ letter: LETTER, case: CASE }));
    const res = await issueLaLetter({
      co_id: 9,
      case_id: 41,
      stage_code: "WARNING_1",
      issue_date: "2026-10-11",
      force: true,
      force_reason: "posted late",
    });
    expect(lastCall().url.endsWith("/longAbsenteeism/letter_issue")).toBe(true);
    // the server renders the template: no subject / body is sent
    expect(lastCall().body).toEqual({
      co_id: 9,
      case_id: 41,
      stage_code: "WARNING_1",
      issue_date: "2026-10-11",
      force: true,
      force_reason: "posted late",
    });
    expect(res.letter.letter_id).toBe(301);
    expect(res.case.case_id).toBe(41);
  });

  it("issues a batch and keeps the stored text of each letter", async () => {
    fetchMock.mockResolvedValueOnce(
      ok({
        batch_ref: "B20261011-1015-5",
        issue_date: "2026-10-11",
        issued: [{ case_id: 41, letter_id: 302, stage_code: "WARNING_2", subject: "S", body: "B" }, { case_id: "x" }],
        skipped: [{ case_id: 42, reason: "Due on 15.10.2026" }],
      }),
    );
    const res = await issueLaLetterBatch({ co_id: 9, branch_id: 12, case_ids: [41, 42] });
    expect(lastCall().body).toMatchObject({ case_ids: [41, 42] });
    expect(res.batch_ref).toBe("B20261011-1015-5");
    expect(res.issued).toHaveLength(1);
    expect(res.issued[0].body).toBe("B");
    expect(res.skipped[0].reason).toContain("Due on");
  });

  it("updates a letter and returns the letter + case", async () => {
    fetchMock.mockResolvedValueOnce(ok({ letter: { ...LETTER, sent_date: "2026-10-07" }, case: CASE }));
    const res = await updateLaLetter({ co_id: 9, letter_id: 301, sent_date: "2026-10-07" });
    expect(res.letter?.sent_date).toBe("2026-10-07");
    expect(res.case?.case_id).toBe(41);
  });

  it("lists the dispatch register", async () => {
    fetchMock.mockResolvedValueOnce(ok([{ ...LETTER, body: undefined, emp_code: "1234", emp_name: "RAM" }]));
    const rows = await fetchLaDispatch({
      coId: 9,
      branchId: 12,
      dateFrom: "2026-10-01",
      dateTo: "2026-10-11",
      batchRef: " ",
    });
    const p = params(lastCall().url);
    expect(p.get("date_from")).toBe("2026-10-01");
    expect(p.has("batch_ref")).toBe(false);
    expect(rows[0].emp_code).toBe("1234");
    expect(rows[0].body).toBe("");
  });
});

describe("union receipts", () => {
  it("creates, updates and removes a receipt", async () => {
    fetchMock.mockResolvedValueOnce(ok({ receipt_id: 1, letter_id: 301, union_name: "INTUC" }));
    expect((await createLaReceipt({ co_id: 9, letter_id: 301, union_name: "INTUC" })).receipt_id).toBe(1);
    fetchMock.mockResolvedValueOnce(ok({ receipt_id: 1, letter_id: 301, union_name: "CITU" }));
    expect((await updateLaReceipt({ co_id: 9, receipt_id: 1, union_name: "CITU" })).union_name).toBe("CITU");
    fetchMock.mockResolvedValueOnce(ok({ receipt_id: 1, active: 0 }));
    await deactivateLaReceipt(9, 1);
    expect(lastCall().url.endsWith("/longAbsenteeism/receipt_deactivate")).toBe(true);
  });

  it("dedupes union names (strings or objects)", async () => {
    fetchMock.mockResolvedValueOnce(ok(["INTUC", " CITU ", { union_name: "INTUC" }, 4]));
    expect(await fetchLaUnionNames(9, 12)).toEqual(["INTUC", "CITU"]);
  });
});

describe("struck-off approval", () => {
  it("sends, rejects and reopens, returning the case", async () => {
    fetchMock.mockResolvedValueOnce(ok({ case: { ...CASE, status_id: 20, approval_level: 1 } }));
    expect((await sendLaStruckOff(9, 41))?.status_id).toBe(20);
    expect(lastCall().url.endsWith("/longAbsenteeism/struck_off/send")).toBe(true);
    fetchMock.mockResolvedValueOnce(ok({ case: { ...CASE, status_id: 4 }, approval: {} }));
    expect((await rejectLaStruckOff(9, 41, "union objected"))?.status_id).toBe(4);
    expect(lastCall().body).toEqual({ co_id: 9, case_id: 41, reason: "union objected" });
    fetchMock.mockResolvedValueOnce(ok({ case: CASE }));
    expect((await reopenLaStruckOff(9, 41))?.status_id).toBeNull();
  });

  it("approves with the struck-off date", async () => {
    fetchMock.mockResolvedValueOnce(
      ok({
        case: { ...CASE, status: 0, stage_code: "STRUCK_OFF", status_id: 3 },
        approval: { new_status_id: 3, new_approval_level: null, message: "approved" },
      }),
    );
    const res = await approveLaStruckOff({ co_id: 9, case_id: 41, struck_off_date: "2026-10-11" });
    expect(lastCall().body).toEqual({ co_id: 9, case_id: 41, struck_off_date: "2026-10-11" });
    expect(res.approval?.new_status_id).toBe(3);
    expect(res.case?.stage_code).toBe("STRUCK_OFF");
  });

  it("reads flat engine permissions", async () => {
    fetchMock.mockResolvedValueOnce(
      ok({
        canApprove: true,
        canReject: true,
        canReopen: false,
        status_id: 20,
        approval_level: 1,
        max_approval_level: 1,
        hierarchy_exists: true,
        can_send: false,
        send_blocked_reason: null,
      }),
    );
    const p = await fetchLaStruckOffPermissions(9, 41);
    expect(lastCall().url).toContain("/longAbsenteeism/struck_off/permissions?");
    expect(p).toMatchObject({ canApprove: true, canReject: true, status_id: 20, hierarchy_exists: true, can_send: false });
  });

  it("reads nested permissions too", async () => {
    fetchMock.mockResolvedValueOnce(ok({ permissions: { canApprove: 1 }, can_send: "true", status_id: null }));
    const p = await fetchLaStruckOffPermissions(9, 41);
    expect(p.canApprove).toBe(true);
    expect(p.can_send).toBe(true);
    expect(p.status_id).toBeNull();
  });
});

describe("reports", () => {
  it("struck-off register", async () => {
    fetchMock.mockResolvedValueOnce(ok([{ case_id: 41, case_no: "LA/12/26/0001", warning1_date: "2026-09-01" }]));
    const rows = await fetchLaStruckOffRegister({
      coId: 9,
      branchId: 12,
      dateFrom: "2026-01-01",
      dateTo: "2026-10-11",
      deptId: 4,
    });
    expect(lastCall().url).toContain("/longAbsenteeism/report/struck_off_register?");
    expect(params(lastCall().url).get("dept_id")).toBe("4");
    expect(rows[0].warning1_date).toBe("2026-09-01");
    expect(rows[0].remarks).toBeNull();
  });

  it("stage summary", async () => {
    fetchMock.mockResolvedValueOnce(
      ok({
        by_dept: [{ dept_desc: "WEAVING", counts: { DETECTED: 2, WARNING_1: "1" }, parked: 1, total_live: 3 }],
        exits: [{ exit_reason: "REJOINED", label: "Rejoined", count: 4 }],
        as_on: "2026-10-11",
      }),
    );
    const s = await fetchLaStageSummary({ coId: 9, branchId: 12 });
    expect(s.by_dept[0].counts.WARNING_1).toBe(1);
    expect(s.exits[0].count).toBe(4);
  });

  it("monthly trend defaults to 12 months", async () => {
    fetchMock.mockResolvedValueOnce(ok([{ month: "2026-10", opened: 3, struck_off: 1 }]));
    const rows = await fetchLaMonthlyTrend({ coId: 9, branchId: 12 });
    expect(params(lastCall().url).get("months")).toBe("12");
    expect(rows[0]).toEqual({ month: "2026-10", opened: 3, struck_off: 1, rejoined: 0, other_exits: 0 });
  });
});
