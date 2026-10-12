/**
 * Zod schemas of the FE-2 tabs (Dispatch / Reports filters, Templates,
 * Settings). Same pattern as _schemas.ts: each form has a pure `*Issues()`
 * function (the rules, unit-tested in _tabsSchemas.test.ts) and a schema
 * factory that feeds those issues to react-hook-form through zodResolver (or
 * to `safeParse` for the filter bars). The rules mirror the backend's checks
 * in long_absenteeism_letters.py (clean_rule, template_save, _report_range);
 * the backend stays the authority and its 400 messages are shown inline.
 */

import { z } from "zod";
import { isIsoDate, type FieldIssue } from "@/components/lowPerformerFollowup/schemas";
import type { LaRule, LaRuleSavePayload } from "@/utils/longAbsenteeismService";
import { BODY_MAX, SUBJECT_MAX, parseWholeDays, textOrNull } from "./_schemas";

/** long_absenteeism_letters.py MAX_RULE_DAYS / MAX_LOOKBACK_DAYS / MAX_RANGE_DAYS / MAX_BATCH_REF; case_no column size. */
export const RULE_DAYS_MAX = 365;
/** lookback_days: 0 = no limit (the default), else detect days .. 3650 (amendment 11.18). */
export const LOOKBACK_DAYS_MAX = 3650;
export const RANGE_DAYS_MAX = 1100;
export const BATCH_REF_MAX = 30;
export const CASE_NO_MAX = 30;

/** Turns a list of field issues into zod issues (one superRefine per schema). */
function addIssues<P extends string>(issues: FieldIssue<P>[], ctx: z.RefinementCtx): void {
  for (const issue of issues) ctx.addIssue({ code: "custom", path: [issue.path], message: issue.message });
}

/** Whole days between two ISO dates (to - from); NaN for a bad date. */
export function daysBetween(from: string, to: string): number {
  if (!isIsoDate(from) || !isIsoDate(to)) return Number.NaN;
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

// ─── Date range filters (Dispatch, Struck-off register) ──────────────

export interface RangeFormValues {
  date_from: string;
  date_to: string;
}

/** Both dates required and valid, from <= to, at most RANGE_DAYS_MAX days apart. */
export function rangeIssues(v: RangeFormValues): FieldIssue<keyof RangeFormValues>[] {
  const issues: FieldIssue<keyof RangeFormValues>[] = [];
  const from = v.date_from.trim();
  const to = v.date_to.trim();
  if (!from) issues.push({ path: "date_from", message: "From date is required" });
  else if (!isIsoDate(from)) issues.push({ path: "date_from", message: "Enter a valid date" });
  if (!to) issues.push({ path: "date_to", message: "To date is required" });
  else if (!isIsoDate(to)) issues.push({ path: "date_to", message: "Enter a valid date" });
  if (issues.length === 0) {
    const days = daysBetween(from, to);
    if (days < 0) issues.push({ path: "date_from", message: "From date cannot be after the to date" });
    else if (days > RANGE_DAYS_MAX) {
      issues.push({ path: "date_from", message: `The range may cover at most ${RANGE_DAYS_MAX} days` });
    }
  }
  return issues;
}

export function makeRangeSchema() {
  return z
    .object({ date_from: z.string(), date_to: z.string() })
    .superRefine((v, zctx) => addIssues(rangeIssues(v), zctx));
}

export interface DispatchFilterValues extends RangeFormValues {
  /** "" = every letter stage. */
  stage_code: string;
  /** "" = every batch. */
  batch_ref: string;
}

export function dispatchFilterIssues(v: DispatchFilterValues): FieldIssue<keyof DispatchFilterValues>[] {
  const issues: FieldIssue<keyof DispatchFilterValues>[] = [...rangeIssues(v)];
  if (v.batch_ref.trim().length > BATCH_REF_MAX) {
    issues.push({ path: "batch_ref", message: `Cannot exceed ${BATCH_REF_MAX} characters` });
  }
  return issues;
}

export function makeDispatchFilterSchema() {
  return z
    .object({ date_from: z.string(), date_to: z.string(), stage_code: z.string(), batch_ref: z.string() })
    .superRefine((v, zctx) => addIssues(dispatchFilterIssues(v), zctx));
}

/** First message per field of a failed safeParse (filter bars show them as helper text). */
export function fieldErrors<K extends string>(
  result: { success: true } | { success: false; error: z.ZodError },
): Partial<Record<K, string>> {
  if (result.success) return {};
  const out: Partial<Record<K, string>> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "") as K;
    if (key && out[key] == null) out[key] = issue.message;
  }
  return out;
}

