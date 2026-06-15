// Types for the Spinning SQC screens (Speed/TPI Entry + Count Observations).
// Mirrors backend /api/juteSQC SQC endpoints. Backend returns floats already;
// dates are 'YYYY-MM-DD' strings.

export type SqcMachine = {
	machine_id: number;
	machine_name: string;
	mech_code: string;
	branch_id?: number | null;
};

export type SqcQuality = {
	yarn_quality_id: number;
	quality_code: string;
	quality_name: string;
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
	yarn_quality_id: number;
	quality_code?: string;
	quality_name?: string;
	actual_speed: number | null;
	actual_tpi: number | null;
};

export type SqcEntrySetup = {
	machines: SqcMachine[];
	qualities: SqcQuality[];
	entries: SqcEntryRow[];
};

// One row in the SPINNING_SQC_ENTRY_SAVE payload.
export type SqcEntrySavePayloadRow = {
	mc_id: number;
	yarn_quality_id: number;
	actual_speed?: number | null;
	actual_tpi?: number | null;
};

// ─── Count Observations (Tab 2) ─────────────────────────────────────────────

export type SqcCountSetup = {
	machines: SqcMachine[];
	qualities: SqcQuality[];
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
	yarn_quality_id: number;
	quality_code?: string | null;
	quality_name?: string | null;
	observed_count: number;
};

export type SqcCountAverageRow = {
	yarn_quality_id: number;
	quality_code?: string | null;
	quality_name?: string | null;
	avg_count: number;
};

export type SqcCountByDateResponse = {
	readings: SqcCountReadingRow[];
	averages: SqcCountAverageRow[];
};

// One row in the SPINNING_SQC_COUNT_SAVE payload.
export type SqcCountSavePayloadRow = {
	spell_id?: number | null;
	mc_id?: number | null;
	yarn_quality_id: number;
	observed_count: number;
};
