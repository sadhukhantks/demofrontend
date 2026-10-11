/**
 * Long Absenteeism follow-up (name struck off) service.
 *
 * Backend: vowerp3be src/juteProduction/long_absenteeism.py (cases, candidates,
 * events, performance) and long_absenteeism_letters.py (rule, templates,
 * letters, dispatch, union receipts, struck-off approval, reports), both
 * mounted at /api/longAbsenteeism (portal persona, cookie auth). Every response
 * is `{ data: ... }`; errors are 4xx/5xx with `{ detail }`, which
 * fetchWithCookie already flattens into `error`.
 *
 * One tracked case per long-absent worker: three warning letters, a show
 * cause, a gate notice served on the unions, then a struck-off approval that
 * marks the employee Terminated. Letters are rendered from the company's
 * templates (one per warning, show cause, gate notice, memo) and never edited
 * by hand: the server merges the template again at issue. The legal sequence
 * counts from each letter's SENT date.
 *
 * Every code and label the UI shows comes from GET /setup (codes_payload() in
 * long_absenteeism_common.py) — nothing here hardcodes a label. Every function
 * throws `Error(detail)` on failure so callers need one try/catch.
 *
 * Spec: vowerp3be docs/superpowers/specs/2026-10-11-long-absenteeism-followup.md
 */

import { apiRoutesPortalMasters } from "@/utils/api";
import { fetchWithCookie } from "@/utils/apiClient2";

// ─── Codes ───────────────────────────────────────────────────────────

export interface LaCodeLabel {
  code: string;
  label: string;
}

/** A ladder stage; `order` is its position (DETECTED = 0 … STRUCK_OFF = 7). */
export interface LaStage extends LaCodeLabel {
  order: number;
}

/** Case status: 1 open, 2 parked (reply under review), 0 closed. */
export type LaCaseStatus = 0 | 1 | 2;

export interface LaStatusLabel {
  code: number;
  label: string;
}

/**
 * Grouping of a live case on the "Due today" view (GET /list). STRUCK_OFF_DUE =
 * a gate-notice case whose reply window has ended: send it for struck-off
 * approval (a gate-notice case is never LETTER_DUE).
 */
export type LaDueBand =
  | "VERIFY"
  | "LETTER_DUE"
  | "STRUCK_OFF_DUE"
  | "MARKED_PRESENT"
  | "REPLY_REVIEW"
  | "APPROVAL"
  | "NONE";

export const LA_DUE_BANDS: ReadonlyArray<LaDueBand> = Object.freeze([
  "VERIFY",
  "LETTER_DUE",
  "STRUCK_OFF_DUE",
  "MARKED_PRESENT",
  "REPLY_REVIEW",
  "APPROVAL",
  "NONE",
]);

/** User-entered timeline types (the rest are written by the system). */
export type LaUserEventType = "REMARK" | "FEEDBACK" | "REPLY";

export const LA_USER_EVENT_TYPES: ReadonlyArray<LaUserEventType> = Object.freeze(["REMARK", "FEEDBACK", "REPLY"]);

export type LaListView = "due" | "open" | "parked" | "closed" | "all";

// ─── Rule / setup ────────────────────────────────────────────────────

/** Per-company rule merged over the code defaults (GET /rule, setup.rule). */
export interface LaRule {
  co_id?: number;
  detect_days: number;
  lookback_days: number;
  wait_w2_days: number;
  wait_w3_days: number;
  wait_sc_days: number;
  sc_reply_days: number;
  notice_reply_days: number;
  dismiss_snooze_days: number;
  /**
   * Excluded EB-code prefixes, canonical "T,C,R,L" (single letters, comma
   * separated): workers whose EB No starts with one of them are not candidates.
   * The server returns the default when the company has none; null / blank on
   * save = back to the default.
   */
  exclude_prefixes: string | null;
  /** Retired (amendment 11.17): still sent by the server, no longer used. */
  exclude_t_codes?: number;
  clause_text: string | null;
  signatory: string | null;
  extra_1_label: string | null;
  extra_2_label: string | null;
  extra_3_label: string | null;
  extra_4_label: string | null;
  extra_5_label: string | null;
}

export const LA_RULE_INT_FIELDS = [
  "detect_days",
  "lookback_days",
  "wait_w2_days",
  "wait_w3_days",
  "wait_sc_days",
  "sc_reply_days",
  "notice_reply_days",
  "dismiss_snooze_days",
] as const;

export type LaRuleIntField = (typeof LA_RULE_INT_FIELDS)[number];

export const LA_EXTRA_KEYS = ["extra_1", "extra_2", "extra_3", "extra_4", "extra_5"] as const;
export type LaExtraKey = (typeof LA_EXTRA_KEYS)[number];

export interface LaDept {
  dept_id: number;
  dept_desc: string;
}

/** GET /setup — codes_payload() + the branch's departments + rule + server date + access. */
export interface LaSetup {
  stages: LaStage[];
  /** Letter stages in issue order (WARNING_1 … STRUCK_OFF). */
  letter_stages: string[];
  template_codes: LaCodeLabel[];
  statuses: LaStatusLabel[];
  /** Exits the user may choose on /exit. */
  exit_reasons: LaCodeLabel[];
  /** Every exit reason (incl. STRUCK_OFF / DISMISSED) — for labels. */
  all_exit_reasons: LaCodeLabel[];
  esi_stl_results: LaCodeLabel[];
  event_types: LaCodeLabel[];
  user_event_types: string[];
  reply_channels: LaCodeLabel[];
  dispatch_modes: LaCodeLabel[];
  delivery_statuses: LaCodeLabel[];
  placeholders: LaCodeLabel[];
  depts: LaDept[];
  rule: LaRule;
  /** Server (IST) date, YYYY-MM-DD. */
  today: string;
  /** 0 none, 1 view, 3 create, 4 edit — for the selected branch. */
  access_level: number;
}

// ─── Cases ───────────────────────────────────────────────────────────

/** case_to_dict(): every column of jute_prod_absent_case + labels + live absent days. */
export interface LaCase {
  case_id: number;
  co_id: number;
  branch_id: number;
  eb_id: number;
  case_no: string | null;
  // snapshot (frozen at /open)
  emp_code: string | null;
  emp_name: string | null;
  dept_id: number | null;
  dept_desc: string | null;
  sub_dept_desc: string | null;
  designation: string | null;
  category: string | null;
  father_name: string | null;
  address: string | null;
  mobile: string | null;
  date_of_join: string | null;
  esi_no: string | null;
  pf_no: string | null;
  last_machine: string | null;
  last_spell: string | null;
  // absence facts
  last_working_date: string;
  detected_date: string | null;
  absent_days_at_open: number | null;
  rejoined_seen_date: string | null;
  // ladder
  stage_code: string;
  stage_date: string | null;
  next_due_date: string | null;
  status: LaCaseStatus;
  habitual: number;
  // verification
  esi_stl_result: string | null;
  timekeeper_confirmed: number;
  verified_date: string | null;
  verify_note: string | null;
  // exit
  exit_reason: string | null;
  exit_date: string | null;
  exit_remarks: string | null;
  expected_return_date: string | null;
  snooze_until: string | null;
  struck_off_date: string | null;
  /** Struck-off approval only: null = not started, 20 pending, 3 approved, 4 rejected. */
  status_id: number | null;
  approval_level: number | null;
  // performance snapshot
  perf_avg_eff: number | null;
  perf_kg_per_hr: number | null;
  perf_days_worked: number | null;
  perf_from: string | null;
  perf_to: string | null;
  perf_dept: string | null;
  // Excel-style free text
  remarks: string | null;
  extra_1: string | null;
  extra_2: string | null;
  extra_3: string | null;
  extra_4: string | null;
  extra_5: string | null;
  updated_by: number | null;
  updated_date_time: string | null;
  // derived
  stage_label: string;
  stage_order: number;
  status_label: string;
  exit_reason_label: string | null;
  /** Live: today (or the rejoined date) - last working date. */
  absent_days: number;
}

