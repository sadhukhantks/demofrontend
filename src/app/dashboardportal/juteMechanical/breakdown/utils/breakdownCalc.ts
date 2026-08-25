// Pure client-side helpers for the Breakdown Entry page.
//
// The backend is the authority on every derived field (spec "Derived fields" —
// duration_min, response_min, tran_date, status are computed in Python on save).
// Nothing here is ever persisted: these helpers only power the LIVE preview the
// operator sees while typing ("Duration: 45 min"), so a wrong stop/restart pair
// is caught before the row is saved rather than after.
//
//   duration_min = (restart_datetime  - stop_datetime) / 60   null while open
//   response_min = (attended_datetime - stop_datetime) / 60   null if unattended
//   status       = CLOSED if restart else (UNDER_REPAIR if attended else OPEN)

/** Repair state of an incident. Mirrors the backend's BREAKDOWN_STATUSES. */
export const BREAKDOWN_STATUS = Object.freeze({
	OPEN: "OPEN",
	UNDER_REPAIR: "UNDER_REPAIR",
	CLOSED: "CLOSED",
} as const);

export type BreakdownStatusCode = (typeof BREAKDOWN_STATUS)[keyof typeof BREAKDOWN_STATUS];

/** Default downtime type — only BREAKDOWN rows count as failures in the reports. */
export const DEFAULT_DOWNTIME_TYPE = "BREAKDOWN";

/** Minutes in an hour / a day, so the magic numbers below have names. */
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 1440;

/** Elapsed-minute thresholds that colour the open board (theme severities). */
const ELAPSED_WARNING_MIN = 60;
const ELAPSED_CRITICAL_MIN = 240;

