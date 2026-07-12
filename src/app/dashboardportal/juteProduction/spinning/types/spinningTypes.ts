// TypeScript response/request shapes for the spinning / doff portal feature.
// Field names/types mirror the backend SPEC (all responses are { data: ... }).

export type SpinningMachineOption = {
	machine_id: number;
	machine_name: string;
	mech_code: string;
	branch_id: number | null;
	// Resolved from jute_prod_spng_target_map (standard bobbin_wt) as-of today by the
	// doff setup endpoint; an as-of-today display hint (create/edit re-resolve per tran_date).
	bobbin_weight: number;
};

export type SpinningSpellOption = {
	spell_code: string;
	spell_name: string;
	spell_id: number;
	working_hours: number;
};

export type SpinningTrollyOption = {
	trolly_id: number;
	trolly_name: string;
	trolly_weight: number;
	bucket_weight: number;
};

export type YarnItemOption = {
	item_id: number;
	item_code: string;
	item_name: string;
	std_count: number | null;
	std_mr_pct: number | null;
};

export type SpinningSetup = {
	machines: SpinningMachineOption[];
	spells: SpinningSpellOption[];
	trollies: SpinningTrollyOption[];
	yarn_items: YarnItemOption[];
};

export type DoffPrevState = {
	running_total_net: number;
	next_doff_no: number;
	tare: number;
};

export type DoffEntryRow = {
	daily_doff_tbl_id: number;
	doff_date: string;
	spell_id: number;
	spell_code: string;
	mc_id: number;
	mech_code: string | null;
	machine_name: string | null;
	trolly_id: number;
	trolly_name: string | null;
	item_id: number | null;
	item_code: string | null;
	gross_weight: number;
	tare_weight: number;
	net_weight: number;
};

export type FrameMapRow = {
	machine_id: number;
	mech_code: string | null;
	machine_name: string | null;
	// Today's SAVED mapping (null = nothing saved yet for this machine).
	item_id: number | null;
	item_code: string | null;
	item_name: string | null;
	// Prior date's mapping, surfaced as an unsaved-draft suggestion for prefill.
	prev_item_id: number | null;
	prev_item_name: string | null;
	prev_date: string | null;
};

// --- Planning Grid (SPINNING_PLANNING_GRID) ---
// One row per frame (machine) per spell. All numeric columns are computed
// server-side and rendered read-only; the client only previews/saves them.
export type PlanningGridRow = {
	tran_date: string;
	spell_id: number;
	spell_code: string | null;
	machine_id: number;
	mech_code: string | null;
	item_id: number;
	item_code: string | null;
	spindles: number;
	minutes: number;
	act_count: number;
	std_count: number;
	std_speed: number;
	actual_speed: number;
	target_speed: number;
	std_tpi: number;
	actual_tpi: number;
	target_tpi: number;
	std_eff: number;
	target_eff: number;
	p100prod: number;
	std_prod: number;
	target_prod: number;
	act_prod_doff: number;
	winding_total: number;
	act_prod_wind: number;
	eff_doff: number;
	eff_winding: number;
};

// Per machine+quality+shift rollup returned alongside the planning grid rows.
export type ShiftRollupRow = {
	machine_id: number;
	item_id: number;
	shift: string;
	prod_doff: number;
	prod_wind: number;
	doff_eff: number;
	wind_eff: number;
};

export type PlanningGridData = {
	rows: PlanningGridRow[];
	shift_rollup: ShiftRollupRow[];
	// Additive lock flags carried by the planning_grid response after Process.
	locked?: boolean;
	reprocess_needed?: boolean;
};

export type TrollyRow = {
	trolly_id: number;
	trolly_name: string;
	trolly_weight: number;
	bucket_weight: number;
	trolly_posting_code: string | null;
	branch_id: number | null;
};