/** GET /list row: the case + its letter dates + the Due-today band. */
export interface LaListRow extends LaCase {
  w1_date: string | null;
  w1_sent: string | null;
  w2_date: string | null;
  w2_sent: string | null;
  w3_date: string | null;
  w3_sent: string | null;
  sc_date: string | null;
  sc_sent: string | null;
  gn_date: string | null;
  gn_sent: string | null;
  due_band: LaDueBand;
  next_stage_code: string | null;
  next_stage_label: string | null;
}

/** GET /candidates row: a worker absent >= detect_days with no live / snoozed case. */
export interface LaCandidate {
  eb_id: number;
  emp_code: string | null;
  emp_name: string | null;
  dept_id: number | null;
  dept_desc: string | null;
  sub_dept_desc: string | null;
  designation: string | null;
  category: string | null;
  last_seen: string | null;
  absent_days: number;
  /** Earlier closed cases of the worker in the branch (repeat absentee). */
  closed_cases: number;
}

export interface LaEarlierCase {
  case_id: number;
  case_no: string | null;
  detected_date: string | null;
  stage_code: string | null;
  exit_reason: string | null;
  exit_date: string | null;
}

// ─── Letters ─────────────────────────────────────────────────────────

export interface LaReceipt {
  receipt_id: number;
  letter_id: number;
  union_name: string;
  received_by: string | null;
  received_date: string | null;
  remarks: string | null;
}

export interface LaAttachmentRef {
  attachment_id: number;
  filename: string | null;
}

/** letter_to_dict() (+ receipts / attachments on GET /letters and GET /get). */
export interface LaLetter {
  letter_id: number;
  case_id: number;
  stage_code: string;
  letter_no: number | null;
  template_code: string | null;
  issue_date: string;
  subject: string | null;
  body: string;
  reply_due_date: string | null;
  dispatch_mode: string | null;
  sent_date: string | null;
  ad_no: string | null;
  delivery_status: string | null;
  delivery_date: string | null;
  gate_display_date: string | null;
  dept_display_date: string | null;
  batch_ref: string | null;
  forced: number;
  stage_label: string;
  template_label: string | null;
  dispatch_mode_label: string | null;
  delivery_status_label: string | null;
  receipts: LaReceipt[];
  /** Latest active attachment per file type (signed_copy / ad_card). */
  attachments: Record<string, LaAttachmentRef | null>;
}

/** POST /letter_preview — the merged text of the next (or given) stage. */
export interface LaPreview {
  case_id: number | null;
  case_no: string | null;
  stage_code: string;
  stage_label: string | null;
  /** WARNING_1 / WARNING_2 / WARNING_3 / SHOW_CAUSE / GATE_NOTICE / STRUCK_OFF_MEMO. */
  template_code: string | null;
  template_label: string | null;
  letter_no: number | null;
  subject: string;
  body: string;
  /** Always false: the letter is the template merged on the server, never edited by hand. */
  editable: boolean;
  /** Why the letter cannot be issued now (null = it can). */
  blocked_reason: string | null;
  blocked_code: string | null;
  /** The caller has edit and may force past a wait / missing sent date. */
  can_force: boolean;
  /** The letter date the text was merged with. */
  issue_date: string | null;
  /** When the letter becomes issuable (wait from the previous sent date). */
  due_date: string | null;
  reply_due_date: string | null;
  /** The stage's usual dispatch mode. */
  dispatch_mode: string | null;
}

/** Optional inputs of POST /letter_preview (Templates tab: preview an unsaved template on a case). */
export interface LaPreviewOptions {
  /** Find the case by its number instead of the id. */
  caseNo?: string | null;
  issueDate?: string | null;
  templateSubject?: string | null;
  templateBody?: string | null;
}

export interface LaIssueResult {
  letter: LaLetter;
  case: LaCase;
}

export interface LaBatchIssued {
  case_id: number;
  letter_id: number;
  stage_code: string;
  stage_label: string | null;
  case_no: string | null;
  emp_code: string | null;
  emp_name: string | null;
  /** The stored text (printed as issued). */
  subject: string | null;
  body: string | null;
}

export interface LaBatchSkipped {
  case_id: number;
  reason: string;
}

export interface LaBatchResult {
  batch_ref: string | null;
  issue_date: string | null;
  issued: LaBatchIssued[];
  skipped: LaBatchSkipped[];
}

/** GET /letters_due row: a live open case whose next letter can be issued today. */
export interface LaLetterDueRow {
  case_id: number;
  case_no: string | null;
  emp_code: string | null;
  emp_name: string | null;
  dept_desc: string | null;
  stage_code: string | null;
  stage_label: string | null;
  next_stage_code: string;
  next_stage_label: string | null;
  /** When the next letter became due. */
  next_due_date: string | null;
  absent_days: number | null;
}

/** POST /letter_update: the letter and the case (its next due date moves with the sent date). */
export interface LaLetterUpdateResult {
  letter: LaLetter | null;
  case: LaCase | null;
}

/** GET /dispatch row: a letter + who it is for. */
export interface LaDispatchRow extends LaLetter {
  case_no: string | null;
  emp_code: string | null;
  emp_name: string | null;
  dept_desc: string | null;
  /** Case snapshot (the dispatch register prints the postal address). */
  designation?: string | null;
  address?: string | null;
}

// ─── Templates ───────────────────────────────────────────────────────

export interface LaTemplate {
  template_code: string;
  label: string;
  lang: string;
  subject: string;
  body: string;
  /** True when the company has no saved row (code default). */
  is_default: boolean;
  /** When the company's row was last saved (null for a default). */
  updated_date_time?: string | null;
}

export interface LaTemplates {
  templates: LaTemplate[];
  placeholders: LaCodeLabel[];
}

// ─── Events ──────────────────────────────────────────────────────────

/** event_to_dict() (+ attachment on GET /events). */
export interface LaEvent {
  event_id: number;
  case_id: number;
  event_type: string;
  event_date: string;
  channel: string | null;
  contact_name: string | null;
  text: string | null;
  ref_letter_id: number | null;
  updated_by: number | null;
  updated_date_time: string | null;
  event_type_label: string;
  channel_label: string | null;
  attachment_id: number | null;
  attachment_filename: string | null;
}

export interface LaEventResult {
  event: LaEvent;
  /** The case after the event (a REPLY with park parks it). */
  case: LaCase | null;
}

export interface LaEventDeactivated {
  event_id: number;
  active: number;
}

/** GET /get — everything the case page shows. */
export interface LaCaseDetail {
  case: LaCase;
  letters: LaLetter[];
  /** Newest first. */
  events: LaEvent[];
  earlier_cases: LaEarlierCase[];
}

// ─── Performance ─────────────────────────────────────────────────────

export interface LaPerfRow {
  tran_date: string;
  shift: string | null;
  spell_code: string | null;
  machine_id: number | null;
  machine: string | null;
  quality_id: number | null;
  quality: string | null;
  prod_kg: number | null;
  std_kg: number | null;
  eff_pct: number | null;
  hours: number | null;
}

export interface LaPerfSummary {
  days_worked: number;
  rows: number;
  prod_kg: number;
  std_kg: number;
  avg_eff: number | null;
  kg_per_hr: number | null;
}

export type LaPerformance =
  | { available: false; reason: string }
  | {
      available: true;
      dept: string;
      date_from: string | null;
      date_to: string | null;
      summary: LaPerfSummary;
      rows: LaPerfRow[];
    };

// ─── Struck-off approval ─────────────────────────────────────────────

