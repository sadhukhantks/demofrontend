/**
 * Pure date helpers for the Period Master: resolve a slot to concrete dates
 * for a calendar month and validate slot contiguity (light client-side check;
 * the server remains the authority).
 */
import type { SlotInput } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");

/** Days in a calendar month (month is 1–12). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** ISO date string; day is clamped to the month length. */
export function isoDate(year: number, month: number, day: number): string {
  const d = Math.min(Math.max(day, 1), daysInMonth(year, month));
  return `${year}-${pad(month)}-${pad(d)}`;
}

/** The calendar month before (year, month); January wraps to the previous December. */
export function previousMonth(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

/** Resolve a slot to from/to ISO dates for the month it belongs to. */
export function slotRange(
  slot: Pick<SlotInput, "from_day" | "from_prev_month" | "to_day">,
  year: number,
  month: number,
): { from: string; to: string } {
  const fromRef = slot.from_prev_month ? previousMonth(year, month) : { year, month };
  return {
    from: isoDate(fromRef.year, fromRef.month, slot.from_day),
    to: slot.to_day == null ? isoDate(year, month, daysInMonth(year, month)) : isoDate(year, month, slot.to_day),
  };
}

/** YYYY-MM-DD to DD-MM-YYYY (returns the input unchanged if it is not an ISO date). */
export function formatDmy(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** e.g. "Oct-2026: F1 01-10 → 15-10, F2 16-10 → 31-10". */
export function previewLine(slots: SlotInput[], year: number, month: number): string {
  if (slots.length === 0) return "";
  const parts = slots.map((s) => {
    const r = slotRange(s, year, month);
    return `${s.slot_code || `#${s.slot_no}`} ${r.from.slice(8)}-${r.from.slice(5, 7)} → ${r.to.slice(8)}-${r.to.slice(5, 7)}`;
  });
  return `${MONTH_NAMES[month - 1]}-${year}: ${parts.join(", ")}`;
}

/**
 * Light contiguity check. Returns an error message or null when fine.
 * Rules: slot 1 starts day 1 (or day D of previous month, with the last slot
 * ending D-1); each next slot starts the day after the previous ends; the last
 * slot ends at month end (unless slot 1 starts in the previous month);
 * intermediate to_day <= 27; only slot 1 may start in the previous month.
 */
export function validateSlots(slots: SlotInput[]): string | null {
  if (slots.length === 0) return null;
  const first = slots[0];
  const prev = first.from_prev_month === 1;
  if (!prev && first.from_day !== 1) return "Slot 1 must start on day 1 (or in the previous month).";
  if (slots.slice(1).some((s) => s.from_prev_month === 1)) {
    return "Only slot 1 can start in the previous month.";
  }
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    const last = i === slots.length - 1;
    if (!last) {
      if (s.to_day == null) return `Slot ${s.slot_no}: only the last slot can end at month end.`;
      if (s.to_day > 27) return `Slot ${s.slot_no}: an intermediate slot cannot end after day 27.`;
      if (slots[i + 1].from_day !== s.to_day + 1) {
        return `Slot ${i + 2} must start on day ${s.to_day + 1}, the day after slot ${s.slot_no} ends.`;
      }
    }
  }
  const lastSlot = slots[slots.length - 1];
  if (prev) {
    if (lastSlot.to_day == null || lastSlot.to_day !== first.from_day - 1) {
      return `The last slot must end on day ${first.from_day - 1}, the day before slot 1 starts.`;
    }
  } else if (lastSlot.to_day != null) {
    return "The last slot must end at month end (leave To day blank).";
  }
  return null;
}
