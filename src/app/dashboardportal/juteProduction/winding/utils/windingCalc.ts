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

// Winder-wise production rollup — one row per (winder, yarn quality) for the
// selected spell, straight off the server reconciliation rows
// (WINDING_SPELL_REPORT). production_kg already carries the jugar adjustment
// (doff sum - opening + closing); re-summing the raw doff nets here is what
// made the jugar drop out of Production / Total (TKT-000087), so this helper
// deliberately only filters, labels and sorts — it never recomputes weights.
export type WinderWiseRow = {
	id: string;
	winder: string;
	item_code: string;
	sum_production: number;
	opening_jugar: number;
	closing_jugar: number;
	production_kg: number;
};

export function winderWiseRows(
	rows: WindingSpellReportRow[],
	spellId: number | null,
): WinderWiseRow[] {
	return rows
		.filter((r) => spellId == null || Number(r.spell_id) === spellId)
		.map((r) => ({
			id: `${r.spell_id ?? "-"}|${r.eb_id ?? "-"}|${r.item_id ?? "-"}`,
			winder: [r.emp_code, r.worker_name].filter(Boolean).join(" - ") || "—",
			item_code: r.item_code ?? "—",
			sum_production: round3(Number(r.sum_production) || 0),
			opening_jugar: round3(Number(r.opening_jugar) || 0),
			closing_jugar: round3(Number(r.closing_jugar) || 0),
			production_kg: round3(Number(r.production_kg) || 0),
		}))
		.sort((a, b) => a.winder.localeCompare(b.winder) || a.item_code.localeCompare(b.item_code));
}

// Day/spell total shown above the grid — the sum of the reconciled kg, not of
// the doff nets.
export function winderWiseTotal(rows: WinderWiseRow[]): number {
	return round3(rows.reduce((a, r) => a + r.production_kg, 0));
}
