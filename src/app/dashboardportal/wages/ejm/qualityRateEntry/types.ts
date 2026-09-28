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
export type QualityRateRow = {
	id: number;
	wages_quality_rate_id: number;
	dept_id: number | null;
	dept_desc: string;
	quality_id: number | null;
	q_code: string;
	quality: string;
	quality_rate: number | null;
};

/**
 * Create/edit payload — mirrors `ejm_wages_quality_rate` (quality_rate is
 * DECIMAL(10,6)). The backend re-validates and enforces one rate per
 * (dept_id, quality_id), since the table carries no unique key.
 */
export const qualityRateSchema = z.object({
	dept_id: z.number().int().positive("Department is required"),
	quality_id: z.number().int().positive("Wages quality is required"),
	quality_rate: z
		.number("Quality rate must be a number")
		.min(-9999.999999, "Quality rate is out of range")
		.max(9999.999999, "Quality rate is out of range"),
});

export type QualityRateInput = z.infer<typeof qualityRateSchema>;
