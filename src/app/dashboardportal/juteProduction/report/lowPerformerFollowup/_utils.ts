/**
 * Pure helpers of the Low Performer Follow-up page (no React, no fetch) —
 * URL params, number / label formatting, timeline ordering, hour-cut totals
 * and the trend-week labels. Covered by _utils.test.ts.
 */

import type {
  CodeLabel,
  FollowupEvent,
  FollowupRow,
  TrendWeek,
} from "@/utils/lowPerformerFollowupService";
import { labelOf } from "@/components/lowPerformerFollowup/constants";

// ─── URL params ──────────────────────────────────────────────────────

/** Positive integer id from a search param, else null. */
export function parsePositiveId(raw: string | null | undefined): number | null {
  if (raw == null || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** `${pathname}?a=1&b=2`, skipping empty params. */
export function buildHref(
  pathname: string,
  params: Record<string, string | number | null | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${pathname}?${qs}` : pathname;
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

// ─── List filters ────────────────────────────────────────────────────

export type StatusFilter = "open" | "closed" | "all";

export const STATUS_FILTER_OPTIONS: ReadonlyArray<{ value: StatusFilter; label: string }> = Object.freeze([
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
]);

/** status query param: 1 = open, 0 = closed, null = all. */
export function statusParam(filter: StatusFilter): 0 | 1 | null {
  if (filter === "open") return 1;
  if (filter === "closed") return 0;
  return null;
}

// ─── Formatting ──────────────────────────────────────────────────────

/** Fixed decimals; blank (never 0) for null / non-numeric. */
export function fmtNum(value: number | null | undefined, decimals = 2): string {
  if (value == null || !Number.isFinite(value)) return "";
  return value.toFixed(decimals);
}

/** Efficiency points with a sign, e.g. "+2.40" / "-5.10"; blank for null. */
export function fmtDiff(value: number | null | undefined, decimals = 2): string {
  if (value == null || !Number.isFinite(value)) return "";
  const s = value.toFixed(decimals);
  return value > 0 ? `+${s}` : s;
}

/** a - b, or null when either side is missing. */
export function numDiff(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  return a - b;
}

/** Theme colour of an efficiency difference (person - others). */
export function diffColor(value: number | null | undefined): "success.main" | "error.main" | undefined {
  if (value == null || !Number.isFinite(value) || value === 0) return undefined;
  return value > 0 ? "success.main" : "error.main";
}

/** Hours without trailing zeros: 5 -> "5", 2.5 -> "2.5". */
export function fmtHours(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return String(Number(value.toFixed(2)));
}

/** "2 · 5.5 h" — hour-cut count and total; blank when none. */
export function hourCutsLabel(row: Pick<FollowupRow, "hours_cut_count" | "total_hours_cut">): string {
  if (!row.hours_cut_count) return "";
  return `${row.hours_cut_count} · ${fmtHours(row.total_hours_cut)} h`;
}

/** "2 · Written warning" — notice count and the latest notice's type; blank when none. */
export function noticesLabel(
  row: Pick<FollowupRow, "notice_count" | "last_notice_type">,
  noticeTypes: ReadonlyArray<CodeLabel> | null | undefined,
): string {
  if (!row.notice_count) return "";
  const last = labelOf(noticeTypes, row.last_notice_type);
  return last ? `${row.notice_count} · ${last}` : String(row.notice_count);
}

// ─── Timeline ────────────────────────────────────────────────────────

/** Newest first: by event date, then by id (later entry first on the same day). */
export function sortEventsNewestFirst(events: ReadonlyArray<FollowupEvent>): FollowupEvent[] {
  return [...events].sort((a, b) =>
    a.event_date === b.event_date
      ? b.followup_event_id - a.followup_event_id
      : a.event_date < b.event_date
        ? 1
        : -1,
  );
}

/** Earliest event date (the start date may not move after it), null when no events. */
export function earliestEventDate(events: ReadonlyArray<FollowupEvent>): string | null {
  let min: string | null = null;
  for (const e of events) {
    if (min == null || e.event_date < min) min = e.event_date;
  }
  return min;
}

/** Latest event date (the closed date may not be before it), null when no events. */
export function latestEventDate(events: ReadonlyArray<FollowupEvent>): string | null {
  let max: string | null = null;
  for (const e of events) {
    if (max == null || e.event_date > max) max = e.event_date;
  }
  return max;
}

/** Hours already cut on a date + spell by this follow-up's other hour-cut events. */
export function hoursAlreadyCut(
  events: ReadonlyArray<FollowupEvent>,
  eventDate: string,
  spellId: number,
  excludeEventId: number | null = null,
): number {
  let total = 0;
  for (const e of events) {
    if (e.event_type !== "HOURS_CUT") continue;
    if (e.followup_event_id === excludeEventId) continue;
    if (e.event_date !== eventDate || e.spell_id !== spellId) continue;
    total += e.hours_cut ?? 0;
  }
  return total;
}

/** One-line detail of an event for the timeline (remarks are shown separately). */
export function describeEvent(
  ev: FollowupEvent,
  noticeTypes: ReadonlyArray<CodeLabel> | null | undefined,
): string {
  if (ev.event_type === "NOTICE") {
    const type = ev.notice_type_label || labelOf(noticeTypes, ev.notice_type) || "Notice";
    return ev.issued_by ? `${type} · issued by ${ev.issued_by}` : type;
  }
  if (ev.event_type === "HOURS_CUT") {
    const hours = fmtHours(ev.hours_cut);
    const spell = ev.spell_code ?? "";
    return `${hours || "?"} h${spell ? ` in spell ${spell}` : ""}`;
  }
  return "";
}

/** Production per hour; null without hours (never a divide-by-zero 0 / Infinity). */
export function kgPerHr(prodKg: number | null | undefined, hours: number | null | undefined): number | null {
  if (prodKg == null || hours == null || !Number.isFinite(prodKg) || !Number.isFinite(hours) || hours <= 0) {
    return null;
  }
  return prodKg / hours;
}

/** Days in an ISO date window, both ends included; null for a bad / reversed pair. */
export function windowDays(from: string, to: string): number | null {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round((b - a) / 86_400_000) + 1;
}

// ─── Trend ───────────────────────────────────────────────────────────

/**
 * What the trend chart plots: efficiency, unless no week has one (counts with
 * no standard — e.g. sls winding has no targets), then kg per hour.
 */
export function trendMetric(
  weeks: ReadonlyArray<Pick<TrendWeek, "avg_eff" | "peer_avg_eff">>,
): "eff" | "kg_per_hr" {
  return weeks.some((w) => w.avg_eff != null || w.peer_avg_eff != null) ? "eff" : "kg_per_hr";
}

/**
 * Axis label per week: "Wk N" from the marking on; weeks before it read
 * "Before" — numbered "Before (wk -1)", "Before (wk -2)" … when there are
 * several, so every category stays unique on the chart axis.
 */
export function weekLabels(weeks: ReadonlyArray<Pick<TrendWeek, "week_no">>): string[] {
  const before = weeks.filter((w) => w.week_no <= 0).length;
  return weeks.map((w) => {
    if (w.week_no >= 1) return `Wk ${w.week_no}`;
    return before === 1 ? "Before" : `Before (wk ${w.week_no - 1})`;
  });
}
