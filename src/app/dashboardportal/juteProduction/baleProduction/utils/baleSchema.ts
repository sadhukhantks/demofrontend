// Zod schemas for Bale Production — the single source of truth for the entry
// form's TypeScript type and validation (SPEC §8.1) and for the Bale Series
// master dialog (SPEC §8.2).
//
// Every select/number field is held as a STRING because MUI text inputs bind to
// strings; values become numbers only in the payload builders, so the form type
// stays honest and there is no NaN churn mid-keystroke. Header context (date,
// spell, machine, entry type) lives on the page, not in the form, and is merged
// in by `buildBaleEntryPayload`.

import { z } from "zod";
import {
	BALE_ENTRY_TYPES,
	BALE_QUALITY_TYPE_HESSIAN,
	BALE_QUALITY_TYPE_SACKING,
	type BaleEntryPayload,
	type BaleEntryType,
	type BaleSeriesPayload,
} from "../types/baleTypes";
import {
	BALE_GROSS_MAX,
	BALE_GROSS_MIN,
	BALE_NO_MAX,
	BALE_WT_SCALE,
	decimalPlaces,
} from "./baleCalc";

// -----------------------------------------------------------------------------
// Shared string-field refinements
// -----------------------------------------------------------------------------

const isIntegerString = (v: string) => /^\d+$/.test(v.trim());

/** Required positive integer typed as text (bale numbers). */
const requiredBaleNo = (label: string) =>
	z
		.string()
		.min(1, `${label} is required`)
		.refine(isIntegerString, { message: `${label} must be a whole number` })
		.refine((v) => Number(v) >= 1, { message: `${label} must be at least 1` })
		.refine((v) => Number(v) <= BALE_NO_MAX, {
			message: `${label} cannot exceed ${BALE_NO_MAX.toLocaleString()}`,
		});

// -----------------------------------------------------------------------------
// Entry form (SPEC §4.2 / §6.1 validation)
// -----------------------------------------------------------------------------

export const baleEntrySchema = z
	.object({
		entry_type: z.enum([BALE_ENTRY_TYPES.PROD, BALE_ENTRY_TYPES.REPACK]),
		finishing_quality_id: z.string().min(1, "Quality is required"),
		bale_series_id: z.string().min(1, "Series is required"),
		bale_no: requiredBaleNo("Bale no"),
		// REPACK only — enforced in superRefine below so PROD rows can leave it blank.
		original_bale_no: z.string(),
		// Optional: blank = scale tared, tare 0 (D1).
		trolly_id: z.string(),
		gross_wt: z
			.string()
			.min(1, "Gross weight is required")
			.refine((v) => Number.isFinite(Number(v)), { message: "Gross weight must be a number" })
			.refine((v) => Number(v) >= BALE_GROSS_MIN, {
				message: `Gross weight must be at least ${BALE_GROSS_MIN} kg`,
			})
			.refine((v) => Number(v) <= BALE_GROSS_MAX, {
				message: `Gross weight cannot exceed ${BALE_GROSS_MAX} kg`,
			})
			.refine((v) => decimalPlaces(v) <= BALE_WT_SCALE, {
				message: `Maximum ${BALE_WT_SCALE} decimal places`,
			}),
		remarks: z.string().max(255, "Remarks cannot exceed 255 characters"),
	})
	.superRefine((values, ctx) => {
		if (values.entry_type === BALE_ENTRY_TYPES.REPACK) {
			const v = values.original_bale_no.trim();
			if (v === "") {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["original_bale_no"],
					message: "Original bale no is required for a repack",
				});
			} else if (!isIntegerString(v) || Number(v) < 1) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["original_bale_no"],
					message: "Original bale no must be a whole number of at least 1",
				});
			} else if (Number(v) > BALE_NO_MAX) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["original_bale_no"],
					message: `Original bale no cannot exceed ${BALE_NO_MAX.toLocaleString()}`,
				});
			}
		}
	});

