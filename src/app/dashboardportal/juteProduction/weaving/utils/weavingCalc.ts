// Client-side preview mirrors the backend weaving rules (SPEC §3, revised 2026-06-24).
// The server / vw_weaving_daily recomputes all values on read and is AUTHORITATIVE —
// these are display-only previews. Structure mirrors spinningCalc.ts / beamingCalc.ts.
//
// REVISED JUGAR MODEL (2026-06-24): the operator enters the CLOSING jugar reading (cj);
// open_jugar (oj) is the last available close for this (loom, quality) before this
// (date, spell); and `jugar` (jugars PRODUCED this spell) is DERIVED:
//     X     = jc - oj + cj                       (jc = no_of_jugar_per_cut)
//     jugar = (X - jc) when X > jc else X         (= cj-oj no-wrap; jc-oj+cj wrapped)
//     jugar = max(0, jugar)
//     production_yds = (cuts + jugar / jc) * FL   (guard jc > 0)
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

// effectiveJugar(jc, oj, cj) = the jugars PRODUCED this spell (derived), SPEC §3.
//   X = jc - oj + cj; jugar = (X - jc) if X > jc else X; jugar = max(0, jugar).
// jc = no_of_jugar_per_cut, oj = open_jugar (last available close), cj = closing jugar
// (operator input). Pure + guarded — returns 0 when jc is falsy/non-positive.
export function effectiveJugar(jc: number, oj: number, cj: number): number {
	const j = Number(jc);
	if (!j || j <= 0) return 0;
	const open = Number(oj) || 0;
	const close = Number(cj) || 0;
	const x = j - open + close;
	const jugar = x > j ? x - j : x;
	return Math.max(0, jugar);
}

// production_yds = (cuts + jugar / jc) * FL (SPEC §3, revised). FL = finished length
// (yards/cut), jc = no_of_jugar_per_cut, `jugar` = jugars PRODUCED (from effectiveJugar).
// Returns 0 when fl is falsy; guards jc div-by-zero by dropping the jugar term when
// jc is 0/falsy.
export function productionYds(cuts: number, fl: number, jugar: number, jc: number): number {
	const c = Number(cuts);
	const f = Number(fl);
	if (!f) return 0;
	const j = Number(jc);
	const jugarFraction = j ? Number(jugar) / j : 0;
	return round3((c + jugarFraction) * f);
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
