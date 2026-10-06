import { z } from "zod";

export type Option = { value: number; label: string };

/** A Beaming / Press machine; its department picks the quality master. */
export type MachineOption = Option & { dept_id: number };

export type GroupProductionSetup = {
	machines: MachineOption[];
	shifts: Option[];
	/** dept_id (as string) -> that department's qualities. */
	qualities_by_dept: Record<string, Option[]>;
};

/** Index row: one fortnight with saved rows. */
export type GroupProductionPeriodRow = {
	id: number;
	period_id: number;
	start_date: string | null;
	end_date: string | null;
	row_count: number;
	total_production: number | null;
};

/** Numeric columns of `ejm_fne_group_production`, all DECIMAL(10,3). */
export const NUMBER_FIELDS = [
	{ key: "production", label: "Production", readOnly: false },
	{ key: "target_prod", label: "Target Prod", readOnly: true },
	{ key: "max_target_production", label: "Max Target Prod", readOnly: true },
	{ key: "conv_production", label: "Conv Production", readOnly: true },
] as const;

export type NumberField = (typeof NUMBER_FIELDS)[number]["key"];

/** One entry line; `savedId` null = the trailing blank row (appears after each save). */
export type GroupProductionLine = {
	id: string;
	savedId: number | null;
	machine_id: number | null;
	shift_id: number | null;
	quality_id: number | null;
} & Record<NumberField, string>;

const decimal = (label: string) =>
	z
		.number(`${label} must be a number`)
		.min(-9999999.999, `${label} is out of range`)
		.max(9999999.999, `${label} is out of range`)
		.nullable();

/** Save payload for one row; the backend re-validates machine/shift/quality scope. */
export const groupProductionSaveSchema = z.object({
	period_id: z.number().int().positive("Select a fortnight period"),
	branch_id: z.number().int().positive("Select a branch"),
	grp_prod_id: z.number().int().positive().nullable(),
	machine_id: z.number("Select a machine").int().positive("Select a machine"),
	shift_id: z.number("Select a shift").int().positive("Select a shift"),
	quality_id: z.number("Select a quality").int().positive("Select a quality"),
	production: decimal("Production"),
	target_prod: decimal("Target Prod"),
	max_target_production: decimal("Max Target Prod"),
	conv_production: decimal("Conv Production"),
});

export type GroupProductionSavePayload = z.infer<typeof groupProductionSaveSchema>;
