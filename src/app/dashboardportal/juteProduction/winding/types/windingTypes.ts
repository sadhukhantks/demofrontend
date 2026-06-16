// TypeScript response/request shapes for the Winding production portal feature.
// Field names/types mirror the backend (src/juteProduction/winding_entry.py +
// winding_query.py). All responses are double-unwrapped: { data: ... }.

export type WindingMachineOption = {
	machine_id: number;
	machine_name: string;
	mech_code: string;
	branch_id: number | null;
};

export type WindingSpellOption = {
	spell_code: string;
	spell_name: string;
	spell_id: number;
	working_hours: number;
};

// Trolly (type 'T') and Spool (type 'S') share this shape — busket_weight is
// aliased to bucket_weight by the backend (production typo kept on the table).
export type WindingTrollyOption = {
	trolly_id: number;
	trolly_name: string;
	trolly_weight: number;
	bucket_weight: number;
};

// A yarn item (item_mst, item_type_id=4) — the single yarn identity.
export type YarnItemOption = {
	item_id: number;
	item_code: string;
	item_name: string | null;
};

// Response of WINDING_DOFF_SETUP (data.{...}).
export type WindingDoffSetup = {
	machines: WindingMachineOption[];
	yarn_items: YarnItemOption[];
	trollies: WindingTrollyOption[];
	spools: WindingTrollyOption[];
	spells: WindingSpellOption[];
};

// Response of WINDING_JUGAR_SETUP.
export type WindingJugarSetup = {
	machines: WindingMachineOption[];
	spells: WindingSpellOption[];
};

// Response of WINDING_DOFF_PREV_STATE (data may be null).
export type WindingDoffPrevState = {
	winding_doff_id: number;
	machine_id: number;
	item_id: number | null;
	trolly_id: number | null;
	trolly_wt: number;
	spool_id: number | null;
	spool_wt: number;
	no_of_machines: number | null;
	gross_input_wt: number;
	production_qty: number;
	tran_date?: string;
};

// One row from WINDING_DOFF_BY_DATE (one machine of a combined doff).
export type WindingDoffRow = {
	winding_doff_id: number;
	co_id: number;
	branch_id: number | null;
	tran_date: string;
	spell_id: number;
	spell_code: string | null;
	machine_id: number;
	mech_code: string | null;
	machine_name: string | null;
	item_id: number | null;
	item_code: string | null;
	trolly_id: number;
	trolly_name: string | null;
	trolly_wt: number;
	spool_id: number;
	spool_name: string | null;
	spool_wt: number;
	no_of_machines: number | null;
	gross_input_wt: number;
	production_qty: number;
	row_gross_wt: number;
	operator_id: number | null;
};

// Response of WINDING_JUGAR_PREV_STATE.
export type WindingJugarPrevState = {
	weight: number;
	winding_jugar_id: number | null;
	open_close: "O" | "C";
};

// One row from WINDING_JUGAR_BY_DATE.
export type WindingJugarRow = {
	winding_jugar_id: number;
	co_id: number;
	branch_id: number | null;
	tran_date: string;
	spell_id: number;
	spell_code: string | null;
	machine_id: number;
	mech_code: string | null;
	machine_name: string | null;
	weight: number;
	open_close: "O" | "C";
};

// One row from WINDING_QUALITY_SETUP / WINDING_QUALITY_BY_DATE.
export type WindingQualityRow = {
	winding_daily_qlty_id: number;
	co_id: number;
	branch_id: number | null;
	tran_date: string;
	spell_id: number;
	spell_code: string | null;
	machine_id: number;
	mech_code: string | null;
	machine_name: string | null;
	item_id: number | null;
	item_code: string | null;
	no_of_spindle: number;
};

// Response of WINDING_QUALITY_SETUP (data.{...}).
export type WindingQualitySetup = {
	machines: WindingQualityRow[];
	yarn_items: YarnItemOption[];
};
