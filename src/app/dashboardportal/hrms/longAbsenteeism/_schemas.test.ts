import { describe, expect, it } from "vitest";
import type { LaCase, LaLetter } from "@/utils/longAbsenteeismService";
import {
  AD_NO_MAX,
  NOTE_MAX,
  RETURN_DATE_REASONS,
  REMARKS_MAX,
  approveIssues,
  batchIssues,
  caseFieldsChanges,
  caseFieldsDefaults,
  caseFieldsIssues,
  cellTextIssue,
  dateIssue,
  dismissIssues,
  eventIssues,
  exitIssues,
  letterIssueIssues,
  letterUpdateChanges,
  letterUpdateDefaults,
  letterUpdateIssues,
  letterRecordDefaults,
  letterRecordIssues,
  letterRecordMinDate,
  letterRecordPayload,
  makeLetterRecordSchema,
  leaveTypeIdOrNull,
  makeBatchSchema,
  makeExitSchema,
  makeLetterIssueSchema,
  makeOpenCaseSchema,
  detectedDateOrNull,
  needsReturnDate,
  noteIssues,
  openCaseIssues,
  parseWholeDays,
  receiptIssues,
  textOrNull,
  verifyDefaults,
  verifyIssues,
  type CaseFieldsFormValues,
  type ExitFormValues,
  type LetterIssueFormValues,
  type LetterUpdateFormValues,
} from "./_schemas";

const TODAY = "2026-10-11";
const paths = (issues: { path: string }[]) => issues.map((i) => i.path);

const CASE = {
  case_id: 41,
  last_working_date: "2026-09-20",
  remarks: "old",
  habitual: 0,
  extra_1: null,
  extra_2: "x",
  extra_3: null,
  extra_4: null,
  extra_5: null,
  esi_stl_result: null,
  timekeeper_confirmed: 1,
  verify_note: null,
} as unknown as LaCase;

const LETTER = {
  letter_id: 301,
  issue_date: "2026-10-06",
  sent_date: null,
  dispatch_mode: "REG_POST_AD",
  ad_no: null,
  delivery_status: null,
  delivery_date: null,
  gate_display_date: null,
  dept_display_date: null,
} as unknown as LaLetter;

describe("dateIssue", () => {
  it("required / valid / future / before-min", () => {
    expect(dateIssue("", "Date", { required: true })).toBe("Date is required");
    expect(dateIssue("", "Date")).toBeNull();
    expect(dateIssue("2026-02-30", "Date")).toBe("Enter a valid date");
    expect(dateIssue("2026-10-12", "Date", { max: TODAY })).toBe("Date cannot be in the future");
    expect(dateIssue("2026-10-01", "Sent date", { min: { date: "2026-10-06", what: "letter date" } })).toBe(
      "Sent date cannot be before the letter date (06-10-2026)",
    );
    expect(dateIssue("2026-10-06", "Date", { max: TODAY, min: { date: "2026-10-06", what: "x" } })).toBeNull();
  });

  it("textOrNull trims", () => {
    expect(textOrNull("  ")).toBeNull();
    expect(textOrNull(" a ")).toBe("a");
  });
});

