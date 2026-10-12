import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.mock("@/utils/apiClient2", () => ({
  fetchWithCookie: (...args: unknown[]) => fetchMock(...args),
}));
// downloadLaLettersPdf: axios blob GET + file-saver (the fetchExcelBlob pattern)
const axiosGet = vi.fn();
vi.mock("axios", () => ({
  default: {
    get: (...args: unknown[]) => axiosGet(...args),
    isAxiosError: (e: unknown) => Boolean(e && typeof e === "object" && "isAxiosError" in e),
  },
}));
const saveAsMock = vi.fn();
vi.mock("file-saver", () => ({ saveAs: (...args: unknown[]) => saveAsMock(...args) }));

import {
  approveLaStruckOff,
  createLaEvent,
  createLaReceipt,
  defaultLettersPdfName,
  downloadLaLettersPdf,
  fetchLaLettersPrint,
  filenameFromDisposition,
  letterIdsParam,
  recordLaLetter,
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

/** The leave fields a server with the leave module sends on a case / list row. */
const LEAVE_FIELDS = {
  leave_type_id: 24,
  leave_type_name: "STL LEAVE (L)",
  leave_from: "2026-10-08",
  leave_to: "2026-10-24",
  leave_transaction_id: 5001,
  leave_parked: 1,
  pending_leave_since: "2026-10-09",
  esi_stl_result_label: "STL LEAVE (L)",
  on_leave_now: true,
  on_leave_label: "STL LEAVE (L) 08.10.2026 – 24.10.2026 (leave module)",
};

/** What the leave fields read as when an older server sends none of them. */
const NO_LEAVE_FIELDS = {
  leave_type_id: null,
  leave_type_name: null,
  leave_from: null,
  leave_to: null,
  leave_transaction_id: null,
  leave_parked: 0,
  pending_leave_since: null,
  esi_stl_result_label: null,
  on_leave_now: false,
  on_leave_label: null,
};

/** setup.leave_types / leave_options / exit_options of a server with the leave-type master. */
const LEAVE_SETUP = {
  leave_types: [
    { leave_type_id: 24, leave_type_code: "L", leave_type_description: "STL LEAVE", payable: "Y" },
    { leave_type_id: "25", leave_type_code: null, leave_type_description: null, payable: null },
    { leave_type_code: "X", leave_type_description: "no id" },
    "junk",
  ],
  leave_options: [
    { code: "LEAVE", leave_type_id: 24, label: "STL LEAVE (L)", legacy_code: "STL", source: "master" },
    { code: "MATERNITY", leave_type_id: null, label: "Maternity", legacy_code: null, source: "legacy" },
    // no source: inferred; no label: the code
    { code: "LEAVE", leave_type_id: "25" },
    { code: "ESI", label: "On ESI", source: "weird" },
    // dropped: no code / empty code / not an object
    { label: "nameless", leave_type_id: 3 },
    { code: "", label: "empty" },
    null,
  ],
  exit_options: [
    { code: "REJOINED", leave_type_id: null, label: "Rejoined", legacy_code: null, source: "builtin" },
    { code: "LEAVE", leave_type_id: 24, label: "On leave: STL LEAVE (L)", legacy_code: "STL", source: "master" },
    { code: "RESIGNED", label: "Resigned" },
  ],
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

  it("fills the leave lists from the setup payload", async () => {
    fetchMock.mockResolvedValueOnce(ok({ ...SETUP, ...LEAVE_SETUP }));
    const s = await fetchLaSetup(9, 12);
    // Rows without a usable id are dropped; ids and text are coerced.
    expect(s.leave_types).toEqual([
      { leave_type_id: 24, leave_type_code: "L", leave_type_description: "STL LEAVE", payable: "Y" },
      { leave_type_id: 25, leave_type_code: null, leave_type_description: null, payable: null },
    ]);
    expect(s.leave_options).toEqual([
      { code: "LEAVE", leave_type_id: 24, label: "STL LEAVE (L)", legacy_code: "STL", source: "master" },
      { code: "MATERNITY", leave_type_id: null, label: "Maternity", legacy_code: null, source: "legacy" },
      { code: "LEAVE", leave_type_id: 25, label: "LEAVE", legacy_code: null, source: "master" },
      { code: "ESI", leave_type_id: null, label: "On ESI", legacy_code: null, source: "builtin" },
    ]);
    expect(s.exit_options.map((o) => [o.code, o.leave_type_id, o.label, o.source])).toEqual([
      ["REJOINED", null, "Rejoined", "builtin"],
      ["LEAVE", 24, "On leave: STL LEAVE (L)", "master"],
      ["RESIGNED", null, "Resigned", "builtin"],
    ]);
  });

  it("the leave lists are empty arrays when an older server sends none", async () => {
    fetchMock.mockResolvedValueOnce(ok(SETUP));
    const s = await fetchLaSetup(9, 12);
    expect(s.leave_types).toEqual([]);
    expect(s.leave_options).toEqual([]);
    expect(s.exit_options).toEqual([]);
    // ... and so are lists that are not arrays.
    fetchMock.mockResolvedValueOnce(ok({ ...SETUP, leave_types: null, leave_options: "x", exit_options: { a: 1 } }));
    const bad = await fetchLaSetup(9, 12);
    expect(bad.leave_types).toEqual([]);
    expect(bad.leave_options).toEqual([]);
    expect(bad.exit_options).toEqual([]);
  });

  it("a setup with the leave lists is still a setup, and so is one without them", () => {
    expect(isLaSetup({ ...SETUP, ...LEAVE_SETUP })).toBe(true);
    expect(isLaSetup(SETUP)).toBe(true);
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

  it("candidate rows carry the leave fields and the pending request", async () => {
    fetchMock.mockResolvedValueOnce(
      ok([
        {
          eb_id: 5,
          emp_code: "88",
          absent_days: 12,
          pending_leave_since: "2026-10-09",
          leave_transaction_id: "5001",
          leave_type_id: 24,
          leave_type_name: "STL LEAVE (L)",
          leave_from: "2026-10-01",
          leave_to: "2026-10-05",
        },
        { eb_id: 6, emp_code: "89", absent_days: 11 },
      ]),
    );
    const rows = await fetchLaCandidates({ coId: 9, branchId: 12 });
    expect(rows[0]).toMatchObject({
      pending_leave_since: "2026-10-09",
      leave_transaction_id: 5001,
      leave_type_id: 24,
      leave_type_name: "STL LEAVE (L)",
      leave_from: "2026-10-01",
      leave_to: "2026-10-05",
    });
    // Without a leave all of them are null (not undefined).
    expect(rows[1]).toMatchObject({
      pending_leave_since: null,
      leave_transaction_id: null,
      leave_type_id: null,
      leave_type_name: null,
      leave_from: null,
      leave_to: null,
    });
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

  it("keeps the ON_LEAVE band, a leave-module band of the Due-today view", async () => {
    fetchMock.mockResolvedValueOnce(
      ok([
        { ...CASE, status: 2, due_band: "ON_LEAVE", ...LEAVE_FIELDS },
        { ...CASE, due_band: "VERIFY" },
      ]),
    );
    const rows = await fetchLaList({ coId: 9, branchId: 12, view: "due", deptId: null, q: "" });
    expect(rows[0].due_band).toBe("ON_LEAVE");
    expect(rows[0].status).toBe(2);
    // An older server's VERIFY still parses (it is just not shown any more).
    expect(rows[1].due_band).toBe("VERIFY");
    expect(LA_DUE_BANDS).toContain("ON_LEAVE");
    expect(LA_DUE_BANDS.indexOf("ON_LEAVE")).toBeGreaterThan(LA_DUE_BANDS.indexOf("MARKED_PRESENT"));
    expect(LA_DUE_BANDS.indexOf("ON_LEAVE")).toBeLessThan(LA_DUE_BANDS.indexOf("REPLY_REVIEW"));
  });

  it("a list row parses the leave fields", async () => {
    fetchMock.mockResolvedValueOnce(ok([{ ...CASE, due_band: "ON_LEAVE", status: 2, ...LEAVE_FIELDS }]));
    const [r] = await fetchLaList({ coId: 9, branchId: 12, view: "due", deptId: null, q: "" });
    expect(r).toMatchObject(LEAVE_FIELDS);
  });

  it("a list row without the leave fields defaults them (null / 0 / false)", async () => {
    fetchMock.mockResolvedValueOnce(ok([{ ...CASE, due_band: "LETTER_DUE" }]));
    const [r] = await fetchLaList({ coId: 9, branchId: 12, view: "due", deptId: null, q: "" });
    expect(r).toMatchObject(NO_LEAVE_FIELDS);
  });

  it("coerces the leave fields: text numbers, 0 / 1 and 'true' flags", async () => {
    fetchMock.mockResolvedValueOnce(
      ok([
        {
          ...CASE,
          leave_type_id: "24",
          leave_transaction_id: "5001",
          leave_parked: "1",
          on_leave_now: 1,
          pending_leave_since: "2026-10-09",
        },
        { ...CASE, leave_parked: null, on_leave_now: "true" },
        { ...CASE, on_leave_now: 0 },
        { ...CASE, on_leave_now: "no", leave_type_id: "abc", leave_transaction_id: "" },
      ]),
    );
    const rows = await fetchLaList({ coId: 9, branchId: 12, view: "due", deptId: null, q: "" });
    expect(rows[0]).toMatchObject({
      leave_type_id: 24,
      leave_transaction_id: 5001,
      leave_parked: 1,
      on_leave_now: true,
      pending_leave_since: "2026-10-09",
    });
    expect(rows[1]).toMatchObject({ leave_parked: 0, on_leave_now: true });
    expect(rows[2].on_leave_now).toBe(false);
    expect(rows[3]).toMatchObject({ on_leave_now: false, leave_type_id: null, leave_transaction_id: null });
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

describe("a case carries the leave fields", () => {
  it("the case of /get parses them", async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ case: { ...CASE, status: 2, ...LEAVE_FIELDS }, letters: [], events: [], earlier_cases: [] }),
    );
    const d = await fetchLaCase(9, 41);
    expect(d.case).toMatchObject(LEAVE_FIELDS);
  });

  it("the case of /get defaults them when absent", async () => {
    fetchMock.mockResolvedValueOnce(ok({ case: CASE, letters: [], events: [], earlier_cases: [] }));
    const d = await fetchLaCase(9, 41);
    expect(d.case).toMatchObject(NO_LEAVE_FIELDS);
  });

  it("extractCase and the case actions normalise them too", async () => {
    expect(extractCase({ ...CASE, ...LEAVE_FIELDS })).toMatchObject(LEAVE_FIELDS);
    expect(extractCase({ case: CASE })).toMatchObject(NO_LEAVE_FIELDS);
    fetchMock.mockResolvedValueOnce(ok({ ...CASE, leave_parked: "1", on_leave_now: "1" }));
    const parked = await resumeLaCase({ co_id: 9, case_id: 41 });
    expect(parked).toMatchObject({ leave_parked: 1, on_leave_now: true, leave_transaction_id: null });
  });

  it("a case without the leave fields is still a case", () => {
    expect(isLaCase(CASE)).toBe(true);
    expect(isLaCase({ ...CASE, ...LEAVE_FIELDS })).toBe(true);
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

describe("closing a case as on leave", () => {
  it("exit posts the leave type with the reason, the exit date and the expected return", async () => {
    fetchMock.mockResolvedValueOnce(ok({ ...CASE, status: 0, exit_reason: "LEAVE", ...LEAVE_FIELDS }));
    const payload = {
      co_id: 9,
      case_id: 41,
      exit_reason: "LEAVE",
      leave_type_id: 24,
      exit_date: "2026-10-11",
      expected_return_date: "2026-10-24",
      exit_remarks: "Approved leave in the leave module: STL LEAVE (L) 08-10-2026 – 24-10-2026",
    };
    const res = await exitLaCase(payload);
    const { url, method, body } = lastCall();
    expect(url.endsWith("/longAbsenteeism/exit")).toBe(true);
    expect(method).toBe("POST");
    expect(body).toEqual(payload);
    expect((body as { leave_type_id: number }).leave_type_id).toBe(24);
    expect(res.case_id).toBe(41);
    expect(res.leave_type_id).toBe(24);
  });

  it("exit posts a null leave type for a reason that has none, and no expected return for an ended leave", async () => {
    fetchMock.mockResolvedValueOnce(ok(CASE));
    await exitLaCase({
      co_id: 9,
      case_id: 41,
      exit_reason: "LEAVE",
      leave_type_id: null,
      exit_date: "2026-10-11",
      expected_return_date: null,
    });
    expect(lastCall().body).toEqual({
      co_id: 9,
      case_id: 41,
      exit_reason: "LEAVE",
      leave_type_id: null,
      exit_date: "2026-10-11",
      expected_return_date: null,
    });
  });

  it("exit without a leave type leaves the key out (the other reasons)", async () => {
    fetchMock.mockResolvedValueOnce(ok(CASE));
    await exitLaCase({ co_id: 9, case_id: 41, exit_reason: "REJOINED", exit_date: "2026-10-10" });
    expect(lastCall().body).toEqual({ co_id: 9, case_id: 41, exit_reason: "REJOINED", exit_date: "2026-10-10" });
  });

  it("the retired verify call still carries a leave type for an older flow", async () => {
    fetchMock.mockResolvedValueOnce(ok(CASE));
    await verifyLaCase({
      co_id: 9,
      case_id: 41,
      esi_stl_result: "LEAVE",
      leave_type_id: 24,
      timekeeper_confirmed: true,
      habitual: false,
    });
    expect(lastCall().url.endsWith("/longAbsenteeism/verify")).toBe(true);
    expect(lastCall().body).toMatchObject({ esi_stl_result: "LEAVE", leave_type_id: 24 });
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

describe("reprint, PDF and letters issued outside VoWERP (owner 2026-10-12)", () => {
  beforeEach(() => {
    axiosGet.mockReset();
    saveAsMock.mockReset();
  });

  it("a letter carries recorded (0 when the server sends none)", async () => {
    fetchMock.mockResolvedValueOnce(ok([LETTER, { ...LETTER, letter_id: 302, recorded: 1 }]));
    const [a, b] = await fetchLaLetters(9, 41);
    expect(a.recorded).toBe(0);
    expect(b.recorded).toBe(1);
  });

  it("opens a case with a detected date", async () => {
    fetchMock.mockResolvedValueOnce(ok(CASE));
    await openLaCase({ co_id: 9, branch_id: 12, eb_id: 7001, detected_date: "2026-09-30" });
    expect(lastCall().body).toMatchObject({ eb_id: 7001, detected_date: "2026-09-30" });
  });

  it("letter ids keep their order without repeats", () => {
    expect(letterIdsParam([9, 5, 9, 1])).toBe("9,5,1");
  });

  it("loads the letters to reprint in the requested order", async () => {
    fetchMock.mockResolvedValueOnce(
      ok([
        { letter_id: 9, case_id: 41, branch_id: 12, stage_code: "WARNING_2", subject: "S", body: "B9", recorded: 1 },
        { letter_id: 5, case_id: 42, stage_code: "WARNING_1", body: null, issue_date: "2026-09-01" },
      ]),
    );
    const rows = await fetchLaLettersPrint(9, [9, 5, 9]);
    const p = params(lastCall().url);
    expect(lastCall().url).toContain("/longAbsenteeism/letters_print?");
    expect(p.get("co_id")).toBe("9");
    expect(p.get("letter_ids")).toBe("9,5");
    expect(rows.map((r) => r.letter_id)).toEqual([9, 5]);
    expect(rows[0]).toMatchObject({ recorded: 1, branch_id: 12, body: "B9", subject: "S" });
    expect(rows[1]).toMatchObject({ recorded: 0, branch_id: null, body: "", subject: null, issue_date: "2026-09-01" });
  });

  it("rejects a malformed reprint response and passes server errors on", async () => {
    fetchMock.mockResolvedValueOnce(ok([{ letter_id: "x" }]));
    await expect(fetchLaLettersPrint(9, [1])).rejects.toThrow("Unexpected response for letters print");
    fetchMock.mockResolvedValueOnce(fail("Letter not found: 6", 404));
    await expect(fetchLaLettersPrint(9, [6])).rejects.toThrow("Letter not found: 6");
  });

  it("reads the file name of a Content-Disposition header", () => {
    expect(filenameFromDisposition('attachment; filename="long-absenteeism-letters-20261012.pdf"')).toBe(
      "long-absenteeism-letters-20261012.pdf",
    );
    expect(filenameFromDisposition("attachment; filename=a.pdf")).toBe("a.pdf");
    expect(filenameFromDisposition("attachment; filename*=UTF-8''l%20a.pdf")).toBe("l a.pdf");
    expect(filenameFromDisposition(null)).toBeNull();
    expect(filenameFromDisposition("inline")).toBeNull();
    expect(defaultLettersPdfName(new Date(2026, 9, 2))).toBe("long-absenteeism-letters-20261002.pdf");
  });

  it("downloads the PDF as a blob and saves it under the server's file name", async () => {
    const blob = new Blob(["%PDF-1.4"], { type: "application/pdf" });
    axiosGet.mockResolvedValueOnce({
      data: blob,
      headers: { "content-disposition": 'attachment; filename="long-absenteeism-letters-20261012.pdf"' },
    });
    const name = await downloadLaLettersPdf(9, [9, 5]);
    expect(name).toBe("long-absenteeism-letters-20261012.pdf");
    const [url, opts] = axiosGet.mock.calls[0] as [string, { responseType: string; withCredentials: boolean }];
    expect(url).toContain("/longAbsenteeism/letters_pdf?");
    expect(params(url).get("letter_ids")).toBe("9,5");
    expect(opts).toEqual({ responseType: "blob", withCredentials: true });
    expect(saveAsMock).toHaveBeenCalledWith(blob, "long-absenteeism-letters-20261012.pdf");
  });

  it("turns a JSON error inside the blob into the message and saves nothing", async () => {
    axiosGet.mockRejectedValueOnce({
      isAxiosError: true,
      response: { data: new Blob([JSON.stringify({ detail: "Letter not found: 6" })]) },
    });
    await expect(downloadLaLettersPdf(9, [6])).rejects.toThrow("Letter not found: 6");
    axiosGet.mockResolvedValueOnce({ data: new Blob([]), headers: {} });
    await expect(downloadLaLettersPdf(9, [6])).rejects.toThrow("The PDF came back empty");
    await expect(downloadLaLettersPdf(9, [])).rejects.toThrow("Select at least one letter");
    expect(saveAsMock).not.toHaveBeenCalled();
  });

  it("records a letter issued outside VoWERP and returns letter + case", async () => {
    fetchMock.mockResolvedValueOnce(ok({ letter: { ...LETTER, recorded: 1, sent_date: "2026-08-22" }, case: CASE }));
    const payload = {
      co_id: 9,
      case_id: 41,
      stage_code: "WARNING_1",
      issue_date: "2026-08-20",
      sent_date: "2026-08-22",
      dispatch_mode: "REG_POST_AD",
      ad_no: "RA9",
      delivery_status: null,
      delivery_date: null,
      note: "From the register",
    };
    const res = await recordLaLetter(payload);
    expect(lastCall().url.endsWith("/longAbsenteeism/letter_record")).toBe(true);
    expect(lastCall().method).toBe("POST");
    expect(lastCall().body).toEqual(payload);
    expect(res.letter.recorded).toBe(1);
    expect(res.case.case_id).toBe(41);
    fetchMock.mockResolvedValueOnce(ok({ letter: null }));
    await expect(recordLaLetter(payload)).rejects.toThrow("Unexpected response for letter record");
  });
});