export type BaleEntryFormValues = z.infer<typeof baleEntrySchema>;

/** Blank entry form. Quality/series/trolley are remembered between saves by the form itself. */
export function buildDefaultBaleFormValues(entryType: BaleEntryType): BaleEntryFormValues {
	return {
		entry_type: entryType,
		finishing_quality_id: "",
		bale_series_id: "",
		bale_no: "",
		original_bale_no: "",
		trolly_id: "",
		gross_wt: "",
		remarks: "",
	};
}

/** Header context owned by the page (set once per weighing session, SPEC §3). */
export type BaleEntryContext = {
	coId: number;
	branchId: number;
	tranDate: string;
	spellId: number;
	machineId: number | null;
};

/**
 * POST /entry_create and PUT /entry_edit/{id} body (SPEC §6.1, §6.3). PROD rows
 * always send `original_bale_no: null` — the server rejects a value on them.
 */
export function buildBaleEntryPayload(
	values: BaleEntryFormValues,
	ctx: BaleEntryContext,
	allowDuplicate = false
): BaleEntryPayload {
	const isRepack = values.entry_type === BALE_ENTRY_TYPES.REPACK;
	const remarks = values.remarks.trim();
	return {
		co_id: ctx.coId,
		branch_id: ctx.branchId,
		tran_date: ctx.tranDate,
		spell_id: ctx.spellId,
		machine_id: ctx.machineId,
		entry_type: values.entry_type,
		finishing_quality_id: Number(values.finishing_quality_id),
		bale_series_id: Number(values.bale_series_id),
		bale_no: Number(values.bale_no),
		original_bale_no: isRepack ? Number(values.original_bale_no) : null,
		trolly_id: values.trolly_id === "" ? null : Number(values.trolly_id),
		gross_wt: Number(values.gross_wt),
		remarks: remarks === "" ? null : remarks,
		allow_duplicate: allowDuplicate,
	};
}

// -----------------------------------------------------------------------------
// Bale Series master dialog (SPEC §4.1 / §8.2)
// -----------------------------------------------------------------------------

export const baleSeriesSchema = z.object({
	series_name: z
		.string()
		.trim()
		.min(1, "Series name is required")
		.max(60, "Series name cannot exceed 60 characters"),
	quality_type: z.enum([String(BALE_QUALITY_TYPE_HESSIAN), String(BALE_QUALITY_TYPE_SACKING)], {
		message: "Quality type is required",
	}),
	item_id: z.string(),
	state_id: z.string(),
	party_id: z.string(),
	last_bale_no: z
		.string()
		.min(1, "Last bale no is required (0 for a new series)")
		.refine(isIntegerString, { message: "Last bale no must be a whole number" })
		.refine((v) => Number(v) >= 0, { message: "Last bale no cannot be negative" })
		.refine((v) => Number(v) <= BALE_NO_MAX, {
			message: `Last bale no cannot exceed ${BALE_NO_MAX.toLocaleString()}`,
		}),
});

export type BaleSeriesFormValues = z.infer<typeof baleSeriesSchema>;

export const DEFAULT_BALE_SERIES_FORM_VALUES: BaleSeriesFormValues = Object.freeze({
	series_name: "",
	quality_type: String(BALE_QUALITY_TYPE_SACKING),
	item_id: "",
	state_id: "",
	party_id: "",
	last_bale_no: "0",
});

/** POST /series_create and PUT /series_edit/{id} body (SPEC §6.3). */
export function buildBaleSeriesPayload(
	values: BaleSeriesFormValues,
	coId: number,
	branchId: number
): BaleSeriesPayload {
	return {
		co_id: coId,
		branch_id: branchId,
		series_name: values.series_name.trim(),
		quality_type: Number(values.quality_type),
		item_id: values.item_id === "" ? null : Number(values.item_id),
		state_id: values.state_id === "" ? null : Number(values.state_id),
		party_id: values.party_id === "" ? null : Number(values.party_id),
		last_bale_no: Number(values.last_bale_no),
	};
}
