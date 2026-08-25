/**
 * Every type the Overhaul Register page uses, in ONE file (house rule: a single
 * type module per page, so nothing can form an import cycle).
 *
 * The Zod schema is the single source of truth for both the form's TypeScript type
 * and its validation. Select and number fields are held as STRINGS because MUI
 * inputs bind to strings; they become numbers only when the API payload is built,
 * which keeps the form type honest and avoids NaN churn mid-keystroke.
 *
 * Wire types (`MechOverhaul`, `MechOverhaulCreate`, ...) are NOT redeclared here —
 * they are imported from `@/utils/juteMechanicalService`, which owns the contract.
 */

import { z } from "zod";
import type {
	MechOverhaulCreate,
	MechOverhaulDetail,
	MechOverhaulSpareInput,
} from "@/utils/juteMechanicalService";
import {
	isDateRangeInverted,
	isFutureISODate,
	spareLineAmount,
	todayISO,
	toNumber,
} from "../utils/overhaulCalc";

// =============================================================================
// Enum codes — mirror src/juteMechanical/constants.py
// =============================================================================

/** `done_by = VENDOR` is the value that makes `party_id` mandatory (backend 400s). */
export const DONE_BY_VENDOR = "VENDOR";
export const DONE_BY_INHOUSE = "INHOUSE";

export const OVERHAUL_TYPE_MAJOR = "MAJOR";
export const OVERHAUL_TYPE_MINOR = "MINOR";

/**
 * The shape both the server's enum payload and the local fallbacks satisfy.
 * Annotating the fallbacks with it keeps `serverList.length > 0 ? serverList : FALLBACK`
 * a single array type instead of a union TypeScript refuses to `.map()`.
 */
export interface OverhaulEnumLike {
	code: string;
	label: string;
}

/**
 * Fallbacks used only if `overhaul_create_setup` returns an empty enum list, so the
 * two dropdowns are never empty. The server payload always wins when present.
 */
export const FALLBACK_OVERHAUL_TYPES: ReadonlyArray<OverhaulEnumLike> = Object.freeze([
	{ code: OVERHAUL_TYPE_MAJOR, label: "Major" },
	{ code: OVERHAUL_TYPE_MINOR, label: "Minor" },
]);

export const FALLBACK_DONE_BY_OPTIONS: ReadonlyArray<OverhaulEnumLike> = Object.freeze([
	{ code: DONE_BY_INHOUSE, label: "In-house" },
	{ code: DONE_BY_VENDOR, label: "Vendor" },
]);

/** Stable empty array, so memo dependencies do not churn on every render. */
export const EMPTY_SPARES: ReadonlyArray<EditableOverhaulSpare> = Object.freeze([]);

// =============================================================================
// Spare line editing
// =============================================================================

/**
 * One spare line while it is being edited. Numeric cells are strings (see the file
 * header); the item identity columns are snapshots taken from the item picker so
 * the table can show codes and names without a second lookup.
 */
export interface EditableOverhaulSpare {
	/** Client-side row key — spare lines have no server id until the save round-trips. */
	line_id: string;
	item_id: number;
	item_code: string;
	item_name: string;
	uom_id: number | null;
	uom_name: string;
	qty: string;
	rate: string;
	/** Blank means "derive from qty x rate", exactly as the backend does. */
	amount: string;
	remarks: string;
}

let spareLineCounter = 0;

/** Monotonic client-side row key for a new spare line. */
export function nextSpareLineId(): string {
	spareLineCounter += 1;
	return `spare-${spareLineCounter}`;
}

/** Turn a saved spare line back into an editable row (edit mode). */
export function toEditableSpare(
	spare: MechOverhaulDetail["spares"][number],
): EditableOverhaulSpare {
	return {
		line_id: nextSpareLineId(),
		item_id: spare.item_id,
		item_code: spare.item_code ?? "",
		item_name: spare.item_name ?? "",
		uom_id: spare.uom_id,
		uom_name: spare.uom_name ?? "",
		qty: spare.qty === null ? "" : String(spare.qty),
		rate: spare.rate === null ? "" : String(spare.rate),
		amount: spare.amount === null ? "" : String(spare.amount),
		remarks: spare.remarks ?? "",
	};
}

// =============================================================================
// Header form — Zod schema + inferred type
// =============================================================================

