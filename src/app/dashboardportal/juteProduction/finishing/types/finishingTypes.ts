// TypeScript response/request shapes for the Finishing Production Entry feature.
// Field names/types mirror the backend contract EXACTLY
// (../vowerp3be/src/juteProduction/finishing_entry.py). All responses are
// { data: ... }. One type file per feature to avoid circular dependencies.

// The six finishing sub-processes. LOCKED CONTRACT — these tokens key the
// `process` column and the spec-sheet param matrix (constants.FINISHING_PROCESSES).
export const FINISHING_PROCESSES = [
	"damping",
	"calendering",
	"lapping",
	"cutting",
	"hemming",
	"balepress",
] as const;

export type FinishingProcess = (typeof FINISHING_PROCESSES)[number];

// finishing_quality.quality_type — hessian qualities = 1, sacking qualities = 2.
export const FINISHING_QUALITY_TYPE_HESSIAN = 1;
export const FINISHING_QUALITY_TYPE_SACKING = 2;

// Cloth processes finish hessian cloth; bag processes convert cloth into bags.
export const FINISHING_CLOTH_PROCESSES: readonly FinishingProcess[] = [
	"damping",
	"calendering",
	"lapping",
];

// --- Setup lookups (GET /finishingProd/entry_setup) ------------------------

export type FinishingMachineOption = {
	machine_id: number;
	mech_code: string;
	machine_name: string;
};

export type FinishingQualityOption = {
	finishing_quality_id: number;
	fin_quality_code: string;
	fin_quality_name: string;
	// 1 = Hessian, 2 = Sacking.
	quality_type: number;
};

export type FinishingSpellOption = {
	spell_id: number;
	spell_code: string;
	spell_name: string | null;
	working_hours: number;
};

export type FinishingEbOption = {
	eb_id: number;
	emp_code: string;
	eb_name: string;
};

// One captured process-specific param (EAV).
export type FinishingParam = {
	param: string;
	value: number | null;
};

// GET /finishingProd/entry_setup -> { data: FinishingSetup }
export type FinishingSetup = {
	process: string;
	machines: FinishingMachineOption[];
	qualities: FinishingQualityOption[];
	spells: FinishingSpellOption[];
	eb_list: FinishingEbOption[];
	// Applicable captured-param tokens for this process (drives dynamic inputs).
	param_tokens: string[];
	// Day's existing rows when tran_date was supplied to entry_setup.
	entries: FinishingEntryRow[];
};

// --- Day-grid entry row (GET /finishingProd/entry_by_date) -----------------
// All header columns plus resolved labels + computed snapshot + nested params.
export type FinishingEntryRow = {
	finishing_daily_id: number;
	co_id: number;
	branch_id: number | null;
	tran_date: string;
	spell_id: number;
	spell_code: string | null;
	process: string;
	machine_id: number;
	mech_code: string | null;
	machine_name: string | null;
	finishing_quality_id: number;
	fin_quality_code: string | null;
	fin_quality_name: string | null;
	quality_type: number | null;
	eb_id: number | null;
	input_qty: number | null;
	input_uom: string | null;
	prod_qty: number | null;
	prod_uom: string | null;
	prod_wt_kg: number | null;
	wastage_kg: number | null;
	// Server-resolved standards snapshot (read-only).
	std_speed: number | null;
	target_speed: number | null;
	act_speed: number | null;
	std_eff: number | null;
	target_eff: number | null;
	working_hours: number | null;
	// Server-computed outputs (F1–F3, read-only).
	p100prod: number | null;
	std_prod: number | null;
	target_prod: number | null;
	act_eff: number | null;
	// Nested captured params.
	params: FinishingParam[];
};

// --- Save body (POST /finishingProd/entry_save) ----------------------------
export type FinishingEntrySaveBody = {
	co_id: number;
	branch_id: number | null;
	tran_date: string;
	spell_id: number;
	process: string;
	machine_id: number;
	finishing_quality_id: number;
	eb_id: number | null;
	input_qty: number | null;
	input_uom: string | null;
	prod_qty: number;
	prod_uom: string;
	wastage_kg: number | null;
	params: FinishingParam[];
};

// Computed snapshot returned by entry_save.
export type FinishingSaveComputed = {
	p100prod: number;
	std_prod: number;
	target_prod: number;
	act_eff: number;
	prod_wt_kg: number | null;
};

export type FinishingSaveStandards = {
	std_speed: number;
	target_speed: number;
	act_speed: number;
	std_eff: number;
	target_eff: number;
	working_hours: number;
};

export type FinishingSaveResult = {
	finishing_daily_id: number;
	computed: FinishingSaveComputed;
	standards: FinishingSaveStandards;
};