// ─── Settings (the company's rule) ───────────────────────────────────

/** The day fields of the rule, in form order. */
export const RULE_DAY_FIELDS = [
  "detect_days",
  "lookback_days",
  "wait_w2_days",
  "wait_w3_days",
  "wait_sc_days",
  "sc_reply_days",
  "notice_reply_days",
  "dismiss_snooze_days",
] as const;
export type RuleDayField = (typeof RULE_DAY_FIELDS)[number];

/** Max length of the rule's text fields (long_absenteeism_common.py RULE_TEXT_FIELDS). */
export const RULE_TEXT_LIMITS = Object.freeze({
  clause_text: 500,
  signatory: 100,
  extra_1_label: 50,
  extra_2_label: 50,
  extra_3_label: 50,
  extra_4_label: 50,
  extra_5_label: 50,
  exclude_prefixes: 50,
});
export type RuleTextField = keyof typeof RULE_TEXT_LIMITS;
export const RULE_TEXT_FIELDS = Object.keys(RULE_TEXT_LIMITS) as RuleTextField[];

/** The code default of exclude_prefixes (long_absenteeism_common.py RULE_DEFAULTS). */
export const EXCLUDE_PREFIXES_DEFAULT = "T,C,R,L";

/**
 * Excluded EB prefixes (amendment 11.17), mirroring the backend's
 * clean_exclude_prefixes: blank = the default; otherwise only ASCII letters,
 * commas and spaces, one letter per prefix. Returns the message or null.
 */
export function excludePrefixesIssue(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (t.length > RULE_TEXT_LIMITS.exclude_prefixes) {
    return `Cannot exceed ${RULE_TEXT_LIMITS.exclude_prefixes} characters`;
  }
  if (!/^[A-Za-z,\s]+$/.test(t)) return "Use letters, commas and spaces only";
  if (t.split(/[,\s]+/).some((tok) => tok.length > 1)) return "One letter per prefix, comma separated (e.g. T,C,R,L)";
  return null;
}

/** Day fields are kept as typed (text inputs); texts as typed (blank = the default / hidden). */
export type SettingsFormValues = Record<RuleDayField, string> & Record<RuleTextField, string>;

export function settingsDefaults(rule: LaRule): SettingsFormValues {
  const out = {} as SettingsFormValues;
  for (const f of RULE_DAY_FIELDS) out[f] = String(rule[f] ?? "");
  for (const f of RULE_TEXT_FIELDS) out[f] = rule[f] ?? "";
  return out;
}

export function settingsIssues(v: SettingsFormValues): FieldIssue<keyof SettingsFormValues>[] {
  const issues: FieldIssue<keyof SettingsFormValues>[] = [];
  for (const f of RULE_DAY_FIELDS) {
    const min = f === "detect_days" ? 1 : 0;
    const max = f === "lookback_days" ? LOOKBACK_DAYS_MAX : RULE_DAYS_MAX;
    const days = parseWholeDays(v[f]);
    if (days == null || days < min || days > max) {
      issues.push({ path: f, message: `Enter whole days between ${min} and ${max}` });
    }
  }
  // Look back: 0 = no limit; otherwise at least the detection days.
  const detect = parseWholeDays(v.detect_days);
  const lookback = parseWholeDays(v.lookback_days);
  if (
    detect != null &&
    lookback != null &&
    detect >= 1 &&
    detect <= RULE_DAYS_MAX &&
    lookback !== 0 &&
    lookback <= LOOKBACK_DAYS_MAX &&
    lookback < detect
  ) {
    issues.push({ path: "lookback_days", message: `Use 0 (no limit) or at least the detection days (${detect})` });
  }
  for (const f of RULE_TEXT_FIELDS) {
    if (f === "exclude_prefixes") continue;
    const max = RULE_TEXT_LIMITS[f];
    if (v[f].trim().length > max) issues.push({ path: f, message: `Cannot exceed ${max} characters` });
  }
  const prefixes = excludePrefixesIssue(v.exclude_prefixes);
  if (prefixes) issues.push({ path: "exclude_prefixes", message: prefixes });
  return issues;
}

export function makeSettingsSchema() {
  return z
    .object({
      detect_days: z.string(),
      lookback_days: z.string(),
      wait_w2_days: z.string(),
      wait_w3_days: z.string(),
      wait_sc_days: z.string(),
      sc_reply_days: z.string(),
      notice_reply_days: z.string(),
      dismiss_snooze_days: z.string(),
      // optional: blank = the default T,C,R,L (letters / commas / spaces checked in settingsIssues)
      exclude_prefixes: z.string(),
      clause_text: z.string(),
      signatory: z.string(),
      extra_1_label: z.string(),
      extra_2_label: z.string(),
      extra_3_label: z.string(),
      extra_4_label: z.string(),
      extra_5_label: z.string(),
    })
    .superRefine((v, zctx) => addIssues(settingsIssues(v), zctx));
}

