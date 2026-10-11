/**
 * Rules of the FE-2 tab forms: Settings (the rule), Templates (subject /
 * body / unknown placeholders, caret insert, preview stage), the preview
 * case number and the Dispatch / register date-range filters.
 */
import { describe, expect, it } from "vitest";
import type { LaRule } from "@/utils/longAbsenteeismService";
import {
  daysBetween,
  dispatchFilterIssues,
  excludePrefixesIssue,
  fieldErrors,
  insertAtCaret,
  makeDispatchFilterSchema,
  makeSettingsSchema,
  makeTemplateSchema,
  previewCaseIssues,
  previewStageFor,
  rangeIssues,
  settingsDefaults,
  settingsIssues,
  settingsPayload,
  templateIssues,
  unknownPlaceholders,
  type SettingsFormValues,
} from "./_tabsSchemas";

const RULE: LaRule = {
  co_id: 9,
  detect_days: 10,
  lookback_days: 90,
  wait_w2_days: 10,
  wait_w3_days: 10,
  wait_sc_days: 15,
  sc_reply_days: 3,
  notice_reply_days: 7,
  dismiss_snooze_days: 30,
  exclude_prefixes: "T,C,R,L",
  exclude_t_codes: 1,
  clause_text: "Clause 14(C)(V)",
  signatory: "Personnel Manager",
  extra_1_label: "Union",
  extra_2_label: null,
  extra_3_label: null,
  extra_4_label: null,
  extra_5_label: null,
};

const paths = (issues: { path: string }[]) => issues.map((i) => i.path);

