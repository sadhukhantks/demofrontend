// Types for the Spreader SQC screens (R-08-04 Roll Weight, first tab).
// Mirrors backend /api/juteSQC spreader-roll-weight endpoints. The server
// recomputes and persists every calc_* / band_counts_* value on save and is
// authoritative; the FE only previews the math for live display.
// Dates are 'YYYY-MM-DD' strings; the backend returns floats already.

import { z } from "zod";

// ─── Number of readings captured per roll-weight entry (fixed at 10) ─────────
export const ROLL_WT_READINGS = 10;

// ─── Master option shapes ────────────────────────────────────────────────────

// A spell / shift option (spell_mst ⨝ shift_mst). De-duped by spell_code.
export type SqcSpell = {
	spell_id: number;
	spell_code: string;
	spell_name: string;
};

// A spreader machine (machine_mst, machine_type = Spreader). wt_per_roll is the
// snapshot standard roll weight from spreader_machine_attr (0 when unset).
export type SqcMachine = {
	machine_id: number;
	machine_name: string;
	mech_code: string;
	dept_id?: number | null;
	dept_name?: string | null;
	branch_id?: number | null;
	wt_per_roll?: number | null;
};

// A raw-jute quality (item_mst, parent group item_type_id=2). std_mr_pct is the
// per-quality standard moisture regain % from jute_spreader_quality_attr (the
// backend joins the satellite; null → server falls back to base 16 on save).
export type RawJuteQualityOption = {
	item_id: number;
	item_code: string;
	item_name: string;
	std_mr_pct?: number | null;
};

// ─── R-08-04 Roll Weight ─────────────────────────────────────────────────────

// GET get_spreader_roll_wt_setup -> {"data": {spells, machines, qualities, entries}}.
export type SpreaderRollWtSetup = {
	spells: SqcSpell[];
	machines: SqcMachine[];
	qualities: RawJuteQualityOption[];
	entries: SpreaderRollWtReadingRow[];
};

// Per-band sample counts. The server persists these as a JSON ARRAY of 6 ints
// (one per bucket: <e1 / e1-e2 / e2-e3 / e3-e4 / e4-e5 / >e5), so saved rows
// carry number[] (see SpreaderRollWtReadingRow). The FE bucketer (spreaderCalc)
// builds a label-keyed object of this same shape for the live form preview.
export type BandCounts = Record<string, number>;

// One saved roll-weight entry row (jute_sqc_spreader_roll_wt + label joins).
// roll_weights / mr_pcts arrive as parsed arrays (backend json.loads).
export type SpreaderRollWtReadingRow = {
	spreader_roll_wt_id: number;
	co_id?: number;
	branch_id?: number | null;
	entry_date: string; // 'YYYY-MM-DD'
	spell_id?: number | null;
	spell_code?: string | null;
	spell_name?: string | null;
	mc_id?: number | null;
	machine_id?: number | null;
	machine_name?: string | null;
	mech_code?: string | null;
	item_id?: number | null;
	item_code?: string | null;
	item_name?: string | null;
	feeder_name?: string | null;
	roll_weights: number[];
	mr_pcts: number[];
	std_mr_pct?: number | null;
	calc_avg_mr_pct?: number | null;
	calc_avg_obs?: number | null;
	calc_avg_corr?: number | null;
	calc_stdev_obs?: number | null;
	calc_stdev_corr?: number | null;
	calc_cv_pct?: number | null;
	// Persisted by the server as a JSON array of 6 bucket counts (json.loads'd).
	band_counts_obs?: number[] | null;
	band_counts_corr?: number[] | null;
};

// GET get_spreader_roll_wt_by_date -> {"data": {readings}}.
export type SpreaderRollWtByDateResponse = {
	readings: SpreaderRollWtReadingRow[];
};

// POST create_spreader_roll_wt body (per §5.5). Empty selects → null.
// roll_weights / mr_pcts are sent as exactly-10 numeric arrays. The server
// snapshots std_mr_pct + band edges and recomputes all calc_* values.
export type SpreaderRollWtSavePayload = {
	co_id: number;
	branch_id: number;
	entry_date: string;
	spell_id: number | null;
	mc_id: number | null;
	item_id: number | null;
	feeder_name: string | null;
	roll_weights: number[];
	mr_pcts: number[];
};

// ─── Zod schema for the entry form ───────────────────────────────────────────
// Numeric inputs are held as strings in form state; the schema validates the
// parsed payload that is POSTed. Exactly 10 readings; each weight > 0.

export const spreaderRollWtSchema = z.object({
	co_id: z.number().int().positive("A company must be selected"),
	branch_id: z.number().int().positive("A branch must be selected"),
	entry_date: z.string().min(1, "Entry date is required"),
	spell_id: z.number().int().positive().nullable(),
	mc_id: z.number().int().positive().nullable(),
	item_id: z.number().int().positive().nullable(),
	feeder_name: z.string().nullable(),
	roll_weights: z
		.array(z.number())
		.refine((arr) => arr.length === ROLL_WT_READINGS, `Enter all ${ROLL_WT_READINGS} roll weight readings`)
		.refine((arr) => arr.every((w) => w > 0), "All roll weights must be greater than 0"),
	mr_pcts: z
		.array(z.number())
		.refine((arr) => arr.length === ROLL_WT_READINGS, `Enter all ${ROLL_WT_READINGS} MR% readings`),
});

// Inferred payload type — kept structurally compatible with SpreaderRollWtSavePayload.
export type SpreaderRollWtFormValues = z.infer<typeof spreaderRollWtSchema>;
