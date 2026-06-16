// Types for the Spinning SQC screens (Speed/TPI Entry + Count Observations).
// Mirrors backend /api/juteSQC SQC endpoints. Backend returns floats already;
// dates are 'YYYY-MM-DD' strings.

export type SqcMachine = {
	machine_id: number;
	machine_name: string;
	mech_code: string;
	branch_id?: number | null;
};

// A yarn item (item_mst, item_type_id=4) — the single yarn identity.
export type YarnItemOption = {
	item_id: number;
	item_code: string;
	item_name: string;
	// Standard count (jute_yarn_mst.jute_yarn_count).
	std_count?: number | null;
	// Standard moisture regain % (jute_yarn_mst.std_mr_pct) — feeds corrected count.
	std_mr_pct?: number | null;
};

export type SqcSpell = {
	spell_id: number;
	spell_code: string;
	spell_name: string;
};

// ─── Speed / TPI Entry (Tab 1) ──────────────────────────────────────────────

export type SqcEntryRow = {
	// Identity / display fields returned by SPINNING_SQC_ENTRY_BY_DATE.
	// The backend may key rows differently; we tolerate optional id fields and
	// fall back to a composite key in the grid.
	jute_sqc_spinning_entry_id?: number;
	entry_date: string;
	mc_id: number;
	machine_id?: number;
	machine_name?: string;
	mech_code?: string;
	item_id: number;
	item_code?: string;
	item_name?: string;
	actual_speed: number | null;
	actual_tpi: number | null;
};

export type SqcEntrySetup = {
	machines: SqcMachine[];
	yarn_items: YarnItemOption[];
	entries: SqcEntryRow[];
};

// One row in the SPINNING_SQC_ENTRY_SAVE payload.
export type SqcEntrySavePayloadRow = {
	mc_id: number;
	item_id: number;
	actual_speed?: number | null;
	actual_tpi?: number | null;
};

// ─── Count Observations (Tab 2) ─────────────────────────────────────────────

export type SqcCountSetup = {
	machines: SqcMachine[];
	yarn_items: YarnItemOption[];
	spells: SqcSpell[];
	entries: SqcCountReadingRow[];
};

export type SqcCountReadingRow = {
	// Each row is a single observation/reading (multi-observation, not upsert).
	jute_sqc_spinning_count_id?: number;
	sqc_spinning_count_id?: number;
	id?: number;
	entry_date: string;
	spell_id?: number | null;
	spell_code?: string | null;
	spell_name?: string | null;
	mc_id?: number | null;
	machine_id?: number | null;
	machine_name?: string | null;
	mech_code?: string | null;
	item_id: number;
	item_code?: string | null;
	item_name?: string | null;
	std_mr_pct?: number | null;
	// R-08-16 raw inputs (DP/TP store-only; WT/450 + MR% feed the count calc).
	dp?: number | null;
	tp?: number | null;
	wt_450_gms?: number | null;
	mr_pct?: number | null;
	observed_count: number;
	corrected_count?: number | null;
};

export type SqcCountAverageRow = {
	item_id: number;
	item_code?: string | null;
	item_name?: string | null;
	avg_count: number;
	avg_corrected?: number | null;
};

export type SqcCountByDateResponse = {
	readings: SqcCountReadingRow[];
	averages: SqcCountAverageRow[];
};

// One row in the SPINNING_SQC_COUNT_SAVE payload.
// observed_count / corrected_count are sent as a preview; the server recomputes them.
export type SqcCountSavePayloadRow = {
	spell_id?: number | null;
	mc_id?: number | null;
	item_id: number;
	dp?: number | null;
	tp?: number | null;
	wt_450_gms?: number | null;
	mr_pct?: number | null;
	observed_count?: number | null;
	corrected_count?: number | null;
};

// ─── RHMR — Temperature / Humidity per date + spell (Tab 3) ──────────────────

export type SqcRhmrRow = {
	spinning_sqc_rhmr_id?: number;
	co_id?: number;
	branch_id?: number | null;
	entry_date: string; // 'YYYY-MM-DD'
	spell_id: number;
	spell_code?: string | null;
	spell_name?: string | null;
	temperature: number | null;
	humidity: number | null;
};

export type SqcRhmrSetup = {
	spells: SqcSpell[];
};

// POST SPINNING_SQC_RHMR_SAVE body. confirm=true overwrites an existing
// (date, spell) row; the first save without confirm returns SqcRhmrSaveResult.exists.
export type SqcRhmrSavePayload = {
	co_id: number;
	branch_id: number;
	entry_date: string;
	spell_id: number;
	temperature: number | null;
	humidity: number | null;
	confirm?: boolean;
};

export type SqcRhmrSaveResult = {
	saved?: number;
	mode?: "insert" | "update";
	exists?: boolean;
	existing?: {
		spinning_sqc_rhmr_id: number;
		temperature: number | null;
		humidity: number | null;
	};
};