describe("settings", () => {
  const base = (): SettingsFormValues => settingsDefaults(RULE);

  it("defaults from the rule: days as text, the prefixes as text, null texts blank", () => {
    const v = base();
    expect(v.detect_days).toBe("10");
    expect(v.notice_reply_days).toBe("7");
    expect(v.exclude_prefixes).toBe("T,C,R,L");
    expect("exclude_t_codes" in v).toBe(false);
    expect(settingsDefaults({ ...RULE, exclude_prefixes: null }).exclude_prefixes).toBe("");
    expect(v.extra_1_label).toBe("Union");
    expect(v.extra_2_label).toBe("");
    expect(settingsIssues(v)).toEqual([]);
  });

  it("detect days 1..365, the others 0..365, whole days only", () => {
    expect(paths(settingsIssues({ ...base(), detect_days: "0" }))).toEqual(["detect_days"]);
    expect(paths(settingsIssues({ ...base(), wait_w2_days: "0" }))).toEqual([]);
    expect(paths(settingsIssues({ ...base(), wait_w3_days: "366" }))).toEqual(["wait_w3_days"]);
    expect(paths(settingsIssues({ ...base(), sc_reply_days: "2.5" }))).toEqual(["sc_reply_days"]);
    expect(paths(settingsIssues({ ...base(), dismiss_snooze_days: "" }))).toEqual(["dismiss_snooze_days"]);
    expect(paths(settingsIssues({ ...base(), notice_reply_days: "-1" }))).toEqual(["notice_reply_days"]);
    // look back alone goes up to 3650
    expect(settingsIssues({ ...base(), lookback_days: "3650" })).toEqual([]);
    expect(settingsIssues({ ...base(), lookback_days: "3651" })).toEqual([
      { path: "lookback_days", message: "Enter whole days between 0 and 3650" },
    ]);
  });

  it("look back is 0 (no limit) or at least the detect days", () => {
    const issues = settingsIssues({ ...base(), detect_days: "30", lookback_days: "20" });
    expect(issues).toEqual([{ path: "lookback_days", message: "Use 0 (no limit) or at least the detection days (30)" }]);
    expect(settingsIssues({ ...base(), detect_days: "30", lookback_days: "30" })).toEqual([]);
    expect(settingsIssues({ ...base(), detect_days: "30", lookback_days: "0" })).toEqual([]);
    expect(settingsIssues({ ...base(), detect_days: "365", lookback_days: "0" })).toEqual([]);
    expect(settingsPayload(9, { ...base(), lookback_days: "0" }).lookback_days).toBe(0);
  });

  it("text limits: clause 500, signatory 100, extra labels 50", () => {
    expect(paths(settingsIssues({ ...base(), clause_text: "x".repeat(501) }))).toEqual(["clause_text"]);
    expect(paths(settingsIssues({ ...base(), signatory: "x".repeat(101) }))).toEqual(["signatory"]);
    expect(paths(settingsIssues({ ...base(), extra_5_label: "x".repeat(51) }))).toEqual(["extra_5_label"]);
    expect(settingsIssues({ ...base(), extra_5_label: "x".repeat(50) })).toEqual([]);
  });

  it("excluded EB prefixes: blank = default, letters / commas / spaces, one letter each, max 50", () => {
    for (const ok of ["", "  ", "T,C,R,L", "t c r l", " T , C ", "T,,C", "L"]) {
      expect(excludePrefixesIssue(ok)).toBeNull();
      expect(settingsIssues({ ...base(), exclude_prefixes: ok })).toEqual([]);
    }
    expect(excludePrefixesIssue("T,1")).toBe("Use letters, commas and spaces only");
    expect(excludePrefixesIssue("T;C")).toBe("Use letters, commas and spaces only");
    expect(excludePrefixesIssue("T,é")).toBe("Use letters, commas and spaces only");
    expect(excludePrefixesIssue("TX,C")).toBe("One letter per prefix, comma separated (e.g. T,C,R,L)");
    expect(excludePrefixesIssue("T,".repeat(25) + "C")).toBe("Cannot exceed 50 characters");
    expect(settingsIssues({ ...base(), exclude_prefixes: "T-C" })).toEqual([
      { path: "exclude_prefixes", message: "Use letters, commas and spaces only" },
    ]);
  });

  it("the payload sends whole days and blank texts as null, prefixes as typed", () => {
    const p = settingsPayload(9, { ...base(), wait_sc_days: " 20 ", exclude_prefixes: " t, c ", signatory: "  " });
    expect(p).not.toHaveProperty("exclude_t_codes");
    expect(settingsPayload(9, { ...base(), exclude_prefixes: "  " }).exclude_prefixes).toBeNull();
    expect(p).toMatchObject({
      co_id: 9,
      detect_days: 10,
      wait_sc_days: 20,
      exclude_prefixes: "t, c",
      signatory: null,
      clause_text: "Clause 14(C)(V)",
      extra_1_label: "Union",
      extra_2_label: null,
    });
  });

  it("the zod schema carries the issues to react-hook-form", () => {
    const schema = makeSettingsSchema();
    expect(schema.safeParse(base()).success).toBe(true);
    const bad = schema.safeParse({ ...base(), detect_days: "0" });
    expect(bad.success).toBe(false);
    expect(fieldErrors<keyof SettingsFormValues>(bad).detect_days).toMatch(/between 1 and 365/);
    const badPrefixes = schema.safeParse({ ...base(), exclude_prefixes: "TC" });
    expect(fieldErrors<keyof SettingsFormValues>(badPrefixes).exclude_prefixes).toMatch(/One letter per prefix/);
  });
});

