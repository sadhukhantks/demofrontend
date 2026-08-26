// Per-process display config for the Finishing Production pages.
// Drives the friendly titles, the input/prod UoM defaults sent to the backend,
// and the human labels for the captured params (qid standards/targets only).
//
// UoM defaults match the backend contract (finishing_entry.py):
//   damping     m    -> m
//   calendering m    -> m
//   lapping     m    -> roll
//   rolling     roll -> roll
//   cutting     m    -> pcs
//   hemming     pcs  -> bag
//   herackle    m    -> pcs
//   sacksewing  pcs  -> bag
//   balepress   bag  -> bale

import type {
	FinishingProcess,
	FinishingSyncEbMachine,
	FinishingSyncEbResult,
} from "../types/finishingTypes";

export type FinishingProcessConfig = {
	process: FinishingProcess;
	title: string;
	subtitle: string;
	inputUom: string;
	prodUom: string;
	// Labour-based process: keyed by a worker (emp_code -> eb_id), NOT a machine.
	usesEmployee?: boolean;
	// Machine AND/OR worker: both inputs shown, at least one required (hemming/herackle).
	// Enables the "Sync EB from Attendance" button on the header row.
	allowsEmployee?: boolean;
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
		subtitle: "Finish hessian cloth (metres).",
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
	rolling: {
		process: "rolling",
		title: "Rolling Production",
		subtitle: "Roll finished hessian cloth.",
		inputUom: "roll",
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
		subtitle: "Stitch pieces into finished bags — machine and/or worker (EB no).",
		inputUom: "pcs",
		prodUom: "bag",
		allowsEmployee: true,
	},
	herackle: {
		process: "herackle",
		title: "Herackle Production",
		subtitle: "Herackle sacking cloth into pieces — machine and/or worker (EB no).",
		inputUom: "m",
		prodUom: "pcs",
		allowsEmployee: true,
	},
	sacksewing: {
		process: "sacksewing",
		title: "Sack Sewing Production",
		subtitle: "Sew pieces into finished bags — entered per worker (emp code), no machine.",
		inputUom: "pcs",
		prodUom: "bag",
		usesEmployee: true,
	},
	balepress: {
		process: "balepress",
		title: "Bale Press Production",
		subtitle: "Press finished bags into bales — bags in, bales out.",
		inputUom: "bag",
		prodUom: "bale",
	},
};

// Human labels for the captured qid params (standard/target roles only;
// BE contract constants.FINISHING_PARAMS). Unknown tokens fall back to the
// raw token, so this stays robust if the matrix gains a param.
export const PARAM_LABELS: Record<string, string> = {
	std_prod_yds: "Std Production (yds)",
	target_pcs: "Target Pcs",
	pcs_per_bundle: "Pcs / Bundle",
	bundles: "No. of Bundles",
	no_of_bales: "No. of Bales",
};

export function paramLabel(token: string): string {
	return PARAM_LABELS[token] ?? token;
}

// --- entry_sync_eb result rendering ----------------------------------------
// Bucket rows are machine rows; fall back to #id when the label didn't resolve.
export function machineLabel(m: FinishingSyncEbMachine): string {
	return m?.mech_code ?? (m?.machine_id != null ? `#${m.machine_id}` : "?");
}

// "Stamped 4. No worker: M-1, M-2. Ambiguous: M-3 (pick EB via edit)." — empty
// buckets are omitted entirely.
export function syncSummary(r: FinishingSyncEbResult): string {
	const parts = [`Stamped ${r.stamped}.`];
	const bucket = (label: string, rows: FinishingSyncEbMachine[] | undefined, suffix = "") => {
		if (rows && rows.length)
			parts.push(`${label}: ${rows.map(machineLabel).join(", ")}${suffix}.`);
	};
	bucket("No worker", r.no_worker);
	bucket("Ambiguous", r.ambiguous, " (pick EB via edit)");
	bucket("Collisions", r.collisions);
	return parts.join(" ");
}

// Local ISO-date helper (YYYY-MM-DD) — avoids the UTC shift of toISOString().
export function todayISO(): string {
	const d = new Date();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${d.getFullYear()}-${m}-${day}`;
}
