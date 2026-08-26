/**
 * Client-side derivations for the Overhaul Register.
 *
 * The backend (`src/juteMechanical/overhaul.py`) is the authority: it recomputes
 * `downtime_days`, `spare_cost`, `total_cost` and `next_due_date` on every save and
 * we never post those rolled-up values. These helpers exist purely so the entry
 * screen can show the same numbers LIVE as the user types, using exactly the
 * formulas the server will apply:
 *
 *   downtime_days = (to_date - from_date).days + 1        // only when to_date is set
 *   spare_cost    = SUM(amount)  where amount = typed amount, else qty * rate, else 0
 *   total_cost    = labour_cost + spare_cost
 *   next_due_date = (to_date or from_date) + overhaul_freq_months
 *
 * `overhaul_freq_months` lives on the machine-attribute master, NOT on the overhaul
 * form — a machine with no interval configured simply gets no due date, which is
 * why the form surfaces a hint instead of quietly saving a blank one.
 *
 * This module deliberately imports nothing: it is the leaf of the page's dependency
 * graph, so `types/overhaulTypes.ts` can use it without a cycle.
 */

/** Structural shape of one editable spare line, as far as costing is concerned. */
export interface SpareCostInput {
	/** Quantity as typed (may be ""). */
	qty: string;
	/** Rate as typed (may be ""). */
	rate: string;
	/** Line amount as typed; "" means "derive it from qty x rate". */
	amount: string;
}

/** Today as an ISO date string (YYYY-MM-DD) in LOCAL time. */
export function todayISO(): string {
	const now = new Date();
	const tzOffset = now.getTimezoneOffset() * 60000;
	return new Date(now.getTime() - tzOffset).toISOString().slice(0, 10);
}

/**
 * Parse a YYYY-MM-DD string into a local-midnight Date, or null when unparseable.
 * `new Date("2026-01-31")` is parsed as UTC by the spec and can slide a day in
 * negative-offset timezones, so the time part is appended explicitly.
 */
export function parseISODate(value: string): Date | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
	const parsed = new Date(`${value}T00:00:00`);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Format a Date back to a local YYYY-MM-DD string. */
export function formatISODate(date: Date): string {
	const tzOffset = date.getTimezoneOffset() * 60000;
	return new Date(date.getTime() - tzOffset).toISOString().slice(0, 10);
}

/** True when the ISO date is strictly after today (local). */
export function isFutureISODate(value: string): boolean {
	const parsed = parseISODate(value);
	if (!parsed) return false;
	return formatISODate(parsed) > todayISO();
}

/** True when `toDate` is earlier than `fromDate` (both ISO); "" on either side is fine. */
export function isDateRangeInverted(fromDate: string, toDate: string): boolean {
	if (!fromDate || !toDate) return false;
	const from = parseISODate(fromDate);
	const to = parseISODate(toDate);
	if (!from || !to) return false;
	return to.getTime() < from.getTime();
}

/** Number from a possibly-empty typed string; non-numeric text reads as 0. */
export function toNumber(value: string | number | null | undefined): number {
	if (value === null || value === undefined || value === "") return 0;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * `(to_date - from_date).days + 1`, matching the backend inclusively (a one-day
 * overhaul is 1 day, not 0). Null while `to_date` is blank — the machine has not
 * come back yet, so the downtime is not known.
 */
export function downtimeDays(fromDate: string, toDate: string): number | null {
	const from = parseISODate(fromDate);
	const to = parseISODate(toDate);
	if (!from || !to) return null;
	const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
	return days < 0 ? null : days;
}

/** One spare line's value: the typed amount, else qty x rate, else 0. */
export function spareLineAmount(line: SpareCostInput): number {
	if (line.amount !== "" && Number.isFinite(Number(line.amount))) {
		return Number(line.amount);
	}
	if (line.qty !== "" && line.rate !== "") {
		return toNumber(line.qty) * toNumber(line.rate);
	}
	return 0;
}

/** Sum of the spare lines — the server's `spare_cost`. */
export function spareCost(lines: ReadonlyArray<SpareCostInput>): number {
	return lines.reduce((sum, line) => sum + spareLineAmount(line), 0);
}

/** `labour_cost + spare_cost` — the server's `total_cost`. */
export function totalCost(labourCost: string | number, spares: number): number {
	return toNumber(labourCost) + spares;
}

/**
 * Add whole calendar months, clamping day-of-month overflow the same way the
 * backend's `_add_months` does: 31 Jan + 1 month -> 28/29 Feb, 31 Mar + 1 -> 30 Apr.
 */
export function addMonthsISO(baseISO: string, months: number): string | null {
	const base = parseISODate(baseISO);
	if (!base || !Number.isFinite(months)) return null;
	const total = base.getFullYear() * 12 + base.getMonth() + Math.trunc(months);
	const year = Math.floor(total / 12);
	const month = total - year * 12;
	const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
	return formatISODate(new Date(year, month, Math.min(base.getDate(), lastDayOfMonth)));
}

/**
 * Preview of the `next_due_date` the server will store: base date + the machine's
 * `overhaul_freq_months`. The base date is `to_date`, falling back to `from_date`
 * while the overhaul is still running — the same fallback the backend uses.
 *
 * Returns null when the machine has no interval configured. That is not an error
 * state, but it IS worth telling the user about, because the machine will never
 * appear on the maintenance-due report until someone sets the interval.
 */
export function nextOverhaulDueISO(
	fromDate: string,
	toDate: string,
	freqMonths: number | null | undefined,
): string | null {
	if (!freqMonths) return null;
	const base = toDate || fromDate;
	if (!base) return null;
	return addMonthsISO(base, freqMonths);
}

/** Money for display — two decimals, grouped, no currency symbol. */
export function formatAmount(value: number | null | undefined): string {
	if (value === null || value === undefined || !Number.isFinite(value)) return "—";
	return value.toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
}
