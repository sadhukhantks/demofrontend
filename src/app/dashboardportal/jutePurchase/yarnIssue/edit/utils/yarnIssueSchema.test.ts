import { describe, expect, it } from "vitest";

import { buildYarnIssueSchema, collectFieldErrors, collectLineErrors, formatIssues, yarnIssueSchema } from "./yarnIssueSchema";

const validLine = {
	item_id: 335556,
	yarn_purchase_li_id: 101,
	no_of_packages: 2,
	weight_kg: 98.5,
	remarks: null,
};

const valid = {
	co_id: 1,
	branch_id: 29,
	tran_date: "2026-09-25",
	issue_type: "ISSUE" as const,
	dept_id: 3,
	remarks: null,
	lines: [validLine],
};

describe("yarnIssueSchema (structure)", () => {
	it("accepts a complete issue", () => {
		expect(yarnIssueSchema.safeParse(valid).success).toBe(true);
	});

	it("accepts a return with nulls for every optional field", () => {
		const result = yarnIssueSchema.safeParse({
			...valid,
			issue_type: "RETURN",
			remarks: null,
			lines: [{ item_id: 1, yarn_purchase_li_id: 2, no_of_packages: null, weight_kg: 0.5, remarks: null }],
		});
		expect(result.success).toBe(true);
	});

	it("requires tran_date, type and department", () => {
		const result = yarnIssueSchema.safeParse({ ...valid, tran_date: "", issue_type: null, dept_id: null });
		expect(result.success).toBe(false);
		if (!result.success) {
			const errors = collectFieldErrors(result.error);
			expect(errors.tran_date).toBe("Date is required");
			expect(errors.issue_type).toBe("Type is required");
			expect(errors.dept_id).toBe("Department is required");
		}
	});

	it("requires at least one line", () => {
		const result = yarnIssueSchema.safeParse({ ...valid, lines: [] });
		expect(result.success).toBe(false);
		if (!result.success) expect(formatIssues(result.error)).toEqual(["Lines: Add at least one yarn line"]);
	});

	it("requires the purchase lot on every line, numbering the offending line", () => {
		const result = yarnIssueSchema.safeParse({ ...valid, lines: [validLine, { ...validLine, yarn_purchase_li_id: null }] });
		expect(result.success).toBe(false);
		if (!result.success) expect(formatIssues(result.error)).toEqual(["Line 2 (Purchase Lot): Purchase lot is required"]);
	});

	it("requires weight_kg > 0", () => {
		const result = yarnIssueSchema.safeParse({ ...valid, lines: [{ ...validLine, weight_kg: 0 }] });
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(formatIssues(result.error)).toEqual(["Line 1 (Weight (kg)): Weight (kg) must be greater than 0"]);
			expect(collectLineErrors(result.error).get(0)?.weight_kg).toBe("Weight (kg) must be greater than 0");
		}
	});

	it("rejects negative packages and a missing branch", () => {
		const result = yarnIssueSchema.safeParse({ ...valid, branch_id: 0, lines: [{ ...validLine, no_of_packages: -1 }] });
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(collectFieldErrors(result.error).branch_id).toBe("Branch is required");
			expect(formatIssues(result.error)).toContain("Line 1 (No. of Packages): Cannot be negative");
		}
	});
});

describe("buildYarnIssueSchema (lot balance rule)", () => {
	const lotBalances = new Map<number, number>([
		[101, 100],
		[102, 40],
	]);
	const lotLabels = new Map<number, string>([[101, "PUR-24/25-0001"]]);
	const schema = buildYarnIssueSchema({ lotBalances, lotLabels });

	it("an ISSUE within the lot balance passes", () => {
		expect(schema.safeParse({ ...valid, lines: [{ ...validLine, weight_kg: 100 }] }).success).toBe(true);
	});

	it("an ISSUE over the lot balance fails on the weight of every line on that lot", () => {
		const result = schema.safeParse({
			...valid,
			lines: [
				{ ...validLine, weight_kg: 60 },
				{ ...validLine, weight_kg: 50 },
				{ ...validLine, yarn_purchase_li_id: 102, weight_kg: 40 },
			],
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const messages = formatIssues(result.error);
			expect(messages).toHaveLength(2);
			expect(messages[0]).toBe(
				"Line 1 (Weight (kg)): Exceeds the godown balance of PUR-24/25-0001: 110.00 kg on this document against 100.00 kg available (over by 10.00 kg)",
			);
			expect(messages[1]).toMatch(/^Line 2 \(Weight \(kg\)\): Exceeds the godown balance/);
		}
	});

	it("a RETURN over the balance passes (backend only warns)", () => {
		const result = schema.safeParse({ ...valid, issue_type: "RETURN", lines: [{ ...validLine, weight_kg: 5000 }] });
		expect(result.success).toBe(true);
	});

	it("an ISSUE on a lot with no known balance is left to the backend", () => {
		const result = schema.safeParse({ ...valid, lines: [{ ...validLine, yarn_purchase_li_id: 999, weight_kg: 5000 }] });
		expect(result.success).toBe(true);
	});

	it("falls back to the lot id when no label is known", () => {
		const result = schema.safeParse({ ...valid, lines: [{ ...validLine, yarn_purchase_li_id: 102, weight_kg: 41 }] });
		expect(result.success).toBe(false);
		if (!result.success) expect(formatIssues(result.error)[0]).toContain("lot #102");
	});
});
