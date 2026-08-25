/**
 * Shared helpers for the Jute Mechanical & Maintenance report pages.
 *
 * WHY THE `unknown` ACCESSORS EXIST
 * ---------------------------------
 * `juteMechanicalService.ts` is owned elsewhere and must not be edited from
 * here, but a few of its report row interfaces name keys the backend does not
 * actually emit (e.g. `share_pct` where `/reason-pareto` returns `pct_share`,
 * `downtime_per_1000_hrs` where `/reliability` returns
 * `downtime_per_1000_running_hrs`). `src/juteMechanical/reports.py` is the
 * authority on response keys, so every grid column here binds to the BACKEND
 * key, read through these narrowing accessors rather than through a property
 * access the service's interface would reject. No `any` is involved: values
 * enter as `unknown` and leave as `number | string | null`.
 *
 * Two reports (`/top-problem-machines`, `/machine-history`) return `data` as an
 * OBJECT of named row lists rather than an array, which the service's
 * `requestList` envelope cannot express. {@link asRows} accepts either shape so
 * those pages read the real payload without crashing on `.map`.
 */

/** Reason code the mill uses for "No Reason mentioned" (backend NR_REASON_CODE). */
export const NR_REASON_CODE = "NR";

/** Narrow an unknown value to an index signature. Non-objects yield `{}`. */
export function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null) {
    return value as Record<string, unknown>;
  }
  return {};
}

/** Narrow an unknown value to an array of records. Non-arrays yield `[]`. */
export function asRows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.map(asRecord);
}

/**
 * Pull a named list out of a report payload that may arrive either as a bare
 * array (the `{ data: [...] }` envelope) or as an object of named lists
 * (`{ data: { by_downtime: [...], ... } }`), which is what
 * `/top-problem-machines` and `/machine-history` actually return.
 */
export function asNamedRows(payload: unknown, key: string): Record<string, unknown>[] {
  if (Array.isArray(payload)) return asRows(payload);
  return asRows(asRecord(payload)[key]);
}

/** Read a numeric field. Returns null when absent or not finite. */
export function pickNum(rec: Record<string, unknown>, key: string): number | null {
  const raw = rec[key];
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Read an integer-ish field, falling back to `fallback` when absent. */
export function pickInt(
  rec: Record<string, unknown>,
  key: string,
  fallback = 0,
): number {
  const n = pickNum(rec, key);
  return n === null ? fallback : Math.trunc(n);
}

/** Read a string field. Returns null when absent or empty. */
export function pickStr(rec: Record<string, unknown>, key: string): string | null {
  const raw = rec[key];
  if (raw === null || raw === undefined) return null;
  const s = String(raw);
  return s === "" ? null : s;
}

/** Read a string field, substituting `fallback` when absent. */
export function pickText(
  rec: Record<string, unknown>,
  key: string,
  fallback = "",
): string {
  return pickStr(rec, key) ?? fallback;
}

/** Read a boolean field (accepts real booleans and 1/0/"true"). */
export function pickBool(rec: Record<string, unknown>, key: string): boolean {
  const raw = rec[key];
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw !== 0;
  if (typeof raw === "string") return raw === "true" || raw === "1";
  return false;
}

/** ISO date/datetime → `DD-MM-YYYY`, the mill's reading format. */
export function dmy(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 10).split("-").reverse().join("-");
}

/** ISO datetime → `DD-MM-YYYY HH:MM`. */
export function dmyTime(value: string | null | undefined): string {
  if (!value) return "";
  const datePart = dmy(value);
  const timePart = value.length >= 16 ? value.slice(11, 16) : "";
  return timePart ? `${datePart} ${timePart}` : datePart;
}

/** Minutes → `Hh Mm`, easier to read than 4-digit minute counts. */
export function minutesToHm(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  const total = Math.max(0, Math.round(value));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * Mill-level unattributed share, recomputed from the rows on screen.
 *
 * The backend returns `unattributed_pct` at the top level of every summary
 * report, but the service's `requestList` keeps only `{ data, total }` and
 * discards it. The formula is reproduced exactly (backend: downtime on reason
 * code 'NR' / total downtime * 100) from data the rows do carry:
 *
 *  - aggregate rows expose `nr_downtime_min` + `total_downtime_min`;
 *  - per-reason / per-incident rows are summed by reason code instead.
 *
 * Returns null when there is no downtime to divide by — "not computable",
 * never a misleading 0%.
 */
export function unattributedPctFromRows(
  records: Record<string, unknown>[],
): number | null {
  let nrSplit = 0;
  let totalSplit = 0;
  let sawSplit = false;

  for (const rec of records) {
    const nr = pickNum(rec, "nr_downtime_min");
    const total = pickNum(rec, "total_downtime_min");
    if (nr !== null && total !== null) {
      sawSplit = true;
      nrSplit += nr;
      totalSplit += total;
    }
  }
  if (sawSplit) {
    return totalSplit > 0 ? (nrSplit * 100) / totalSplit : null;
  }

  // Per-reason (total_duration) or per-incident (duration_min) rows.
  let nr = 0;
  let total = 0;
  for (const rec of records) {
    const duration =
      pickNum(rec, "total_duration") ??
      pickNum(rec, "duration_min") ??
      pickNum(rec, "total_downtime_min");
    if (duration === null) continue;
    total += duration;
    if (pickStr(rec, "reason_code") === NR_REASON_CODE) nr += duration;
  }
  return total > 0 ? (nr * 100) / total : null;
}

/** Sum a numeric backend key across rows (used for footer/caption figures). */
export function sumBy(
  records: Record<string, unknown>[],
  key: string,
): number {
  return records.reduce((acc, rec) => acc + (pickNum(rec, key) ?? 0), 0);
}
