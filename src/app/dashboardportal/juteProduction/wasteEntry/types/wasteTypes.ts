// Types + fixed enum for the Jute Waste Entry page (SPEC §3, §6, §9).
//
// Single type-definition file for the module — nothing here imports from the
// page, hooks, or components, so no circular dependencies can form.

/**
 * Fixed, app-enforced waste types (SPEC §9). There is deliberately NO
 * waste-type master table; the stored value is the lowercase `code`, and the
 * dropdown binds value-to-code (never value-to-label) so the persisted
 * `waste_type_code` is guaranteed to be one of these strings.
 */
export const WASTE_TYPE_CODES = [
	"caddis",
	"hard_waste",
	"soft_waste",
	"sweeping",
	"yarn_waste",
	"cloth_waste",
	"other",
] as const;

export type WasteTypeCode = (typeof WASTE_TYPE_CODES)[number];

/** Display labels for the FE dropdown and grid (visible text only — SPEC §9). */
export const WASTE_TYPE_LABELS: Record<WasteTypeCode, string> = {
	caddis: "Caddis / Dust",
	hard_waste: "Hard Waste",
	soft_waste: "Soft Waste",
	sweeping: "Sweepings",
	yarn_waste: "Yarn Waste",
	cloth_waste: "Cloth Waste",
	other: "Other",
};

/** Runtime narrowing for values arriving from the API (never trust the wire). */
export function isWasteTypeCode(value: unknown): value is WasteTypeCode {
	return (
		typeof value === "string" && (WASTE_TYPE_CODES as readonly string[]).includes(value)
	);
}

/** Label lookup that degrades gracefully for unknown/legacy codes. */
export function wasteTypeLabel(value: unknown): string {
	if (isWasteTypeCode(value)) return WASTE_TYPE_LABELS[value];
	return value == null ? "" : String(value);
}

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

export type WasteTypeOption = {
	code: string;
	label: string;
};

export type WasteSetup = {
	spells: WasteSpellOption[];
	departments: WasteDeptOption[];
	machines: WasteMachineOption[];
	waste_types: WasteTypeOption[];
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
	waste_type_code: string;
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
	waste_type_code: WasteTypeCode;
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
	waste_type_code: WasteTypeCode;
	waste_qty: number;
	remarks: string | null;
};

/** One row of the grid footer: total waste_qty for a single waste type. */
export type WasteTypeTotal = {
	code: string;
	label: string;
	total: number;
};