describe("templates", () => {
  const known = ["name", "eb_no", "letter_date", "previous_notices"];

  it("lists unknown placeholders once, in order", () => {
    expect(unknownPlaceholders("{name} {nmae} {} {nmae} {eb_no} {x y}", known)).toEqual(["nmae", "", "x y"]);
    expect(unknownPlaceholders("{name}\n{letter_date}", known)).toEqual([]);
    // A brace pair across a line break is not a token (same as the backend).
    expect(unknownPlaceholders("{na\nme}", known)).toEqual([]);
  });

  it("subject <= 300, body required and <= 20000, unknown tokens by name", () => {
    expect(templateIssues({ subject: "S", body: "Dear {name}" }, { placeholders: known })).toEqual([]);
    expect(paths(templateIssues({ subject: "x".repeat(301), body: "B" }, { placeholders: [] }))).toEqual(["subject"]);
    expect(templateIssues({ subject: "", body: "  " }, { placeholders: [] })).toEqual([
      { path: "body", message: "The letter text is required" },
    ]);
    expect(paths(templateIssues({ subject: "", body: "x".repeat(20001) }, { placeholders: [] }))).toEqual(["body"]);
    expect(templateIssues({ subject: "{subj}", body: "{name} {nam}" }, { placeholders: known })).toEqual([
      { path: "subject", message: "Unknown placeholder {subj}" },
      { path: "body", message: "Unknown placeholder {nam}" },
    ]);
    // Without a placeholder list the token check is left to the backend.
    expect(templateIssues({ subject: "", body: "{anything}" }, { placeholders: [] })).toEqual([]);
    expect(makeTemplateSchema({ placeholders: known }).safeParse({ subject: "", body: "{bad}" }).success).toBe(false);
  });

  it("inserts a token at the caret / over the selection", () => {
    expect(insertAtCaret("Dear ,", 5, 5, "{name}")).toEqual({ text: "Dear {name},", caret: 11 });
    expect(insertAtCaret("Dear XXX,", 5, 8, "{name}")).toEqual({ text: "Dear {name},", caret: 11 });
    // Unknown caret: appended at the end; out-of-range positions are clamped.
    expect(insertAtCaret("abc", null, null, "{x}")).toEqual({ text: "abc{x}", caret: 6 });
    expect(insertAtCaret("abc", 99, 120, "{x}")).toEqual({ text: "abc{x}", caret: 6 });
    expect(insertAtCaret("abc", -4, 1, "{x}")).toEqual({ text: "{x}bc", caret: 3 });
  });

  it("previews each template as its letter stage", () => {
    // one template per warning (owner 2026-10-11): WARNING_n previews the n-th warning
    expect(previewStageFor("WARNING_1")).toBe("WARNING_1");
    expect(previewStageFor("WARNING_2")).toBe("WARNING_2");
    expect(previewStageFor("WARNING_3")).toBe("WARNING_3");
    expect(previewStageFor("SHOW_CAUSE")).toBe("SHOW_CAUSE");
    expect(previewStageFor("GATE_NOTICE")).toBe("GATE_NOTICE");
    expect(previewStageFor("STRUCK_OFF_MEMO")).toBe("STRUCK_OFF");
  });

  it("the preview needs a case number", () => {
    expect(previewCaseIssues({ case_no: " " })).toEqual([{ path: "case_no", message: "Enter a case number" }]);
    expect(paths(previewCaseIssues({ case_no: "x".repeat(31) }))).toEqual(["case_no"]);
    expect(previewCaseIssues({ case_no: "LA/12/26/0001" })).toEqual([]);
  });
});

describe("date-range filters", () => {
  it("counts days between ISO dates", () => {
    expect(daysBetween("2026-10-01", "2026-10-11")).toBe(10);
    expect(Number.isNaN(daysBetween("2026-13-01", "2026-10-11"))).toBe(true);
  });

  it("needs both dates, in order, at most 1100 days apart", () => {
    expect(rangeIssues({ date_from: "2026-09-11", date_to: "2026-10-11" })).toEqual([]);
    expect(paths(rangeIssues({ date_from: "", date_to: "2026-10-11" }))).toEqual(["date_from"]);
    expect(paths(rangeIssues({ date_from: "2026-10-11", date_to: "11-10-2026" }))).toEqual(["date_to"]);
    expect(rangeIssues({ date_from: "2026-10-12", date_to: "2026-10-11" })).toEqual([
      { path: "date_from", message: "From date cannot be after the to date" },
    ]);
    expect(paths(rangeIssues({ date_from: "2023-01-01", date_to: "2026-10-11" }))).toEqual(["date_from"]);
  });

  it("dispatch filter: batch ref <= 30 characters", () => {
    const ok = { date_from: "2026-09-11", date_to: "2026-10-11", stage_code: "", batch_ref: "B20261011-1030-5" };
    expect(dispatchFilterIssues(ok)).toEqual([]);
    expect(paths(dispatchFilterIssues({ ...ok, batch_ref: "x".repeat(31) }))).toEqual(["batch_ref"]);
    const parsed = makeDispatchFilterSchema().safeParse({ ...ok, date_to: "" });
    expect(fieldErrors(parsed)).toEqual({ date_to: "To date is required" });
    expect(fieldErrors(makeDispatchFilterSchema().safeParse(ok))).toEqual({});
  });
});
