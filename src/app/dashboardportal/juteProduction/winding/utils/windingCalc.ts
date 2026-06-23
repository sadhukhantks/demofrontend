// Client-side preview for the Winding doff net split. Mirrors the backend
// src/juteProduction/services/winding_rules.py EXACTLY. The server recomputes
// all values on save and is authoritative — these helpers are display-only so
// the operator sees the net + per-machine split before pressing Save.

// Per-machine net-weight gate (kg): legacy view gate 1 <= net/mc <= 500
// (constants.py WINDING_NET_MIN / WINDING_NET_MAX).
export const WINDING_NET_MIN = 1;
export const WINDING_NET_MAX = 500;

// Jugar (spindle leftover) weight band (kg): 0 < weight <= 100.
export const JUGAR_MIN = 0;
export const JUGAR_MAX = 100;

// Spindle-count band per machine/spell on the quality entry: 1..30.
export const SPINDLE_MIN = 1;
export const SPINDLE_MAX = 30;

function round2(x: number): number {
	return Math.round(x * 100) / 100;
}

function round3(x: number): number {
	return Math.round(x * 1000) / 1000;
}

// Python's round() uses banker's rounding (round-half-to-even). The backend
// compute_winding_net_per_mc relies on it, so we mirror it here for parity.
function roundHalfEven(x: number): number {
	const floor = Math.floor(x);
	const diff = x - floor;
	if (diff < 0.5) return floor;
	if (diff > 0.5) return floor + 1;
	// Exactly .5 -> round to even.
	return floor % 2 === 0 ? floor : floor + 1;
}

// Total net weight of one doff (kg) across all nomc machines.
//   net = grosswt - trollywt - (nomc * spoolwt)
// May be <= 0 — caller gates Save on net > 0 (mirrors the BE 400).
export function computeWindingNet(
	grosswt: number,
	trollywt: number,
	nomc: number,
	spoolwt: number,
): number {
	return round3(Number(grosswt) - Number(trollywt) - Number(nomc) * Number(spoolwt));
}

// Per-machine net weight (kg, integer) under the legacy equal split.
//   gross/mc  = round2(grosswt / nomc)
//   trolly/mc = round2(trollywt / nomc)
//   net/mc    = round( gross/mc - trolly/mc - spoolwt )  // integer, half-even
// The SAME value is written to every active machine. Returns 0 when nomc falsy.
export function computeWindingNetPerMc(
	grosswt: number,
	trollywt: number,
	nomc: number,
	spoolwt: number,
): number {
	const n = Number(nomc);
	if (!n) return 0;
	const grossPerMc = round2(Number(grosswt) / n);
	const trollyPerMc = round2(Number(trollywt) / n);
	return roundHalfEven(grossPerMc - trollyPerMc - Number(spoolwt));
}

// Stored per-row gross weight for one machine.
//   row_gross_wt = net_per_mc + trollywt + spoolwt
export function computeWindingRowGrossWt(
	netPerMc: number,
	trollywt: number,
	spoolwt: number,
): number {
	return round3(Number(netPerMc) + Number(trollywt) + Number(spoolwt));
}

// A doff per-machine net must fall within [WINDING_NET_MIN, WINDING_NET_MAX].
export function validateWindingNet(net: number): boolean {
	return WINDING_NET_MIN <= net && net <= WINDING_NET_MAX;
}
