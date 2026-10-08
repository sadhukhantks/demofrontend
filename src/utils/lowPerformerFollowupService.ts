/**
 * Low Performer Follow-up service.
 *
 * Backend: vowerp3be src/juteProduction/low_performer_followup.py, mounted at
 * /api/lowPerformerFollowup (portal persona, cookie auth). Every response is
 * `{ data: ... }`; errors are 4xx/5xx with `{ detail }`, which fetchWithCookie
 * already flattens into `error`.
 *
 * The mill marks a few workers (by EB No) whose production / efficiency must
 * be followed up, then keeps a dated record of remarks, warning notices and
 * hour cuts against that follow-up, and compares the person's performance with
 * the others on the same machine / count. Every function here throws
 * `Error(detail)` on failure so callers only need one try/catch.
 */

import { apiRoutesPortalMasters } from "@/utils/api";
import { fetchWithCookie } from "@/utils/apiClient2";

// ─── Codes and setup ─────────────────────────────────────────────────

export type FollowupDeptCode = "WEAVING" | "SPINNING" | "WINDING";
export type FollowupEventType = "REMARK" | "NOTICE" | "HOURS_CUT";

export interface CodeLabel {
  code: string;
  label: string;
}

export interface FollowupSpell {
  spell_id: number;
  spell_code: string;
  spell_name: string | null;
  working_hours: number | null;
}

/** GET /setup — the code lists (with labels) and the branch's spells. */
export interface FollowupSetup {
  depts: CodeLabel[];
  notice_types: CodeLabel[];
  close_reasons: CodeLabel[];
  event_types: CodeLabel[];
  /** Spells of the branch, for the hour-cut form. */
  spells: FollowupSpell[];
  /** Server date (YYYY-MM-DD). */
  today: string;
}

// ─── Follow-ups and events ───────────────────────────────────────────

/** GET /list -> FollowupRow[]; GET /get and POST create/update/close/reopen -> FollowupRow. */
export interface FollowupRow {
  followup_id: number;
  co_id: number;
  branch_id: number;
  eb_id: number;
  eb_no: string | null;
  worker_name: string | null;
  dept_code: FollowupDeptCode;
  reason: string | null;
  start_date: string;
  review_date: string | null;
  /** 1 = open (being followed up), 0 = closed. */
  status: 0 | 1;
  closed_date: string | null;
  close_reason: string | null;
  close_remarks: string | null;
  remark_count: number;
  notice_count: number;
  hours_cut_count: number;
  total_hours_cut: number;
  /** Code of the latest notice, null if none. */
  last_notice_type: string | null;
  last_event_date: string | null;
  /** Open AND review_date <= today. */
  review_due: boolean;
  /** (closed_date or today) - start_date, in days. */
  days_tracked: number;
  updated_date_time: string | null;
}

/** GET /events -> FollowupEvent[] (newest first); event_create / event_update -> FollowupEvent. */
export interface FollowupEvent {
  followup_event_id: number;
  followup_id: number;
  event_type: FollowupEventType;
  event_date: string;
  notice_type: string | null;
  notice_type_label: string | null;
  issued_by: string | null;
  spell_id: number | null;
  spell_code: string | null;
  hours_cut: number | null;
  remarks: string | null;
  /** NOTICE scan, latest active. */
  attachment_id: number | null;
  attachment_filename: string | null;
  updated_by: number | null;
  updated_date_time: string | null;
}

/** POST /event_deactivate response. */
export interface FollowupEventDeactivated {
  followup_event_id: number;
  active: 0;
}

/** GET /tracked -> TrackedFollowup[] (open follow-ups only). */
export interface TrackedFollowup {
  followup_id: number;
  eb_id: number;
  dept_code: FollowupDeptCode;
  start_date: string;
  review_date: string | null;
}

// ─── Performance ─────────────────────────────────────────────────────

/** One row per day + spell (+ machine + quality) the person worked. */
export interface PerfRow {
  tran_date: string;
  shift: string;
  spell_code: string | null;
  machine_id: number | null;
  machine: string | null;
  quality_id: number | null;
  quality: string | null;
  prod_kg: number;
  std_kg: number | null;
  eff_pct: number | null;
  hours: number | null;
}

export interface SameMachineSummary {
  machine_id: number;
  machine: string | null;
  person_days: number;
  person_avg_eff: number | null;
  others_avg_eff: number | null;
  others_rows: number;
  /** person - others (efficiency points). */
  diff: number | null;
  /** Production per hour worked — shown next to efficiency (no standard = no efficiency). */
  person_kg_per_hr: number | null;
  others_kg_per_hr: number | null;
}