export const overhaulFormSchema = z
	.object({
		machine_id: z.string().min(1, "Machine is required"),
		overhaul_type: z.string().min(1, "Overhaul type is required"),
		from_date: z
			.string()
			.min(1, "From date is required")
			.refine((value) => !isFutureISODate(value), {
				message: "From date cannot be in the future",
			}),
		/** Blank while the machine is still down — the backend accepts a NULL to_date. */
		to_date: z.string(),
		work_done: z.string().max(2000, "Work done cannot exceed 2000 characters"),
		done_by: z.string().min(1, "Done by is required"),
		/** Only meaningful (and only required) when done_by = VENDOR. */
		party_id: z.string(),
		labour_cost: z
			.string()
			.refine((value) => value === "" || Number.isFinite(Number(value)), {
				message: "Labour cost must be a number",
			})
			.refine((value) => value === "" || Number(value) >= 0, {
				message: "Labour cost cannot be negative",
			}),
		remarks: z.string().max(500, "Remarks cannot exceed 500 characters"),
	})
	.superRefine((values, ctx) => {
		// Mirrors the backend's DATE_ORDER_MSG gate.
		if (isDateRangeInverted(values.from_date, values.to_date)) {
			ctx.addIssue({
				code: "custom",
				path: ["to_date"],
				message: "To date cannot be earlier than From date",
			});
		}
		// Mirrors the backend's VENDOR_PARTY_MSG gate: party_id is required when the
		// work was done by a vendor. Catching it here keeps the user out of a 400.
		if (values.done_by === DONE_BY_VENDOR && values.party_id === "") {
			ctx.addIssue({
				code: "custom",
				path: ["party_id"],
				message: "Vendor is required when the overhaul was done by a vendor",
			});
		}
	});

export type OverhaulFormValues = z.infer<typeof overhaulFormSchema>;

/** Blank header — today's date, in-house, minor. */
export function buildDefaultOverhaulFormValues(): OverhaulFormValues {
	return {
		machine_id: "",
		overhaul_type: OVERHAUL_TYPE_MINOR,
		from_date: todayISO(),
		to_date: "",
		work_done: "",
		done_by: DONE_BY_INHOUSE,
		party_id: "",
		labour_cost: "",
		remarks: "",
	};
}

/** Lift a saved overhaul into the form (edit mode). */
export function toOverhaulFormValues(detail: MechOverhaulDetail): OverhaulFormValues {
	return {
		machine_id: String(detail.machine_id),
		overhaul_type: detail.overhaul_type ?? OVERHAUL_TYPE_MINOR,
		from_date: detail.from_date ?? todayISO(),
		to_date: detail.to_date ?? "",
		work_done: detail.work_done ?? "",
		done_by: detail.done_by ?? DONE_BY_INHOUSE,
		party_id: detail.party_id === null ? "" : String(detail.party_id),
		labour_cost: detail.labour_cost === null ? "" : String(detail.labour_cost),
		remarks: detail.remarks ?? "",
	};
}

// =============================================================================
// Payload builder
// =============================================================================

/** A spare row is postable once it carries an item; qty/rate/amount may be blank. */
export function isPostableSpare(line: EditableOverhaulSpare): boolean {
	return Number.isFinite(line.item_id) && line.item_id > 0;
}

function toSpareInput(line: EditableOverhaulSpare): MechOverhaulSpareInput {
	return {
		item_id: line.item_id,
		qty: line.qty === "" ? null : toNumber(line.qty),
		uom_id: line.uom_id,
		rate: line.rate === "" ? null : toNumber(line.rate),
		// Always send an explicit amount so the grid total and the stored value agree,
		// even when the user typed only qty and rate.
		amount: spareLineAmount(line),
		remarks: line.remarks.trim() === "" ? null : line.remarks.trim(),
	};
}

/**
 * Body for `POST /overhaul_create` and `PUT /overhaul_edit/{id}` — the same shape.
 * `downtime_days`, `spare_cost`, `total_cost` and `next_due_date` are deliberately
 * absent: the backend derives them and would ignore anything we sent.
 */
export function buildOverhaulPayload(
	values: OverhaulFormValues,
	spares: ReadonlyArray<EditableOverhaulSpare>,
	coId: number,
	branchId: number,
): MechOverhaulCreate {
	const isVendor = values.done_by === DONE_BY_VENDOR;
	return {
		co_id: coId,
		branch_id: branchId,
		machine_id: Number(values.machine_id),
		overhaul_type: values.overhaul_type,
		from_date: values.from_date,
		to_date: values.to_date === "" ? null : values.to_date,
		work_done: values.work_done.trim() === "" ? null : values.work_done.trim(),
		done_by: values.done_by,
		party_id: isVendor && values.party_id !== "" ? Number(values.party_id) : null,
		labour_cost: values.labour_cost === "" ? null : toNumber(values.labour_cost),
		remarks: values.remarks.trim() === "" ? null : values.remarks.trim(),
		spares: spares.filter(isPostableSpare).map(toSpareInput),
	};
}
