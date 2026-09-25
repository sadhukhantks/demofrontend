/**
 * @file yarnIssueFormat.ts
 * @description Pure date/number formatting helpers for the Yarn Issue pages.
 */

const pad2 = (value: number) => String(value).padStart(2, "0");

/** Local date as `YYYY-MM-DD` (avoids the UTC shift of `toISOString`). */
export const toYmd = (date: Date): string => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

export const todayYmd = (): string => toYmd(new Date());

/** First and last day of the month containing `now` — the list page's default range. */
export const currentMonthRange = (now: Date = new Date()): { from: string; to: string } => {
	const from = new Date(now.getFullYear(), now.getMonth(), 1);
	const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
	return { from: toYmd(from), to: toYmd(to) };
};

/** `2026-09-25` (or an ISO datetime) → `25 Sep 2026`; anything unparseable is returned as-is. */
export const formatDisplayDate = (value?: string | null): string => {
	if (!value) return "-";
	const trimmed = value.trim();
	const ymd = trimmed.match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})/);
	let date: Date | null = null;
	if (ymd) {
		const [, year, month, day] = ymd;
		date = new Date(Number(year), Number(month) - 1, Number(day));
	} else {
		const parsed = new Date(trimmed);
		if (!Number.isNaN(parsed.getTime())) date = parsed;
	}
	if (!date || Number.isNaN(date.getTime())) return trimmed;
	return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
};

/** Indian-grouped number with fixed decimals; `-` for null/undefined. */
export const formatNumber = (value: number | null | undefined, digits = 2): string => {
	if (value == null || !Number.isFinite(value)) return "-";
	return value.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
};
