import { z } from "zod";
import type { ApprovalStatusId } from "@/components/ui/transaction";

/** A fortnight period from `forthnight_period_mst`. */
export type ForthnightPeriod = {
	forthnight_id: number;
	start_date: string;
	end_date: string;
	/** 1 = 1st–15th, 2 = 16th–month end. */
	type_of_period: number;
};

/** One efficiency code, with this fortnight's % where one has been entered. */
export type FneEffCodeRow = {
	id: number;
	eff_code_type_id: number;
	/** Numeric code value stored in `ejm_fne_eff_code_type.eff_code`. */
	eff_code: number;
	effocode: string;
	code_details: string;
	default_eff_pc: number | null;
	eff_pc: number | null;
};

/** Save + Approve only: the grid stays editable until the fortnight is Approved (3). */
export const isEditableStatus = (statusId: ApprovalStatusId) => statusId !== 3;

export const STATUS_LABELS: Record<ApprovalStatusId, string> = {
	21: "Drafted",
	1: "Open",
	20: "Pending Approval",
	3: "Approved",
	4: "Rejected",
	5: "Closed",
	6: "Cancelled",
};

/**
 * Save payload — one fortnight and its lines. Mirrors the column limits of
 * `ejm_fne_eff_code_type` (eff_pc DECIMAL(10,3)); the backend re-validates.
 */
export const fneSavePayloadSchema = z.object({
	forthnig_id: z.number().int().positive("Select a fortnight period"),
	lines: z
		.array(
			z.object({
				eff_code: z.number().int("Efficiency code must be a whole number"),
				eff_pc: z
					.number("Efficiency % must be a number")
					.min(-9999999.999, "Efficiency % is out of range")
					.max(9999999.999, "Efficiency % is out of range"),
			})
		)
		.min(1, "Enter an efficiency % for at least one code"),
});

export type FneSavePayload = z.infer<typeof fneSavePayloadSchema>;
