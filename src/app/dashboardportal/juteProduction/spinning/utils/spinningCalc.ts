// Client-side preview mirrors src/juteProduction/services/spinning_rules.py exactly.
// The server recomputes all values on save and is authoritative.
//
// Unit caution: the production constants baked into p100X (14400, 2.2046, 36)
// encode legacy unit conversions (count system, lb<->kg, inches<->yards). Do NOT
// "simplify" them — they reproduce the exact mill audit spreadsheet.

function round2(x: number): number {
	return Math.round(x * 100) / 100;
}

function round3(x: number): number {
	return Math.round(x * 1000) / 1000;
}

// Doff tare = trolly + busket (sic) + bobbin weights.
export function computeTare(trollyWeight: number, busketWeight: number, bobbinWeight: number): number {
	return round3(Number(trollyWeight) + Number(busketWeight) + Number(bobbinWeight));
}

// Net doff weight = gross - tare.
export function computeNet(gross: number, tare: number): number {
	return round3(Number(gross) - Number(tare));
}

// 100%-efficiency production (kg) for one shift bucket.
// Returns 0 when framesX or tpi is zero/falsy (avoids div-by-zero).
export function p100X(
	speed: number,
	hrsX: number,
	actCount: number,
	spindle: number,
	framesX: number,
	tpi: number,
): number {
	if (!framesX || !tpi) return 0;
	return round2((speed * hrsX * 60 * actCount * spindle * framesX) / (tpi * 14400 * 2.2046 * 36));
}

export type SpinningDailyInput = {
	speed: number;
	tpi: number;
	spindle: number;
	act_count: number;
	tar_eff: number;
	frames_a: number;
	frames_b: number;
	frames_c: number;
	prod_a: number;
	prod_b: number;
	prod_c: number;
	hrs_a: number;
	hrs_b: number;
	hrs_c: number;
	winders: number;
};

export type SpinningDailyComputed = {
	p100a: number;
	p100b: number;
	p100c: number;
	tar_prd: number;
	hunprod: number;
	act_eff: number;
	eff_a: number;
	eff_b: number;
	eff_c: number;
	totmc: number;
	totprd: number;
	prd_frm: number;
	prd_wnd: number;
};

// Roll up the per-shift spinning daily snapshot and efficiency outputs.
export function computeSpinningDaily({
	speed,
	tpi,
	spindle,
	act_count,
	tar_eff,
	frames_a,
	frames_b,
	frames_c,
	prod_a,
	prod_b,
	prod_c,
	hrs_a,
	hrs_b,
	hrs_c,
	winders,
}: SpinningDailyInput): SpinningDailyComputed {
	const p100a = p100X(speed, hrs_a, act_count, spindle, frames_a, tpi);
	const p100b = p100X(speed, hrs_b, act_count, spindle, frames_b, tpi);
	const p100c = p100X(speed, hrs_c, act_count, spindle, frames_c, tpi);
	const p100 = round2(p100a + p100b + p100c);
	const totprd = prod_a + prod_b + prod_c;
	const totmc = frames_a + frames_b + frames_c;
	return {
		p100a,
		p100b,
		p100c,
		tar_prd: p100,
		hunprod: Math.round((p100 * tar_eff) / 10000) * 100,
		act_eff: p100 ? round2((totprd / p100) * 100) : 0,
		eff_a: p100a ? round2((prod_a / p100a) * 100) : 0,
		eff_b: p100b ? round2((prod_b / p100b) * 100) : 0,
		eff_c: p100c ? round2((prod_c / p100c) * 100) : 0,
		totmc,
		totprd,
		prd_frm: totmc ? Math.round(totprd / totmc) : 0,
		prd_wnd: winders ? Math.round(totprd / winders) : 0,
	};
}

export function todayISO(): string {
	const d = new Date();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${d.getFullYear()}-${m}-${day}`;
}
