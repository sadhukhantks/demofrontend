/**
 * Zod schemas of the Long Absenteeism dialogs. Each form has a pure
 * `*Issues()` function (the rules, unit-tested) and a schema factory that
 * feeds those issues to react-hook-form through zodResolver. The rules mirror
 * the backend's obvious checks; the backend stays the authority and its
 * errors are shown inline in the dialogs.
 */

import { z } from "zod";
import { fmtDate, isIsoDate, type FieldIssue } from "@/components/lowPerformerFollowup/schemas";
import {
  LA_EXTRA_KEYS,
  type LaCase,
  type LaExtraKey,
  type LaLetter,
  type LaUpdatePayload,
  type LaUserEventType,
} from "@/utils/longAbsenteeismService";

// Column sizes of the backend tables / long_absenteeism_common.py MAX_* constants.
export const REMARKS_MAX = 1000;
export const EXTRA_MAX = 200;
export const TEXT_MAX = 1000;
export const NOTE_MAX = 500;
export const VERIFY_NOTE_MAX = 300;
export const EXIT_REMARKS_MAX = 500;
export const DISMISS_REASON_MAX = 500;
export const CONTACT_MAX = 100;
export const AD_NO_MAX = 50;
export const UNION_NAME_MAX = 100;
export const RECEIVED_BY_MAX = 100;
export const RECEIPT_REMARKS_MAX = 300;
export const SUBJECT_MAX = 300;
export const BODY_MAX = 20000;
export const SNOOZE_MAX = 365;
export const EB_NO_MAX = 30;

/** Exits that come back on a known date (the case reappears as a candidate after it). */
export const RETURN_DATE_REASONS: ReadonlyArray<string> = Object.freeze(["ESI", "STL", "MATERNITY", "MEDICAL"]);

/** Turns a list of field issues into zod issues (one superRefine per schema). */
function addIssues<P extends string>(issues: FieldIssue<P>[], ctx: z.RefinementCtx): void {
  for (const issue of issues) ctx.addIssue({ code: "custom", path: [issue.path], message: issue.message });
}

/**
 * Problem with a date field, else null.
 * @param required  blank is an error
 * @param max       latest allowed (usually today)
 * @param min       earliest allowed, with its description for the message
 */
export function dateIssue(
  value: string,
  what: string,
  opts: { required?: boolean; max?: string | null; min?: { date: string; what: string } | null } = {},
): string | null {
  const d = value.trim();
  if (!d) return opts.required ? `${what} is required` : null;
  if (!isIsoDate(d)) return "Enter a valid date";
  if (opts.max && d > opts.max) return `${what} cannot be in the future`;
  if (opts.min && opts.min.date && d < opts.min.date) {
    return `${what} cannot be before the ${opts.min.what} (${fmtDate(opts.min.date)})`;
  }
  return null;
}

function maxLenIssue(value: string, max: number): string | null {
  return value.trim().length > max ? `Cannot exceed ${max} characters` : null;
}

/** Blank -> null, else trimmed text. */
export function textOrNull(value: string): string | null {
  const t = value.trim();
  return t ? t : null;
}

// ─── Open case ───────────────────────────────────────────────────────

export interface OpenCaseFormValues {
  /** Only when the worker is picked by EB No (not from a candidate row). */
  eb_no: string;
  /** "" = let the server find the last day seen. */
  last_working_date: string;
  remarks: string;
}

export interface OpenCaseContext {
  today: string;
  needsEbNo: boolean;
}

export function openCaseIssues(v: OpenCaseFormValues, ctx: OpenCaseContext): FieldIssue<keyof OpenCaseFormValues>[] {
  const issues: FieldIssue<keyof OpenCaseFormValues>[] = [];
  if (ctx.needsEbNo) {
    const eb = v.eb_no.trim();
    if (!eb) issues.push({ path: "eb_no", message: "EB No is required" });
    else if (eb.length > EB_NO_MAX) issues.push({ path: "eb_no", message: "EB No is too long" });
  }
  const lwd = dateIssue(v.last_working_date, "Last working date", { max: ctx.today });
  if (lwd) issues.push({ path: "last_working_date", message: lwd });
  const remarks = maxLenIssue(v.remarks, REMARKS_MAX);
  if (remarks) issues.push({ path: "remarks", message: remarks });
  return issues;
}

export function makeOpenCaseSchema(ctx: OpenCaseContext) {
  return z
    .object({ eb_no: z.string(), last_working_date: z.string(), remarks: z.string() })
    .superRefine((v, zctx) => addIssues(openCaseIssues(v, ctx), zctx));
}

