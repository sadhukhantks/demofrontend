import { describe, expect, it } from "vitest";
import type { WasteReportGroup, WasteReportMapRow } from "@/utils/wasteReportMapService";
import {
	NEW_GROUP_VALUE,
	blankFormValues,
	buildWasteReportMapPayload,
	buildWasteReportMapSchema,
	departmentLabel,
	groupDefaults,
	rowToFormValues,
	suggestNextDisplayOrder,
	type WasteReportMapFormValues,
} from "./wasteReportMapSchema";

const GROUPS: WasteReportGroup[] = [
	{
		group_code: "SWEEP",
		group_name: "Spinning Sweep",
		day_denom: "SPINNING",
		total_denom: "SPINNING",
		display_order: 80,
		item_count: 1,
	},
	{
		group_code: "THREAD",
		group_name: "Thread Waste",
		day_denom: "WEAVING",
		total_denom: "SPINNING",
		display_order: 40,
		item_count: 2,
	},
];

const ROW: WasteReportMapRow = {
	waste_report_map_id: 1,
	co_id: 1,
	group_code: "SWEEP",
	group_name: "Spinning Sweep",
	day_denom: "SPINNING",
	day_denom_label: "Spinning production",
	total_denom: "SPINNING",
	total_denom_label: "Spinning production",
	item_id: 270197,
	item_code: "3",
	item_name: "Sweepings",
	dept_id: null,
	dept_desc: null,
	branch_id: null,
	branch_name: null,
	col_label: null,
	display_order: 80,
	active: 1,
	updated_by: 1,
	updated_date_time: "2026-08-26 22:50:02",
};

const schema = buildWasteReportMapSchema(GROUPS.map((g) => g.group_code));

function valid(overrides: Partial<WasteReportMapFormValues> = {}): WasteReportMapFormValues {
	return {
		group_choice: "SWEEP",
		group_code: "",
		group_name: "Spinning Sweep",
		day_denom: "SPINNING",
		total_denom: "SPINNING",
		display_order: "80",
		item_id: "270197",
		dept_id: "",
		col_label: "",
		...overrides,
	};
}

function issuePaths(values: WasteReportMapFormValues): string[] {
	const result = schema.safeParse(values);
	return result.success ? [] : result.error.issues.map((i) => i.path.join("."));
}

describe("buildWasteReportMapSchema", () => {
	it("accepts an existing group with any department", () => {
		expect(issuePaths(valid())).toEqual([]);
	});

	it("requires group, name, both % bases, order and item", () => {
		const paths = issuePaths(blankFormValues());
		expect(paths).toEqual(
			expect.arrayContaining(["group_choice", "group_name", "day_denom", "total_denom", "display_order", "item_id"]),
		);
		expect(paths).not.toContain("dept_id");
		expect(paths).not.toContain("col_label");
	});

	it("validates a new group code", () => {
		const base = valid({ group_choice: NEW_GROUP_VALUE, group_name: "Line Waste" });
		expect(issuePaths({ ...base, group_code: "" })).toContain("group_code");
		expect(issuePaths({ ...base, group_code: "LINE-WASTE" })).toContain("group_code");
		expect(issuePaths({ ...base, group_code: "other" })).toContain("group_code");
		// An existing code must be picked from the list, not re-created.
		expect(issuePaths({ ...base, group_code: "sweep" })).toContain("group_code");
		expect(issuePaths({ ...base, group_code: "line_waste" })).toEqual([]);
	});

	it("ignores group_code for an existing group", () => {
		expect(issuePaths(valid({ group_code: "bad code!" }))).toEqual([]);
	});

	it("rejects a negative, fractional or oversized display order", () => {
		expect(issuePaths(valid({ display_order: "-1" }))).toContain("display_order");
		expect(issuePaths(valid({ display_order: "1.5" }))).toContain("display_order");
		expect(issuePaths(valid({ display_order: "100000" }))).toContain("display_order");
		expect(issuePaths(valid({ display_order: "0" }))).toEqual([]);
	});

	it("rejects a blank group name and an over-long column label", () => {
		expect(issuePaths(valid({ group_name: "   " }))).toContain("group_name");
		expect(issuePaths(valid({ col_label: "x".repeat(101) }))).toContain("col_label");
	});
});

describe("groupDefaults", () => {
	it("prefills an existing group's definition", () => {
		expect(groupDefaults("THREAD", GROUPS)).toEqual({
			group_name: "Thread Waste",
			day_denom: "WEAVING",
			total_denom: "SPINNING",
			display_order: "40",
		});
	});

	it("blanks the fields and suggests the next order for a new group", () => {
		expect(groupDefaults(NEW_GROUP_VALUE, GROUPS)).toEqual({
			group_name: "",
			day_denom: "",
			total_denom: "",
			display_order: "90",
		});
	});

	it("suggests 10 when there are no groups", () => {
		expect(suggestNextDisplayOrder([])).toBe(10);
	});
});

describe("buildWasteReportMapPayload", () => {
	it("uses the chosen group code and NULL department for 'any department'", () => {
		expect(buildWasteReportMapPayload(valid({ col_label: "  " }), 1)).toEqual({
			co_id: 1,
			group_code: "SWEEP",
			group_name: "Spinning Sweep",
			day_denom: "SPINNING",
			total_denom: "SPINNING",
			item_id: 270197,
			dept_id: null,
			col_label: null,
			display_order: 80,
		});
	});

	it("uppercases a new group code and keeps the department", () => {
		const payload = buildWasteReportMapPayload(
			valid({
				group_choice: NEW_GROUP_VALUE,
				group_code: " line_waste ",
				group_name: " Line Waste ",
				dept_id: "3",
				col_label: " Batching ",
				display_order: "15",
			}),
			1,
		);
		expect(payload.group_code).toBe("LINE_WASTE");
		expect(payload.group_name).toBe("Line Waste");
		expect(payload.dept_id).toBe(3);
		expect(payload.col_label).toBe("Batching");
		expect(payload.display_order).toBe(15);
	});
});

describe("rowToFormValues / departmentLabel", () => {
	it("lifts a row into the form with '' for any department", () => {
		expect(rowToFormValues(ROW)).toEqual(valid());
	});

	it("labels departments", () => {
		expect(departmentLabel(ROW)).toBe("Any department");
		expect(departmentLabel({ dept_id: 3, dept_desc: "Batching Dept", branch_name: "Factory" })).toBe(
			"Batching Dept — Factory",
		);
	});
});
