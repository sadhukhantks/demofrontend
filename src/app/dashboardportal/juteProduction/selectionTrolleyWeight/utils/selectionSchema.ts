// Zod schema for the Selection Trolley Weight entry form — the single source of
// truth for the form's TypeScript type and validation (spec §4.1).
//
// Every select/number field is held as a STRING because MUI text inputs bind to
// strings; values become numbers only in the payload builder, so the form type
// stays honest and there is no NaN churn mid-keystroke. Header context (date,
// spell, branch) lives on the page, not in the form, and is merged in by
// `buildSelectionEntryPayload`.

import { z } from "zod";
import type { SelectionEntryPayload } from "../types/selectionTypes";
import { SELECTION_GROSS_MAX, SELECTION_GROSS_MIN, SELECTION_WT_SCALE, decimalPlaces } from "./selectionCalc";

export const selectionEntrySchema = z.object({
	item_id: z.string().min(1, "Quality is required"),
	// Optional gate entry (D7) — blank = none.
	jute_mr_id: z.string(),
	trolly_id: z.string().min(1, "Trolley is required"),
	gross_wt: z
		.string()
		.min(1, "Gross weight is required")
		.refine((v) => Number.isFinite(Number(v)), { message: "Gross weight must be a number" })
		.refine((v) => Number(v) >= SELECTION_GROSS_MIN, {
			message: `Gross weight must be at least ${SELECTION_GROSS_MIN} kg`,
		})
		.refine((v) => Number(v) <= SELECTION_GROSS_MAX, {
			message: `Gross weight cannot exceed ${SELECTION_GROSS_MAX} kg`,
		})
		.refine((v) => decimalPlaces(v) <= SELECTION_WT_SCALE, {
			message: `Maximum ${SELECTION_WT_SCALE} decimal places`,
		}),
	remarks: z.string().max(255, "Remarks cannot exceed 255 characters"),
});

export type SelectionEntryFormValues = z.infer<typeof selectionEntrySchema>;

/** Blank entry form. Quality / gate entry / trolley are remembered between saves by the form itself. */
export function buildDefaultSelectionFormValues(): SelectionEntryFormValues {
	return {
		item_id: "",
		jute_mr_id: "",
		trolly_id: "",
		gross_wt: "",
		remarks: "",
	};
}

/** Header context owned by the page (set once per weighing session). */
export type SelectionEntryContext = {
	coId: number;
	branchId: number;
	tranDate: string;
	spellId: number | null;
};

/** POST /entry_create and PUT /entry_edit/{id} body (spec §3.1). */
export function buildSelectionEntryPayload(
	values: SelectionEntryFormValues,
	ctx: SelectionEntryContext
): SelectionEntryPayload {
	const remarks = values.remarks.trim();
	return {
		co_id: ctx.coId,
		branch_id: ctx.branchId,
		tran_date: ctx.tranDate,
		spell_id: ctx.spellId,
		item_id: Number(values.item_id),
		trolly_id: Number(values.trolly_id),
		jute_mr_id: values.jute_mr_id === "" ? null : Number(values.jute_mr_id),
		gross_wt: Number(values.gross_wt),
		remarks: remarks === "" ? null : remarks,
	};
}
