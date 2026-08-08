// Client-side helpers for the Jute Waste Entry page.
//
// Waste is a plain event log (SPEC §2) — there is no backend aggregate endpoint,
// so the per-waste-type footer totals shown under the day grid (SPEC §3.1) are
// computed here from the rows already loaded for the selected date.

import {
	WASTE_TYPE_CODES,
	wasteTypeLabel,
	type WasteEntryRow,
	type WasteTypeTotal,
} from "../types/wasteTypes";

/** Column width of `waste_qty` — DECIMAL(10,3), so 99999.999 is the ceiling (SPEC §2). */
export const MAX_WASTE_QTY = 99999.999;

/** Decimal places allowed by DECIMAL(10,3). */
export const WASTE_QTY_SCALE = 3;

/** Today as an ISO date string (YYYY-MM-DD) in local time, for default tran_date. */
export function todayISO(): string {
	const d = new Date();
	const tzOffset = d.getTimezoneOffset() * 60000;
	return new Date(d.getTime() - tzOffset).toISOString().slice(0, 10);
}

/**
 * True when an ISO (YYYY-MM-DD) date string is later than today (SPEC §2:
 * `tran_date` must not be in the future). String comparison is safe and
 * timezone-free for zero-padded ISO dates.
 */
export function isFutureISODate(value: string): boolean {
	if (!value) return false;
	return value > todayISO();
}

/** Number of decimal places typed into a numeric text field ("12.500" → 3). */
export function decimalPlaces(value: string): number {
	const dot = value.indexOf(".");
	return dot === -1 ? 0 : value.length - dot - 1;
}

/**
 * Single-row validation (SPEC §2): a waste row is valid only when
 * 0 < waste_qty <= 99999.999.
 */
export function isWasteQtyValid(qty: number): boolean {
	return Number.isFinite(qty) && qty > 0 && qty <= MAX_WASTE_QTY;
}

/** Sum of waste quantities across rows (ignores non-finite values). */
export function sumWasteQty(rows: ReadonlyArray<WasteEntryRow>): number {
	return rows.reduce<number>((acc, row) => {
		const n = Number(row.waste_qty);
		return acc + (Number.isFinite(n) ? n : 0);
	}, 0);
}

/** Round to the column scale so float addition doesn't leak 0.30000000000000004. */
export function roundQty(value: number): number {
	const factor = 10 ** WASTE_QTY_SCALE;
	return Math.round(value * factor) / factor;
}

/**
 * Footer totals for the day grid: waste_qty summed per waste type (SPEC §3.1).
 * Ordered by the canonical enum order, with any unknown/legacy code appended
 * last so nothing silently disappears from the total.
 */
export function totalsByWasteType(rows: ReadonlyArray<WasteEntryRow>): WasteTypeTotal[] {
	const sums = new Map<string, number>();
	rows.forEach((row) => {
		const n = Number(row.waste_qty);
		if (!Number.isFinite(n)) return;
		sums.set(row.waste_type_code, (sums.get(row.waste_type_code) ?? 0) + n);
	});

	const ordered: WasteTypeTotal[] = [];
	WASTE_TYPE_CODES.forEach((code) => {
		const total = sums.get(code);
		if (total == null) return;
		ordered.push({ code, label: wasteTypeLabel(code), total: roundQty(total) });
		sums.delete(code);
	});
	sums.forEach((total, code) => {
		ordered.push({ code, label: wasteTypeLabel(code), total: roundQty(total) });
	});
	return ordered;
}

/** Display formatting for quantities — always 3 decimals, matching the column. */
export function formatQty(value: number | null | undefined): string {
	const n = Number(value);
	return Number.isFinite(n) ? n.toFixed(WASTE_QTY_SCALE) : "";
}
