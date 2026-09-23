// All Selection Trolley Weight types in ONE file (prevents circular imports
// between the hooks, components and utils). Shapes mirror the backend contract
// in docs/claude/modules/jute-production/selection-trolley-weight-spec.md §3.1
// exactly — the FE and BE are built against that document in parallel.

// =============================================================================
// GET /selectionProd/entry_setup?co_id&branch_id[&tran_date]
// =============================================================================

/** A raw-jute quality issued to the branch inside the 7-day window (D4). */
export type SelectionQualityOption = {
	item_id: number;
	item_code: string | null;
	item_name: string;
	/** SUM(jute_issue.weight) in the window, kg. */
	issued_kg: number | null;
};

/** A gate entry (`jute_mr`) whose lines were issued in the window (D7). */
export type SelectionGateEntryOption = {
	jute_mr_id: number;
	gate_entry_no: number | string | null;
	/** YYYY-MM-DD */
	gate_entry_date: string | null;
	supplier_name: string | null;
	/** Distinct qualities issued from this gate entry in the window. */
	item_ids: number[];
	issued_kg: number | null;
};

/** A trolley tagged to the Selection stage in Trolly Master (D1). */
export type SelectionTrollyOption = {
	trolly_id: number;
	trolly_name: string;
	/** Current tare, kg — snapshotted server-side into every entry. */
	trolly_weight: number | null;
	trolly_posting_code: string | null;
};

export type SelectionSpellOption = {
	spell_id: number;
	spell_code: string;
	spell_name: string | null;
};

export type SelectionQualityWindow = {
	date_from: string;
	date_to: string;
	days: number;
};

export type SelectionSetup = {
	qualities: SelectionQualityOption[];
	gate_entries: SelectionGateEntryOption[];
	trollies: SelectionTrollyOption[];
	spells: SelectionSpellOption[];
	quality_window: SelectionQualityWindow | null;
};

// =============================================================================
// Row shape shared by entries_by_date.rows and the entry_create / entry_edit echo
// =============================================================================

export type SelectionRow = {
	selection_wt_id: number;
	co_id: number;
	branch_id: number;
	/** YYYY-MM-DD */
	tran_date: string;
	spell_id: number | null;
	spell_code: string | null;
	item_id: number;
	item_code: string | null;
	item_name: string | null;
	trolly_id: number;
	trolly_name: string | null;
	jute_mr_id: number | null;
	gate_entry_no: number | string | null;
	gate_entry_date: string | null;
	/** Tare snapshot at save time, kg. */
	trolly_wt: number;
	gross_wt: number;
	net_wt: number;
	/** "YYYY-MM-DD HH:mm:ss" */
	weigh_time: string;
	remarks: string | null;
};

// =============================================================================
// GET /selectionProd/entries_by_date?co_id&branch_id&tran_date[&spell_id]
// =============================================================================

export type SelectionTotals = {
	trolleys: number;
	gross_wt: number;
	trolly_wt: number;
	net_wt: number;
};

export type SelectionQualityTotal = {
	item_id: number;
	item_name: string | null;
	trolleys: number;
	net_wt: number;
};

export type SelectionEntriesByDateResponse = {
	rows: SelectionRow[];
	totals: SelectionTotals;
	by_quality: SelectionQualityTotal[];
};

// =============================================================================
// POST /selectionProd/entry_create  /  PUT /selectionProd/entry_edit/{id}?co_id=
// =============================================================================

export type SelectionEntryPayload = {
	co_id: number;
	branch_id: number;
	tran_date: string;
	spell_id: number | null;
	item_id: number;
	trolly_id: number;
	jute_mr_id: number | null;
	gross_wt: number;
	remarks: string | null;
};

export type SelectionEntrySaveResponse = {
	row: SelectionRow;
};

/** DELETE /selectionProd/entry_delete/{id}?co_id= */
export type SelectionEntryDeleteResponse = {
	selection_wt_id: number;
};

// =============================================================================
// Shared mutation result — `status` is surfaced so the page can tell a
// validation 400 (shown verbatim) from a network failure (status 0).
// =============================================================================

export type SelectionMutationResult<TRow = SelectionRow> = {
	ok: boolean;
	error: string | null;
	/** HTTP status from fetchWithCookie (0 on network failure). */
	status: number;
	row: TRow | null;
};
