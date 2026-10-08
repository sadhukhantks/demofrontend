/** Date-range guard for the trend page — the server caps the range too (93
 * days, a quarter); this only saves the round trip and says why. Dates are
 * YYYY-MM-DD strings. */

export const RANGE_CAP_DAYS = 93;
export const DEFAULT_RANGE_DAYS = 14;
export const PRESET_DAYS = [7, 14, 30] as const;

const MS_PER_DAY = 86_400_000;

/** null when the range is usable, otherwise the message to show. */
export function rangeError(from: string, to: string): string | null {
  if (!from || !to) return "Pick both dates.";
  // Lexicographic compare is exact for YYYY-MM-DD.
  if (from > to) return "From Date must be on or before To Date.";
  // Date-only ISO strings parse as UTC, so no DST shift can bend the day count.
  const days = (Date.parse(to) - Date.parse(from)) / MS_PER_DAY + 1;
  if (days > RANGE_CAP_DAYS) {
    return `Range is capped at ${RANGE_CAP_DAYS} days (asked for ${Math.round(days)}).`;
  }
  return null;
}

/** The `days`-day window ending on `to` (inclusive), as YYYY-MM-DD. */
export function windowEndingOn(to: string, days: number): { from: string; to: string } {
  const end = Date.parse(to);
  if (Number.isNaN(end)) return { from: to, to };
  const start = new Date(end - (days - 1) * MS_PER_DAY);
  return { from: start.toISOString().slice(0, 10), to };
}

/** Which preset (if any) the current range matches, for the chip highlight. */
export function matchingPreset(from: string, to: string): number | null {
  const days = (Date.parse(to) - Date.parse(from)) / MS_PER_DAY + 1;
  return (PRESET_DAYS as readonly number[]).includes(days) ? days : null;
}