/** Today as a local-time ISO date (YYYY-MM-DD). */
export function todayISO(): string {
	const d = new Date();
	return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/**
 * "Now" in the exact shape an `<input type="datetime-local">` wants
 * (YYYY-MM-DDTHH:mm), in LOCAL time — the operator logs mill-floor clock time.
 */
export function nowDateTimeLocal(): string {
	const d = new Date();
	return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

/**
 * Parse a datetime that may arrive in either shape:
 *  - "2026-08-24T14:30"       the datetime-local input value
 *  - "2026-08-24 14:30:00"    what the backend returns (Python `str(datetime)`)
 *
 * Both are treated as LOCAL wall-clock time (never UTC) — the mill records the
 * clock on the wall, and `new Date("YYYY-MM-DDTHH:mm")` is local by spec.
 * Returns null for empty or unparseable input rather than an Invalid Date.
 */
export function parseLocalDateTime(value: string | null | undefined): Date | null {
	if (!value) return null;
	const normalised = value.trim().replace(" ", "T").slice(0, 19);
	if (normalised.length < 16) return null;
	const parsed = new Date(normalised);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Convert a stored/served datetime into the `datetime-local` input value
 * (YYYY-MM-DDTHH:mm). Empty string when there is nothing to show — which is the
 * normal state of `restart_datetime` on an incident that is still down.
 */
export function toDateTimeLocalInput(value: string | null | undefined): string {
	const parsed = parseLocalDateTime(value);
	if (!parsed) return "";
	return new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000)
		.toISOString()
		.slice(0, 16);
}

/**
 * Convert a `datetime-local` input value into the string sent to the API.
 * Seconds are appended because the input omits them; Pydantic accepts both, but
 * sending a full ISO-8601 local timestamp keeps the payload unambiguous.
 * Returns null for a blank field — for `restart_datetime` that is meaningful:
 * null means the machine is STILL DOWN and the incident stays on the open board.
 */
export function toApiDateTime(value: string | null | undefined): string | null {
	if (!value) return null;
	const trimmed = value.trim();
	if (trimmed === "") return null;
	return trimmed.length === 16 ? `${trimmed}:00` : trimmed;
}

/** Whole minutes between two datetimes, or null when either side is missing. */
export function minutesBetween(
	from: string | null | undefined,
	to: string | null | undefined
): number | null {
	const start = parseLocalDateTime(from);
	const end = parseLocalDateTime(to);
	if (!start || !end) return null;
	return Math.floor((end.getTime() - start.getTime()) / 60000);
}

/**
 * Live downtime preview: restart − stop. Null while the incident is open, which
 * is exactly what the backend stores for `duration_min`.
 */
export function durationMinutes(
	stopDateTime: string | null | undefined,
	restartDateTime: string | null | undefined
): number | null {
	return minutesBetween(stopDateTime, restartDateTime);
}

/** Live response-time preview: attended − stop. Null until attendance is recorded. */
export function responseMinutes(
	stopDateTime: string | null | undefined,
	attendedDateTime: string | null | undefined
): number | null {
	return minutesBetween(stopDateTime, attendedDateTime);
}

/** Minutes an incident has been down so far, measured against a supplied clock. */
export function elapsedMinutes(
	stopDateTime: string | null | undefined,
	now: Date = new Date()
): number | null {
	const start = parseLocalDateTime(stopDateTime);
	if (!start) return null;
	return Math.max(0, Math.floor((now.getTime() - start.getTime()) / 60000));
}

/**
 * The repair state the backend will derive from these three datetimes. Shown on
 * the form so the operator can see that leaving restart blank keeps the incident
 * on the open board.
 */
export function deriveStatus(
	stopDateTime: string | null | undefined,
	attendedDateTime: string | null | undefined,
	restartDateTime: string | null | undefined
): BreakdownStatusCode {
	if (parseLocalDateTime(restartDateTime)) return BREAKDOWN_STATUS.CLOSED;
	if (parseLocalDateTime(attendedDateTime)) return BREAKDOWN_STATUS.UNDER_REPAIR;
	return BREAKDOWN_STATUS.OPEN;
}

/** Human label for a repair state, used when the setup enum has not loaded yet. */
export function statusFallbackLabel(status: string | null | undefined): string {
	switch (status) {
		case BREAKDOWN_STATUS.OPEN:
			return "Open";
		case BREAKDOWN_STATUS.UNDER_REPAIR:
			return "Under repair";
		case BREAKDOWN_STATUS.CLOSED:
			return "Closed";
		default:
			return status ?? "";
	}
}

/**
 * Minutes as shop-floor readable text: "45 min", "3 h 20 min", "2 d 5 h".
 * Null (still open / not recorded) renders as an em dash.
 */
export function formatMinutes(minutes: number | null | undefined): string {
	if (minutes == null || !Number.isFinite(minutes)) return "—";
	const total = Math.max(0, Math.floor(minutes));
	if (total < MINUTES_PER_HOUR) return `${total} min`;
	if (total < MINUTES_PER_DAY) {
		const hours = Math.floor(total / MINUTES_PER_HOUR);
		const rest = total % MINUTES_PER_HOUR;
		return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
	}
	const days = Math.floor(total / MINUTES_PER_DAY);
	const hours = Math.floor((total % MINUTES_PER_DAY) / MINUTES_PER_HOUR);
	return hours === 0 ? `${days} d` : `${days} d ${hours} h`;
}

/** Compact display for a served datetime: "24-08-2026 14:30", or "" when absent. */
export function formatDateTimeDisplay(value: string | null | undefined): string {
	const parsed = parseLocalDateTime(value);
	if (!parsed) return "";
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${pad(parsed.getDate())}-${pad(parsed.getMonth() + 1)}-${parsed.getFullYear()} ${pad(
		parsed.getHours()
	)}:${pad(parsed.getMinutes())}`;
}

/** MUI palette severity for an elapsed downtime — theme tokens, never hex. */
export type ElapsedSeverity = "success" | "warning" | "error";

/**
 * Longer down = louder. Under an hour is normal, over four hours is a problem
 * the shift supervisor needs to see at a glance.
 */
export function elapsedSeverity(minutes: number | null | undefined): ElapsedSeverity {
	if (minutes == null || minutes < ELAPSED_WARNING_MIN) return "success";
	if (minutes < ELAPSED_CRITICAL_MIN) return "warning";
	return "error";
}

/** True when a datetime-local value lies in the future (the backend rejects it). */
export function isFutureDateTime(value: string | null | undefined, now: Date = new Date()): boolean {
	const parsed = parseLocalDateTime(value);
	if (!parsed) return false;
	return parsed.getTime() > now.getTime();
}

/** Numeric read of a form string; null when blank or not a finite number. */
export function toNumberOrNull(value: string | null | undefined): number | null {
	if (value == null) return null;
	const trimmed = String(value).trim();
	if (trimmed === "") return null;
	const parsed = Number(trimmed);
	return Number.isFinite(parsed) ? parsed : null;
}

/** Money rounding for spare amounts — two decimals, no floating-point tail. */
export function roundMoney(value: number): number {
	return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * A spare line's amount = qty x rate. The backend derives the same value when
 * `amount` is omitted; computing it here lets the editor show the line total
 * live and lets the page send an explicit, already-rounded figure.
 */
export function spareLineAmount(
	qty: string | null | undefined,
	rate: string | null | undefined
): number | null {
	const q = toNumberOrNull(qty);
	const r = toNumberOrNull(rate);
	if (q == null || r == null) return null;
	return roundMoney(q * r);
}

/** Sum of every line amount that resolves to a number. */
export function sumSpareAmounts(
	lines: ReadonlyArray<{ qty: string; rate: string }>
): number {
	return roundMoney(
		lines.reduce((total, line) => total + (spareLineAmount(line.qty, line.rate) ?? 0), 0)
	);
}
