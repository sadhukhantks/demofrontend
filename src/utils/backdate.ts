/**
 * Backdating window for the jute-production entry dates (spec
 * vowerp3be/docs/superpowers/specs/2026-10-12-bale-stock-inspection-design.md §7d,
 * owner ruling 2026-10-12): inspection date, despatch date, finishing-stock count
 * date and bale-press date may go back at most BACKDATE_DAYS_MAX days. Mirrors
 * `BACKDATE_DAYS_MAX` in vowerp3be src/juteProduction/constants.py — the server
 * refuses older dates with the same wording. Local-date arithmetic throughout:
 * `toISOString()` would be the UTC date, "yesterday" in IST before 05:30.
 */

export const BACKDATE_DAYS_MAX = 60;

function isoOf(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Today as YYYY-MM-DD in the browser's local time. */
export function todayISO(): string {
  return isoOf(new Date());
}

/** The local date `days` days before today, YYYY-MM-DD. */
export function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return isoOf(d);
}

/** Earliest date an entry may carry: today − BACKDATE_DAYS_MAX. */
export function minBackdateISO(): string {
  return isoDaysAgo(BACKDATE_DAYS_MAX);
}

/** True when a non-blank ISO date lies before the backdate window. */
export function isBeyondBackdateWindow(value: string): boolean {
  return value !== "" && value < minBackdateISO();
}

/** The later of an optional floor (e.g. the bale's press date) and the window floor. */
export function laterOf(a: string | null | undefined, b: string): string {
  return a && a > b ? a : b;
}

/** Shared message, e.g. backdateMessage("Despatch date"). */
export function backdateMessage(what: string): string {
  return `${what} cannot be more than ${BACKDATE_DAYS_MAX} days in the past`;
}