export interface SameMachineRow {
  tran_date: string;
  machine_id: number;
  machine: string | null;
  person_spells: string;
  person_eff: number | null;
  other_eb_id: number | null;
  other_eb_no: string | null;
  other_name: string | null;
  other_spell_code: string | null;
  other_shift: string;
  quality: string | null;
  other_eff: number | null;
  person_prod_kg: number;
  other_prod_kg: number;
  other_hours: number | null;
}

export interface SameQualityRow {
  quality_id: number | null;
  quality: string | null;
  person_days: number;
  person_rows: number;
  person_avg_eff: number | null;
  /** Everyone on that quality, on the dates the person worked it. */
  dept_avg_eff: number | null;
  /** Same, excluding the person. */
  others_avg_eff: number | null;
  /** Distinct other workers on it those dates. */
  others_workers: number;
  /** Everyone on that quality over the whole window. */
  range_dept_avg_eff: number | null;
  /** person - others. */
  diff: number | null;
  person_kg_per_hr: number | null;
  others_kg_per_hr: number | null;
}

export interface TrendWeek {
  /** 1 = first week from start_date; <= 0 = before marking. */
  week_no: number;
  week_start: string;
  week_end: string;
  days_worked: number;
  prod_kg: number;
  /** Person. */
  avg_eff: number | null;
  /** Other workers on the same date + quality pairs as the person that week. */
  peer_avg_eff: number | null;
  kg_per_hr: number | null;
  peer_kg_per_hr: number | null;
}

export interface FollowupPerformance {
  followup: FollowupRow;
  date_from: string;
  date_to: string;
  /** Longest window one request may ask for (explicit From / To). */
  max_days: number;
  /** Longest window when no dates are sent (shorter than max_days for weaving). */
  default_days: number;
  /** The default window was shortened (to default_days, on a week boundary). */
  clipped: boolean;
  person_rows: PerfRow[];
  person_summary: {
    days_worked: number;
    rows: number;
    prod_kg: number;
    std_kg: number;
    avg_eff: number | null;
    kg_per_hr: number | null;
  };
  same_machine: { summary: SameMachineSummary[]; rows: SameMachineRow[] };
  same_quality: SameQualityRow[];
  weekly_trend: TrendWeek[];
  notes: string[];
}

// ─── Request payloads ────────────────────────────────────────────────

export interface CreateFollowupPayload {
  co_id: number;
  branch_id: number;
  /** Send eb_no (emp code) or eb_id; the backend resolves it and checks the branch. */
  eb_no?: string;
  eb_id?: number;
  dept_code: FollowupDeptCode;
  reason?: string;
  start_date: string;
  review_date?: string | null;
}

export interface UpdateFollowupPayload {
  co_id: number;
  followup_id: number;
  reason?: string;
  start_date: string;
  review_date?: string | null;
}

export interface CloseFollowupPayload {
  co_id: number;
  followup_id: number;
  closed_date: string;
  close_reason: string;
  close_remarks?: string;
}

export interface CreateFollowupEventPayload {
  co_id: number;
  followup_id: number;
  event_type: FollowupEventType;
  event_date: string;
  notice_type?: string | null;
  issued_by?: string | null;
  spell_id?: number | null;
  hours_cut?: number | null;
  remarks?: string | null;
}

/** event_type cannot change on update. */
export interface UpdateFollowupEventPayload {
  co_id: number;
  followup_event_id: number;
  event_date: string;
  notice_type?: string | null;
  issued_by?: string | null;
  spell_id?: number | null;
  hours_cut?: number | null;
  remarks?: string | null;
}

/** What the generic attachment upload returns for the notice scan. */
export interface FollowupNoticeAttachment {
  attachment_id: number;
  original_filename: string;
  size_bytes?: number;
  mime_type?: string;
}

