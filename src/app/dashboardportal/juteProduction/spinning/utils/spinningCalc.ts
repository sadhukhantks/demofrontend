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

// Planning-grid 100%-efficiency production preview for one frame/spell row.
// Mirrors the backend planning_grid p100prod term:
//   (std_speed * minutes * act_count * spindles) / (36 * 14400 * 2.2046 * std_tpi)
// rounded to 0 decimals. Returns 0 when std_tpi/spindles/act_count are zero
// (avoids div-by-zero). DISPLAY-ONLY preview — the server is authoritative.
export function p100ProdSpell(
	stdSpeed: number,
	minutes: number,
	actCount: number,
	spindles: number,
	stdTpi: number,
): number {
	if (!stdTpi || !spindles || !actCount) return 0;
	return Math.round(
		(Number(stdSpeed) * Number(minutes) * Number(actCount) * Number(spindles)) /
			(36 * 14400 * 2.2046 * Number(stdTpi)),
	);
}

export function todayISO(): string {
	const d = new Date();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${d.getFullYear()}-${m}-${day}`;
}
