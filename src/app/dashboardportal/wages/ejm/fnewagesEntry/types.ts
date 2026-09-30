import { z } from "zod";

/** A department from `prod_wages_link_setup` — only weaving/winding/finishing/beaming ones. */
export type QualityDepartmentOption = {
	value: string;
	label: string;
	quality_type: string;
};

/** Index row: one saved (fortnight, department) entry. */
export type FneQualTargetEntryRow = {
	id: string;
	period_id: number;
	start_date: string | null;
	end_date: string | null;
	dept_id: number;
	dept_desc: string;
	quality_count: number;
	approved_count: number;
};

/** A quality from the department's own quality master (weaving/winding/finishing/beaming). */
export type QualityOption = { value: number; label: string };

/**
 * One line of the entry grid. `savedId` is null for the trailing blank row;
 * a new blank row appears only once the previous one is saved.
 */
export type FneQualTargetLine = {
	id: string;
	savedId: number | null;
	quality_it: number | null;
	eff_pc: string;
	status_id: number;
};

/** Save + Approve only, per row: 21 Drafted (editable) -> 3 Approved (locked). */
export const FNE_QUAL_TARGET_STATUS = { DRAFT: 21, APPROVED: 3 } as const;

/**
 * Save payload — mirrors `ejm_wages_fne_qual_target` (eff_pc is DECIMAL(6,2)).
 * The backend re-validates and keys rows on (period_id, dept_id, quality_it).
 */
export const fneQualTargetSaveSchema = z.object({
	period_id: z.number().int().positive("Select a fortnight period"),
	dept_id: z.number().int().positive("Select a department"),
	approve: z.boolean(),
	lines: z.array(
		z.object({
			quality_it: z.number().int().positive(),
			eff_pc: z
				.number("Target Prod/Eff(5) must be a number")
				.min(-9999.99, "Target Prod/Eff(5) is out of range")
				.max(9999.99, "Target Prod/Eff(5) is out of range"),
		})
	),
});

export type FneQualTargetSavePayload = z.infer<typeof fneQualTargetSaveSchema>;
