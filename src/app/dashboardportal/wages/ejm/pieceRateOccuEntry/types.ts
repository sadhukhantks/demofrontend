import { z } from "zod";

/** A designation offered by the picker, carrying its department's legacy code. */
export type DesignationOption = {
	desig_id: number;
	desig: string;
	dept_id: number;
	dept_desc: string;
	/** Equals the legacy FoxPro DEPTCODE, so dept_code is never typed by hand. */
	dept_code: string;
};

/** Row shape the DataGrid renders. */
export type PieceRateRow = {
	id: number;
	p_occu_id: number;
	dept_code: string;
	occu_code: string;
	f_b_rate: number;
	dept_id: number | null;
	dept_desc: string;
	desig_id: number | null;
	desig: string;
};

/**
 * Create/edit payload. dept_code and dept_id are derived server-side from the
 * chosen designation, so they are deliberately absent here; occu_code mirrors
 * the CHAR(2) column and f_b_rate the DECIMAL(10,6) one.
 */
export const pieceRateSchema = z.object({
	desig_id: z.number().int().positive("Designation is required"),
	occu_code: z
		.string()
		.trim()
		.min(1, "Occupation code is required")
		.max(2, "Occupation code must be 2 characters or less"),
	f_b_rate: z
		.number("F/B rate must be a number")
		.min(-9999.999999, "F/B rate is out of range")
		.max(9999.999999, "F/B rate is out of range"),
});

export type PieceRateInput = z.infer<typeof pieceRateSchema>;
