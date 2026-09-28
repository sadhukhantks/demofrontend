import { z } from "zod";

/** Row shape the DataGrid renders (mapped from the API response). */
export type EffCodeRow = {
	id: number;
	eff_code_type_id: number;
	effocode: string;
	code_details: string;
	eff_pc: number | null;
};

/**
 * Single source of truth for the create/edit payload — mirrors the
 * `ejm_eff_code_type` columns (effocode VARCHAR(10), code_details VARCHAR(100),
 * eff_pc DECIMAL(6,2)). The backend re-validates the same rules.
 */
export const effCodeSchema = z.object({
	effocode: z
		.string()
		.trim()
		.min(1, "Efficiency code is required")
		.max(10, "Efficiency code must be 10 characters or less"),
	code_details: z.string().trim().max(100, "Code details must be 100 characters or less"),
	eff_pc: z
		.number("Efficiency % must be a number")
		.min(-9999.99, "Efficiency % is out of range")
		.max(9999.99, "Efficiency % is out of range")
		.nullable(),
});

export type EffCodeInput = z.infer<typeof effCodeSchema>;
