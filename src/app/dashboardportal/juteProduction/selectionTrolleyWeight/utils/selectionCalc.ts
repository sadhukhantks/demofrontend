// Pure helpers for the Selection Trolley Weight page — the client-side mirror
// of the server rule `net_wt = gross_wt − trolly_wt` (spec D2) used for the
// live preview, plus the day totals / by-quality roll-up and the gate-entry
// filter (D7). No React, no I/O: everything here is unit-tested in
// selectionCalc.test.ts.

import type {
	SelectionGateEntryOption,
	SelectionQualityOption,
	SelectionQualityTotal,
	SelectionRow,
	SelectionTotals,
	SelectionTrollyOption,
} from "../types/selectionTypes";

// -----------------------------------------------------------------------------
// Bounds (spec §3 — constants in the backend's juteProduction/constants.py)
// -----------------------------------------------------------------------------

export const SELECTION_GROSS_MIN = 1;
export const SELECTION_GROSS_MAX = 5000;
/** DECIMAL(10,3) on every weight column. */
export const SELECTION_WT_SCALE = 3;
/** Quality picker window, days ending on the entry date (D4). */
export const SELECTION_QUALITY_WINDOW_DAYS = 7;

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

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "20-Jan-2026" from "2026-01-20" (or a datetime starting with it); raw string when unparsable. */
export function formatDateDMY(iso: string | null | undefined): string {
	if (!iso) return "";
	const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
	if (!m) return iso;
	const month = MONTHS_SHORT[Number(m[2]) - 1];
	if (!month) return iso;
	return `${m[3]}-${month}-${m[1]}`;
}

/** "HH:mm" from "YYYY-MM-DD HH:mm:ss" / ISO datetime; falls back to the raw string. */
export function formatTime(value: string | null | undefined): string {
	if (!value) return "";
	const m = /(\d{2}):(\d{2})(?::\d{2})?/.exec(value);
	return m ? `${m[1]}:${m[2]}` : value;
}

// -----------------------------------------------------------------------------
// Numbers
// -----------------------------------------------------------------------------

/** Round to the weight column scale so float subtraction does not leak 0.30000000000000004. */
export function roundWt(value: number): number {
	const factor = 10 ** SELECTION_WT_SCALE;
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
 * D2 — `net_wt = gross_wt − trolly_wt` (trolley tare only, no basket).
 * A null/undefined tare counts as 0. Result is rounded to 3 dp.
 */
export function computeNet(grossWt: number, trollyWt: number | null | undefined): number {
	return roundWt(toNum(grossWt) - toNum(trollyWt));
}

// -----------------------------------------------------------------------------
// Day totals / by-quality roll-up (client mirror of entries_by_date.totals /
// by_quality — used as the fallback when the server omits them)
// -----------------------------------------------------------------------------

export function computeTotals(rows: ReadonlyArray<SelectionRow>): SelectionTotals {
	return rows.reduce<SelectionTotals>(
		(acc, r) => ({
			trolleys: acc.trolleys + 1,
			gross_wt: roundWt(acc.gross_wt + toNum(r.gross_wt)),
			trolly_wt: roundWt(acc.trolly_wt + toNum(r.trolly_wt)),
			net_wt: roundWt(acc.net_wt + toNum(r.net_wt)),
		}),
		{ trolleys: 0, gross_wt: 0, trolly_wt: 0, net_wt: 0 }
	);
}

/** Trolleys and net kg per quality, ordered by item_name (then item_id). */
export function rollupByQuality(rows: ReadonlyArray<SelectionRow>): SelectionQualityTotal[] {
	const map = new Map<number, SelectionQualityTotal>();
	for (const r of rows) {
		const cur = map.get(r.item_id);
		if (cur) {
			cur.trolleys += 1;
			cur.net_wt = roundWt(cur.net_wt + toNum(r.net_wt));
		} else {
			map.set(r.item_id, { item_id: r.item_id, item_name: r.item_name, trolleys: 1, net_wt: roundWt(toNum(r.net_wt)) });
		}
	}
	return [...map.values()].sort(
		(a, b) => (a.item_name ?? "").localeCompare(b.item_name ?? "") || a.item_id - b.item_id
	);
}

// -----------------------------------------------------------------------------
// Gate entries (D7) — client-side filter to the chosen quality
// -----------------------------------------------------------------------------

/** Gate entries that issued the given quality in the window; all of them when no quality is chosen. */
export function gateEntriesForQuality(
	gateEntries: ReadonlyArray<SelectionGateEntryOption>,
	itemId: number | null | undefined
): SelectionGateEntryOption[] {
	if (itemId == null) return [...gateEntries];
	return gateEntries.filter((g) => (g.item_ids ?? []).some((id) => Number(id) === itemId));
}

/** True when the gate entry may stay selected for the quality (used to auto-clear on quality change). */
export function gateEntryHasQuality(
	gateEntry: SelectionGateEntryOption | null | undefined,
	itemId: number | null | undefined
): boolean {
	if (!gateEntry || itemId == null) return false;
	return (gateEntry.item_ids ?? []).some((id) => Number(id) === itemId);
}

// -----------------------------------------------------------------------------
// Display formatting
// -----------------------------------------------------------------------------

/** Weights: up to 3 decimals, trailing zeros stripped ("294", "293.5", "0.125"). */
export function formatKg(value: number | null | undefined): string {
	if (value === null || value === undefined) return "";
	const n = toNum(value, Number.NaN);
	if (!Number.isFinite(n)) return "";
	return String(Number(n.toFixed(SELECTION_WT_SCALE)));
}

/** Tare shown with a fixed 3 decimals ("77.000") so trolley labels line up. */
export function formatTare(value: number | null | undefined): string {
	return toNum(value).toFixed(SELECTION_WT_SCALE);
}

/** Whole kg with thousands grouping for the issued quantity ("21,480"). */
export function formatKgGrouped(value: number | null | undefined): string {
	const n = Math.round(toNum(value));
	return n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

/** Dropdown label: `D TD 5 · 21,480 kg issued`. */
export function qualityLabel(q: SelectionQualityOption): string {
	return `${q.item_name} · ${formatKgGrouped(q.issued_kg)} kg issued`;
}

/** Dropdown label: `GE 36 · 20-Jan-2026 · <supplier>` (supplier omitted when unknown). */
export function gateEntryLabel(g: SelectionGateEntryOption): string {
	const parts = [`GE ${g.gate_entry_no ?? g.jute_mr_id}`];
	const date = formatDateDMY(g.gate_entry_date);
	if (date) parts.push(date);
	if (g.supplier_name) parts.push(g.supplier_name);
	return parts.join(" · ");
}

/** Dropdown label: `74 (tare 77.000 kg)`. */
export function trollyLabel(t: SelectionTrollyOption): string {
	return `${t.trolly_name} (tare ${formatTare(t.trolly_weight)} kg)`;
}

/** Short gate-entry text for grid/cards: `GE 36` or "" when none. */
export function gateEntryShort(row: Pick<SelectionRow, "jute_mr_id" | "gate_entry_no">): string {
	if (row.jute_mr_id == null) return "";
	return `GE ${row.gate_entry_no ?? row.jute_mr_id}`;
}
