// Client-side preview for the Winding doff net. Mirrors the backend
// src/juteProduction/services/winding_rules.py EXACTLY. The server recomputes
// all values on save and is authoritative — these helpers are display-only so
// the operator sees the net before pressing Save.

import type { WindingSpellReportRow } from "../types/windingTypes";

// Net-weight gate (kg): 1 <= net <= 500 (constants.py WINDING_NET_MIN /
// WINDING_NET_MAX). One weighing = one person = one row, so there is no split
// and the gate applies to the single net.
export const WINDING_NET_MIN = 1;
export const WINDING_NET_MAX = 500;

// Jugar (spindle leftover) weight band (kg): 0 < weight <= 100.
export const JUGAR_MIN = 0;
export const JUGAR_MAX = 100;

// Spindle-count band per person/spell on the quality entry: 1..30.
export const SPINDLE_MIN = 1;
export const SPINDLE_MAX = 30;

function round3(x: number): number {
	return Math.round(x * 1000) / 1000;
}

// Net weight of one doff (kg) — one weighing by one winder.
//   net = grosswt - trollywt - spoolwt
// May be <= 0 — caller gates Save on net > 0 (mirrors the BE 400).
export function computeWindingNet(grosswt: number, trollywt: number, spoolwt: number): number {
	return round3(Number(grosswt) - Number(trollywt) - Number(spoolwt));
}

// Stored per-row gross weight.
//   row_gross_wt = net + trollywt + spoolwt
export function computeWindingRowGrossWt(
	net: number,
	trollywt: number,
	spoolwt: number,
): number {
	return round3(Number(net) + Number(trollywt) + Number(spoolwt));
}

// A doff net must fall within [WINDING_NET_MIN, WINDING_NET_MAX].
export function validateWindingNet(net: number): boolean {
	return WINDING_NET_MIN <= net && net <= WINDING_NET_MAX;
}

// Winder-wise production rollup — one row per (spell, winder, yarn quality),
// straight off the server reconciliation rows (WINDING_SPELL_REPORT).
// production_kg already carries the jugar adjustment (doff sum - opening +
// closing); re-summing the raw doff nets here is what made the jugar drop out of
// Production / Total (TKT-000087), so this helper deliberately only filters,
// labels and sorts — it never recomputes weights.
//
// TKT-000169: rows also carry the machine the winder was mapped to and the
// target, and `spellId = null` returns EVERY spell of the day (shifts A, B and C
// together) instead of only the one picked in the shared Spell selector.
export type WinderWiseRow = {
	id: string;
	eb_id: number | null;
	spell_code: string;
	shift: string;
	winder: string;
	machine: string;
	item_code: string;
	sum_production: number;
	opening_jugar: number;
	closing_jugar: number;
	production_kg: number;
	// null = the quality has no target configured (not "target of zero").
	target_kg: number | null;
};

// Machine label as the Quality tab shows it: code first, name as the fallback.
function machineLabel(r: WindingSpellReportRow): string {
	return r.mech_code || r.machine_name || "";
}

// A, B, C in order; anything else (a spell with no A/B/C code) sorts last.
function shiftOrder(shift: string): number {
	const i = "ABC".indexOf(shift);
	return shift === "" || i < 0 ? 3 : i;
}

export function winderWiseRows(
	rows: WindingSpellReportRow[],
	spellId: number | null,
): WinderWiseRow[] {
	return rows
		.filter((r) => spellId == null || Number(r.spell_id) === spellId)
		.map((r) => ({
			id: `${r.spell_id ?? "-"}|${r.eb_id ?? "-"}|${r.item_id ?? "-"}`,
			eb_id: r.eb_id ?? null,
			spell_code: r.spell_code ?? "—",
			shift: (r.shift ?? "").slice(0, 1).toUpperCase(),
			winder: [r.emp_code, r.worker_name].filter(Boolean).join(" - ") || "—",
			machine: machineLabel(r) || "—",
			item_code: r.item_code ?? "—",
			sum_production: round3(Number(r.sum_production) || 0),
			opening_jugar: round3(Number(r.opening_jugar) || 0),
			closing_jugar: round3(Number(r.closing_jugar) || 0),
			production_kg: round3(Number(r.production_kg) || 0),
			target_kg: r.target_kg == null ? null : round3(Number(r.target_kg) || 0),
		}))
		.sort(
			(a, b) =>
				shiftOrder(a.shift) - shiftOrder(b.shift) ||
				a.spell_code.localeCompare(b.spell_code) ||
				a.winder.localeCompare(b.winder) ||
				a.item_code.localeCompare(b.item_code),
		);
}

// Day/spell total shown above the grid — the sum of the reconciled kg, not of
// the doff nets.
export function winderWiseTotal(rows: WinderWiseRow[]): number {
	return round3(rows.reduce((a, r) => a + r.production_kg, 0));
}

// Per-shift subtotals for the strip above the grid. Shifts A, B and C are always
// listed (a shift nobody has entered yet reads 0 rather than silently missing);
// an "Other" bucket appears only when some row's spell resolves to none of them.
// `target_kg` sums the rows that HAVE a target and is null when none do, so a
// tenant with no winding standards configured sees no target at all.
export type WinderWiseShiftTotal = {
	shift: string;
	winders: number;
	production_kg: number;
	target_kg: number | null;
};

export function winderWiseShiftTotals(rows: WinderWiseRow[]): WinderWiseShiftTotal[] {
	const buckets = ["A", "B", "C"];
	const hasOther = rows.some((r) => !buckets.includes(r.shift));
	return [...buckets, ...(hasOther ? [""] : [])].map((shift) => {
		const inShift = rows.filter((r) =>
			shift === "" ? !buckets.includes(r.shift) : r.shift === shift,
		);
		const withTarget = inShift.filter((r) => r.target_kg != null);
		return {
			shift: shift || "Other",
			winders: new Set(inShift.map((r) => r.eb_id ?? r.winder)).size,
			production_kg: round3(inShift.reduce((a, r) => a + r.production_kg, 0)),
			target_kg:
				withTarget.length === 0
					? null
					: round3(withTarget.reduce((a, r) => a + (r.target_kg ?? 0), 0)),
		};
	});
}