/** GET /struck_off/permissions — the approval engine's flags + the send gate. */
export interface LaPermissions {
  canApprove: boolean;
  canReject: boolean;
  canReopen: boolean;
  canViewApprovalLog: boolean;
  status_id: number | null;
  approval_level: number | null;
  /** Highest level in the approval hierarchy (null without one). */
  max_approval_level: number | null;
  hierarchy_exists: boolean;
  can_send: boolean;
  send_blocked_reason: string | null;
}

export interface LaApprovalOutcome {
  new_status_id: number | null;
  new_approval_level: number | null;
  message: string | null;
}

export interface LaApproveResult {
  case: LaCase | null;
  approval: LaApprovalOutcome | null;
}

// ─── Reports ─────────────────────────────────────────────────────────

export interface LaStageSummaryDept {
  dept_desc: string;
  /** Live cases per stage code. */
  counts: Record<string, number>;
  parked: number;
  total_live: number;
}

export interface LaStageSummaryExit {
  exit_reason: string;
  label: string;
  count: number;
}

export interface LaStageSummary {
  by_dept: LaStageSummaryDept[];
  /** Cases closed in the last 90 days, per reason. */
  exits: LaStageSummaryExit[];
  as_on: string | null;
}

export interface LaRegisterRow {
  case_id: number | null;
  case_no: string | null;
  emp_code: string | null;
  emp_name: string | null;
  dept_desc: string | null;
  designation: string | null;
  last_working_date: string | null;
  warning1_date: string | null;
  warning1_sent: string | null;
  warning2_date: string | null;
  warning2_sent: string | null;
  warning3_date: string | null;
  warning3_sent: string | null;
  show_cause_date: string | null;
  gate_notice_date: string | null;
  struck_off_date: string | null;
  remarks: string | null;
}

export interface LaTrendRow {
  /** YYYY-MM */
  month: string;
  opened: number;
  struck_off: number;
  rejoined: number;
  other_exits: number;
}

// ─── Attachments ─────────────────────────────────────────────────────

/** Generic attachment subsystem slots (vowerp3be src/common/attachments/constants.py). */
export const LA_LETTER_ATTACHMENT_MODULE = "jute_prod_absent_letter";
export const LA_LETTER_FILE_TYPES = Object.freeze({ SIGNED_COPY: "signed_copy", AD_CARD: "ad_card" });
export const LA_RECEIPT_ATTACHMENT_MODULE = "jute_prod_absent_receipt";
export const LA_RECEIPT_FILE_TYPE = "union_receipt";
export const LA_EVENT_ATTACHMENT_MODULE = "jute_prod_absent_event";
export const LA_EVENT_FILE_TYPES = Object.freeze({ REPLY: "reply", MEDICAL: "medical", OTHER: "other" });

// ─── Request payloads ────────────────────────────────────────────────

export interface LaOpenPayload {
  co_id: number;
  branch_id: number;
  eb_id: number;
  last_working_date?: string | null;
  remarks?: string | null;
}

export interface LaDismissPayload {
  co_id: number;
  branch_id: number;
  eb_id: number;
  reason: string;
  snooze_days?: number | null;
}

export interface LaVerifyPayload {
  co_id: number;
  case_id: number;
  esi_stl_result: string;
  timekeeper_confirmed: boolean;
  habitual: boolean;
  note?: string | null;
}

/** Only the keys sent are changed. */
export interface LaUpdatePayload {
  co_id: number;
  case_id: number;
  remarks?: string | null;
  extra_1?: string | null;
  extra_2?: string | null;
  extra_3?: string | null;
  extra_4?: string | null;
  extra_5?: string | null;
  habitual?: boolean;
  last_working_date?: string;
}

export interface LaNotePayload {
  co_id: number;
  case_id: number;
  note?: string | null;
}

export interface LaExitPayload {
  co_id: number;
  case_id: number;
  exit_reason: string;
  exit_date: string;
  exit_remarks?: string | null;
  expected_return_date?: string | null;
}

export interface LaEventCreatePayload {
  co_id: number;
  case_id: number;
  event_type: LaUserEventType;
  event_date: string;
  channel?: string | null;
  contact_name?: string | null;
  text: string;
  /** REPLY only: park the case while the reply is reviewed (server default true). */
  park?: boolean;
}

export interface LaEventUpdatePayload {
  co_id: number;
  event_id: number;
  event_date?: string;
  channel?: string | null;
  contact_name?: string | null;
  text?: string | null;
}

export type LaRuleSavePayload = { co_id: number } & Partial<Omit<LaRule, "co_id">>;

export interface LaTemplateSavePayload {
  co_id: number;
  template_code: string;
  subject: string;
  body: string;
}

/** No subject / body: the server merges the company's template for the stage (and ignores any text sent). */
export interface LaIssuePayload {
  co_id: number;
  case_id: number;
  stage_code: string;
  issue_date?: string | null;
  dispatch_mode?: string | null;
  force?: boolean;
  force_reason?: string | null;
}

export interface LaIssueBatchPayload {
  co_id: number;
  branch_id: number;
  case_ids: number[];
  issue_date?: string | null;
  dispatch_mode?: string | null;
}

/** Only the keys sent are changed; null clears a field. */
export interface LaLetterUpdatePayload {
  co_id: number;
  letter_id: number;
  sent_date?: string | null;
  dispatch_mode?: string | null;
  ad_no?: string | null;
  delivery_status?: string | null;
  delivery_date?: string | null;
  gate_display_date?: string | null;
  dept_display_date?: string | null;
}

export interface LaReceiptCreatePayload {
  co_id: number;
  letter_id: number;
  union_name: string;
  received_by?: string | null;
  received_date?: string | null;
  remarks?: string | null;
}

export interface LaReceiptUpdatePayload {
  co_id: number;
  receipt_id: number;
  union_name?: string;
  received_by?: string | null;
  received_date?: string | null;
  remarks?: string | null;
}

export interface LaApprovePayload {
  co_id: number;
  case_id: number;
  struck_off_date?: string | null;
}

// ─── Narrowing helpers ───────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNum(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isStr(value: unknown): value is string {
  return typeof value === "string";
}

function isArrayOf<T>(value: unknown, guard: (v: unknown) => v is T): value is T[] {
  return Array.isArray(value) && value.every(guard);
}

