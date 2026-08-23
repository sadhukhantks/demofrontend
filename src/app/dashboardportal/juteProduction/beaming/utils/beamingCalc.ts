// Client-side preview mirrors src/juteProduction/services/beaming_rules.py (proposed).
// The server recomputes all values on save/create and is AUTHORITATIVE — these are
// display-only previews (SPEC §3, §C.5). Structure mirrors spinningCalc.ts.
//
// Unit caution: the kg/cut constants (14400 = jute spyndle yards, 2.20462 = kg→lb)
// encode the legacy count-system conversion. Do NOT "simplify" them — they reproduce
// the exact mill audit math. Beaming uses 2.20462 (its own constant) to avoid the
// 2.2046 vs 2.20462 precision drift documented in SPEC §3 / §8.

// SPEC §8 constants.
export const BEAMING_SPYNDLE_YDS = 14400;
export const BEAMING_KG_TO_LB = 2.20462;

function round2(x: number): number {
	return Math.round(x * 100) / 100;
}

function round3(x: number): number {
	return Math.round(x * 1000) / 1000;
}

// act_speed = rpm_roller × dia × π / 36 (starch-roller surface speed, yd/min).
// SPEC §3 / Q7. Neither input is entered on the production-entry page: `rpm_roller`
// will be captured on a future Beaming SQC tab (like Spinning SQC), and `dia` is
// resolved server-side from the machine standard. The server computes the
// authoritative act_speed. This helper stays for display-only use in the planning
// grid once both values are server-supplied. Returns 0 when either input is falsy.
export function actSpeed(rpmRoller: number, diaRoller: number): number {
	const rpm = Number(rpmRoller);
	const dia = Number(diaRoller);
	if (!rpm || !dia) return 0;
	return round2((rpm * dia * Math.PI) / 36);
}

// kg_per_cut = (ends × laid_length × count) / (14400 × 2.20462).
// SPEC §3 — this single-term form is the client preview for simple qualities.
// Composite qualities have no client-side std_count (the Σ_n components live
// server-side), so the form shows "—" for them; the server computes the composite
// total and only rejects when components are missing. count = std_count (std) or
// act_count (act). Returns 0 when any input is zero/falsy (avoids div-by-zero).
export function kgPerCut(ends: number, laidLength: number, count: number): number {
	const e = Number(ends);
	const laid = Number(laidLength);
	const c = Number(count);
	if (!e || !laid || !c) return 0;
	return round3((e * laid * c) / (BEAMING_SPYNDLE_YDS * BEAMING_KG_TO_LB));
}

// kg_per_beam = kg_per_cut × cuts_per_beam. SPEC §3.
export function kgPerBeam(kgCut: number, cutsPerBeam: number): number {
	const cuts = Number(cutsPerBeam);
	if (!kgCut || !cuts) return 0;
	return round3(Number(kgCut) * cuts);
}

// yards_per_beam = laid_length × cuts_per_beam. SPEC §3.
export function yardsPerBeam(laidLength: number, cutsPerBeam: number): number {
	const laid = Number(laidLength);
	const cuts = Number(cutsPerBeam);
	if (!laid || !cuts) return 0;
	return round2(laid * cuts);
}

// p100prod = std_speed × working_hours × 60 (100%-eff LENGTH capacity, yards).
// ALWAYS std_speed-based (single value, SPEC §3). Returns 0 when inputs falsy.
export function p100prod(stdSpeed: number, workingHours: number): number {
	const spd = Number(stdSpeed);
	const hrs = Number(workingHours);
	if (!spd || !hrs) return 0;
	return Math.round(spd * hrs * 60);
}

// std_prod / tgt_prod = eff% × p100prod (yards). SPEC §3. `effPct` is a percentage
// (e.g. 85 → 85%). Returns 0 when p100 or eff falsy.
export function effProd(effPct: number, p100: number): number {
	const eff = Number(effPct);
	if (!eff || !p100) return 0;
	return round2((eff / 100) * Number(p100));
}

// act_prod_yards = (laid_length × act_cuts) × no_of_beam (actual LENGTH, yards).
// SPEC §3 — this is the efficiency numerator basis. Returns 0 when inputs falsy.
export function actProdYards(laidLength: number, actCuts: number, noOfBeam: number): number {
	const laid = Number(laidLength);
	const cuts = Number(actCuts);
	const beams = Number(noOfBeam);
	if (!laid || !cuts || !beams) return 0;
	return round2(laid * cuts * beams);
}

// act_prod_kg = kg_per_cut(act_count) × act_cuts × no_of_beam (actual WEIGHT, kg).
// SPEC §3 — reported weight only; NEVER divided by the yards p100prod. Returns 0
// when inputs falsy.
export function actProdKg(kgCutAct: number, actCuts: number, noOfBeam: number): number {
	const cuts = Number(actCuts);
	const beams = Number(noOfBeam);
	if (!kgCutAct || !cuts || !beams) return 0;
	return round3(Number(kgCutAct) * cuts * beams);
}

// act_eff (%) = act_prod_yards ÷ p100prod × 100 (length ÷ length, SPEC §3).
// Returns 0 when p100 is zero/falsy (avoids div-by-zero).
export function actEff(actYards: number, p100: number): number {
	const p = Number(p100);
	if (!p) return 0;
	return round2((Number(actYards) / p) * 100);
}

export function todayISO(): string {
	const d = new Date();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${d.getFullYear()}-${m}-${day}`;
}

// --- Missing-standards diagnosis (ticket TKT-000075) -------------------------
// Every figure on this page is derived from time-versioned rows in
// jute_prod_beaming_target_map (resolved server-side by
// services/beaming_standards.resolve_machine_standards). An unconfigured param
// resolves to 0.0, and the formulas then multiply it out to 0 SILENTLY — the
// symptom reported as "RPM is not showing, so all calculation not showing".
// This turns those zeros into a named list of what to configure and where.
export type BeamingResolvedStandards = {
	laid_length?: number | null;
	cuts_per_beam?: number | null;
	std_cuts_per_beam?: number | null;
	std_eff?: number | null;
	std_speed?: number | null;
	dia?: number | null;
	act_rpm?: number | null;
};

const BEAMING_STANDARD_SOURCES: {
	key: keyof BeamingResolvedStandards;
	label: string;
	source: string;
}[] = [
	{ key: "laid_length", label: "Laid Length", source: "Beaming Standards → Quality / Standard" },
	{ key: "cuts_per_beam", label: "Cuts / Beam", source: "Beaming Standards → Quality / Standard" },
	{ key: "std_eff", label: "Std Eff %", source: "Beaming Standards → Quality / Standard" },
	{ key: "std_speed", label: "Std RPM", source: "Beaming Standards → Machine / Standard" },
	{ key: "dia", label: "Roller Dia", source: "Beaming Standards → Machine / Standard" },
	{ key: "act_rpm", label: "Actual RPM", source: "Beaming SQC → Actual RPM" },
];

// One sentence per source page, listing that page's unset params. Empty array =
// everything the calculation needs resolved for the chosen machine/quality/date.
// ponytail: flat scan over 6 params — no memoisation, it runs once per form change.
export function missingStandards(std: BeamingResolvedStandards | null | undefined): string[] {
	if (!std) return [];
	const bySource = new Map<string, string[]>();
	for (const s of BEAMING_STANDARD_SOURCES) {
		if (Number(std[s.key])) continue;
		bySource.set(s.source, [...(bySource.get(s.source) ?? []), s.label]);
	}
	return [...bySource].map(([source, labels]) => `${labels.join(", ")} — set in ${source}`);
}
