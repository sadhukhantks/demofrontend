// Pure helpers for the Bale Production page — the client-side mirror of the
// server formulas in vowerp3be/docs/bale-production-spec-sheet.md §5 (F0, F9)
// used for the live preview, plus the series auto-resolution rule from §3.
// No React, no I/O: everything here is unit-tested in baleCalc.test.ts.

import type { BaleQualityOption, BaleSeriesOption } from "../types/baleTypes";

// -----------------------------------------------------------------------------
// Bounds (SPEC §4.2 — constants in the backend's juteProduction/constants.py)
// -----------------------------------------------------------------------------

export const BALE_GROSS_MIN = 1;
export const BALE_GROSS_MAX = 2000;
export const BALE_NO_MAX = 9_999_999;
/** DECIMAL(10,3) on every weight column. */
export const BALE_WT_SCALE = 3;
/** Soft band for the deviation preview colour (SPEC §8.1). Never blocks a save. */
export const BALE_DEVIATION_WARN_PCT = 3;

// -----------------------------------------------------------------------------
// Dates
// -----------------------------------------------------------------------------

/** Today as YYYY-MM-DD in LOCAL time (never UTC — mills work past midnight IST). */
export function todayISO(): string {
	const d = new Date();
	const tzOffset = d.getTimezoneOffset() * 60000;
	return new Date(d.getTime() - tzOffset).toISOString().slice(0, 10);
}

/** True when a YYYY-MM-DD string is later than today (string compare is safe for ISO dates). */
export function isFutureISODate(value: string): boolean {
	if (!value) return false;
	return value > todayISO();
}

// -----------------------------------------------------------------------------
// Numbers
// -----------------------------------------------------------------------------

/** Round to the weight column scale so float subtraction does not leak 0.30000000000000004. */
export function roundWt(value: number): number {
	const factor = 10 ** BALE_WT_SCALE;
	return Math.round(value * factor) / factor;
}

/** Number of decimal places typed into a numeric text field ("12.500" → 3). */
export function decimalPlaces(value: string): number {
	const dot = value.indexOf(".");
	return dot === -1 ? 0 : value.length - dot - 1;
}

/** Coerce an API numeric (number or numeric string) to a finite number, else fallback. */
export function toNum(value: unknown, fallback = 0): number {
	const n = typeof value === "number" ? value : Number(value);
	return Number.isFinite(n) ? n : fallback;
}

/**
 * F0 — `net_wt = gross_wt − trolly_wt − packsheet_wt` (D1: packsheet from the
 * quality master, trolley tare from `trolly_mst.trolly_weight`, 0 when tared).
 * Null/undefined tares count as 0. Result is rounded to 3 dp.
 */
export function computeNet(
	grossWt: number,
	trollyWt: number | null | undefined,
	packsheetWt: number | null | undefined
): number {
	return roundWt(toNum(grossWt) - toNum(trollyWt) - toNum(packsheetWt));
}

/**
 * Deviation of a bale's net weight from the quality's standard, in percent
 * (positive = heavy, negative = light — the SPEC §5 sign convention). Returns
 * null when there is no usable standard, so the preview can stay blank rather
 * than divide by zero.
 */
export function deviationPct(netWt: number, stdBaleWt: number | null | undefined): number | null {
	const std = toNum(stdBaleWt);
	if (std <= 0 || !Number.isFinite(netWt)) return null;
	return ((netWt - std) / std) * 100;
}

export type DeviationSeverity = "ok" | "warn";

/** `warn` when |pct| exceeds the soft band, `ok` otherwise, null when no pct. */
export function deviationSeverity(
	pct: number | null,
	warnPct: number = BALE_DEVIATION_WARN_PCT
): DeviationSeverity | null {
	if (pct === null || !Number.isFinite(pct)) return null;
	return Math.abs(pct) > warnPct ? "warn" : "ok";
}

/** F9 — the number the next bale takes. */
export function nextBaleNo(lastBaleNo: number | null | undefined): number {
	return Math.max(0, Math.trunc(toNum(lastBaleNo))) + 1;
}

// -----------------------------------------------------------------------------
// Series auto-resolution (SPEC §3 / §4.1)
// -----------------------------------------------------------------------------

export type SeriesResolution = {
	/** Every series the picked quality may legitimately use, in setup order. */
	candidates: BaleSeriesOption[];
	/** The single unambiguous series, or null when the operator must pick. */
	auto: BaleSeriesOption | null;
	/** Which rule produced the candidates (for helper text / tests). */
	rule: "item" | "type" | "none";
};

/**
 * Hessian pattern first: series bound to this quality's own item. Otherwise the
 * unbound (`item_id === null`) series of the same quality type (the sacking /
 * consignee pattern). `auto` is set only when exactly one candidate remains.
 * Series bound to a DIFFERENT item are never offered — the server rejects them.
 */
export function resolveSeries(
	series: ReadonlyArray<BaleSeriesOption>,
	quality: Pick<BaleQualityOption, "item_id" | "quality_type"> | null | undefined
): SeriesResolution {
	if (!quality) return { candidates: [], auto: null, rule: "none" };

	const byItem = series.filter((s) => s.item_id != null && s.item_id === quality.item_id);
	if (byItem.length > 0) {
		return { candidates: byItem, auto: byItem.length === 1 ? byItem[0] : null, rule: "item" };
	}

	const byType = series.filter(
		(s) => s.item_id == null && Number(s.quality_type) === Number(quality.quality_type)
	);
	return {
		candidates: byType,
		auto: byType.length === 1 ? byType[0] : null,
		rule: byType.length > 0 ? "type" : "none",
	};
}

// -----------------------------------------------------------------------------
// Display formatting
// -----------------------------------------------------------------------------

/** Weights: up to 3 decimals, trailing zeros stripped ("294", "293.5", "0.125"). */
export function formatKg(value: number | null | undefined): string {
	if (value === null || value === undefined) return "";
	const n = toNum(value, Number.NaN);
	if (!Number.isFinite(n)) return "";
	return String(Number(n.toFixed(BALE_WT_SCALE)));
}

/** Deviation: signed with one decimal and a real minus sign — "+2.1 %", "−0.6 %". */
export function formatPct(pct: number | null | undefined): string {
	if (pct === null || pct === undefined || !Number.isFinite(pct)) return "";
	const rounded = Math.round(pct * 10) / 10;
	if (rounded === 0) return "0.0 %";
	const sign = rounded > 0 ? "+" : "−";
	return `${sign}${Math.abs(rounded).toFixed(1)} %`;
}

/** "HH:mm" from an ISO datetime; falls back to the raw string when unparsable. */
export function formatTime(iso: string | null | undefined): string {
	if (!iso) return "";
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	const hh = String(d.getHours()).padStart(2, "0");
	const mm = String(d.getMinutes()).padStart(2, "0");
	return `${hh}:${mm}`;
}