describe("open case", () => {
  it("needs an EB No only when not opened from a candidate", () => {
    const v = { eb_no: "", last_working_date: "", detected_date: "", remarks: "" };
    expect(paths(openCaseIssues(v, { today: TODAY, needsEbNo: true }))).toEqual(["eb_no"]);
    expect(openCaseIssues(v, { today: TODAY, needsEbNo: false })).toEqual([]);
  });

  it("checks the last working date and remarks length", () => {
    const issues = openCaseIssues(
      { eb_no: "12", last_working_date: "2026-10-20", detected_date: TODAY, remarks: "r".repeat(REMARKS_MAX + 1) },
      { today: TODAY, needsEbNo: true },
    );
    expect(paths(issues)).toEqual(["last_working_date", "remarks"]);
  });

  it("detected on: not in the future, not before the last working date, blank = today", () => {
    const base = { eb_no: "12", last_working_date: "2026-09-20", remarks: "" };
    const ctx = { today: TODAY, needsEbNo: true };
    expect(openCaseIssues({ ...base, detected_date: "2026-09-30" }, ctx)).toEqual([]);
    expect(openCaseIssues({ ...base, detected_date: "" }, ctx)).toEqual([]);
    expect(openCaseIssues({ ...base, detected_date: "2026-10-12" }, ctx)).toEqual([
      { path: "detected_date", message: "Detected on cannot be in the future" },
    ]);
    expect(openCaseIssues({ ...base, detected_date: "2026-09-19" }, ctx)).toEqual([
      { path: "detected_date", message: "Detected on cannot be before the last working date (20-09-2026)" },
    ]);
    // no last working date typed: only the future is refused (the server checks the last day seen)
    expect(openCaseIssues({ ...base, last_working_date: "", detected_date: "2026-01-01" }, ctx)).toEqual([]);
    expect(detectedDateOrNull("2026-09-30", TODAY)).toBe("2026-09-30");
    expect(detectedDateOrNull(TODAY, TODAY)).toBeNull();
    expect(detectedDateOrNull(" ", TODAY)).toBeNull();
  });

  it("schema rejects through zod", () => {
    const schema = makeOpenCaseSchema({ today: TODAY, needsEbNo: true });
    expect(schema.safeParse({ eb_no: "", last_working_date: "", detected_date: "", remarks: "" }).success).toBe(false);
    expect(
      schema.safeParse({ eb_no: "12", last_working_date: "2026-09-20", detected_date: TODAY, remarks: "" }).success,
    ).toBe(true);
  });
});

describe("dismiss", () => {
  it("needs a reason; snooze is whole days 0..365 or blank", () => {
    expect(paths(dismissIssues({ reason: " ", snooze_days: "" }))).toEqual(["reason"]);
    expect(paths(dismissIssues({ reason: "leave", snooze_days: "366" }))).toEqual(["snooze_days"]);
    expect(paths(dismissIssues({ reason: "leave", snooze_days: "2.5" }))).toEqual(["snooze_days"]);
    expect(dismissIssues({ reason: "leave", snooze_days: "0" })).toEqual([]);
    expect(parseWholeDays(" 30 ")).toBe(30);
    expect(parseWholeDays("")).toBeNull();
    expect(parseWholeDays("-1")).toBeNull();
  });
});

describe("verify", () => {
  it("needs the ESI / STL result", () => {
    expect(paths(verifyIssues({ esi_stl_result: "", timekeeper_confirmed: false, habitual: false, note: "" }))).toEqual([
      "esi_stl_result",
    ]);
    expect(verifyIssues({ esi_stl_result: "NONE", timekeeper_confirmed: true, habitual: false, note: "" })).toEqual([]);
  });

  it("defaults from the case", () => {
    expect(verifyDefaults(CASE)).toEqual({ esi_stl_result: "", timekeeper_confirmed: true, habitual: false, note: "" });
  });
});

describe("timeline entry", () => {
  const base = { event_date: "2026-10-10", channel: "", contact_name: "", text: "said ok", park: true };

  it("date within the case and not in the future; text required", () => {
    const ctx = { eventType: "REMARK" as const, today: TODAY, minDate: "2026-10-05" };
    expect(eventIssues(base, ctx)).toEqual([]);
    expect(paths(eventIssues({ ...base, event_date: "2026-10-01" }, ctx))).toEqual(["event_date"]);
    expect(paths(eventIssues({ ...base, event_date: "2026-10-12", text: " " }, ctx))).toEqual(["event_date", "text"]);
  });

  it("reply: contact length checked, message names the reply", () => {
    const ctx = { eventType: "REPLY" as const, today: TODAY, minDate: null };
    const issues = eventIssues({ ...base, text: "", contact_name: "c".repeat(101) }, ctx);
    expect(issues).toEqual([
      { path: "text", message: "Describe the reply" },
      { path: "contact_name", message: "Cannot exceed 100 characters" },
    ]);
  });
});

