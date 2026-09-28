import { z } from "zod";

/** A department in the sidebar's branch scope. */
export type DepartmentOption = {
	dept_id: number;
	dept_desc: string;
	dept_code: string | null;
	branch_id: number;
};

/** A wages-quality rate card from `tbl_wages_quality_master`. */
export type WagesQualityOption = {
	q_code_id: number;
	q_code: string;
	quality: string;
	master_dept_id: number | null;
};

/** Row shape the DataGrid renders. */
export type FneQualTargetRow = {
	id: number;
	fne_qual_traget_id: number;
	dept_id: number | null;
	dept_desc: string;
	quality_it: number | null;
	q_code: string;
	quality: string;
	eff_pc: number | null;
};

/**
 * Create/edit payload — mirrors `ejm_wages_fne_qual_target` (eff_pc is
 * DECIMAL(6,2)). The backend re-validates and enforces one target per
 * (dept_id, quality_it), since the table carries no unique key.
 */
export const fneQualTargetSchema = z.object({
	dept_id: z.number().int().positive("Department is required"),
	quality_it: z.number().int().positive("Wages quality is required"),
	eff_pc: z
		.number("Target efficiency % must be a number")
		.min(-9999.99, "Target efficiency % is out of range")
		.max(9999.99, "Target efficiency % is out of range"),
});

export type FneQualTargetInput = z.infer<typeof fneQualTargetSchema>;
