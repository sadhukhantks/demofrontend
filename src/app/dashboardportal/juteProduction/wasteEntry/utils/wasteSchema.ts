// Zod schema for the Waste Entry form — the single source of truth for both
// the form's TypeScript type and its validation (SPEC §2).
//
// Select/number fields are held as strings because MUI TextField binds to
// strings; the values are converted to numbers only when the API payload is
// built (see `buildCreatePayload` / `buildEditPayload` below), which keeps the
// form type honest and avoids NaN churn while the user is mid-keystroke.

import { z } from "zod";
import {
	WASTE_TYPE_CODES,
	type WasteEntryCreatePayload,
	type WasteEntryEditPayload,
} from "../types/wasteTypes";
import { MAX_WASTE_QTY, WASTE_QTY_SCALE, decimalPlaces, isFutureISODate } from "./wasteCalc";

export const wasteEntrySchema = z.object({
	// SPEC §2 — tran_date must not be in the future.
	tran_date: z
		.string()
		.min(1, "Date is required")
		.refine((value) => !isFutureISODate(value), {
			message: "Date cannot be in the future",
		}),
	// SPEC §2 — spell_id must exist in spell_mst; the dropdown is the guarantee,
	// this only enforces that something was picked.
	spell_id: z.string().min(1, "Spell is required"),
	// SPEC §2 — dept_id is stored and required (waste is a departmental measure).
	dept_id: z.string().min(1, "Department is required"),
	// SPEC §3.1 — machine is OPTIONAL; "" means department-level waste.
	machine_id: z.string(),
	// SPEC §9 — fixed enum, no master table.
	waste_type_code: z.enum(WASTE_TYPE_CODES, { error: "Waste type is required" }),
	// SPEC §2 — waste_qty > 0 and <= 99999.999, DECIMAL(10,3).
	waste_qty: z
		.string()
		.min(1, "Quantity is required")
		.refine((value) => Number.isFinite(Number(value)), {
			message: "Quantity must be a number",
		})
		.refine((value) => Number(value) > 0, {
			message: "Quantity must be greater than 0",
		})
		.refine((value) => Number(value) <= MAX_WASTE_QTY, {
			message: `Quantity cannot exceed ${MAX_WASTE_QTY}`,
		})
		.refine((value) => decimalPlaces(value) <= WASTE_QTY_SCALE, {
			message: `Maximum ${WASTE_QTY_SCALE} decimal places`,
		}),
	remarks: z.string().max(255, "Remarks cannot exceed 255 characters"),
});

export type WasteEntryFormValues = z.infer<typeof wasteEntrySchema>;

/** Blank form state — date defaults to today, everything else empty (SPEC §3.1). */
export function buildDefaultFormValues(tranDate: string): WasteEntryFormValues {
	return {
		tran_date: tranDate,
		spell_id: "",
		dept_id: "",
		machine_id: "",
		// Cast is confined to this factory: the enum has no legal "unselected"
		// member, but the form must start with nothing chosen. Validation rejects
		// the empty value before it can ever reach a payload.
		waste_type_code: "" as WasteEntryFormValues["waste_type_code"],
		waste_qty: "",
		remarks: "",
	};
}

/** POST /entry_create body (SPEC §6). */
export function buildCreatePayload(
	values: WasteEntryFormValues,
	coId: number,
	branchId: number
): WasteEntryCreatePayload {
	return {
		co_id: coId,
		branch_id: branchId,
		tran_date: values.tran_date,
		spell_id: Number(values.spell_id),
		dept_id: Number(values.dept_id),
		machine_id: values.machine_id === "" ? null : Number(values.machine_id),
		waste_type_code: values.waste_type_code,
		waste_qty: Number(values.waste_qty),
		remarks: values.remarks.trim() === "" ? null : values.remarks.trim(),
	};
}

/**
 * PUT /entry_edit/{id}?co_id=… body (SPEC §6.1). Only the five editable fields
 * travel: `tran_date` and `dept_id` are immutable, and `co_id` goes in the query
 * string as the company-scoping guard.
 */
export function buildEditPayload(values: WasteEntryFormValues): WasteEntryEditPayload {
	return {
		spell_id: Number(values.spell_id),
		machine_id: values.machine_id === "" ? null : Number(values.machine_id),
		waste_type_code: values.waste_type_code,
		waste_qty: Number(values.waste_qty),
		remarks: values.remarks.trim() === "" ? null : values.remarks.trim(),
	};
}