describe("note", () => {
  it("required or optional, max 500", () => {
    expect(paths(noteIssues({ note: " " }, true))).toEqual(["note"]);
    expect(noteIssues({ note: "" }, false)).toEqual([]);
    expect(paths(noteIssues({ note: "n".repeat(501) }, false))).toEqual(["note"]);
  });
});

describe("exit", () => {
  const v = (x: Partial<ExitFormValues>): ExitFormValues => ({
    exit_reason: "ESI",
    leave_type_id: "",
    exit_date: "2026-10-10",
    exit_remarks: "",
    expected_return_date: "",
    ...x,
  });
  const ctx = { today: TODAY, minDate: "2026-09-20" };

  it("reason + date in range", () => {
    expect(exitIssues(v({}), ctx)).toEqual([]);
    expect(paths(exitIssues(v({ exit_reason: "", exit_date: "" }), ctx))).toEqual(["exit_reason", "exit_date"]);
    expect(paths(exitIssues(v({ exit_date: "2026-09-01" }), ctx))).toEqual(["exit_date"]);
  });

  it("expected return only for ESI / STL / MATERNITY / MEDICAL / LEAVE, not before the exit", () => {
    expect(needsReturnDate("ESI")).toBe(true);
    expect(needsReturnDate("RESIGNED")).toBe(false);
    expect(paths(exitIssues(v({ expected_return_date: "2026-10-01" }), ctx))).toEqual(["expected_return_date"]);
    // Ignored for a reason without a return date.
    expect(exitIssues(v({ exit_reason: "RESIGNED", expected_return_date: "2026-10-01" }), ctx)).toEqual([]);
    expect(makeExitSchema(ctx).safeParse(v({ expected_return_date: "2026-11-01" })).success).toBe(true);
  });

  it("the return-date reasons are the leave-like ones, LEAVE included", () => {
    expect([...RETURN_DATE_REASONS].sort()).toEqual(["ESI", "LEAVE", "MATERNITY", "MEDICAL", "STL"]);
    expect(needsReturnDate("LEAVE")).toBe(true);
    for (const reason of ["REJOINED", "RESIGNED", "EXPIRED", "OTHER", ""]) expect(needsReturnDate(reason)).toBe(false);
  });

  it("reason LEAVE needs the leave type (the master type), with the message the dialog shows", () => {
    expect(exitIssues(v({ exit_reason: "LEAVE" }), ctx)).toEqual([
      { path: "leave_type_id", message: "Pick the leave type" },
    ]);
    // Blank-looking text is no leave type.
    expect(paths(exitIssues(v({ exit_reason: "LEAVE", leave_type_id: "  " }), ctx))).toEqual(["leave_type_id"]);
    expect(exitIssues(v({ exit_reason: "LEAVE", leave_type_id: "24" }), ctx)).toEqual([]);
    // Through zod too.
    const schema = makeExitSchema(ctx);
    expect(schema.safeParse(v({ exit_reason: "LEAVE" })).success).toBe(false);
    expect(schema.safeParse(v({ exit_reason: "LEAVE", leave_type_id: "24" })).success).toBe(true);
  });

  it("no reason means no leave-type complaint: the reason is the one reported", () => {
    expect(exitIssues(v({ exit_reason: "", leave_type_id: "" }), ctx)).toEqual([
      { path: "exit_reason", message: "Pick the reason" },
    ]);
  });

  it("only LEAVE needs a leave type: the legacy codes and the other reasons pass without one", () => {
    for (const reason of ["STL", "ESI", "MATERNITY", "MEDICAL", "REJOINED", "RESIGNED"]) {
      expect(exitIssues(v({ exit_reason: reason, leave_type_id: "" }), ctx)).toEqual([]);
    }
  });

  it("LEAVE accepts an expected return date, but not one before the exit date", () => {
    const leave = { exit_reason: "LEAVE", leave_type_id: "24" };
    expect(exitIssues(v({ ...leave, expected_return_date: "2026-10-24" }), ctx)).toEqual([]);
    expect(exitIssues(v({ ...leave, expected_return_date: "2026-10-10" }), ctx)).toEqual([]);
    expect(exitIssues(v({ ...leave, expected_return_date: "" }), ctx)).toEqual([]);
    expect(exitIssues(v({ ...leave, expected_return_date: "2026-10-09" }), ctx)).toEqual([
      { path: "expected_return_date", message: "Expected return date cannot be before the exit date (10-10-2026)" },
    ]);
    expect(exitIssues(v({ ...leave, expected_return_date: "2026-02-30" }), ctx)).toEqual([
      { path: "expected_return_date", message: "Enter a valid date" },
    ]);
    expect(makeExitSchema(ctx).safeParse(v({ ...leave, expected_return_date: "2026-10-24" })).success).toBe(true);
  });

  it("reports the leave type and the other fields together", () => {
    expect(
      paths(exitIssues(v({ exit_reason: "LEAVE", exit_date: "2026-09-01", exit_remarks: "r".repeat(501) }), ctx)),
    ).toEqual(["leave_type_id", "exit_date", "exit_remarks"]);
  });
});