// ─── Dismiss candidate ───────────────────────────────────────────────

export interface DismissFormValues {
  reason: string;
  /** Kept as typed; "" = the rule's default. */
  snooze_days: string;
}

/** Whole days 0..SNOOZE_MAX from typed text; null when blank / invalid. */
export function parseWholeDays(raw: string): number | null {
  const t = raw.trim();
  if (!t || !/^\d+$/.test(t)) return null;
  return Number(t);
}

export function dismissIssues(v: DismissFormValues): FieldIssue<keyof DismissFormValues>[] {
  const issues: FieldIssue<keyof DismissFormValues>[] = [];
  const reason = v.reason.trim();
  if (!reason) issues.push({ path: "reason", message: "Reason is required" });
  else if (reason.length > DISMISS_REASON_MAX) {
    issues.push({ path: "reason", message: `Cannot exceed ${DISMISS_REASON_MAX} characters` });
  }
  if (v.snooze_days.trim()) {
    const days = parseWholeDays(v.snooze_days);
    if (days == null || days > SNOOZE_MAX) {
      issues.push({ path: "snooze_days", message: `Enter whole days between 0 and ${SNOOZE_MAX}` });
    }
  }
  return issues;
}

export function makeDismissSchema() {
  return z
    .object({ reason: z.string(), snooze_days: z.string() })
    .superRefine((v, zctx) => addIssues(dismissIssues(v), zctx));
}

// ─── Verify ──────────────────────────────────────────────────────────

export interface VerifyFormValues {
  /** NONE / ESI / STL; "" = not picked. */
  esi_stl_result: string;
  timekeeper_confirmed: boolean;
  habitual: boolean;
  note: string;
}

export function verifyIssues(v: VerifyFormValues): FieldIssue<keyof VerifyFormValues>[] {
  const issues: FieldIssue<keyof VerifyFormValues>[] = [];
  if (!v.esi_stl_result) issues.push({ path: "esi_stl_result", message: "Pick the ESI / STL result" });
  const note = maxLenIssue(v.note, VERIFY_NOTE_MAX);
  if (note) issues.push({ path: "note", message: note });
  return issues;
}

export function makeVerifySchema() {
  return z
    .object({
      esi_stl_result: z.string(),
      timekeeper_confirmed: z.boolean(),
      habitual: z.boolean(),
      note: z.string(),
    })
    .superRefine((v, zctx) => addIssues(verifyIssues(v), zctx));
}

export function verifyDefaults(c: Pick<LaCase, "esi_stl_result" | "timekeeper_confirmed" | "habitual" | "verify_note">): VerifyFormValues {
  return {
    esi_stl_result: c.esi_stl_result ?? "",
    timekeeper_confirmed: c.timekeeper_confirmed === 1,
    habitual: c.habitual === 1,
    note: c.verify_note ?? "",
  };
}

// ─── Timeline entry ──────────────────────────────────────────────────

export interface EventFormValues {
  event_date: string;
  /** REPLY only; "" = not given. */
  channel: string;
  contact_name: string;
  text: string;
  /** REPLY create only: park the case while the reply is reviewed. */
  park: boolean;
}

export interface EventFormContext {
  eventType: LaUserEventType;
  today: string;
  /** Entries cannot predate the case. */
  minDate: string | null;
}

export function eventIssues(v: EventFormValues, ctx: EventFormContext): FieldIssue<keyof EventFormValues>[] {
  const issues: FieldIssue<keyof EventFormValues>[] = [];
  const d = dateIssue(v.event_date, "Date", {
    required: true,
    max: ctx.today,
    min: ctx.minDate ? { date: ctx.minDate, what: "case date" } : null,
  });
  if (d) issues.push({ path: "event_date", message: d });
  const text = v.text.trim();
  if (!text) {
    issues.push({ path: "text", message: ctx.eventType === "REPLY" ? "Describe the reply" : "Text is required" });
  } else if (text.length > TEXT_MAX) {
    issues.push({ path: "text", message: `Cannot exceed ${TEXT_MAX} characters` });
  }
  if (ctx.eventType === "REPLY") {
    const contact = maxLenIssue(v.contact_name, CONTACT_MAX);
    if (contact) issues.push({ path: "contact_name", message: contact });
  }
  return issues;
}

export function makeEventSchema(ctx: EventFormContext) {
  return z
    .object({
      event_date: z.string(),
      channel: z.string(),
      contact_name: z.string(),
      text: z.string(),
      park: z.boolean(),
    })
    .superRefine((v, zctx) => addIssues(eventIssues(v, ctx), zctx));
}