/**
 * POST /rule_save body: whole days, blank texts as null (the default / hidden).
 * exclude_prefixes goes as typed (trimmed); the server stores its canonical
 * form (T,C,R,L) and the form is reset from the reply.
 */
export function settingsPayload(coId: number, v: SettingsFormValues): LaRuleSavePayload {
  const out: LaRuleSavePayload = { co_id: coId };
  for (const f of RULE_DAY_FIELDS) out[f] = parseWholeDays(v[f]) ?? 0;
  for (const f of RULE_TEXT_FIELDS) out[f] = textOrNull(v[f]);
  return out;
}

// ─── Templates ───────────────────────────────────────────────────────

export interface TemplateFormValues {
  subject: string;
  body: string;
}

export interface TemplateFormContext {
  /** Known placeholder codes; empty = the token check is left to the backend. */
  placeholders: ReadonlyArray<string>;
}

/** Same token shape as the backend's _ANY_TOKEN_RE: anything in braces on one line. */
const ANY_TOKEN_RE = /\{([^{}\n]*)\}/g;

/** Tokens in braces that are not placeholders, in order, without repeats. */
export function unknownPlaceholders(text: string, known: ReadonlyArray<string>): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(ANY_TOKEN_RE)) {
    const tok = m[1];
    if (!known.includes(tok) && !out.includes(tok)) out.push(tok);
  }
  return out;
}

export function templateIssues(
  v: TemplateFormValues,
  ctx: TemplateFormContext,
): FieldIssue<keyof TemplateFormValues>[] {
  const issues: FieldIssue<keyof TemplateFormValues>[] = [];
  if (v.subject.trim().length > SUBJECT_MAX) {
    issues.push({ path: "subject", message: `Cannot exceed ${SUBJECT_MAX} characters` });
  }
  if (!v.body.trim()) issues.push({ path: "body", message: "The letter text is required" });
  else if (v.body.length > BODY_MAX) issues.push({ path: "body", message: `Cannot exceed ${BODY_MAX} characters` });
  if (ctx.placeholders.length) {
    const listed = (bad: string[]) => bad.map((t) => `{${t}}`).join(", ");
    const badSubject = unknownPlaceholders(v.subject, ctx.placeholders);
    if (badSubject.length) {
      issues.push({ path: "subject", message: `Unknown placeholder ${listed(badSubject)}` });
    }
    const badBody = unknownPlaceholders(v.body, ctx.placeholders);
    if (badBody.length) issues.push({ path: "body", message: `Unknown placeholder ${listed(badBody)}` });
  }
  return issues;
}

export function makeTemplateSchema(ctx: TemplateFormContext) {
  return z
    .object({ subject: z.string(), body: z.string() })
    .superRefine((v, zctx) => addIssues(templateIssues(v, ctx), zctx));
}

/**
 * Inserts `insert` over the selection [start, end) of `text` (clamped to the
 * text) and returns the new text with the caret placed after the insert.
 */
export function insertAtCaret(
  text: string,
  start: number | null | undefined,
  end: number | null | undefined,
  insert: string,
): { text: string; caret: number } {
  const len = text.length;
  const s = Math.min(Math.max(start ?? len, 0), len);
  const e = Math.min(Math.max(end ?? s, s), len);
  return { text: text.slice(0, s) + insert + text.slice(e), caret: s + insert.length };
}

/**
 * The letter stage a template is previewed as (TEMPLATE_OF_STAGE reversed):
 * each warning has its own template (WARNING_1 -> WARNING_1 …),
 * STRUCK_OFF_MEMO -> STRUCK_OFF, the others are their own stage.
 */
export function previewStageFor(templateCode: string): string {
  if (templateCode === "STRUCK_OFF_MEMO") return "STRUCK_OFF";
  return templateCode;
}

export interface PreviewCaseFormValues {
  case_no: string;
}

export function previewCaseIssues(v: PreviewCaseFormValues): FieldIssue<"case_no">[] {
  const t = v.case_no.trim();
  if (!t) return [{ path: "case_no", message: "Enter a case number" }];
  if (t.length > CASE_NO_MAX) return [{ path: "case_no", message: `Cannot exceed ${CASE_NO_MAX} characters` }];
  return [];
}

export function makePreviewCaseSchema() {
  return z.object({ case_no: z.string() }).superRefine((v, zctx) => addIssues(previewCaseIssues(v), zctx));
}