describe("leaveTypeIdOrNull", () => {
  it("reads a positive whole number, trimmed", () => {
    expect(leaveTypeIdOrNull("24")).toBe(24);
    expect(leaveTypeIdOrNull(" 7 ")).toBe(7);
  });

  it("blank, zero, negative, fractional and non-numeric text are no leave type", () => {
    for (const bad of ["", "   ", "0", "-3", "2.5", "abc", "12abc", "NaN"]) {
      expect(leaveTypeIdOrNull(bad)).toBeNull();
    }
  });
});

describe("letter dispatch update", () => {
  const ctx = { today: TODAY, issueDate: "2026-10-06" };
  const v = (x: Partial<LetterUpdateFormValues>): LetterUpdateFormValues => ({
    ...letterUpdateDefaults(LETTER, TODAY),
    ...x,
  });

  it("defaults the sent date to today (not before the letter)", () => {
    expect(letterUpdateDefaults(LETTER, TODAY).sent_date).toBe(TODAY);
    expect(letterUpdateDefaults(LETTER, "2026-10-01").sent_date).toBe("2026-10-06");
    expect(letterUpdateDefaults({ ...LETTER, sent_date: "2026-10-07" } as LaLetter, TODAY).sent_date).toBe("2026-10-07");
  });

  it("sent date between the letter date and today; delivery not before sent", () => {
    expect(letterUpdateIssues(v({}), ctx)).toEqual([]);
    expect(paths(letterUpdateIssues(v({ sent_date: "2026-10-05" }), ctx))).toEqual(["sent_date"]);
    expect(paths(letterUpdateIssues(v({ sent_date: "2026-10-08", delivery_date: "2026-10-07" }), ctx))).toEqual([
      "delivery_date",
    ]);
    expect(paths(letterUpdateIssues(v({ gate_display_date: "2026-10-12", ad_no: "a".repeat(51) }), ctx))).toEqual([
      "ad_no",
      "gate_display_date",
    ]);
  });

  it("sends only the changed fields, blanks as null", () => {
    expect(letterUpdateChanges(LETTER, v({}))).toEqual({ sent_date: TODAY });
    expect(letterUpdateChanges(LETTER, v({ sent_date: "", dispatch_mode: "", ad_no: " RL123 " }))).toEqual({
      dispatch_mode: null,
      ad_no: "RL123",
    });
    expect(letterUpdateChanges({ ...LETTER, sent_date: "2026-10-07" } as LaLetter, v({ sent_date: "2026-10-07" }))).toEqual({});
  });
});

describe("union receipt", () => {
  it("union required; date not before the notice", () => {
    const ctx = { today: TODAY, minDate: "2026-10-06" };
    expect(paths(receiptIssues({ union_name: " ", received_by: "", received_date: "", remarks: "" }, ctx))).toEqual([
      "union_name",
    ]);
    expect(
      paths(receiptIssues({ union_name: "INTUC", received_by: "", received_date: "2026-10-01", remarks: "" }, ctx)),
    ).toEqual(["received_date"]);
    expect(receiptIssues({ union_name: "INTUC", received_by: "X", received_date: TODAY, remarks: "" }, ctx)).toEqual([]);
  });
});

