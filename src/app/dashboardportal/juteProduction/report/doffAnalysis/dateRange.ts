/** Frame Analysis range guard — the server caps the range too, this only
 * saves the round trip (and says why). Dates are YYYY-MM-DD strings. */

export const RANGE_CAP_DAYS = 31;

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
