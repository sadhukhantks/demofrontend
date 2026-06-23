// Per-process display config for the Finishing Production pages.
// Drives the friendly titles, the input/prod UoM defaults sent to the backend,
// and the human labels for the dynamically-rendered captured params.
//
// UoM defaults match the backend contract (finishing_entry.py):
//   damping     m   -> m
//   calendering m   -> m   (+ prod_wt_kg auto from BE for cloth processes)
//   lapping     m   -> roll
//   cutting     m   -> pcs
//   hemming     pcs -> bag
//   balepress   bag -> bale

import type { FinishingProcess } from "../types/finishingTypes";

export type FinishingProcessConfig = {
	process: FinishingProcess;
	title: string;
	subtitle: string;
	inputUom: string;
	prodUom: string;
};

export const FINISHING_PROCESS_CONFIG: Record<FinishingProcess, FinishingProcessConfig> = {
	damping: {
		process: "damping",
		title: "Damping Production",
		subtitle: "Moisten grey cloth before calendering — metres in, metres out.",
		inputUom: "m",
		prodUom: "m",
	},
	calendering: {
		process: "calendering",
		title: "Calendering Production",
		subtitle: "Finish hessian cloth (metres); output weight auto-computed.",
		inputUom: "m",
		prodUom: "m",
	},
	lapping: {
		process: "lapping",
		title: "Lapping Production",
		subtitle: "Wind finished cloth into rolls — metres in, rolls out.",
		inputUom: "m",
		prodUom: "roll",
	},
	cutting: {
		process: "cutting",
		title: "Cutting Production",
		subtitle: "Cut calendered cloth into bag pieces — metres in, pieces out.",
		inputUom: "m",
		prodUom: "pcs",
	},
	hemming: {
		process: "hemming",
		title: "Hemming Production",
		subtitle: "Stitch pieces into finished bags — pieces in, bags out.",
		inputUom: "pcs",
		prodUom: "bag",
	},
	balepress: {
		process: "balepress",
		title: "Bale Press Production",
		subtitle: "Press finished bags into bales — bags in, bales out.",
		inputUom: "bag",
		prodUom: "bale",
	},
};

// Human labels for all 20 finishing params across every process/role
// (BE contract §5.1 / constants.FINISHING_PARAMS). The form renders only the
// applicable subset returned in entry_setup.param_tokens; unknown tokens fall
// back to the raw token, so this stays robust if the matrix gains a param.
export const PARAM_LABELS: Record<string, string> = {
	speed: "Speed",
	spray_rate: "Spray Rate (l/min)",
	moisture_add_pct: "Moisture Add %",
	emulsion_pct: "Emulsion %",
	bowl_temp: "Bowl Temp (°C)",
	nip_pressure: "Nip Pressure (kg/cm²)",
	no_of_bowls: "No. of Bowls",
	finished_width: "Finished Width (in)",
	oz_per_yd: "Oz / Yd",
	eff: "Efficiency %",
	lap_length: "Lap Length (m)",
	roll_width: "Roll Width (in)",
	cut_length: "Cut Length (in)",
	pieces_per_100m: "Pieces / 100m",
	stitches_per_in: "Stitches / in",
	hem_allowance: "Hem Allowance (in)",
	press_pressure: "Press Pressure (t)",
	cycle_time: "Cycle Time (s)",
	bags_per_bale: "Bags / Bale",
	bale_weight: "Bale Weight (kg)",
};

export function paramLabel(token: string): string {
	return PARAM_LABELS[token] ?? token;
}

// Local ISO-date helper (YYYY-MM-DD) — avoids the UTC shift of toISOString().
export function todayISO(): string {
	const d = new Date();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${d.getFullYear()}-${m}-${day}`;
}
