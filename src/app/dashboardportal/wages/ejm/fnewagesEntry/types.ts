import { z } from "zod";

/** A department that has rows in ejm_wages_quality_rate (`get_ejm_fne_qual_target_departments?rated=1`). */
export type QualityDepartmentOption = {
	value: string;
	label: string;
};

/** Index row: one saved target (fortnight, department, quality). */
export type FneQualTargetEntryRow = {
	id: number;
	period_id: number;
	start_date: string | null;
	end_date: string | null;
	dept_id: number;
	dept_desc: string;
	quality_label: string;
	process: string | null;
	target: string | null;
	eff_pc: string | null;
	status_id: number;
};

/**
 * One of the department's ejm_wages_quality_rate rows (value = wages_quality_rate_id).
 * `ran` = produced in the selected fortnight; the backend lists those first.
 */
export type QualityOption = { value: number; label: string; target: string | null; ran: boolean };

/**
 * One line of the entry grid. `savedId` is null for the trailing blank row;
 * a new blank row appears only once the previous one is saved.
 */
export type FneQualTargetLine = {
	id: string;
	savedId: number | null;
	quality_id: number | null;
	process: string | null;
	eff_pc: string;
	status_id: number;
};

/** Save + Approve only, per row: 21 Drafted (editable) -> 3 Approved (locked). */
export const FNE_QUAL_TARGET_STATUS = { DRAFT: 21, APPROVED: 3 } as const;

/**
 * Save payload — mirrors `ejm_wages_fne_qual_target` (eff_pc is DECIMAL(6,2)).
 * The backend re-validates and keys rows on (period_id, dept_id, quality_id, process);
 * `id` names a saved row so its process can be modified.
 */
export const fneQualTargetSaveSchema = z.object({
	period_id: z.number().int().positive("Select a fortnight period"),
	dept_id: z.number().int().positive("Select a department"),
	approve: z.boolean(),
	lines: z.array(
		z.object({
			id: z.number().int().positive().nullable(),
			quality_id: z.number().int().positive(),
			process: z.string().nullable(),
			eff_pc: z
				.number("Target Prod/Eff(5) must be a number")
				.min(-9999.99, "Target Prod/Eff(5) is out of range")
				.max(9999.99, "Target Prod/Eff(5) is out of range"),
		})
	),
});

export type FneQualTargetSavePayload = z.infer<typeof fneQualTargetSaveSchema>;