// ─── Note (park / resume / reopen) ───────────────────────────────────

export interface NoteFormValues {
  note: string;
}

export function noteIssues(v: NoteFormValues, required: boolean): FieldIssue<"note">[] {
  const note = v.note.trim();
  if (required && !note) return [{ path: "note", message: "A note is required" }];
  if (note.length > NOTE_MAX) return [{ path: "note", message: `Cannot exceed ${NOTE_MAX} characters` }];
  return [];
}

export function makeNoteSchema(required: boolean) {
  return z.object({ note: z.string() }).superRefine((v, zctx) => addIssues(noteIssues(v, required), zctx));
}

// ─── Exit ────────────────────────────────────────────────────────────

export interface ExitFormValues {
  exit_reason: string;
  exit_date: string;
  exit_remarks: string;
  /** ESI / STL / MATERNITY / MEDICAL only; "" = not known. */
  expected_return_date: string;
}

export interface ExitFormContext {
  today: string;
  /** The exit cannot predate the last working date. */
  minDate: string | null;
}

export function needsReturnDate(reason: string): boolean {
  return RETURN_DATE_REASONS.includes(reason);
}

export function exitIssues(v: ExitFormValues, ctx: ExitFormContext): FieldIssue<keyof ExitFormValues>[] {
  const issues: FieldIssue<keyof ExitFormValues>[] = [];
  if (!v.exit_reason) issues.push({ path: "exit_reason", message: "Pick the reason" });
  const d = dateIssue(v.exit_date, "Exit date", {
    required: true,
    max: ctx.today,
    min: ctx.minDate ? { date: ctx.minDate, what: "last working date" } : null,
  });
  if (d) issues.push({ path: "exit_date", message: d });
  const remarks = maxLenIssue(v.exit_remarks, EXIT_REMARKS_MAX);
  if (remarks) issues.push({ path: "exit_remarks", message: remarks });
  if (needsReturnDate(v.exit_reason) && v.expected_return_date.trim()) {
    const r = dateIssue(v.expected_return_date, "Expected return date", {
      min: !d && v.exit_date.trim() ? { date: v.exit_date.trim(), what: "exit date" } : null,
    });
    if (r) issues.push({ path: "expected_return_date", message: r });
  }
  return issues;
}

export function makeExitSchema(ctx: ExitFormContext) {
  return z
    .object({
      exit_reason: z.string(),
      exit_date: z.string(),
      exit_remarks: z.string(),
      expected_return_date: z.string(),
    })
    .superRefine((v, zctx) => addIssues(exitIssues(v, ctx), zctx));
}

// ─── Letter dispatch update ──────────────────────────────────────────

export interface LetterUpdateFormValues {
  sent_date: string;
  dispatch_mode: string;
  ad_no: string;
  delivery_status: string;
  delivery_date: string;
  gate_display_date: string;
  dept_display_date: string;
}

export interface LetterUpdateContext {
  today: string;
  issueDate: string;
}

export function letterUpdateIssues(
  v: LetterUpdateFormValues,
  ctx: LetterUpdateContext,
): FieldIssue<keyof LetterUpdateFormValues>[] {
  const issues: FieldIssue<keyof LetterUpdateFormValues>[] = [];
  const afterIssue = { date: ctx.issueDate, what: "letter date" };
  const sent = dateIssue(v.sent_date, "Sent date", { max: ctx.today, min: afterIssue });
  if (sent) issues.push({ path: "sent_date", message: sent });
  const ad = maxLenIssue(v.ad_no, AD_NO_MAX);
  if (ad) issues.push({ path: "ad_no", message: ad });
  const sentOk = !sent && v.sent_date.trim() ? v.sent_date.trim() : null;
  const delivery = dateIssue(v.delivery_date, "Delivery date", {
    max: ctx.today,
    min: sentOk ? { date: sentOk, what: "sent date" } : afterIssue,
  });
  if (delivery) issues.push({ path: "delivery_date", message: delivery });
  for (const key of ["gate_display_date", "dept_display_date"] as const) {
    const msg = dateIssue(v[key], "Display date", { max: ctx.today, min: afterIssue });
    if (msg) issues.push({ path: key, message: msg });
  }
  return issues;
}

export function makeLetterUpdateSchema(ctx: LetterUpdateContext) {
  return z
    .object({
      sent_date: z.string(),
      dispatch_mode: z.string(),
      ad_no: z.string(),
      delivery_status: z.string(),
      delivery_date: z.string(),
      gate_display_date: z.string(),
      dept_display_date: z.string(),
    })
    .superRefine((v, zctx) => addIssues(letterUpdateIssues(v, ctx), zctx));
}