describe("case fields", () => {
  const values = (x: Partial<CaseFieldsFormValues>): CaseFieldsFormValues => ({ ...caseFieldsDefaults(CASE), ...x });

  it("limits text and needs a valid date only with edit", () => {
    expect(caseFieldsIssues(values({ last_working_date: "" }), { today: TODAY, canEditDate: false })).toEqual([]);
    expect(paths(caseFieldsIssues(values({ last_working_date: "" }), { today: TODAY, canEditDate: true }))).toEqual([
      "last_working_date",
    ]);
    expect(paths(caseFieldsIssues(values({ extra_3: "e".repeat(201) }), { today: TODAY, canEditDate: false }))).toEqual([
      "extra_3",
    ]);
  });

  it("diffs against the case", () => {
    expect(caseFieldsChanges(CASE, values({}), true)).toEqual({});
    expect(
      caseFieldsChanges(CASE, values({ remarks: " new ", extra_2: "", habitual: true, last_working_date: "2026-09-18" }), true),
    ).toEqual({ remarks: "new", extra_2: null, habitual: true, last_working_date: "2026-09-18" });
    // Without edit the date never goes out.
    expect(caseFieldsChanges(CASE, values({ last_working_date: "2026-09-18" }), false)).toEqual({});
  });

  it("validates inline grid cells", () => {
    expect(cellTextIssue("remarks", "r".repeat(1000))).toBeNull();
    expect(cellTextIssue("remarks", "r".repeat(1001))).toBe("Cannot exceed 1000 characters");
    expect(cellTextIssue("extra_1", "e".repeat(201))).toBe("Cannot exceed 200 characters");
  });
});

describe("letter issue", () => {
  const v = (x: Partial<LetterIssueFormValues>): LetterIssueFormValues => ({
    dispatch_mode: "",
    force: false,
    force_reason: "",
    ...x,
  });

  it("an issuable letter needs nothing: the text is the template, not a form field", () => {
    const ctx = { blockedReason: null, canForce: true };
    expect(letterIssueIssues(v({}), ctx)).toEqual([]);
    expect(letterIssueIssues(v({ dispatch_mode: "HAND" }), ctx)).toEqual([]);
    // only timing / dispatch are in the form (owner 2026-10-11: letters are not edited by hand)
    expect(Object.keys(v({})).sort()).toEqual(["dispatch_mode", "force", "force_reason"]);
    expect(makeLetterIssueSchema(ctx).safeParse(v({})).success).toBe(true);
  });

  it("blocked: force + reason with edit, impossible without", () => {
    const forceable = { blockedReason: "Due on 16.10.2026", canForce: true };
    expect(paths(letterIssueIssues(v({}), forceable))).toEqual(["force"]);
    expect(paths(letterIssueIssues(v({ force: true }), forceable))).toEqual(["force_reason"]);
    expect(letterIssueIssues(v({ force: true, force_reason: "posted by hand" }), forceable)).toEqual([]);
    const hard = { blockedReason: "This case is parked", canForce: false };
    expect(letterIssueIssues(v({ force: true, force_reason: "x" }), hard)).toEqual([
      { path: "force", message: "This case is parked" },
    ]);
    expect(makeLetterIssueSchema(forceable).safeParse(v({ force: true, force_reason: "r" })).success).toBe(true);
  });
});

describe("approve / batch", () => {
  it("struck-off date required, not before the gate notice, not future", () => {
    expect(approveIssues({ struck_off_date: "" }, TODAY, null)).toHaveLength(1);
    expect(approveIssues({ struck_off_date: "2026-10-01" }, TODAY, "2026-10-02")).toHaveLength(1);
    expect(approveIssues({ struck_off_date: TODAY }, TODAY, "2026-10-02")).toEqual([]);
  });

  it("batch needs at least one case", () => {
    expect(batchIssues({ case_ids: [], dispatch_mode: "" })).toHaveLength(1);
    expect(makeBatchSchema().safeParse({ case_ids: [3], dispatch_mode: "" }).success).toBe(true);
    expect(makeBatchSchema().safeParse({ case_ids: [], dispatch_mode: "" }).success).toBe(false);
  });
});

