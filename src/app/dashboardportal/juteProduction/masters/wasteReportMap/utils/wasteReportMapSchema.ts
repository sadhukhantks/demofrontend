// Zod schema + pure helpers for the Wastage Report Mapping add / edit dialog
// (TKT-000183). The schema is the single source of truth for the form type and
// its validation; the backend re-checks every rule (and owns the company-scope
// and duplicate guards).
//
// Select fields are held as strings (ids / codes) like the other jute masters;
// they are converted to the API's types only in `buildWasteReportMapPayload`.

import { z } from "zod";
import type {
	WasteReportGroup,
	WasteReportMapPayload,
	WasteReportMapRow,
} from "@/utils/wasteReportMapService";

/** Group picker value that reveals the Group code + Group name inputs. */
export const NEW_GROUP_VALUE = "__new__";

/** The report's unmapped band — never a user group. Mirrors backend WASTE_REPORT_OTHER_GROUP. */
export const RESERVED_GROUP_CODE = "OTHER";

export const GROUP_CODE_PATTERN = /^[A-Z0-9_]{1,40}$/;
export const GROUP_NAME_MAX = 100;
export const COL_LABEL_MAX = 100;
export const DISPLAY_ORDER_MAX = 99999;

/** Trim + uppercase, the way the backend stores a group code. */
export function normalizeGroupCode(raw: string): string {
	return raw.trim().toUpperCase();
}

/**
 * Build the dialog schema. `existingGroupCodes` lets a "New group" whose code
 * already exists be caught here, pointing the user at the Group list instead.
 */
export function buildWasteReportMapSchema(existingGroupCodes: readonly string[]) {
	const existing = new Set(existingGroupCodes.map(normalizeGroupCode));
	return z
		.object({
			group_choice: z.string().min(1, "Select a group or choose New group…"),
			group_code: z.string(),
			group_name: z
				.string()
				.trim()
				.min(1, "Group name is required")
				.max(GROUP_NAME_MAX, `Group name cannot exceed ${GROUP_NAME_MAX} characters`),
			day_denom: z.string().min(1, "Select the daily % base"),
			total_denom: z.string().min(1, "Select the monthly % base"),
			display_order: z
				.string()
				.min(1, "Display order is required")
				.refine((v) => /^\d+$/.test(v.trim()), { message: "Use a whole number of 0 or more" })
				.refine((v) => Number(v) <= DISPLAY_ORDER_MAX, {
					message: `Display order cannot exceed ${DISPLAY_ORDER_MAX}`,
				}),
			item_id: z.string().min(1, "Select a waste item"),
			/** "" = any department. */
			dept_id: z.string(),
			col_label: z
				.string()
				.max(COL_LABEL_MAX, `Column label cannot exceed ${COL_LABEL_MAX} characters`),
		})
		.superRefine((values, ctx) => {
			if (values.group_choice !== NEW_GROUP_VALUE) return;
			const code = normalizeGroupCode(values.group_code);
			if (!code) {
				ctx.addIssue({ code: "custom", path: ["group_code"], message: "Group code is required" });
			} else if (!GROUP_CODE_PATTERN.test(code)) {
				ctx.addIssue({
					code: "custom",
					path: ["group_code"],
					message: "Letters, digits and underscore only (max 40)",
				});
			} else if (code === RESERVED_GROUP_CODE) {
				ctx.addIssue({
					code: "custom",
					path: ["group_code"],
					message: `"${RESERVED_GROUP_CODE}" is reserved for the report's unmapped band`,
				});
			} else if (existing.has(code)) {
				ctx.addIssue({
					code: "custom",
					path: ["group_code"],
					message: "This group already exists — pick it from the Group list",
				});
			}
		});
}

export type WasteReportMapFormValues = z.infer<ReturnType<typeof buildWasteReportMapSchema>>;

/** Next free display order: 10 past the last group (seeds use steps of 10). */
export function suggestNextDisplayOrder(groups: readonly WasteReportGroup[]): number {
	if (groups.length === 0) return 10;
	const max = Math.max(...groups.map((g) => Number(g.display_order) || 0));
	return Math.min(DISPLAY_ORDER_MAX, Math.floor(max / 10) * 10 + 10);
}

/** Blank form for "Add mapping". */
export function blankFormValues(): WasteReportMapFormValues {
	return {
		group_choice: "",
		group_code: "",
		group_name: "",
		day_denom: "",
		total_denom: "",
		display_order: "",
		item_id: "",
		dept_id: "",
		col_label: "",
	};
}

/** Lift a grid row into the dialog. The row's own group fields are used. */
export function rowToFormValues(row: WasteReportMapRow): WasteReportMapFormValues {
	return {
		group_choice: row.group_code,
		group_code: "",
		group_name: row.group_name ?? "",
		day_denom: row.day_denom ?? "",
		total_denom: row.total_denom ?? "",
		display_order: String(row.display_order ?? 0),
		item_id: String(row.item_id),
		dept_id: row.dept_id == null ? "" : String(row.dept_id),
		col_label: row.col_label ?? "",
	};
}

/**
 * Group-level fields to prefill when the Group picker changes: an existing
 * group's definition, or blanks (with a suggested order) for a new group.
 */
export function groupDefaults(
	choice: string,
	groups: readonly WasteReportGroup[],
): Pick<WasteReportMapFormValues, "group_name" | "day_denom" | "total_denom" | "display_order"> {
	const group = groups.find((g) => g.group_code === choice);
	if (group) {
		return {
			group_name: group.group_name ?? "",
			day_denom: group.day_denom ?? "",
			total_denom: group.total_denom ?? "",
			display_order: String(group.display_order ?? 0),
		};
	}
	return {
		group_name: "",
		day_denom: "",
		total_denom: "",
		display_order: choice === NEW_GROUP_VALUE ? String(suggestNextDisplayOrder(groups)) : "",
	};
}

/** POST /create body (POST /update adds `waste_report_map_id`). */
export function buildWasteReportMapPayload(
	values: WasteReportMapFormValues,
	coId: number,
): WasteReportMapPayload {
	const colLabel = values.col_label.trim();
	return {
		co_id: coId,
		group_code:
			values.group_choice === NEW_GROUP_VALUE
				? normalizeGroupCode(values.group_code)
				: values.group_choice,
		group_name: values.group_name.trim(),
		day_denom: values.day_denom,
		total_denom: values.total_denom,
		item_id: Number(values.item_id),
		dept_id: values.dept_id === "" ? null : Number(values.dept_id),
		col_label: colLabel === "" ? null : colLabel,
		display_order: Number(values.display_order.trim()),
	};
}

/** Grid / dialog text for a row's department: "Any department" when NULL, else "dept — branch". */
export function departmentLabel(
	row: Pick<WasteReportMapRow, "dept_id" | "dept_desc" | "branch_name">,
): string {
	if (row.dept_id == null) return "Any department";
	const dept = row.dept_desc ?? `Department ${row.dept_id}`;
	return row.branch_name ? `${dept} — ${row.branch_name}` : dept;
}
