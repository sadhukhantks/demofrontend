// Client-side preview mirrors the backend weaving rules (SPEC §3). The server
// recomputes all values on save/create and is AUTHORITATIVE — these are display-only
// previews. Structure mirrors spinningCalc.ts / beamingCalc.ts.
//
// Unit caution: the kg constants (28.35 = ounces→grams, /1000 = grams→kg) and the
// picks/length conversions (36 = inches→yards) encode the legacy mill audit math.
// Do NOT "simplify" them — they reproduce the exact mill audit spreadsheet.

function round2(x: number): number {
	return Math.round(x * 100) / 100;
}

// production_yds = cuts·FL − open·FL/jpc + jugar·FL/jpc (SPEC §3).
// FL = full length (yards/cut), jpc = jugar per cut. Returns 0 when fl is falsy and
// guards jpc div-by-zero by treating the open/jugar terms as 0 when jpc is 0/falsy.
export function productionYds(
	cuts: number,
	fl: number,
	open: number,
	jugar: number,
	jpc: number,
): number {
	const c = Number(cuts);
	const f = Number(fl);
	if (!f) return 0;
	const j = Number(jpc);
	const perJugar = j ? f / j : 0;
	return round2(c * f - Number(open) * perJugar + Number(jugar) * perJugar);
}

// production_kg = yds · ozs_yds · 28.35 / 1000 (SPEC §3). ozs_yds = ounces per yard.
// Returns 0 when either input is falsy.
export function productionKg(productionYards: number, ozsYds: number): number {
	const yds = Number(productionYards);
	const ozs = Number(ozsYds);
	if (!yds || !ozs) return 0;
	return round2((yds * ozs * 28.35) / 1000);
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