export function letterUpdateDefaults(l: LaLetter, today: string): LetterUpdateFormValues {
  return {
    // A letter not yet marked sent most often goes out the day it is recorded.
    sent_date: l.sent_date ?? (today >= l.issue_date ? today : l.issue_date),
    dispatch_mode: l.dispatch_mode ?? "",
    ad_no: l.ad_no ?? "",
    delivery_status: l.delivery_status ?? "",
    delivery_date: l.delivery_date ?? "",
    gate_display_date: l.gate_display_date ?? "",
    dept_display_date: l.dept_display_date ?? "",
  };
}

export type LetterUpdateFields = Partial<Record<keyof LetterUpdateFormValues, string | null>>;

/** Only the fields that changed (blank -> null clears); empty object when nothing changed. */
export function letterUpdateChanges(original: LaLetter, v: LetterUpdateFormValues): LetterUpdateFields {
  const out: LetterUpdateFields = {};
  const keys = Object.keys(v) as (keyof LetterUpdateFormValues)[];
  for (const key of keys) {
    const next = textOrNull(v[key]);
    const prev = original[key] ?? null;
    if (next !== prev) out[key] = next;
  }
  return out;
}

// ─── Union receipt ───────────────────────────────────────────────────

export interface ReceiptFormValues {
  union_name: string;
  received_by: string;
  received_date: string;
  remarks: string;
}

export interface ReceiptFormContext {
  today: string;
  /** Cannot be received before the gate notice was issued. */
  minDate: string | null;
}

export function receiptIssues(v: ReceiptFormValues, ctx: ReceiptFormContext): FieldIssue<keyof ReceiptFormValues>[] {
  const issues: FieldIssue<keyof ReceiptFormValues>[] = [];
  const name = v.union_name.trim();
  if (!name) issues.push({ path: "union_name", message: "Union name is required" });
  else if (name.length > UNION_NAME_MAX) {
    issues.push({ path: "union_name", message: `Cannot exceed ${UNION_NAME_MAX} characters` });
  }
  const by = maxLenIssue(v.received_by, RECEIVED_BY_MAX);
  if (by) issues.push({ path: "received_by", message: by });
  const d = dateIssue(v.received_date, "Received date", {
    max: ctx.today,
    min: ctx.minDate ? { date: ctx.minDate, what: "notice date" } : null,
  });
  if (d) issues.push({ path: "received_date", message: d });
  const remarks = maxLenIssue(v.remarks, RECEIPT_REMARKS_MAX);
  if (remarks) issues.push({ path: "remarks", message: remarks });
  return issues;
}

export function makeReceiptSchema(ctx: ReceiptFormContext) {
  return z
    .object({ union_name: z.string(), received_by: z.string(), received_date: z.string(), remarks: z.string() })
    .superRefine((v, zctx) => addIssues(receiptIssues(v, ctx), zctx));
}

// ─── Case fields (remarks, extras, habitual, last working date) ──────

export type CaseFieldsFormValues = {
  remarks: string;
  habitual: boolean;
  /** Edit access only. */
  last_working_date: string;
} & Record<LaExtraKey, string>;

export interface CaseFieldsContext {
  today: string;
  /** Edit access: the last working date may be changed. */
  canEditDate: boolean;
}

export function caseFieldsIssues(
  v: CaseFieldsFormValues,
  ctx: CaseFieldsContext,
): FieldIssue<keyof CaseFieldsFormValues>[] {
  const issues: FieldIssue<keyof CaseFieldsFormValues>[] = [];
  const remarks = maxLenIssue(v.remarks, REMARKS_MAX);
  if (remarks) issues.push({ path: "remarks", message: remarks });
  for (const key of LA_EXTRA_KEYS) {
    const msg = maxLenIssue(v[key], EXTRA_MAX);
    if (msg) issues.push({ path: key, message: msg });
  }
  if (ctx.canEditDate) {
    const d = dateIssue(v.last_working_date, "Last working date", { required: true, max: ctx.today });
    if (d) issues.push({ path: "last_working_date", message: d });
  }
  return issues;
}

export function makeCaseFieldsSchema(ctx: CaseFieldsContext) {
  return z
    .object({
      remarks: z.string(),
      habitual: z.boolean(),
      last_working_date: z.string(),
      extra_1: z.string(),
      extra_2: z.string(),
      extra_3: z.string(),
      extra_4: z.string(),
      extra_5: z.string(),
    })
    .superRefine((v, zctx) => addIssues(caseFieldsIssues(v, ctx), zctx));
}

