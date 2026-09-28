// All Bale Production types in ONE file (prevents circular imports between the
// hooks, components and utils). Shapes mirror the backend contract in
// vowerp3be/docs/bale-production-spec-sheet.md §6.3 exactly — the FE and BE are
// built against that document in parallel.

// =============================================================================
// Discriminators
// =============================================================================

/** `jute_prod_bale_entry.entry_type` (SPEC §4.2, D2). */
export const BALE_ENTRY_TYPES = {
	PROD: "PROD",
	REPACK: "REPACK",
} as const;

export type BaleEntryType = (typeof BALE_ENTRY_TYPES)[keyof typeof BALE_ENTRY_TYPES];

/** `quality_type` codes shared with `jute_prod_finishing_quality` (SPEC §4.1). */
export const BALE_QUALITY_TYPE_HESSIAN = 1;
export const BALE_QUALITY_TYPE_SACKING = 2;

export type BaleQualityType = typeof BALE_QUALITY_TYPE_HESSIAN | typeof BALE_QUALITY_TYPE_SACKING;

export const BALE_QUALITY_TYPE_LABELS: Record<BaleQualityType, string> = {
	[BALE_QUALITY_TYPE_HESSIAN]: "Hessian",
	[BALE_QUALITY_TYPE_SACKING]: "Sacking",
};

// =============================================================================
// GET /baleProd/entry_setup?co_id&branch_id
// =============================================================================

export type BaleQualityOption = {
	finishing_quality_id: number;
	item_id: number;
	item_code: string;
	item_name: string;
	quality_type: number;
	std_bale_weight: number | null;
	packsheet_wt: number | null;
	std_mr_pct: number | null;
	weft_yarn_item_id: number | null;
	/** Weft yarn count in lbs, null when no weft is linked. */
	weft_count: number | null;
};

export type BaleSeriesOption = {
	bale_series_id: number;
	series_name: string;
	quality_type: number;
	/** Set → bound to one quality (hessian pattern); null → any quality of the type. */
	item_id: number | null;
	state_id: number | null;
	party_id: number | null;
	last_bale_no: number;
};

export type BaleMachineOption = {
	machine_id: number;
	machine_name: string;
	mech_code: string | null;
};

export type BaleTrollyOption = {
	trolly_id: number;
	trolly_name: string;
	trolly_weight: number | null;
};

export type BaleSpellOption = {
	spell_id: number;
	spell_code: string;
	spell_name: string | null;
	working_hours: number | null;
};

export type BaleSetup = {
	qualities: BaleQualityOption[];
	series: BaleSeriesOption[];
	machines: BaleMachineOption[];
	trollies: BaleTrollyOption[];
	spells: BaleSpellOption[];
	entries_today_count?: number;
};

// =============================================================================
// GET /baleProd/next_bale_no?co_id&bale_series_id
// =============================================================================

export type NextBaleNoLastEntry = {
	bale_entry_id: number;
	tran_date: string;
	bale_no: number;
	gross_wt: number;
	net_wt: number;
	trolly_id: number | null;
	finishing_quality_id: number;
};

export type NextBaleNoResponse = {
	bale_series_id: number;
	series_name: string;
	last_bale_no: number;
	next_bale_no: number;
	last_entry: NextBaleNoLastEntry | null;
};

// =============================================================================
// Row shape shared by entries_by_date.rows, bale_search.rows and the
// entry_create / entry_edit echo
// =============================================================================

export type BaleRow = {
	bale_entry_id: number;
	co_id: number;
	branch_id: number;
	/** YYYY-MM-DD */
	tran_date: string;
	spell_id: number;
	spell_code: string | null;
	machine_id: number | null;
	machine_name: string | null;
	entry_type: BaleEntryType;
	finishing_quality_id: number;
	item_id: number;
	item_name: string | null;
	quality_type: number;
	bale_series_id: number;
	series_name: string | null;
	bale_no: number;
	original_bale_no: number | null;
	trolly_id: number | null;
	trolly_name: string | null;
	trolly_wt: number;
	packsheet_wt: number;
	gross_wt: number;
	net_wt: number;
	std_bale_wt: number | null;
	/** ISO datetime */
	weigh_time: string;
	remarks: string | null;
};