/** Number from a JSON number or numeric string (MySQL DECIMAL / COUNT may arrive as text); else null. */
function num(value: unknown): number | null {
  if (isNum(value)) return value;
  if (isStr(value) && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function str(value: unknown): string | null {
  if (isStr(value)) return value;
  if (isNum(value)) return String(value);
  return null;
}

function bool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (isNum(value)) return value !== 0;
  if (isStr(value)) return ["1", "true", "yes"].includes(value.trim().toLowerCase());
  return false;
}

function isCodeLabel(value: unknown): value is LaCodeLabel {
  return isRecord(value) && isStr(value.code) && isStr(value.label);
}

function isStage(value: unknown): value is LaStage {
  return isCodeLabel(value) && isRecord(value) && isNum(value.order);
}

function isStatusLabel(value: unknown): value is LaStatusLabel {
  return isRecord(value) && isNum(value.code) && isStr(value.label);
}

function toDepts(value: unknown): LaDept[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((d) => {
    if (!isRecord(d)) return [];
    const id = num(d.dept_id);
    return id != null ? [{ dept_id: id, dept_desc: str(d.dept_desc) ?? `Dept ${id}` }] : [];
  });
}

export function isLaRule(value: unknown): value is LaRule {
  return isRecord(value) && LA_RULE_INT_FIELDS.every((k) => num(value[k]) != null);
}

function toRule(value: Record<string, unknown>): LaRule {
  const textOrNull = (k: string) => str(value[k]);
  return {
    co_id: num(value.co_id) ?? undefined,
    detect_days: num(value.detect_days) ?? 0,
    lookback_days: num(value.lookback_days) ?? 0,
    wait_w2_days: num(value.wait_w2_days) ?? 0,
    wait_w3_days: num(value.wait_w3_days) ?? 0,
    wait_sc_days: num(value.wait_sc_days) ?? 0,
    sc_reply_days: num(value.sc_reply_days) ?? 0,
    notice_reply_days: num(value.notice_reply_days) ?? 0,
    dismiss_snooze_days: num(value.dismiss_snooze_days) ?? 0,
    exclude_prefixes: textOrNull("exclude_prefixes"),
    exclude_t_codes: num(value.exclude_t_codes) ?? undefined,
    clause_text: textOrNull("clause_text"),
    signatory: textOrNull("signatory"),
    extra_1_label: textOrNull("extra_1_label"),
    extra_2_label: textOrNull("extra_2_label"),
    extra_3_label: textOrNull("extra_3_label"),
    extra_4_label: textOrNull("extra_4_label"),
    extra_5_label: textOrNull("extra_5_label"),
  };
}

export function isLaSetup(value: unknown): value is LaSetup {
  return (
    isRecord(value) &&
    isArrayOf(value.stages, isStage) &&
    isArrayOf(value.exit_reasons, isCodeLabel) &&
    isArrayOf(value.esi_stl_results, isCodeLabel) &&
    isArrayOf(value.event_types, isCodeLabel) &&
    isArrayOf(value.reply_channels, isCodeLabel) &&
    isArrayOf(value.dispatch_modes, isCodeLabel) &&
    isArrayOf(value.delivery_statuses, isCodeLabel) &&
    isLaRule(value.rule) &&
    isStr(value.today)
  );
}

function toSetup(value: LaSetup): LaSetup {
  const raw = value as unknown as Record<string, unknown>;
  const codeList = (k: string): LaCodeLabel[] => (Array.isArray(raw[k]) ? (raw[k] as unknown[]).filter(isCodeLabel) : []);
  return {
    stages: value.stages,
    letter_stages: Array.isArray(raw.letter_stages) ? (raw.letter_stages as unknown[]).filter(isStr) : [],
    template_codes: codeList("template_codes"),
    statuses: Array.isArray(raw.statuses) ? (raw.statuses as unknown[]).filter(isStatusLabel) : [],
    exit_reasons: value.exit_reasons,
    all_exit_reasons: codeList("all_exit_reasons"),
    esi_stl_results: value.esi_stl_results,
    event_types: value.event_types,
    user_event_types: Array.isArray(raw.user_event_types) ? (raw.user_event_types as unknown[]).filter(isStr) : [],
    reply_channels: value.reply_channels,
    dispatch_modes: value.dispatch_modes,
    delivery_statuses: value.delivery_statuses,
    placeholders: codeList("placeholders"),
    depts: toDepts(raw.depts),
    rule: toRule(raw.rule as Record<string, unknown>),
    today: value.today,
    access_level: num(raw.access_level) ?? 0,
  };
}

export function isLaCase(value: unknown): value is LaCase {
  return (
    isRecord(value) &&
    isNum(value.case_id) &&
    isNum(value.branch_id) &&
    isNum(value.eb_id) &&
    isStr(value.stage_code) &&
    (value.status === 0 || value.status === 1 || value.status === 2) &&
    isStr(value.last_working_date)
  );
}

/** Coerces the numeric snapshot columns (DECIMAL arrives as number from case_to_dict, but be lenient). */
function toCase<T extends LaCase>(value: T): T {
  const raw = value as unknown as Record<string, unknown>;
  return {
    ...value,
    case_no: str(raw.case_no),
    habitual: num(raw.habitual) ?? 0,
    timekeeper_confirmed: num(raw.timekeeper_confirmed) ?? 0,
    status_id: num(raw.status_id),
    approval_level: num(raw.approval_level),
    perf_avg_eff: num(raw.perf_avg_eff),
    perf_kg_per_hr: num(raw.perf_kg_per_hr),
    perf_days_worked: num(raw.perf_days_worked),
    absent_days: num(raw.absent_days) ?? 0,
    absent_days_at_open: num(raw.absent_days_at_open),
    stage_label: str(raw.stage_label) ?? value.stage_code,
    stage_order: num(raw.stage_order) ?? -1,
    status_label: str(raw.status_label) ?? String(value.status),
    exit_reason_label: str(raw.exit_reason_label),
    emp_code: str(raw.emp_code),
  };
}

const LIST_LETTER_KEYS = [
  "w1_date",
  "w1_sent",
  "w2_date",
  "w2_sent",
  "w3_date",
  "w3_sent",
  "sc_date",
  "sc_sent",
  "gn_date",
  "gn_sent",
] as const;

export function isLaListRow(value: unknown): value is LaListRow {
  return isLaCase(value) && isRecord(value) && (value.due_band === undefined || isStr(value.due_band));
}

function toListRow(value: LaListRow): LaListRow {
  const raw = value as unknown as Record<string, unknown>;
  const band = str(raw.due_band);
  const out = toCase(value);
  for (const k of LIST_LETTER_KEYS) out[k] = str(raw[k]);
  out.due_band = band && (LA_DUE_BANDS as ReadonlyArray<string>).includes(band) ? (band as LaDueBand) : "NONE";
  out.next_stage_code = str(raw.next_stage_code);
  out.next_stage_label = str(raw.next_stage_label);
  return out;
}

export function isLaCandidate(value: unknown): value is LaCandidate {
  return isRecord(value) && isNum(value.eb_id);
}

function toCandidate(value: LaCandidate): LaCandidate {
  const raw = value as unknown as Record<string, unknown>;
  return {
    ...value,
    emp_code: str(raw.emp_code),
    absent_days: num(raw.absent_days) ?? 0,
    closed_cases: num(raw.closed_cases) ?? 0,
  };
}

function isEarlierCase(value: unknown): value is LaEarlierCase {
  return isRecord(value) && isNum(value.case_id);
}

function isReceipt(value: unknown): value is LaReceipt {
  return isRecord(value) && isNum(value.receipt_id) && isStr(value.union_name);
}

export function isLaReceipt(value: unknown): value is LaReceipt {
  return isReceipt(value);
}

function toAttachments(value: unknown): Record<string, LaAttachmentRef | null> {
  const out: Record<string, LaAttachmentRef | null> = {};
  if (!isRecord(value)) return out;
  for (const [key, v] of Object.entries(value)) {
    if (isRecord(v) && isNum(v.attachment_id)) {
      out[key] = {
        attachment_id: v.attachment_id,
        filename: str(v.filename) ?? str(v.original_filename) ?? str(v.attachment_filename),
      };
    } else {
      out[key] = null;
    }
  }
  return out;
}

export function isLaLetter(value: unknown): value is LaLetter {
  return (
    isRecord(value) &&
    isNum(value.letter_id) &&
    isNum(value.case_id) &&
    isStr(value.stage_code) &&
    isStr(value.issue_date) &&
    isStr(value.body)
  );
}

function toLetter<T extends LaLetter>(value: T): T {
  const raw = value as unknown as Record<string, unknown>;
  return {
    ...value,
    letter_no: num(raw.letter_no),
    forced: num(raw.forced) ?? 0,
    stage_label: str(raw.stage_label) ?? value.stage_code,
    receipts: Array.isArray(raw.receipts) ? (raw.receipts as unknown[]).filter(isReceipt) : [],
    attachments: toAttachments(raw.attachments),
  };
}

export function isLaEvent(value: unknown): value is LaEvent {
  return (
    isRecord(value) &&
    isNum(value.event_id) &&
    isNum(value.case_id) &&
    isStr(value.event_type) &&
    isStr(value.event_date)
  );
}

function toEvent(value: LaEvent): LaEvent {
  const raw = value as unknown as Record<string, unknown>;
  return {
    ...value,
    event_type_label: str(raw.event_type_label) ?? value.event_type,
    channel_label: str(raw.channel_label),
    attachment_id: num(raw.attachment_id),
    attachment_filename: str(raw.attachment_filename),
    updated_by: num(raw.updated_by),
  };
}

export function isLaCaseDetail(value: unknown): value is LaCaseDetail {
  return (
    isRecord(value) &&
    isLaCase(value.case) &&
    isArrayOf(value.letters, isLaLetter) &&
    isArrayOf(value.events, isLaEvent)
  );
}

export function isLaPreview(value: unknown): value is LaPreview {
  return (
    isRecord(value) &&
    isStr(value.body) &&
    (value.subject == null || isStr(value.subject)) &&
    (value.blocked_reason == null || isStr(value.blocked_reason))
  );
}

function toPreview(value: LaPreview, requested: string | null): LaPreview {
  const raw = value as unknown as Record<string, unknown>;
  return {
    case_id: num(raw.case_id),
    case_no: str(raw.case_no),
    stage_code: str(raw.stage_code) ?? requested ?? "",
    stage_label: str(raw.stage_label),
    template_code: str(raw.template_code),
    template_label: str(raw.template_label),
    letter_no: num(raw.letter_no),
    subject: str(raw.subject) ?? "",
    body: value.body,
    editable: bool(raw.editable),
    blocked_reason: str(raw.blocked_reason),
    blocked_code: str(raw.blocked_code),
    can_force: bool(raw.can_force),
    issue_date: str(raw.issue_date) ?? str(raw.letter_date),
    due_date: str(raw.due_date),
    reply_due_date: str(raw.reply_due_date),
    dispatch_mode: str(raw.dispatch_mode),
  };
}

export function isLaLetterDueRow(value: unknown): value is LaLetterDueRow {
  return isRecord(value) && isNum(value.case_id) && isStr(value.next_stage_code);
}

function toLetterDue(value: LaLetterDueRow): LaLetterDueRow {
  const raw = value as unknown as Record<string, unknown>;
  return {
    case_id: value.case_id,
    case_no: str(raw.case_no),
    emp_code: str(raw.emp_code),
    emp_name: str(raw.emp_name),
    dept_desc: str(raw.dept_desc),
    stage_code: str(raw.stage_code),
    stage_label: str(raw.stage_label),
    next_stage_code: value.next_stage_code,
    next_stage_label: str(raw.next_stage_label),
    next_due_date: str(raw.next_due_date) ?? str(raw.due_date),
    absent_days: num(raw.absent_days),
  };
}

export function isLaDispatchRow(value: unknown): value is LaDispatchRow {
  return isRecord(value) && isNum(value.letter_id) && isNum(value.case_id) && isStr(value.stage_code);
}

function toDispatchRow(value: LaDispatchRow): LaDispatchRow {
  const raw = value as unknown as Record<string, unknown>;
  const base = toLetter({ ...value, body: str(raw.body) ?? "", issue_date: str(raw.issue_date) ?? "" });
  return {
    ...base,
    case_no: str(raw.case_no),
    emp_code: str(raw.emp_code),
    emp_name: str(raw.emp_name),
    dept_desc: str(raw.dept_desc),
    designation: str(raw.designation),
    address: str(raw.address),
  };
}

export function isLaTemplate(value: unknown): value is LaTemplate {
  return isRecord(value) && isStr(value.template_code) && isStr(value.body);
}

function toTemplate(value: LaTemplate): LaTemplate {
  const raw = value as unknown as Record<string, unknown>;
  return {
    template_code: value.template_code,
    label: str(raw.label) ?? value.template_code,
    lang: str(raw.lang) ?? "en",
    subject: str(raw.subject) ?? "",
    body: value.body,
    is_default: bool(raw.is_default),
    updated_date_time: str(raw.updated_date_time),
  };
}

export function isLaPermissions(value: unknown): value is LaPermissions {
  return isRecord(value) && ("can_send" in value || "canApprove" in value || isRecord(value.permissions));
}

function toPermissions(value: Record<string, unknown>): LaPermissions {
  // The engine's flags may be merged in (flat) or nested under `permissions`.
  const flags = isRecord(value.permissions) ? value.permissions : value;
  return {
    canApprove: bool(flags.canApprove),
    canReject: bool(flags.canReject),
    canReopen: bool(flags.canReopen),
    canViewApprovalLog: bool(flags.canViewApprovalLog),
    status_id: num(value.status_id),
    approval_level: num(value.approval_level),
    max_approval_level: num(value.max_approval_level),
    hierarchy_exists: bool(value.hierarchy_exists),
    can_send: bool(value.can_send),
    send_blocked_reason: str(value.send_blocked_reason),
  };
}

export function isLaStageSummary(value: unknown): value is LaStageSummary {
  return isRecord(value) && Array.isArray(value.by_dept);
}

function toStageSummary(value: LaStageSummary): LaStageSummary {
  const raw = value as unknown as Record<string, unknown>;
  const byDept = (raw.by_dept as unknown[]).filter(isRecord).map((d) => {
    const counts: Record<string, number> = {};
    if (isRecord(d.counts)) {
      for (const [k, v] of Object.entries(d.counts)) counts[k] = num(v) ?? 0;
    }
    return {
      dept_desc: str(d.dept_desc) ?? "",
      counts,
      parked: num(d.parked) ?? 0,
      total_live: num(d.total_live) ?? 0,
    };
  });
  const exits = Array.isArray(raw.exits)
    ? (raw.exits as unknown[]).filter(isRecord).map((e) => ({
        exit_reason: str(e.exit_reason) ?? "",
        label: str(e.label) ?? str(e.exit_reason) ?? "",
        count: num(e.count) ?? 0,
      }))
    : [];
  return { by_dept: byDept, exits, as_on: str(raw.as_on) };
}

export function isLaRegisterRow(value: unknown): value is LaRegisterRow {
  return isRecord(value) && (isStr(value.case_no) || isNum(value.case_id) || isStr(value.emp_code));
}

const REGISTER_TEXT_KEYS = [
  "case_no",
  "emp_code",
  "emp_name",
  "dept_desc",
  "designation",
  "last_working_date",
  "warning1_date",
  "warning1_sent",
  "warning2_date",
  "warning2_sent",
  "warning3_date",
  "warning3_sent",
  "show_cause_date",
  "gate_notice_date",
  "struck_off_date",
  "remarks",
] as const;

function toRegisterRow(value: LaRegisterRow): LaRegisterRow {
  const raw = value as unknown as Record<string, unknown>;
  const out = { case_id: num(raw.case_id) } as LaRegisterRow;
  for (const k of REGISTER_TEXT_KEYS) out[k] = str(raw[k]);
  return out;
}

export function isLaTrendRow(value: unknown): value is LaTrendRow {
  return isRecord(value) && isStr(value.month);
}

function toTrendRow(value: LaTrendRow): LaTrendRow {
  const raw = value as unknown as Record<string, unknown>;
  return {
    month: value.month,
    opened: num(raw.opened) ?? 0,
    struck_off: num(raw.struck_off) ?? 0,
    rejoined: num(raw.rejoined) ?? 0,
    other_exits: num(raw.other_exits) ?? 0,
  };
}

function isPerfRow(value: unknown): value is LaPerfRow {
  return isRecord(value) && isStr(value.tran_date);
}

function toPerfRow(value: LaPerfRow): LaPerfRow {
  const raw = value as unknown as Record<string, unknown>;
  return {
    tran_date: value.tran_date,
    shift: str(raw.shift),
    spell_code: str(raw.spell_code),
    machine_id: num(raw.machine_id),
    machine: str(raw.machine),
    quality_id: num(raw.quality_id),
    quality: str(raw.quality),
    prod_kg: num(raw.prod_kg),
    std_kg: num(raw.std_kg),
    eff_pct: num(raw.eff_pct),
    hours: num(raw.hours),
  };
}

export function isLaPerformance(value: unknown): value is LaPerformance {
  if (!isRecord(value) || typeof value.available !== "boolean") return false;
  if (!value.available) return true;
  return isRecord(value.summary) && Array.isArray(value.rows);
}

function toPerformance(value: LaPerformance): LaPerformance {
  const raw = value as unknown as Record<string, unknown>;
  if (!value.available) {
    return { available: false, reason: str(raw.reason) ?? "Performance is not available for this worker" };
  }
  const s = raw.summary as Record<string, unknown>;
  return {
    available: true,
    dept: str(raw.dept) ?? "",
    date_from: str(raw.date_from) ?? str(raw.perf_from),
    date_to: str(raw.date_to) ?? str(raw.perf_to),
    summary: {
      days_worked: num(s.days_worked) ?? 0,
      rows: num(s.rows) ?? 0,
      prod_kg: num(s.prod_kg) ?? 0,
      std_kg: num(s.std_kg) ?? 0,
      avg_eff: num(s.avg_eff),
      kg_per_hr: num(s.kg_per_hr),
    },
    rows: (raw.rows as unknown[]).filter(isPerfRow).map(toPerfRow),
  };
}

// ─── Transport ───────────────────────────────────────────────────────

/** Calls the endpoint and returns the `data` member, or throws Error(detail). */
async function request(
  url: string,
  fallbackError: string,
  method: "GET" | "POST" = "GET",
  body?: unknown,
): Promise<unknown> {
  const res = await fetchWithCookie<unknown>(url, method, body);
  if (res.error) throw new Error(res.error);
  const payload: unknown = res.data;
  if (!isRecord(payload) || !("data" in payload)) throw new Error(fallbackError);
  return payload.data;
}

/** Narrows the response or throws a readable error (backend / contract drift). */
function expectShape<T>(value: unknown, guard: (v: unknown) => v is T, what: string): T {
  if (!guard(value)) throw new Error(`Unexpected response for ${what}`);
  return value;
}

function expectList<T>(value: unknown, guard: (v: unknown) => v is T, what: string): T[] {
  return expectShape(value, (v): v is T[] => isArrayOf(v, guard), what);
}

/** Query string of the non-empty params (null / undefined / "" are dropped; 0 is kept). */
export function qs(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  return search.toString();
}

/** The case of a response that is either the case itself or `{ case, ... }`; null otherwise. */
export function extractCase(data: unknown): LaCase | null {
  if (isLaCase(data)) return toCase(data);
  if (isRecord(data) && isLaCase(data.case)) return toCase(data.case);
  return null;
}

function requireCase(data: unknown, what: string): LaCase {
  const c = extractCase(data);
  if (!c) throw new Error(`Unexpected response for ${what}`);
  return c;
}

const R = apiRoutesPortalMasters;

// ─── Setup / candidates / list / case ────────────────────────────────

/** Code lists + rule + the branch's departments + server date + access level. */
export async function fetchLaSetup(coId: number, branchId: number): Promise<LaSetup> {
  const data = await request(
    `${R.LA_SETUP}?${qs({ co_id: coId, branch_id: branchId })}`,
    "Failed to load the long absenteeism setup",
  );
  return toSetup(expectShape(data, isLaSetup, "long absenteeism setup"));
}

export interface LaCandidateParams {
  coId: number;
  branchId: number;
  /** YYYY-MM-DD; server default = today (IST). */
  asOn?: string | null;
  deptId?: number | null;
}

/** Workers absent >= detect_days who have no live (or snoozed) case. */
export async function fetchLaCandidates(params: LaCandidateParams): Promise<LaCandidate[]> {
  const data = await request(
    `${R.LA_CANDIDATES}?${qs({
      co_id: params.coId,
      branch_id: params.branchId,
      as_on: params.asOn ?? undefined,
      dept_id: params.deptId ?? undefined,
    })}`,
    "Failed to load the candidates",
  );
  return expectList(data, isLaCandidate, "candidates").map(toCandidate);
}

export interface LaListParams {
  coId: number;
  branchId: number;
  view: LaListView;
  deptId?: number | null;
  stageCode?: string | null;
  /** Matches EB No / name. */
  q?: string | null;
}

/** Cases of a branch for a view (due = live cases with a band other than NONE). */
export async function fetchLaList(params: LaListParams): Promise<LaListRow[]> {
  const data = await request(
    `${R.LA_LIST}?${qs({
      co_id: params.coId,
      branch_id: params.branchId,
      view: params.view,
      dept_id: params.deptId ?? undefined,
      stage_code: params.stageCode ?? undefined,
      q: params.q?.trim() || undefined,
    })}`,
    "Failed to load the long absenteeism list",
  );
  return expectList(data, isLaListRow, "long absenteeism list").map(toListRow);
}

/** One case with its letters (receipts + attachments), events (newest first) and earlier cases. */
export async function fetchLaCase(coId: number, caseId: number): Promise<LaCaseDetail> {
  const data = await request(`${R.LA_GET}?${qs({ co_id: coId, case_id: caseId })}`, "Failed to load the case");
  const d = expectShape(data, isLaCaseDetail, "case");
  const raw = d as unknown as Record<string, unknown>;
  return {
    case: toCase(d.case),
    letters: d.letters.map(toLetter),
    events: d.events.map(toEvent),
    earlier_cases: Array.isArray(raw.earlier_cases) ? (raw.earlier_cases as unknown[]).filter(isEarlierCase) : [],
  };
}

/** Opens a case for a worker of the branch. 409 when a live case exists. */
export async function openLaCase(payload: LaOpenPayload): Promise<LaCase> {
  const data = await request(R.LA_OPEN, "Failed to open the case", "POST", payload);
  return requireCase(data, "open case");
}

/** Records a candidate that should not become a case (closed DISMISSED row, snoozed). */
export async function dismissLaCandidate(payload: LaDismissPayload): Promise<LaCase> {
  const data = await request(R.LA_DISMISS, "Failed to dismiss the candidate", "POST", payload);
  return requireCase(data, "dismiss candidate");
}

/** ESI / STL check + time keeper confirmation (moves DETECTED -> VERIFIED when clear). */
export async function verifyLaCase(payload: LaVerifyPayload): Promise<LaCase> {
  const data = await request(R.LA_VERIFY, "Failed to save the verification", "POST", payload);
  return requireCase(data, "verify case");
}

/** Remarks / extras / habitual (create) or last working date (edit). Only sent keys change. */
export async function updateLaCase(payload: LaUpdatePayload): Promise<LaCase> {
  const data = await request(R.LA_UPDATE, "Failed to update the case", "POST", payload);
  return requireCase(data, "update case");
}

/** Open -> parked (a reply is under review; the case stops ageing). */
export async function parkLaCase(payload: LaNotePayload): Promise<LaCase> {
  const data = await request(R.LA_PARK, "Failed to park the case", "POST", payload);
  return requireCase(data, "park case");
}

/** Parked -> open. */
export async function resumeLaCase(payload: LaNotePayload): Promise<LaCase> {
  const data = await request(R.LA_RESUME, "Failed to resume the case", "POST", payload);
  return requireCase(data, "resume case");
}

/** Closes a live case with a reason (rejoined, ESI, resigned …). */
export async function exitLaCase(payload: LaExitPayload): Promise<LaCase> {
  const data = await request(R.LA_EXIT, "Failed to close the case", "POST", payload);
  return requireCase(data, "exit case");
}

/** Closed -> open (not after struck off). */
export async function reopenLaCase(payload: LaNotePayload): Promise<LaCase> {
  const data = await request(R.LA_REOPEN, "Failed to reopen the case", "POST", payload);
  return requireCase(data, "reopen case");
}

// ─── Events ──────────────────────────────────────────────────────────

/** Active timeline entries of a case (with the latest attachment), newest first. */
export async function fetchLaEvents(coId: number, caseId: number): Promise<LaEvent[]> {
  const data = await request(`${R.LA_EVENTS}?${qs({ co_id: coId, case_id: caseId })}`, "Failed to load the timeline");
  return expectList(data, isLaEvent, "timeline").map(toEvent);
}

/** Adds a remark / feedback / reply. A REPLY with park (default) parks an open case. */
export async function createLaEvent(payload: LaEventCreatePayload): Promise<LaEventResult> {
  const data = await request(R.LA_EVENT_CREATE, "Failed to save the entry", "POST", payload);
  if (isRecord(data) && isLaEvent(data.event)) {
    return { event: toEvent(data.event), case: extractCase(data) };
  }
  if (isLaEvent(data)) return { event: toEvent(data), case: null };
  throw new Error("Unexpected response for timeline entry");
}

/** Edits a user entry (its type cannot change). */
export async function updateLaEvent(payload: LaEventUpdatePayload): Promise<LaEvent> {
  const data = await request(R.LA_EVENT_UPDATE, "Failed to update the entry", "POST", payload);
  const ev = isRecord(data) && isLaEvent(data.event) ? data.event : data;
  return toEvent(expectShape(ev, isLaEvent, "timeline entry"));
}

/** Removes (deactivates) a user entry. */
export async function deactivateLaEvent(coId: number, eventId: number): Promise<LaEventDeactivated> {
  const data = await request(R.LA_EVENT_DEACTIVATE, "Failed to remove the entry", "POST", {
    co_id: coId,
    event_id: eventId,
  });
  if (isRecord(data) && num(data.event_id) != null) {
    return { event_id: num(data.event_id) ?? eventId, active: num(data.active) ?? 0 };
  }
  throw new Error("Unexpected response for entry removal");
}

/** Production in the 30 days before the last working date (weaving / spinning / winding only). */
export async function fetchLaPerformance(coId: number, caseId: number): Promise<LaPerformance> {
  const data = await request(
    `${R.LA_PERFORMANCE}?${qs({ co_id: coId, case_id: caseId })}`,
    "Failed to load the performance",
  );
  return toPerformance(expectShape(data, isLaPerformance, "performance"));
}

// ─── Rule / templates ────────────────────────────────────────────────

export async function fetchLaRule(coId: number): Promise<LaRule> {
  const data = await request(`${R.LA_RULE}?${qs({ co_id: coId })}`, "Failed to load the settings");
  return toRule(expectShape(data, isLaRule, "settings") as unknown as Record<string, unknown>);
}

/** Saves the company's rule; returns the merged rule. */
export async function saveLaRule(payload: LaRuleSavePayload): Promise<LaRule> {
  const data = await request(R.LA_RULE_SAVE, "Failed to save the settings", "POST", payload);
  const rule = isRecord(data) && isLaRule(data.rule) ? data.rule : data;
  return toRule(expectShape(rule, isLaRule, "settings") as unknown as Record<string, unknown>);
}

/** The six templates (WARNING_1/2/3, SHOW_CAUSE, GATE_NOTICE, STRUCK_OFF_MEMO; saved row or code default) + the placeholder list. */
export async function fetchLaTemplates(coId: number): Promise<LaTemplates> {
  const data = await request(`${R.LA_TEMPLATES}?${qs({ co_id: coId })}`, "Failed to load the templates");
  if (isArrayOf(data, isLaTemplate)) return { templates: data.map(toTemplate), placeholders: [] };
  if (isRecord(data) && isArrayOf(data.templates, isLaTemplate)) {
    return {
      templates: data.templates.map(toTemplate),
      placeholders: Array.isArray(data.placeholders) ? (data.placeholders as unknown[]).filter(isCodeLabel) : [],
    };
  }
  throw new Error("Unexpected response for templates");
}

function templateOrNull(data: unknown): LaTemplate | null {
  if (isLaTemplate(data)) return toTemplate(data);
  if (isRecord(data) && isLaTemplate(data.template)) return toTemplate(data.template);
  return null;
}

/** Saves a template (400 names an unknown {placeholder}). Returns the saved template when the API echoes it. */
export async function saveLaTemplate(payload: LaTemplateSavePayload): Promise<LaTemplate | null> {
  const data = await request(R.LA_TEMPLATE_SAVE, "Failed to save the template", "POST", payload);
  return templateOrNull(data);
}

/** Drops the company's saved template (back to the default). */
export async function resetLaTemplate(coId: number, templateCode: string): Promise<LaTemplate | null> {
  const data = await request(R.LA_TEMPLATE_RESET, "Failed to reset the template", "POST", {
    co_id: coId,
    template_code: templateCode,
  });
  return templateOrNull(data);
}

// ─── Letters ─────────────────────────────────────────────────────────

/** Active letters of a case with union receipts and the latest attachments. */
export async function fetchLaLetters(coId: number, caseId: number): Promise<LaLetter[]> {
  const data = await request(`${R.LA_LETTERS}?${qs({ co_id: coId, case_id: caseId })}`, "Failed to load the letters");
  return expectList(data, isLaLetter, "letters").map(toLetter);
}

export interface LaLettersDueParams {
  coId: number;
  branchId: number;
  stageCode?: string | null;
}

/** Live open cases whose next letter can be issued today (batch dialog). */
export async function fetchLaLettersDue(params: LaLettersDueParams): Promise<LaLetterDueRow[]> {
  const data = await request(
    `${R.LA_LETTERS_DUE}?${qs({
      co_id: params.coId,
      branch_id: params.branchId,
      stage_code: params.stageCode ?? undefined,
    })}`,
    "Failed to load the letters due",
  );
  return expectList(data, isLaLetterDueRow, "letters due").map(toLetterDue);
}

/**
 * Merged subject / body for the next stage (or the given one) + why it is
 * blocked, if it is. `opts` lets the Templates tab preview unsaved text, or a
 * case picked by its number (pass caseId null then).
 */
export async function previewLaLetter(
  coId: number,
  caseId: number | null,
  stageCode?: string | null,
  opts: LaPreviewOptions = {},
): Promise<LaPreview> {
  const data = await request(R.LA_LETTER_PREVIEW, "Failed to prepare the letter", "POST", {
    co_id: coId,
    ...(caseId != null ? { case_id: caseId } : {}),
    ...(opts.caseNo?.trim() ? { case_no: opts.caseNo.trim() } : {}),
    ...(stageCode ? { stage_code: stageCode } : {}),
    ...(opts.issueDate ? { issue_date: opts.issueDate } : {}),
    ...(opts.templateSubject != null ? { template_subject: opts.templateSubject } : {}),
    ...(opts.templateBody != null ? { template_body: opts.templateBody } : {}),
  });
  return toPreview(expectShape(data, isLaPreview, "letter preview"), stageCode ?? null);
}

/** Issues one letter (the server renders the template); `force` + reason bypasses the wait / sent-date gates. */
export async function issueLaLetter(payload: LaIssuePayload): Promise<LaIssueResult> {
  const data = await request(R.LA_LETTER_ISSUE, "Failed to issue the letter", "POST", payload);
  if (isRecord(data) && isLaLetter(data.letter)) {
    const c = extractCase(data);
    if (c) return { letter: toLetter(data.letter), case: c };
  }
  throw new Error("Unexpected response for letter issue");
}

/** Issues the next letter of each case with the default template text (never forces). */
export async function issueLaLetterBatch(payload: LaIssueBatchPayload): Promise<LaBatchResult> {
  const data = await request(R.LA_LETTER_ISSUE_BATCH, "Failed to issue the letters", "POST", payload);
  if (!isRecord(data) || !Array.isArray(data.issued)) throw new Error("Unexpected response for batch issue");
  const issued = (data.issued as unknown[]).filter(isRecord).flatMap((r) => {
    const caseId = num(r.case_id);
    const letterId = num(r.letter_id);
    return caseId != null && letterId != null
      ? [
          {
            case_id: caseId,
            letter_id: letterId,
            stage_code: str(r.stage_code) ?? "",
            stage_label: str(r.stage_label),
            case_no: str(r.case_no),
            emp_code: str(r.emp_code),
            emp_name: str(r.emp_name),
            subject: str(r.subject),
            body: str(r.body),
          },
        ]
      : [];
  });
  const skipped = Array.isArray(data.skipped)
    ? (data.skipped as unknown[]).filter(isRecord).flatMap((r) => {
        const caseId = num(r.case_id);
        return caseId != null ? [{ case_id: caseId, reason: str(r.reason) ?? "" }] : [];
      })
    : [];
  return { batch_ref: str(data.batch_ref), issue_date: str(data.issue_date), issued, skipped };
}

/** Sent date / dispatch / A.D. / delivery / display dates; only sent keys change. */
export async function updateLaLetter(payload: LaLetterUpdatePayload): Promise<LaLetterUpdateResult> {
  const data = await request(R.LA_LETTER_UPDATE, "Failed to update the letter", "POST", payload);
  if (isLaLetter(data)) return { letter: toLetter(data), case: null };
  if (isRecord(data) && isLaLetter(data.letter)) return { letter: toLetter(data.letter), case: extractCase(data) };
  return { letter: null, case: extractCase(data) };
}

export interface LaDispatchParams {
  coId: number;
  branchId: number;
  dateFrom: string;
  dateTo: string;
  batchRef?: string | null;
  stageCode?: string | null;
}

/** Letters issued in a date range (newest batch first). */
export async function fetchLaDispatch(params: LaDispatchParams): Promise<LaDispatchRow[]> {
  const data = await request(
    `${R.LA_DISPATCH}?${qs({
      co_id: params.coId,
      branch_id: params.branchId,
      date_from: params.dateFrom,
      date_to: params.dateTo,
      batch_ref: params.batchRef?.trim() || undefined,
      stage_code: params.stageCode ?? undefined,
    })}`,
    "Failed to load the dispatch register",
  );
  return expectList(data, isLaDispatchRow, "dispatch register").map(toDispatchRow);
}

// ─── Union receipts ──────────────────────────────────────────────────

function receiptOf(data: unknown, what: string): LaReceipt {
  const r = isRecord(data) && isReceipt(data.receipt) ? data.receipt : data;
  return expectShape(r, isReceipt, what);
}

export async function createLaReceipt(payload: LaReceiptCreatePayload): Promise<LaReceipt> {
  const data = await request(R.LA_RECEIPT_CREATE, "Failed to save the union receipt", "POST", payload);
  return receiptOf(data, "union receipt");
}

export async function updateLaReceipt(payload: LaReceiptUpdatePayload): Promise<LaReceipt> {
  const data = await request(R.LA_RECEIPT_UPDATE, "Failed to update the union receipt", "POST", payload);
  return receiptOf(data, "union receipt");
}

export async function deactivateLaReceipt(coId: number, receiptId: number): Promise<void> {
  await request(R.LA_RECEIPT_DEACTIVATE, "Failed to remove the union receipt", "POST", {
    co_id: coId,
    receipt_id: receiptId,
  });
}

/** Union names used before in the branch, most used first (suggestions; free text is allowed). */
export async function fetchLaUnionNames(coId: number, branchId: number): Promise<string[]> {
  const data = await request(
    `${R.LA_UNION_NAMES}?${qs({ co_id: coId, branch_id: branchId })}`,
    "Failed to load the union names",
  );
  if (!Array.isArray(data)) throw new Error("Unexpected response for union names");
  const names = data.flatMap((v) => {
    if (isStr(v)) return [v];
    if (isRecord(v) && isStr(v.union_name)) return [v.union_name];
    return [];
  });
  return [...new Set(names.map((n) => n.trim()).filter(Boolean))];
}

// ─── Struck-off approval ─────────────────────────────────────────────

/** Gate notice served and its reply window over: status_id -> 20, level 1. */
export async function sendLaStruckOff(coId: number, caseId: number): Promise<LaCase | null> {
  const data = await request(R.LA_STRUCK_OFF_SEND, "Failed to send for struck-off approval", "POST", {
    co_id: coId,
    case_id: caseId,
  });
  return extractCase(data);
}

/** Approves (next level, or final: stage STRUCK_OFF + employee Terminated). */
export async function approveLaStruckOff(payload: LaApprovePayload): Promise<LaApproveResult> {
  const data = await request(R.LA_STRUCK_OFF_APPROVE, "Failed to approve the struck off", "POST", payload);
  const approval =
    isRecord(data) && isRecord(data.approval)
      ? {
          new_status_id: num(data.approval.new_status_id),
          new_approval_level: num(data.approval.new_approval_level),
          message: str(data.approval.message),
        }
      : null;
  return { case: extractCase(data), approval };
}

export async function rejectLaStruckOff(coId: number, caseId: number, reason: string): Promise<LaCase | null> {
  const data = await request(R.LA_STRUCK_OFF_REJECT, "Failed to reject the struck off", "POST", {
    co_id: coId,
    case_id: caseId,
    reason,
  });
  return extractCase(data);
}

/** Rejected (4) -> not started, so it can be sent again. */
export async function reopenLaStruckOff(coId: number, caseId: number): Promise<LaCase | null> {
  const data = await request(R.LA_STRUCK_OFF_REOPEN, "Failed to reopen the struck-off approval", "POST", {
    co_id: coId,
    case_id: caseId,
  });
  return extractCase(data);
}

export async function fetchLaStruckOffPermissions(coId: number, caseId: number): Promise<LaPermissions> {
  const data = await request(
    `${R.LA_STRUCK_OFF_PERMISSIONS}?${qs({ co_id: coId, case_id: caseId })}`,
    "Failed to load the approval permissions",
  );
  return toPermissions(expectShape(data, isLaPermissions, "approval permissions") as unknown as Record<string, unknown>);
}

// ─── Reports ─────────────────────────────────────────────────────────

export interface LaRegisterParams {
  coId: number;
  branchId: number;
  dateFrom: string;
  dateTo: string;
  deptId?: number | null;
}

/** Struck-off cases with struck_off_date in the range. */
export async function fetchLaStruckOffRegister(params: LaRegisterParams): Promise<LaRegisterRow[]> {
  const data = await request(
    `${R.LA_REPORT_STRUCK_OFF_REGISTER}?${qs({
      co_id: params.coId,
      branch_id: params.branchId,
      date_from: params.dateFrom,
      date_to: params.dateTo,
      dept_id: params.deptId ?? undefined,
    })}`,
    "Failed to load the struck-off register",
  );
  return expectList(data, isLaRegisterRow, "struck-off register").map(toRegisterRow);
}

export interface LaStageSummaryParams {
  coId: number;
  branchId: number;
  asOn?: string | null;
}

/** Live cases per department and stage + exits of the last 90 days. */
export async function fetchLaStageSummary(params: LaStageSummaryParams): Promise<LaStageSummary> {
  const data = await request(
    `${R.LA_REPORT_STAGE_SUMMARY}?${qs({
      co_id: params.coId,
      branch_id: params.branchId,
      as_on: params.asOn ?? undefined,
    })}`,
    "Failed to load the stage summary",
  );
  return toStageSummary(expectShape(data, isLaStageSummary, "stage summary"));
}

export interface LaMonthlyTrendParams {
  coId: number;
  branchId: number;
  months?: number;
}

/** Cases opened / struck off / rejoined / other exits per month. */
export async function fetchLaMonthlyTrend(params: LaMonthlyTrendParams): Promise<LaTrendRow[]> {
  const data = await request(
    `${R.LA_REPORT_MONTHLY_TREND}?${qs({
      co_id: params.coId,
      branch_id: params.branchId,
      months: params.months ?? 12,
    })}`,
    "Failed to load the monthly trend",
  );
  return expectList(data, isLaTrendRow, "monthly trend").map(toTrendRow);
}
