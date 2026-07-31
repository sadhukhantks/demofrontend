// Client-side preview for the Winding doff net. Mirrors the backend
// src/juteProduction/services/winding_rules.py EXACTLY. The server recomputes
// all values on save and is authoritative — these helpers are display-only so
// the operator sees the net before pressing Save.

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
