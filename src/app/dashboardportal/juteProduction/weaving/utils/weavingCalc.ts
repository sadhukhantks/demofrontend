// Client-side preview mirrors the backend weaving rules (SPEC §3, revised 2026-06-30).
// The server / vw_weaving_daily recomputes all values on read and is AUTHORITATIVE —
// these are display-only previews. Structure mirrors spinningCalc.ts / beamingCalc.ts.
//
// REVISED PRODUCTION MODEL (2026-06-30): the operator enters cuts + the CLOSING jugar
// reading (cj); open_jugar (oj) is the last available close for this (loom, quality)
// before this (date, spell); adjustment jugar (adj) = less_production (Adjustment tab).
//     total_jugar    = cuts * jc + cj - oj - adj     (jc = no_of_jugar_per_cut)
//     production_yds  = total_jugar * FL / jc         (guard jc > 0)
// No wrap/clamp: total_jugar is a straight count. (Old cyclic 0..jc counter dropped.)
//
// Unit caution: the kg constants (28.35 = ounces→grams, /1000 = grams→kg) and the
// picks/length conversions (36 = inches→yards) encode the legacy mill audit math.
// Do NOT "simplify" them — they reproduce the exact mill audit spreadsheet.

function round2(x: number): number {
	return Math.round(x * 100) / 100;
}

// The authoritative view rounds production_yds / production_kg to 3 dp
// (efficiency stays at 2 dp). Use round3 for those two outputs to match.
function round3(x: number): number {
	return Math.round(x * 1000) / 1000;
}

// totalJugar(cuts, jc, oj, cj, adj) = cuts·jc + cj − oj − adj (SPEC §3, revised).
// jc = no_of_jugar_per_cut, oj = open_jugar (last available close), cj = closing jugar
// (operator input), adj = adjustment jugar (less_production, 0 when not applicable).
// Straight count — no wrap, no clamp. Returns 0 when jc is falsy/non-positive.
export function totalJugar(cuts: number, jc: number, oj: number, cj: number, adj = 0): number {
	const j = Number(jc);
	if (!j || j <= 0) return 0;
	return Number(cuts) * j + (Number(cj) || 0) - (Number(oj) || 0) - (Number(adj) || 0);
}

// production_yds = total_jugar · FL / jc (SPEC §3, revised). FL = finished length
// (yards/cut), jc = no_of_jugar_per_cut, total = total jugar (from totalJugar).
// Returns 0 when fl is falsy or jc is 0/falsy (avoids div-by-zero).
export function productionYds(total: number, fl: number, jc: number): number {
	const f = Number(fl);
	const j = Number(jc);
	if (!f || !j) return 0;
	return round3((Number(total) * f) / j);
}

// production_kg = yds · ozs_yds · 28.35 / 1000 (SPEC §3). ozs_yds = ounces per yard.
// Returns 0 when either input is falsy.
export function productionKg(productionYards: number, ozsYds: number): number {
	const yds = Number(productionYards);
	const ozs = Number(ozsYds);
	if (!yds || !ozs) return 0;
	return round3((yds * ozs * 28.35) / 1000);
}

// std_prod_yds = (eff_speed · wh · 60) / (36 · eff_picks) (SPEC §3).
// eff_speed = effective loom speed (picks/min), wh = working hours, eff_picks = PPI.
// 36 converts inches→yards. Returns 0 when eff_picks is zero/falsy (avoids div-by-zero).
export function stdProdYds(effSpeed: number, workingHours: number, effPicks: number): number {
	const spd = Number(effSpeed);
	const wh = Number(workingHours);
	const picks = Number(effPicks);
	if (!picks) return 0;
	return round2((spd * wh * 60) / (36 * picks));
}

// efficiency (%) = production_yds · 100 / std_prod_yds (SPEC §3, length ÷ length).
// Returns 0 when std_prod_yds is zero/falsy (avoids div-by-zero).
export function efficiency(productionYards: number, stdProd: number): number {
	const std = Number(stdProd);
	if (!std) return 0;
	return round2((Number(productionYards) * 100) / std);
}

export function todayISO(): string {
	const d = new Date();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${d.getFullYear()}-${m}-${day}`;
}
