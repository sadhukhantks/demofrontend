/**
 * Pure helpers of the Long Absenteeism page (no React, no fetch): URL params,
 * tabs / views, stage + band grouping, chip colours, letter cells, extra
 * columns, date maths and the letter print HTML. Covered by _utils.test.ts.
 */

import type { ApprovalActionPermissions, ApprovalStatusId } from "@/components/ui/transaction/ApprovalActionsBar";
import type {
  LaCandidate,
  LaCase,
  LaCodeLabel,
  LaDueBand,
  LaEvent,
  LaLetter,
  LaListRow,
  LaPermissions,
  LaRule,
  LaSetup,
  LaStage,
} from "@/utils/longAbsenteeismService";
import { fmtDate, isIsoDate } from "@/components/lowPerformerFollowup/schemas";

// ─── URL params ──────────────────────────────────────────────────────

/** Positive integer id from a search param, else null. */
export function parsePositiveId(raw: string | null | undefined): number | null {
  if (raw == null || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** `${pathname}?a=1&b=2`, skipping empty params. */
export function buildHref(pathname: string, params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const q = search.toString();
  return q ? `${pathname}?${q}` : pathname;
}

/**
 * The branch the page works on: the user's pick, else the URL / sidebar seed,
 * as long as it is one of the branches in scope; a single branch in scope is
 * used automatically. While the branch list is still empty (sidebar loading)
 * the candidate is trusted as is.
 */
export function resolveBranchId(
  choice: number | null,
  initial: number | null,
  branches: ReadonlyArray<{ branch_id: number }>,
): number | null {
  const inScope = (id: number | null) => id != null && branches.some((b) => b.branch_id === id);
  if (branches.length === 0) return choice ?? initial;
  if (inScope(choice)) return choice;
  if (inScope(initial)) return initial;
  return branches.length === 1 ? branches[0].branch_id : null;
}

// ─── Tabs and views ──────────────────────────────────────────────────

export type LaTab = "watchlist" | "dispatch" | "reports" | "templates" | "settings";

export interface LaTabDef {
  value: LaTab;
  label: string;
  /** Only users with edit access see the tab. */
  editOnly: boolean;
}

export const LA_TABS: ReadonlyArray<LaTabDef> = Object.freeze([
  { value: "watchlist", label: "Watchlist", editOnly: false },
  { value: "dispatch", label: "Dispatch", editOnly: true },
  { value: "reports", label: "Reports", editOnly: false },
  { value: "templates", label: "Templates", editOnly: true },
  { value: "settings", label: "Settings", editOnly: true },
]);

/** Tabs the user may open. */
export function visibleTabs(canEdit: boolean): LaTabDef[] {
  return LA_TABS.filter((t) => canEdit || !t.editOnly);
}

/** ?tab= value, falling back to the watchlist for an unknown tab or one the user may not open. */
export function parseTab(raw: string | null | undefined, canEdit: boolean): LaTab {
  const tab = visibleTabs(canEdit).find((t) => t.value === raw);
  return tab ? tab.value : "watchlist";
}

export type WatchView = "due" | "open" | "parked" | "closed" | "candidates";

export const WATCH_VIEWS: ReadonlyArray<{ value: WatchView; label: string }> = Object.freeze([
  { value: "due", label: "Due today" },
  { value: "open", label: "Open" },
  { value: "parked", label: "Parked" },
  { value: "closed", label: "Closed" },
  { value: "candidates", label: "Candidates" },
]);

export function parseView(raw: string | null | undefined): WatchView {
  return WATCH_VIEWS.find((v) => v.value === raw)?.value ?? "due";
}

// ─── Labels and colours ──────────────────────────────────────────────

/** Label of a code from a setup list; falls back to the code itself. */
export function labelOf(list: ReadonlyArray<LaCodeLabel> | null | undefined, code: string | null | undefined): string {
  if (!code) return "";
  return list?.find((c) => c.code === code)?.label ?? code;
}

export type ChipColor = "default" | "primary" | "secondary" | "info" | "success" | "warning" | "error";

/** Stage chip colour: early stages quiet, warnings amber, show cause / gate notice red. */
export function stageColor(stageCode: string | null | undefined): ChipColor {
  switch (stageCode) {
    case "DETECTED":
      return "default";
    case "VERIFIED":
      return "info";
    case "WARNING_1":
    case "WARNING_2":
    case "WARNING_3":
      return "warning";
    case "SHOW_CAUSE":
    case "GATE_NOTICE":
      return "error";
    case "STRUCK_OFF":
      return "secondary";
    default:
      return "default";
  }
}

/** Case status chip colour: open primary, parked amber, closed grey. */
export function caseStatusColor(status: number | null | undefined): ChipColor {
  if (status === 1) return "primary";
  if (status === 2) return "warning";
  return "default";
}

/** Struck-off approval state as words (the case's status_id is ONLY that approval). */
export function approvalStatusLabel(statusId: number | null | undefined): string {
  switch (statusId) {
    case 20:
      return "Struck-off approval pending";
    case 3:
      return "Struck off (approved)";
    case 4:
      return "Struck-off rejected";
    default:
      return "Not sent for approval";
  }
}

export function approvalStatusColor(statusId: number | null | undefined): ChipColor {
  switch (statusId) {
    case 20:
      return "warning";
    case 3:
      return "success";
    case 4:
      return "error";
    default:
      return "default";
  }
}

// ─── Struck-off approval bar ─────────────────────────────────────────

const BAR_STATUSES: ReadonlyArray<ApprovalStatusId> = [1, 3, 4, 5, 6, 20, 21];

/** The approval bar's status: the case's status_id, or 1 ("open", not yet sent) when it has none. */
export function approvalBarStatus(statusId: number | null | undefined): ApprovalStatusId {
  const s = statusId ?? 1;
  return (BAR_STATUSES as ReadonlyArray<number>).includes(s) ? (s as ApprovalStatusId) : 1;
}

/**
 * Which buttons the struck-off approval bar shows. Not started: only "Send for
 * approval" (when the backend says the gate notice window is over and the user
 * has edit) — never a direct Approve. Pending: the engine's Approve / Reject.
 * Rejected: Re-open (edit). Approved: nothing.
 */
export function struckOffBarPermissions(
  statusId: number | null | undefined,
  perms: Pick<LaPermissions, "canApprove" | "canReject" | "canReopen" | "can_send"> | null,
  canEdit: boolean,
): ApprovalActionPermissions {
  if (!perms) return {};
  switch (statusId ?? null) {
    case null:
      return { canSendForApproval: perms.can_send && canEdit };
    case 20:
      return { canApprove: perms.canApprove, canReject: perms.canReject };
    case 4:
      return { canReopen: perms.canReopen && canEdit };
    default:
      return {};
  }
}

/** The approval panel appears from the gate notice on, or once the approval has started. */
export function showsStruckOffPanel(c: Pick<LaCase, "stage_code" | "status_id">): boolean {
  return c.stage_code === "GATE_NOTICE" || c.status_id != null;
}

// ─── Stages ──────────────────────────────────────────────────────────

/** The ladder, in order, when /setup has not arrived (labels are codes until then). */
const FALLBACK_STAGE_CODES = [
  "DETECTED",
  "VERIFIED",
  "WARNING_1",
  "WARNING_2",
  "WARNING_3",
  "SHOW_CAUSE",
  "GATE_NOTICE",
  "STRUCK_OFF",
];
const FALLBACK_LETTER_STAGES = ["WARNING_1", "WARNING_2", "WARNING_3", "SHOW_CAUSE", "GATE_NOTICE", "STRUCK_OFF"];

function stageList(setup: Pick<LaSetup, "stages"> | null | undefined): LaStage[] {
  if (setup?.stages?.length) return [...setup.stages].sort((a, b) => a.order - b.order);
  return FALLBACK_STAGE_CODES.map((code, order) => ({ code, label: code, order }));
}

export function stageLabel(setup: Pick<LaSetup, "stages"> | null | undefined, code: string | null | undefined): string {
  if (!code) return "";
  return stageList(setup).find((s) => s.code === code)?.label ?? code;
}

/**
 * The letter the case would be issued next from its current stage, or null:
 * nothing is issued before verification, and after the gate notice the next
 * step is the struck-off approval (the memo is only printed after it).
 */
export function nextLetterStage(
  setup: Pick<LaSetup, "stages" | "letter_stages"> | null | undefined,
  stageCode: string | null | undefined,
): string | null {
  if (!stageCode) return null;
  const stages = stageList(setup);
  const letters = setup?.letter_stages?.length ? setup.letter_stages : FALLBACK_LETTER_STAGES;
  const idx = stages.findIndex((s) => s.code === stageCode);
  if (idx < 0 || idx + 1 >= stages.length) return null;
  const next = stages[idx + 1].code;
  if (!letters.includes(next) || next === "STRUCK_OFF") return null;
  return next;
}

/** Stage order of a code (unknown codes sort last). */
export function stageOrder(setup: Pick<LaSetup, "stages"> | null | undefined, code: string | null | undefined): number {
  const s = stageList(setup).find((x) => x.code === code);
  return s ? s.order : Number.MAX_SAFE_INTEGER;
}

// ─── Due-today bands ─────────────────────────────────────────────────

export type BandKey = "CANDIDATES" | Exclude<LaDueBand, "NONE">;

export const BANDS: ReadonlyArray<{ key: BandKey; title: string; hint: string }> = Object.freeze([
  { key: "CANDIDATES", title: "New candidates", hint: "Absent past the limit with no case yet — open a case or dismiss" },
  { key: "VERIFY", title: "Verification pending", hint: "Check ESI / STL and confirm with the time keeper" },
  { key: "LETTER_DUE", title: "Letters due", hint: "The next letter can be issued today" },
  {
    key: "STRUCK_OFF_DUE",
    title: "Struck off due",
    hint: "Gate notice reply window is over — send for struck-off approval",
  },
  { key: "MARKED_PRESENT", title: "Marked present", hint: "Attendance found after the last working date — check and close" },
  { key: "REPLY_REVIEW", title: "Replies to review", hint: "Parked while a reply is reviewed" },
  { key: "APPROVAL", title: "Awaiting approval", hint: "Struck-off sent for approval" },
]);

/** Live rows grouped by band, in band order; rows of band NONE are left out. */
export function groupByBand(rows: ReadonlyArray<LaListRow>): Record<Exclude<LaDueBand, "NONE">, LaListRow[]> {
  const out: Record<Exclude<LaDueBand, "NONE">, LaListRow[]> = {
    VERIFY: [],
    LETTER_DUE: [],
    STRUCK_OFF_DUE: [],
    MARKED_PRESENT: [],
    REPLY_REVIEW: [],
    APPROVAL: [],
  };
  for (const r of rows) {
    if (r.due_band !== "NONE") out[r.due_band].push(r);
  }
  return out;
}

export interface LetterGroup {
  code: string;
  label: string;
  rows: LaListRow[];
}

/** Letters-due rows sub-grouped by the letter they need next, in ladder order. */
export function groupLettersDue(
  rows: ReadonlyArray<LaListRow>,
  setup: Pick<LaSetup, "stages"> | null | undefined,
): LetterGroup[] {
  const map = new Map<string, LetterGroup>();
  for (const r of rows) {
    const code = r.next_stage_code ?? "";
    let g = map.get(code);
    if (!g) {
      g = { code, label: r.next_stage_label || stageLabel(setup, code) || "Next letter", rows: [] };
      map.set(code, g);
    }
    g.rows.push(r);
  }
  return [...map.values()].sort((a, b) => stageOrder(setup, a.code) - stageOrder(setup, b.code));
}

// ─── Search ──────────────────────────────────────────────────────────

/** Case-insensitive match of EB No / name (candidates are filtered on the client). */
export function matchesQuery(row: Pick<LaCandidate, "emp_code" | "emp_name">, q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  return (row.emp_code ?? "").toLowerCase().includes(t) || (row.emp_name ?? "").toLowerCase().includes(t);
}

// ─── Department summary and filter ───────────────────────────────────

/** Label of the bucket for rows that carry no department. */
export const NO_DEPARTMENT_LABEL = "No department";

/**
 * Local department-filter value for "rows without a department". The
 * watchlist filters by department on the client, so this never reaches the
 * server (real department ids are positive).
 */
export const NO_DEPT_FILTER = -1;

export interface DeptCount {
  /** null for the "No department" bucket (its filter value is `NO_DEPT_FILTER`). */
  dept_id: number | null;
  dept_desc: string;
  count: number;
}

export interface DeptSummaryData {
  items: DeptCount[];
  /** Number of rows counted (the sum of the item counts). */
  total: number;
}

type DeptRow = { dept_desc?: string | null; dept_id?: number | null };

function deptLabel(d: DeptCount): string {
  if (d.dept_id == null) return NO_DEPARTMENT_LABEL;
  return d.dept_desc || `Dept ${d.dept_id}`;
}

/**
 * Rows grouped by department id, biggest department first (ties by name).
 * Rows without a department id fall into the single "No department" bucket.
 */
export function countByDept(rows: ReadonlyArray<DeptRow>): DeptCount[] {
  const map = new Map<number | null, DeptCount>();
  for (const r of rows) {
    const id = r.dept_id ?? null;
    const desc = r.dept_desc?.trim() ?? "";
    const found = map.get(id);
    if (found) {
      found.count += 1;
      if (!found.dept_desc && desc) found.dept_desc = desc;
    } else {
      map.set(id, { dept_id: id, dept_desc: desc, count: 1 });
    }
  }
  return [...map.values()]
    .map((d) => ({ ...d, dept_desc: deptLabel(d) }))
    .sort((a, b) => b.count - a.count || a.dept_desc.localeCompare(b.dept_desc, "en", { sensitivity: "base" }));
}

/** `countByDept` plus the total, for the department strip. */
export function deptSummary(rows: ReadonlyArray<DeptRow>): DeptSummaryData {
  return { items: countByDept(rows), total: rows.length };
}

/**
 * Rows of one department: null = every row, `NO_DEPT_FILTER` = the rows
 * without a department, otherwise the rows of that department id.
 */
export function filterByDept<T extends { dept_id?: number | null }>(rows: ReadonlyArray<T>, deptId: number | null): T[] {
  if (deptId == null) return [...rows];
  if (deptId === NO_DEPT_FILTER) return rows.filter((r) => r.dept_id == null);
  return rows.filter((r) => r.dept_id === deptId);
}

// ─── Letter cells and extra columns ──────────────────────────────────

/** One sheet cell of a letter: its date, and the sent date (or "not sent" once issued). */
export function letterCell(date: string | null | undefined, sent: string | null | undefined): string {
  if (!date) return "";
  return sent ? `${fmtDate(date)} · sent ${fmtDate(sent)}` : `${fmtDate(date)} · not sent`;
}

export interface ExtraColumn {
  key: "extra_1" | "extra_2" | "extra_3" | "extra_4" | "extra_5";
  label: string;
}

/** The extra Excel columns the company named in Settings (unnamed ones are hidden). */
export function extraColumns(rule: Pick<LaRule, "extra_1_label" | "extra_2_label" | "extra_3_label" | "extra_4_label" | "extra_5_label"> | null | undefined): ExtraColumn[] {
  if (!rule) return [];
  const pairs: [ExtraColumn["key"], string | null][] = [
    ["extra_1", rule.extra_1_label],
    ["extra_2", rule.extra_2_label],
    ["extra_3", rule.extra_3_label],
    ["extra_4", rule.extra_4_label],
    ["extra_5", rule.extra_5_label],
  ];
  return pairs.flatMap(([key, label]) => (label && label.trim() ? [{ key, label: label.trim() }] : []));
}

// ─── Dates ───────────────────────────────────────────────────────────

/** ISO date + n days (UTC arithmetic, no time-zone drift); "" for a bad date. */
export function addDays(iso: string, days: number): string {
  if (!isIsoDate(iso)) return "";
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** True when an ISO date is on or before today (a due date that has come). */
export function isDue(date: string | null | undefined, today: string): boolean {
  return Boolean(date) && (date as string).slice(0, 10) <= today;
}

/** "Due 12-10-2026" / "Due today" / "Overdue since 01-10-2026"; "" without a date. */
export function dueText(date: string | null | undefined, today: string): string {
  if (!date) return "";
  const d = date.slice(0, 10);
  if (d === today) return "Due today";
  if (d < today) return `Overdue since ${fmtDate(d)}`;
  return `Due ${fmtDate(d)}`;
}

// ─── Case state ──────────────────────────────────────────────────────

export function isLive(c: Pick<LaCase, "status">): boolean {
  return c.status !== 0;
}

/** Display name: "Name (EB 1234)". */
export function workerTitle(c: Pick<LaCase, "emp_name" | "emp_code" | "eb_id">): string {
  const name = c.emp_name?.trim() || "(no name)";
  return `${name} (EB ${c.emp_code ?? c.eb_id})`;
}

/** A letter's heading: "1st warning · letter 1" / "Show cause". */
export function letterTitle(l: Pick<LaLetter, "stage_label" | "letter_no">): string {
  return l.letter_no ? `${l.stage_label} · letter ${l.letter_no}` : l.stage_label;
}

/** The user-entered timeline types; system entries are never editable. */
export function isUserEvent(ev: Pick<LaEvent, "event_type">): boolean {
  return ev.event_type === "REMARK" || ev.event_type === "FEEDBACK" || ev.event_type === "REPLY";
}

/** Newest first: by event date, then by id. */
export function sortEventsNewestFirst(events: ReadonlyArray<LaEvent>): LaEvent[] {
  return [...events].sort((a, b) =>
    a.event_date === b.event_date ? b.event_id - a.event_id : a.event_date < b.event_date ? 1 : -1,
  );
}

/** Letters in issue order (oldest first). */
export function sortLettersOldestFirst(letters: ReadonlyArray<LaLetter>): LaLetter[] {
  return [...letters].sort((a, b) =>
    a.issue_date === b.issue_date ? a.letter_id - b.letter_id : a.issue_date < b.issue_date ? -1 : 1,
  );
}

/** Default dispatch mode of a letter stage: the gate notice goes on the board, the rest by post. */
export function defaultDispatchMode(stageCode: string | null | undefined, modes: ReadonlyArray<LaCodeLabel>): string {
  const want = stageCode === "GATE_NOTICE" ? "GATE_BOARD" : stageCode === "STRUCK_OFF" ? "HAND" : "REG_POST_AD";
  if (modes.some((m) => m.code === want)) return want;
  return modes[0]?.code ?? "";
}

// ─── Numbers ─────────────────────────────────────────────────────────

/** Fixed decimals; blank (never 0) for null / non-numeric. */
export function fmtNum(value: number | null | undefined, decimals = 2): string {
  if (value == null || !Number.isFinite(value)) return "";
  return value.toFixed(decimals);
}

// ─── Printing ────────────────────────────────────────────────────────

/** Escapes text for HTML element content and attribute values. */
export function escapeHtml(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface Letterhead {
  coName: string;
  address: string;
  logoBase64?: string;
}

export interface PrintableLetter {
  subject: string | null;
  body: string;
}

/** Print CSS of the letters (no colours: the browser prints black on white). */
export const LETTER_PRINT_CSS = `
  .la-letter { font-family: "Times New Roman", Times, serif; font-size: 12pt; line-height: 1.45; max-width: 180mm; margin: 0 auto; }
  .la-page-break { page-break-after: always; break-after: page; }
  .la-head { display: flex; align-items: center; gap: 12px; border-bottom: 1px solid; padding-bottom: 6px; margin-bottom: 14px; }
  .la-head img { max-height: 60px; max-width: 180px; object-fit: contain; }
  .la-co { font-size: 15pt; font-weight: 700; }
  .la-addr { font-size: 9.5pt; }
  .la-subject { font-weight: 700; text-align: center; text-decoration: underline; margin: 10px 0 14px; }
  .la-body { white-space: pre-wrap; font-family: inherit; font-size: inherit; margin: 0; }
`;

/** One letter: letterhead, subject, then the stored body exactly as issued. */
export function buildLetterHtml(head: Letterhead, letter: PrintableLetter): string {
  const logo = head.logoBase64 ? `<img src="${escapeHtml(head.logoBase64)}" alt="" />` : "";
  const subject = letter.subject?.trim()
    ? `<div class="la-subject">${escapeHtml(letter.subject.trim())}</div>`
    : "";
  return (
    `<div class="la-letter">` +
    `<div class="la-head">${logo}<div><div class="la-co">${escapeHtml(head.coName)}</div>` +
    `<div class="la-addr">${escapeHtml(head.address)}</div></div></div>` +
    subject +
    `<pre class="la-body" style="white-space:pre-wrap;font-family:inherit">${escapeHtml(letter.body)}</pre>` +
    `</div>`
  );
}

/** Several letters in one window, one per page (page-break-after on all but the last). */
export function buildLettersHtml(head: Letterhead, letters: ReadonlyArray<PrintableLetter>): string {
  return letters
    .map((l, i) =>
      i < letters.length - 1
        ? `<div class="la-page-break" style="page-break-after:always">${buildLetterHtml(head, l)}</div>`
        : buildLetterHtml(head, l),
    )
    .join("");
}
