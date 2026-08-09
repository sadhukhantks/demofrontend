// Types for the Jute Waste Entry page (SPEC §3, §6, §9).
//
// Single type-definition file for the module — nothing here imports from the
// page, hooks, or components, so no circular dependencies can form.
//
// SPEC §9: waste type is no longer a fixed app enum — it is an ITEM of
// item-type 3 ("jute wastage"), so the options come from the item master and
// the stored value is `item_id`.

// ---------------------------------------------------------------------------
// GET /entry_create_setup payload (SPEC §6)
// ---------------------------------------------------------------------------

export type WasteSpellOption = {
	spell_id: number;
	spell_code?: string | null;
	spell_name: string;
	working_hours: number;
};

export type WasteDeptOption = {
	dept_id: number;
	dept_desc: string;
	branch_id: number | null;
};

export type WasteMachineOption = {
	machine_id: number;
	machine_name: string;
	dept_id: number;
};

/** A waste type — an item of item-type 3 ("jute wastage") from the item master. */
export type WasteItemOption = {
	item_id: number;
	item_name: string;
	item_code: string;
};

export type WasteSetup = {
	spells: WasteSpellOption[];
	departments: WasteDeptOption[];
	machines: WasteMachineOption[];
	waste_items: WasteItemOption[];
};

// ---------------------------------------------------------------------------
// GET /entries_by_date row (SPEC §6)
// ---------------------------------------------------------------------------

export type WasteEntryRow = {
	waste_entry_id: number;
	tran_date: string;
	spell_id: number;
	spell_code: string | null;
	spell_name: string | null;
	dept_id: number;
	dept_desc: string | null;
	machine_id: number | null;
	machine_name: string | null;
	item_id: number;
	/** Left-joined from the item master — null if the item was deactivated. */
	item_name: string | null;
	item_code: string | null;
	waste_qty: number;
	remarks: string | null;
};

// ---------------------------------------------------------------------------
// Write payloads (SPEC §6)
// ---------------------------------------------------------------------------

export type WasteEntryCreatePayload = {
	co_id: number;
	branch_id: number;
	tran_date: string;
	spell_id: number;
	dept_id: number;
	/** null = department-level waste, no machine attribution (SPEC §3.1). */
	machine_id: number | null;
	/** Waste type — item master id (item-type 3, "jute wastage"). */
	item_id: number;
	waste_qty: number;
	remarks: string | null;
};

/**
 * PUT /entry_edit/{waste_entry_id}?co_id=… body (SPEC §6.1).
 *
 * `co_id` rides in the QUERY STRING, not the body — the row is located by
 * (waste_entry_id, co_id) so one company cannot mutate another's row by
 * guessing an id. `tran_date` and `dept_id` are IMMUTABLE and must not be sent;
 * moving a row to another date or department is delete + re-add.
 *
 * Null means "leave unchanged", NOT "clear". Consequence: an already-attributed
 * `machine_id` cannot be un-set through edit (delete + re-add instead) — the UI
 * hides the blank machine option for such rows rather than silently no-opping.
 */
export type WasteEntryEditPayload = {
	spell_id: number;
	machine_id: number | null;
	/** Waste type — item master id (item-type 3, "jute wastage"). */
	item_id: number;
	waste_qty: number;
	remarks: string | null;
};

/** One row of the grid footer: total waste_qty for a single waste item. */
export type WasteItemTotal = {
	item_id: number;
	label: string;
	total: number;
};