// =============================================================================
// GET /baleProd/entries_by_date?co_id&branch_id&tran_date[&spell_id][&entry_type]
// =============================================================================

export type BaleQualityTotal = {
	finishing_quality_id: number;
	item_name: string | null;
	quality_type: number;
	entry_type: BaleEntryType;
	bales: number;
	total_gross: number;
	total_net: number;
	avg_net: number | null;
	std_bale_wt: number | null;
};

export type BaleEntriesByDateResponse = {
	rows: BaleRow[];
	totals: BaleQualityTotal[];
};

// =============================================================================
// POST /baleProd/entry_create  /  PUT /baleProd/entry_edit/{id}
// =============================================================================

export type BaleEntryPayload = {
	co_id: number;
	branch_id: number;
	tran_date: string;
	spell_id: number;
	machine_id: number | null;
	entry_type: BaleEntryType;
	finishing_quality_id: number;
	bale_series_id: number;
	bale_no: number;
	original_bale_no: number | null;
	trolly_id: number | null;
	gross_wt: number;
	remarks: string | null;
	/** Resend with true after the operator confirms a 409 (SPEC Q5). */
	allow_duplicate: boolean;
};

export type BaleEntrySaveResponse = {
	row: BaleRow;
	last_bale_no: number;
};

/** DELETE /baleProd/entry_delete/{id}?co_id */
export type BaleEntryDeleteResponse = {
	bale_entry_id: number;
	bale_series_id: number;
	/** Series counter after the delete — wound back when the deleted bale was the top. */
	last_bale_no: number | null;
};

/** GET /baleProd/bale_search?co_id&branch_id&bale_no[&bale_series_id] */
export type BaleSearchResponse = {
	rows: BaleRow[];
};

// =============================================================================
// Bale Series master (SPEC §4.1, §8.2)
// =============================================================================

export type BaleSeriesSetupItem = {
	item_id: number;
	item_code: string;
	item_name: string;
};

export type BaleSeriesSetupState = {
	state_id: number;
	state: string;
};

export type BaleSeriesSetupParty = {
	party_id: number;
	supp_name: string;
};

/** GET /baleProd/series_setup?co_id[&branch_id] */
export type BaleSeriesSetup = {
	items: BaleSeriesSetupItem[];
	states: BaleSeriesSetupState[];
	parties: BaleSeriesSetupParty[];
};

/** One row of GET /baleProd/series_list?co_id[&branch_id]. */
export type BaleSeriesRow = {
	bale_series_id: number;
	co_id: number;
	branch_id: number;
	branch_name: string | null;
	series_name: string;
	quality_type: number;
	item_id: number | null;
	item_name: string | null;
	state_id: number | null;
	state: string | null;
	party_id: number | null;
	party_name: string | null;
	last_bale_no: number;
	/** Active bale rows that reference this series. */
	bales_total: number;
};

export type BaleSeriesListResponse = {
	rows: BaleSeriesRow[];
};

/** POST /baleProd/series_create body; PUT /baleProd/series_edit/{id} takes the same. */
export type BaleSeriesPayload = {
	co_id: number;
	branch_id: number;
	series_name: string;
	quality_type: number;
	item_id: number | null;
	state_id: number | null;
	party_id: number | null;
	last_bale_no: number;
};

// =============================================================================
// Shared mutation result — `status` is surfaced so the page can recognise a
// 409 (duplicate bale no / unknown original) and offer "Save anyway".
// =============================================================================

export type BaleMutationResult<TRow = BaleRow> = {
	ok: boolean;
	error: string | null;
	/** HTTP status from fetchWithCookie (0 on network failure). */
	status: number;
	row: TRow | null;
	/** Series counter after the save (create/edit only). */
	lastBaleNo: number | null;
};

/** HTTP status the backend uses for "confirm before saving" (SPEC §6, Q5). */
export const HTTP_CONFLICT = 409;
