// TypeScript response/request shapes for the spinning / doff portal feature.
// Field names/types mirror the backend SPEC (all responses are { data: ... }).

export type SpinningMachineOption = {
	machine_id: number;
	machine_name: string;
	mech_code: string;
	branch_id: number | null;
	bobbin_weight: number;
	no_of_spindle: number;
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

export type SpinningQualityOption = {
	yarn_quality_id: number;
	quality_code: string;
	quality_name: string;
};

export type SpinningSetup = {
	machines: SpinningMachineOption[];
	spells: SpinningSpellOption[];
	trollies: SpinningTrollyOption[];
	qualities: SpinningQualityOption[];
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
	yarn_quality_id: number | null;
	quality_code: string | null;
	gross_weight: number;
	tare_weight: number;
	net_weight: number;
};

export type FrameMapRow = {
	machine_id: number;
	mech_code: string | null;
	machine_name: string | null;
	yarn_quality_id: number | null;
	param_id: number | null;
	quality_code: string | null;
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
	yarn_quality_id: number;
	quality_code: string | null;
	param_id: number;
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
	yarn_quality_id: number;
	shift: string;
	prod_doff: number;
	prod_wind: number;
	doff_eff: number;
	wind_eff: number;
};

export type PlanningGridData = {
	rows: PlanningGridRow[];
	shift_rollup: ShiftRollupRow[];
};

export type SpinningMachineAttrRow = {
	spinning_machine_attr_id: number | null;
	machine_id: number;
	mech_code: string | null;
	machine_name: string | null;
	dept_name: string | null;
	branch_id: number | null;
	bobbin_weight: number;
	speed: number;
	no_of_spindle: number;
	frame_type: string | null;
	active: number;
};

export type TrollyRow = {
	trolly_id: number;
	trolly_name: string;
	trolly_weight: number;
	bucket_weight: number;
	trolly_posting_code: string | null;
	branch_id: number | null;
};

export type YarnQualityParamRow = {
	param_id: number;
	yarn_quality_id: number;
	set_name: string | null;
	speed: number;
	tpi: number;
	std_count: number;
	spindle: number;
	frame_type: string | null;
	jbo_rbo: string | null;
	subgroup_type: string | null;
	target_eff: number;
	active: number;
};
