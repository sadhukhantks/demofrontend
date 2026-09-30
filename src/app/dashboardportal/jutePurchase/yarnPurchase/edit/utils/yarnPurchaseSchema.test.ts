import { describe, expect, it } from "vitest";

import { collectFieldErrors, formatIssues, yarnPurchaseSchema } from "./yarnPurchaseSchema";

const validLine = {
	item_id: 335556,
	package_type: "BALE",
	no_of_packages: 10,
	wt_per_package: 50,
	weight_kg: 500,
	rate_per_kg: 81,
	remarks: null,
};

const valid = {
	co_id: 1,
	branch_id: 29,
	tran_date: "2026-09-25",
	party_id: 5,
	challan_no: "CH-1",
	challan_date: "2026-09-24",
	vehicle_no: "WB11A1234",
	remarks: null,
	lines: [validLine],
};

describe("yarnPurchaseSchema", () => {
	it("accepts a complete purchase", () => {
		const result = yarnPurchaseSchema.safeParse(valid);
		expect(result.success).toBe(true);
	});

	it("accepts nulls for every optional field", () => {
		const result = yarnPurchaseSchema.safeParse({
			...valid,
			party_id: null,
			challan_no: null,
			challan_date: null,
			vehicle_no: null,
			remarks: null,
			lines: [{ item_id: 1, package_type: null, no_of_packages: null, wt_per_package: null, weight_kg: 0.5, rate_per_kg: null, remarks: null }],
		});
		expect(result.success).toBe(true);
	});

	it("turns an empty challan date into null", () => {
		const result = yarnPurchaseSchema.safeParse({ ...valid, challan_date: "" });
		expect(result.success).toBe(true);
		if (result.success) expect(result.data.challan_date).toBeNull();
	});

	it("requires tran_date", () => {
		const result = yarnPurchaseSchema.safeParse({ ...valid, tran_date: "" });
		expect(result.success).toBe(false);
		if (!result.success) expect(collectFieldErrors(result.error).tran_date).toBe("Date is required");
	});

	it("requires at least one line", () => {
		const result = yarnPurchaseSchema.safeParse({ ...valid, lines: [] });
		expect(result.success).toBe(false);
		if (!result.success) expect(formatIssues(result.error)).toEqual(["Lines: Add at least one yarn line"]);
	});

	it("requires weight_kg > 0", () => {
		const result = yarnPurchaseSchema.safeParse({ ...valid, lines: [{ ...validLine, weight_kg: 0 }] });
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(formatIssues(result.error)).toEqual(["Line 1 (Weight (kg)): Weight (kg) must be greater than 0"]);
		}
	});

	it("requires an item on every line, numbering the offending line", () => {
		const result = yarnPurchaseSchema.safeParse({ ...valid, lines: [validLine, { ...validLine, item_id: null }] });
		expect(result.success).toBe(false);
		if (!result.success) expect(formatIssues(result.error)).toEqual(["Line 2 (Yarn Item): Yarn item is required"]);
	});

	it("rejects negative packages, wt/package and rate", () => {
		const result = yarnPurchaseSchema.safeParse({
			...valid,
			lines: [{ ...validLine, no_of_packages: -1, wt_per_package: -2, rate_per_kg: -3 }],
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(formatIssues(result.error)).toEqual([
				"Line 1 (No. of Packages): Cannot be negative",
				"Line 1 (Wt / Package): Cannot be negative",
				"Line 1 (Rate / kg): Cannot be negative",
			]);
		}
	});

	it("rejects a missing branch", () => {
		const result = yarnPurchaseSchema.safeParse({ ...valid, branch_id: 0 });
		expect(result.success).toBe(false);
		if (!result.success) expect(collectFieldErrors(result.error).branch_id).toBe("Branch is required");
	});
});
