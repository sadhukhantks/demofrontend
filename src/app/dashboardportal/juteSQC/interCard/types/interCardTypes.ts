// Types for the Inter Card & Tow Breaker SQC screen (R-08-07A Card Sliver Weight
// — carding stage). Mirrors the backend /api/juteSQC card-sliver-wt endpoints.
// This is a MULTI-ROW report: one date sheet holds many (section, machine, spell,
// quality) reading sets, each with exactly 4 cut weights + 4 MR%. The server
// recomputes and persists every calc_* value on save and is AUTHORITATIVE; the FE
// only previews the math for live display. Per-section AVERAGES and a per-quality
// GRAND-AVERAGE block are recomputed by the server at read time (NOT stored) and
// returned alongside the rows.
//
// STRUCTURAL DELTA vs the Breaker Card clone: every row carries a SECTION
// (INTER_CARD / TOW_BREAKER / HOPPER) — there is NO card_side anywhere — and the
// quality linkage is a YARN GROUP (item_grp_mst, item_type 4), not a single line quality. A yarn group
// has no single std, so std MR always falls back to 20 and the CV band is
// unevaluated (cv_within_band null).
// Std MR% now comes from the Std Moisture Master (juteSQC/stdMoisture) per
// (co_id, yarn group, process); the value below is only the fallback used
// while the master has no entry — in that case the backend rejects the save.
//
// Dates are 'YYYY-MM-DD' strings; the backend returns floats already.

import { z } from "zod";

// ─── Number of cut readings captured per card-sliver row (fixed at 4) ────────
export const CARD_SLIVER_READINGS = 4;

// ─── The three carding sub-sections ──────────────────────────────────────────
export const CARD_SECTIONS = ["INTER_CARD", "TOW_BREAKER", "HOPPER"] as const;
export type CardSection = (typeof CARD_SECTIONS)[number];
export const DEFAULT_CARD_SECTION: CardSection = "INTER_CARD";

// ─── Master option shapes ────────────────────────────────────────────────────

// A spell / shift option (spell_mst ⨝ shift_mst). De-duped by spell_code.
export type SqcSpell = {
	spell_id: number;
	spell_code: string;
	spell_name: string;
};

// A carding machine (machine_mst ⨝ machine_type_mst, joined to dept_mst for the
// branch). Same shape as the breaker machine option plus machine_type_name.
export type InterCardMachine = {
	machine_id: number;
	machine_name: string;
	mech_code: string;
	machine_type_name?: string | null;
	dept_id?: number | null;
	dept_name?: string | null;
	branch_id?: number | null;
};

// A jute-yarn item group (item_grp_mst, item_type_id 4).
// item_grp_name is the display label. A yarn group has no single std, so the
// preview always uses std 20 and no CV band.
export type YarnGroupOption = {
	item_grp_id: number;
	item_grp_name: string;
	branch_id?: number | null;
};

// ─── Setup payload ───────────────────────────────────────────────────────────

// GET get_card_sliver_wt_setup -> {"data": {sections, machines, spells, groups, entries}}.
export type InterCardSetup = {
	sections: CardSection[];
	machines: InterCardMachine[];
	spells: SqcSpell[];
	groups: YarnGroupOption[];
	// Std MR% resolved from the Std Moisture Master for THIS page's process, keyed by
	// item_grp_id AS A STRING. A group missing from the map has no standard set, and
	// saving readings for it is rejected by the backend (400). Optional so the page
	// still renders against a backend that predates the master.
	std_mr_by_group?: Record<string, number>;
	entries: InterCardReadingRow[];
};

// ─── Saved reading row ───────────────────────────────────────────────────────

// One saved card-sliver reading set (jute_sqc_card_sliver_wt + label joins).
// weights / mr_pcts arrive as parsed arrays (backend json.loads) of length 4.
export type InterCardReadingRow = {
	card_sliver_wt_id: number;
	co_id?: number;
	branch_id?: number | null;
	entry_date: string; // 'YYYY-MM-DD'
	section: CardSection;
	mc_id?: number | null;
	machine_id?: number | null;
	machine_name?: string | null;
	mech_code?: string | null;
	spell_id?: number | null;
	spell_code?: string | null;
	spell_name?: string | null;
	item_grp_id?: number | null;
	item_grp_name?: string | null;
	// Legacy line-quality fields — still present on old rows, not used.
	item_id?: number | null;
	jute_quality?: string | null;
	item_code?: string | null;
	item_name?: string | null;
	weights: number[];
	mr_pcts: number[];
	std_mr_pct?: number | null;
	std_cv_low?: number | null;
	std_cv_high?: number | null;
	calc_wt?: number | null; // row avg observed
	calc_mr_pct?: number | null; // row avg MR%
	calc_corr_wt?: number | null; // corrected sliver weight
	calc_sdev?: number | null; // sample (n-1) stdev of corrected cuts
	calc_cv_pct?: number | null; // ratio (render ×100 for a percentage)
	cv_within_band?: number | null; // 1 pass / 0 fail / null when no band seeded
};