export function caseFieldsDefaults(c: LaCase): CaseFieldsFormValues {
  return {
    remarks: c.remarks ?? "",
    habitual: c.habitual === 1,
    last_working_date: c.last_working_date,
    extra_1: c.extra_1 ?? "",
    extra_2: c.extra_2 ?? "",
    extra_3: c.extra_3 ?? "",
    extra_4: c.extra_4 ?? "",
    extra_5: c.extra_5 ?? "",
  };
}

/** The /update payload of the changed fields only (the date only with edit access). */
export function caseFieldsChanges(
  c: LaCase,
  v: CaseFieldsFormValues,
  canEditDate: boolean,
): Omit<LaUpdatePayload, "co_id" | "case_id"> {
  const out: Omit<LaUpdatePayload, "co_id" | "case_id"> = {};
  const remarks = textOrNull(v.remarks);
  if (remarks !== (c.remarks ?? null)) out.remarks = remarks;
  for (const key of LA_EXTRA_KEYS) {
    const next = textOrNull(v[key]);
    if (next !== (c[key] ?? null)) out[key] = next;
  }
  if (v.habitual !== (c.habitual === 1)) out.habitual = v.habitual;
  if (canEditDate && v.last_working_date.trim() && v.last_working_date.trim() !== c.last_working_date) {
    out.last_working_date = v.last_working_date.trim();
  }
  return out;
}

/** Problem with an inline-edited grid cell (remarks / extra), else null. */
export function cellTextIssue(field: "remarks" | LaExtraKey, value: string): string | null {
  return maxLenIssue(value, field === "remarks" ? REMARKS_MAX : EXTRA_MAX);
}

// ─── Letter issue (preview dialog) ───────────────────────────────────

/** The letter text is not part of the form: it is rendered from the template (read-only). */
export interface LetterIssueFormValues {
  dispatch_mode: string;
  force: boolean;
  force_reason: string;
}

export interface LetterIssueContext {
  /** The preview's blocked_reason (null = issuable). */
  blockedReason: string | null;
  canForce: boolean;
}

export function letterIssueIssues(
  v: LetterIssueFormValues,
  ctx: LetterIssueContext,
): FieldIssue<keyof LetterIssueFormValues>[] {
  const issues: FieldIssue<keyof LetterIssueFormValues>[] = [];
  if (ctx.blockedReason) {
    if (!ctx.canForce) {
      issues.push({ path: "force", message: ctx.blockedReason });
    } else if (!v.force) {
      issues.push({ path: "force", message: "Tick Force to issue it anyway" });
    } else {
      const reason = v.force_reason.trim();
      if (!reason) issues.push({ path: "force_reason", message: "Say why it is forced" });
      else if (reason.length > NOTE_MAX) {
        issues.push({ path: "force_reason", message: `Cannot exceed ${NOTE_MAX} characters` });
      }
    }
  }
  return issues;
}

export function makeLetterIssueSchema(ctx: LetterIssueContext) {
  return z
    .object({
      dispatch_mode: z.string(),
      force: z.boolean(),
      force_reason: z.string(),
    })
    .superRefine((v, zctx) => addIssues(letterIssueIssues(v, ctx), zctx));
}

// ─── Struck-off approve ──────────────────────────────────────────────

export interface ApproveFormValues {
  struck_off_date: string;
}

export function approveIssues(v: ApproveFormValues, today: string, minDate: string | null): FieldIssue<"struck_off_date">[] {
  const d = dateIssue(v.struck_off_date, "Struck-off date", {
    required: true,
    max: today,
    min: minDate ? { date: minDate, what: "gate notice date" } : null,
  });
  return d ? [{ path: "struck_off_date", message: d }] : [];
}

export function makeApproveSchema(today: string, minDate: string | null) {
  return z
    .object({ struck_off_date: z.string() })
    .superRefine((v, zctx) => addIssues(approveIssues(v, today, minDate), zctx));
}

// ─── Batch issue ─────────────────────────────────────────────────────

export interface BatchFormValues {
  case_ids: number[];
  dispatch_mode: string;
}

export function batchIssues(v: BatchFormValues): FieldIssue<keyof BatchFormValues>[] {
  return v.case_ids.length === 0 ? [{ path: "case_ids", message: "Pick at least one case" }] : [];
}

export function makeBatchSchema() {
  return z
    .object({ case_ids: z.array(z.number().int().positive()), dispatch_mode: z.string() })
    .superRefine((v, zctx) => addIssues(batchIssues(v), zctx));
}
