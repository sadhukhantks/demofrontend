import { z } from "zod";
import type { Option } from "../fneGroupProduction/types";

/** A Beaming / Press machine; its department is saved as the row's dept_id. */
export type McHoursMachineOption = Option & { dept_id: number; dept_desc: string };

export type McHoursSetup = {
	machines: McHoursMachineOption[];
	shifts: Option[];
};

/** Index row: one fortnight with saved rows. */
export type McHoursPeriodRow = {
	id: number;
	period_id: number;
	start_date: string | null;
	end_date: string | null;
	row_count: number;
	total_mc_hours: number | null;
	total_idle_hours: number | null;
};

/** One entry line; `savedId` null = the trailing blank row (appears after each save). */
export type McHoursLine = {
	id: string;
	savedId: number | null;
	machine_id: number | null;
	shift_id: number | null;
	mc_hours: string;
	idle_hours: string;
};

const hours = (label: string) =>
	z
		.number(`${label} must be a number`)
		.min(-9999999.999, `${label} is out of range`)
		.max(9999999.999, `${label} is out of range`)
		.nullable();

/** Save payload for one row (DECIMAL(10,3) hours); the backend re-validates scope. */
export const mcHoursSaveSchema = z.object({
	period_id: z.number().int().positive("Select a fortnight period"),
	branch_id: z.number().int().positive("Select a branch"),
	grp_mc_hrs_id: z.number().int().positive().nullable(),
	machine_id: z.number("Select a machine").int().positive("Select a machine"),
	shift_id: z.number("Select a shift").int().positive("Select a shift"),
	mc_hours: hours("MC Hours"),
	idle_hours: hours("Idle Hours"),
});