/** Notice scans go through the generic attachment subsystem under this slot. */
export const FOLLOWUP_ATTACHMENT_MODULE = "jute_prod_followup";
export const FOLLOWUP_NOTICE_FILE_TYPE = "notice";
/** Must match ALLOWED_MIME in vowerp3be src/common/attachments/constants.py. */
export const NOTICE_FILE_MIME_TYPES: ReadonlyArray<string> = Object.freeze([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
export const NOTICE_FILE_MAX_BYTES = 10 * 1024 * 1024;

// ─── Narrowing helpers ───────────────────────────────────────────────

const EVENT_TYPES: ReadonlyArray<string> = ["REMARK", "NOTICE", "HOURS_CUT"];

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

function isCodeLabel(value: unknown): value is CodeLabel {
  return isRecord(value) && isStr(value.code) && isStr(value.label);
}

function isFollowupSpell(value: unknown): value is FollowupSpell {
  return isRecord(value) && isNum(value.spell_id) && isStr(value.spell_code);
}

export function isFollowupSetup(value: unknown): value is FollowupSetup {
  return (
    isRecord(value) &&
    isArrayOf(value.depts, isCodeLabel) &&
    isArrayOf(value.notice_types, isCodeLabel) &&
    isArrayOf(value.close_reasons, isCodeLabel) &&
    isArrayOf(value.event_types, isCodeLabel) &&
    Array.isArray(value.spells) &&
    isStr(value.today)
  );
}

export function isFollowupRow(value: unknown): value is FollowupRow {
  return (
    isRecord(value) &&
    isNum(value.followup_id) &&
    isNum(value.branch_id) &&
    isNum(value.eb_id) &&
    isStr(value.dept_code) &&
    isStr(value.start_date) &&
    (value.status === 0 || value.status === 1)
  );
}

export function isFollowupEvent(value: unknown): value is FollowupEvent {
  return (
    isRecord(value) &&
    isNum(value.followup_event_id) &&
    isNum(value.followup_id) &&
    isStr(value.event_type) &&
    EVENT_TYPES.includes(value.event_type) &&
    isStr(value.event_date)
  );
}

function isTrackedFollowup(value: unknown): value is TrackedFollowup {
  return (
    isRecord(value) &&
    isNum(value.followup_id) &&
    isNum(value.eb_id) &&
    isStr(value.dept_code) &&
    isStr(value.start_date)
  );
}

export function isFollowupPerformance(value: unknown): value is FollowupPerformance {
  if (!isRecord(value)) return false;
  const sm = value.same_machine;
  return (
    isFollowupRow(value.followup) &&
    isStr(value.date_from) &&
    isStr(value.date_to) &&
    Array.isArray(value.person_rows) &&
    isRecord(value.person_summary) &&
    isRecord(sm) &&
    Array.isArray(sm.summary) &&
    Array.isArray(sm.rows) &&
    Array.isArray(value.same_quality) &&
    Array.isArray(value.weekly_trend) &&
    isArrayOf(value.notes, isStr)
  );
}

function isDeactivated(value: unknown): value is FollowupEventDeactivated {
  return isRecord(value) && isNum(value.followup_event_id);
}

function isNoticeAttachment(value: unknown): value is FollowupNoticeAttachment {
  return isRecord(value) && isNum(value.attachment_id) && isStr(value.original_filename);
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

function qs(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  return search.toString();
}

const R = apiRoutesPortalMasters;

// ─── Service functions ───────────────────────────────────────────────

/** Code lists + the branch's spells + the server date. */
export async function fetchFollowupSetup(coId: number, branchId: number): Promise<FollowupSetup> {
  const data = await request(
    `${R.LPF_SETUP}?${qs({ co_id: coId, branch_id: branchId })}`,
    "Failed to load the follow-up setup",
  );
  const setup = expectShape(data, isFollowupSetup, "follow-up setup");
  // A spell row without a code can't be offered in the hour-cut form — drop
  // it rather than fail the whole setup.
  return { ...setup, spells: setup.spells.filter(isFollowupSpell) };
}

export interface FollowupListParams {
  coId: number;
  branchId: number;
  deptCode?: FollowupDeptCode | null;
  /** 1 = open, 0 = closed, omitted = all. */
  status?: 0 | 1 | null;
}

/** Follow-ups of a branch, optionally narrowed to a department / status. */
export async function fetchFollowupList(params: FollowupListParams): Promise<FollowupRow[]> {
  const data = await request(
    `${R.LPF_LIST}?${qs({
      co_id: params.coId,
      branch_id: params.branchId,
      dept_code: params.deptCode ?? undefined,
      status: params.status ?? undefined,
    })}`,
    "Failed to load the follow-up list",
  );
  return expectShape(data, (v): v is FollowupRow[] => isArrayOf(v, isFollowupRow), "follow-up list");
}

/** One follow-up with its counts. */
export async function fetchFollowup(coId: number, followupId: number): Promise<FollowupRow> {
  const data = await request(
    `${R.LPF_GET}?${qs({ co_id: coId, followup_id: followupId })}`,
    "Failed to load the follow-up",
  );
  return expectShape(data, isFollowupRow, "follow-up");
}

/** Marks a person for follow-up. 409 when they already have an open one in the branch + dept. */
export async function createFollowup(payload: CreateFollowupPayload): Promise<FollowupRow> {
  const data = await request(R.LPF_CREATE, "Failed to add the follow-up", "POST", payload);
  return expectShape(data, isFollowupRow, "follow-up");
}

/** Edits the reason / start date / review date. */
export async function updateFollowup(payload: UpdateFollowupPayload): Promise<FollowupRow> {
  const data = await request(R.LPF_UPDATE, "Failed to update the follow-up", "POST", payload);
  return expectShape(data, isFollowupRow, "follow-up");
}

/** Closes a follow-up with a reason. */
export async function closeFollowup(payload: CloseFollowupPayload): Promise<FollowupRow> {
  const data = await request(R.LPF_CLOSE, "Failed to close the follow-up", "POST", payload);
  return expectShape(data, isFollowupRow, "follow-up");
}

/** Reopens a closed follow-up. 409 when another open one exists for the person. */
export async function reopenFollowup(coId: number, followupId: number): Promise<FollowupRow> {
  const data = await request(R.LPF_REOPEN, "Failed to reopen the follow-up", "POST", {
    co_id: coId,
    followup_id: followupId,
  });
  return expectShape(data, isFollowupRow, "follow-up");
}

/** Active events of a follow-up, newest first. */
export async function fetchFollowupEvents(coId: number, followupId: number): Promise<FollowupEvent[]> {
  const data = await request(
    `${R.LPF_EVENTS}?${qs({ co_id: coId, followup_id: followupId })}`,
    "Failed to load the follow-up timeline",
  );
  return expectShape(data, (v): v is FollowupEvent[] => isArrayOf(v, isFollowupEvent), "follow-up events");
}

/** Adds a remark / notice / hour cut (open follow-ups only). */
export async function createFollowupEvent(payload: CreateFollowupEventPayload): Promise<FollowupEvent> {
  const data = await request(R.LPF_EVENT_CREATE, "Failed to save the entry", "POST", payload);
  return expectShape(data, isFollowupEvent, "follow-up event");
}

/** Edits an event (its type cannot change). */
export async function updateFollowupEvent(payload: UpdateFollowupEventPayload): Promise<FollowupEvent> {
  const data = await request(R.LPF_EVENT_UPDATE, "Failed to update the entry", "POST", payload);
  return expectShape(data, isFollowupEvent, "follow-up event");
}

/** Removes (deactivates) an event. */
export async function deactivateFollowupEvent(
  coId: number,
  eventId: number,
): Promise<FollowupEventDeactivated> {
  const data = await request(R.LPF_EVENT_DEACTIVATE, "Failed to remove the entry", "POST", {
    co_id: coId,
    followup_event_id: eventId,
  });
  return expectShape(data, isDeactivated, "event removal");
}

export interface FollowupPerformanceParams {
  coId: number;
  followupId: number;
  /** Send both dates or neither (server default window). */
  dateFrom?: string | null;
  dateTo?: string | null;
}

/** Day + spell rows of the person plus the three comparisons and the weekly trend. */
export async function fetchFollowupPerformance(
  params: FollowupPerformanceParams,
): Promise<FollowupPerformance> {
  const from = params.dateFrom?.trim() ?? "";
  const to = params.dateTo?.trim() ?? "";
  if ((from === "") !== (to === "")) {
    throw new Error("Enter both From and To dates, or leave both blank");
  }
  const data = await request(
    `${R.LPF_PERFORMANCE}?${qs({
      co_id: params.coId,
      followup_id: params.followupId,
      date_from: from,
      date_to: to,
    })}`,
    "Failed to load the performance",
  );
  return expectShape(data, isFollowupPerformance, "follow-up performance");
}

export interface TrackedFollowupParams {
  coId: number;
  branchId: number;
  deptCode: FollowupDeptCode;
}

/** Open follow-ups of a branch + department — for the Low Producer report badges. */
export async function fetchTrackedFollowups(params: TrackedFollowupParams): Promise<TrackedFollowup[]> {
  const data = await request(
    `${R.LPF_TRACKED}?${qs({
      co_id: params.coId,
      branch_id: params.branchId,
      dept_code: params.deptCode,
    })}`,
    "Failed to load the tracked workers",
  );
  return expectShape(
    data,
    (v): v is TrackedFollowup[] => isArrayOf(v, isTrackedFollowup),
    "tracked follow-ups",
  );
}

/** Client-side check of a notice scan; returns the problem or null. */
export function noticeFileProblem(file: File): string | null {
  if (!NOTICE_FILE_MIME_TYPES.includes(file.type)) {
    return "Only PDF or image (JPG / PNG / WebP) files are allowed";
  }
  if (file.size > NOTICE_FILE_MAX_BYTES) return "File exceeds the 10 MB limit";
  return null;
}

/** Uploads the scanned notice for a NOTICE event (generic attachment subsystem). */
export async function uploadFollowupNoticeAttachment(
  coId: number,
  eventId: number,
  file: File,
): Promise<FollowupNoticeAttachment> {
  const problem = noticeFileProblem(file);
  if (problem) throw new Error(problem);
  const form = new FormData();
  form.append("file", file);
  form.append("module", FOLLOWUP_ATTACHMENT_MODULE);
  form.append("entity_id", String(eventId));
  form.append("file_type", FOLLOWUP_NOTICE_FILE_TYPE);
  const data = await request(
    `${R.ATTACHMENT_UPLOAD}?${qs({ co_id: coId })}`,
    "Failed to upload the notice scan",
    "POST",
    form,
  );
  return expectShape(data, isNoticeAttachment, "attachment upload");
}