describe("letter issued outside VoWERP (back-dated entry)", () => {
  const blank = letterRecordDefaults("REG_POST_AD");
  const ctx = { today: TODAY, minDate: { date: "2026-09-20", what: "last working date" } };

  it("the earliest letter date is the later of the last working date and the latest letter", () => {
    const c = { last_working_date: "2026-09-20" };
    expect(letterRecordMinDate(c, [])).toEqual({ date: "2026-09-20", what: "last working date" });
    expect(
      letterRecordMinDate(c, [
        { stage_code: "WARNING_1", issue_date: "2026-09-25" },
        { stage_code: "WARNING_2", issue_date: "2026-10-05" },
      ]),
    ).toEqual({ date: "2026-10-05", what: "previous letter's date" });
    expect(letterRecordMinDate(c, [{ stage_code: "WARNING_1", issue_date: "2026-09-01" }])).toEqual({
      date: "2026-09-20",
      what: "last working date",
    });
    expect(letterRecordMinDate({ last_working_date: "" }, [])).toBeNull();
  });

  it("needs the letter date, within the case's dates; sent / delivery follow it", () => {
    expect(blank).toEqual({
      issue_date: "",
      sent_date: "",
      dispatch_mode: "REG_POST_AD",
      ad_no: "",
      delivery_status: "",
      delivery_date: "",
      note: "",
    });
    expect(letterRecordIssues(blank, ctx)).toEqual([{ path: "issue_date", message: "Letter date is required" }]);
    expect(paths(letterRecordIssues({ ...blank, issue_date: "2026-09-19" }, ctx))).toEqual(["issue_date"]);
    expect(paths(letterRecordIssues({ ...blank, issue_date: "2026-10-12" }, ctx))).toEqual(["issue_date"]);
    expect(letterRecordIssues({ ...blank, issue_date: "2026-09-25", sent_date: "2026-09-24" }, ctx)).toEqual([
      { path: "sent_date", message: "Sent date cannot be before the letter date (25-09-2026)" },
    ]);
    expect(
      paths(letterRecordIssues({ ...blank, issue_date: "2026-09-25", sent_date: "2026-09-27", delivery_date: "2026-09-26" }, ctx)),
    ).toEqual(["delivery_date"]);
    expect(
      paths(
        letterRecordIssues(
          { ...blank, issue_date: "2026-09-25", ad_no: "x".repeat(AD_NO_MAX + 1), note: "n".repeat(NOTE_MAX + 1) },
          ctx,
        ),
      ),
    ).toEqual(["ad_no", "note"]);
    expect(
      letterRecordIssues({ ...blank, issue_date: "2026-09-25", sent_date: "2026-09-26", delivery_date: "2026-10-01" }, ctx),
    ).toEqual([]);
    expect(makeLetterRecordSchema(ctx).safeParse({ ...blank, issue_date: "2026-09-25" }).success).toBe(true);
    expect(makeLetterRecordSchema(ctx).safeParse(blank).success).toBe(false);
  });

  it("builds the POST body (blank -> null; no A.D. / delivery on the gate notice)", () => {
    const v = {
      ...blank,
      issue_date: " 2026-09-25 ",
      sent_date: "2026-09-26",
      ad_no: " RA1 ",
      delivery_status: "DELIVERED",
      delivery_date: "2026-09-28",
      note: " from register ",
    };
    expect(letterRecordPayload(9, 41, "WARNING_1", v)).toEqual({
      co_id: 9,
      case_id: 41,
      stage_code: "WARNING_1",
      issue_date: "2026-09-25",
      sent_date: "2026-09-26",
      dispatch_mode: "REG_POST_AD",
      ad_no: "RA1",
      delivery_status: "DELIVERED",
      delivery_date: "2026-09-28",
      note: "from register",
    });
    expect(letterRecordPayload(9, 41, "GATE_NOTICE", { ...v, dispatch_mode: "GATE_BOARD" })).toMatchObject({
      dispatch_mode: "GATE_BOARD",
      ad_no: null,
      delivery_status: null,
      delivery_date: null,
    });
  });
});