// ─── Per-section AVERAGE block ───────────────────────────────────────────────
// Recomputed at read by the server across that date's rows for the section.
export type SectionAverage = {
	section: CardSection;
	row_count?: number | null;
	avg_obs?: number | null;
	avg_mr_pct?: number | null;
	avg_corr_wt?: number | null;
	avg_sdev?: number | null;
	avg_cv_pct?: number | null; // ratio (render ×100)
};

// ─── per-group GRAND-AVERAGE block ───────────────────────────────────────────
// Recomputed at read by the server across that date's rows for the yarn group:
//   OBS  = mean(calc_wt), MR%  = mean(calc_mr_pct), CORR = mean(calc_corr_wt),
//   CV%  = stdev(pooled corrected cuts) / mean(pooled corrected cuts) (ratio).
export type InterCardGrandAverage = {
	item_grp_id?: number | null;
	item_grp_name?: string | null;
	row_count?: number | null;
	grand_obs?: number | null;
	grand_mr_pct?: number | null;
	grand_corr_wt?: number | null;
	grand_cv_pct?: number | null; // ratio (render ×100)
	std_cv_high?: number | null;
	cv_within_band?: number | null; // 1 pass / 0 fail / null when no band seeded
};

// GET get_card_sliver_wt_by_date -> {"data": {rows, section_averages, grand_averages}}.
// OBJECT envelope (per R-08-04/03 review lessons): never a bare list.
export type InterCardByDateResponse = {
	rows: InterCardReadingRow[];
	section_averages: SectionAverage[];
	grand_averages: InterCardGrandAverage[];
};

// ─── Save payload (multi-row) ────────────────────────────────────────────────

// One input row in the create payload. Empty selects → null. weights / mr_pcts
// are exactly-4 numeric arrays; the server recomputes all calc_* values per row
// (std MR fixed at 20 for a yarn group, no CV band).
export type InterCardRow = {
	section: CardSection;
	mc_id: number | null;
	spell_id: number | null;
	item_grp_id: number | null;
	weights: number[];
	mr_pcts: number[];
};

// POST create_card_sliver_wt body. One save inserts MANY rows.
export type InterCardSavePayload = {
	co_id: number;
	branch_id: number;
	entry_date: string;
	rows: InterCardRow[];
};

// ─── Zod schema ──────────────────────────────────────────────────────────────
// Numeric inputs are held as strings in form state; the schema validates the
// parsed payload that is POSTed. Each row needs a section, exactly 4 weights
// (> 0) and exactly 4 MR% (>= 0).

export const interCardRowSchema = z.object({
	section: z.enum(CARD_SECTIONS),
	mc_id: z.number().int().positive().nullable(),
	spell_id: z.number().int().positive().nullable(),
	item_grp_id: z.number({ error: "A yarn group must be selected" }).int().positive("A yarn group must be selected"),
	weights: z
		.array(z.number())
		.refine((arr) => arr.length === CARD_SLIVER_READINGS, `Enter all ${CARD_SLIVER_READINGS} cut weights`)
		.refine((arr) => arr.every((w) => w > 0), "All cut weights must be greater than 0"),
	mr_pcts: z
		.array(z.number())
		.refine((arr) => arr.length === CARD_SLIVER_READINGS, `Enter all ${CARD_SLIVER_READINGS} MR% readings`)
		.refine((arr) => arr.every((m) => m >= 0), "MR% cannot be negative"),
});

export const interCardSaveSchema = z.object({
	co_id: z.number().int().positive("A company must be selected"),
	branch_id: z.number().int().positive("A branch must be selected"),
	entry_date: z.string().min(1, "Entry date is required"),
	rows: z.array(interCardRowSchema).min(1, "Add at least one reading row to save"),
});

// Inferred payload types — kept structurally compatible with the manual types.
export type InterCardRowFormValues = z.infer<typeof interCardRowSchema>;
export type InterCardSaveFormValues = z.infer<typeof interCardSaveSchema>;
