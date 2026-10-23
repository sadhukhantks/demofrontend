import { describe, expect, it } from "vitest";
import type { CostParamCodeOption, CostParamRow } from "./_service";
import {
	emptyForm,
	fmtParamValue,
	fromRow,
	isDateMoved,
	isFutureDated,
	isProductScoped,
	makeCostParamFormSchema,
	productScopedCodes,
	toPayload,
	toUpdatePayload,
	uomOf,
	type CostParamFormValues,
} from "./_schema";

const SETUP_CODES: CostParamCodeOption[] = [
	{ code: "REALISATION_PER_T", label: "Realisation per tonne", uom: "₹/t", product_scoped: true },
	{ code: "WAGE_PER_HAND_DAY", label: "Wage per hand-day", uom: "₹/hand-day", product_scoped: false },
];
const SCOPED = productScopedCodes(SETUP_CODES);
const costParamFormSchema = makeCostParamFormSchema(SCOPED);

const base: CostParamFormValues = {
	...emptyForm("2026-10-18"),
	param_code: "WAGE_PER_HAND_DAY",
	param_value: 400,
	uom: "₹/hand-day",
};

type Parsed = ReturnType<typeof costParamFormSchema.safeParse>;

function messageAt(r: Parsed, path: string): string | undefined {
	return r.success ? undefined : r.error.issues.find((i) => i.path[0] === path)?.message;
}

describe("productScopedCodes", () => {
	it("reads the backend flag, so a new scoped code needs no frontend change", () => {
		expect([...SCOPED]).toEqual(["REALISATION_PER_T"]);
		expect(isProductScoped("REALISATION_PER_T", SCOPED)).toBe(true);
		expect(isProductScoped("WAGE_PER_HAND_DAY", SCOPED)).toBe(false);
		const more = productScopedCodes([
			...SETUP_CODES,
			{ code: "JUTE_PER_KG_CLOTH", label: "Jute per kg of cloth", uom: "kg/kg", product_scoped: true },
		]);
		expect(isProductScoped("JUTE_PER_KG_CLOTH", more)).toBe(true);
		const schema = makeCostParamFormSchema(more);
		expect(messageAt(schema.safeParse({ ...base, param_code: "JUTE_PER_KG_CLOTH", product: null }), "product")).toBe(
			"Pick a product for this parameter"
		);
	});
});

describe("costParamFormSchema", () => {
	it("needs a product only for a product-scoped code", () => {
		expect(costParamFormSchema.safeParse(base).success).toBe(true);
		const missing = costParamFormSchema.safeParse({ ...base, param_code: "REALISATION_PER_T", product: null });
		expect(missing.success).toBe(false);
		expect(messageAt(missing, "product")).toBe("Pick a product for this parameter");
		expect(
			costParamFormSchema.safeParse({ ...base, param_code: "REALISATION_PER_T", product: "SACKING" }).success
		).toBe(true);
	});

	it("rejects a negative value with the friendly message", () => {
		const r = costParamFormSchema.safeParse({ ...base, param_value: -1 });
		expect(r.success).toBe(false);
		expect(messageAt(r, "param_value")).toBe("Value cannot be negative");
	});

	it("asks for a value when nothing was typed (NaN) and accepts zero", () => {
		const r = costParamFormSchema.safeParse({ ...base, param_value: Number.NaN });
		expect(r.success).toBe(false);
		expect(messageAt(r, "param_value")).toBe("Enter a value");
		expect(costParamFormSchema.safeParse({ ...base, param_value: 0 }).success).toBe(true);
	});

	it("needs a parameter and a dated row", () => {
		expect(messageAt(costParamFormSchema.safeParse({ ...base, param_code: "" }), "param_code")).toBe(
			"Pick a parameter"
		);
		expect(messageAt(costParamFormSchema.safeParse({ ...base, effective_date: "" }), "effective_date")).toBe(
			"Pick an effective date"
		);
	});
});

describe("toPayload", () => {
	it("maps the scope switch to branch_id (null = all branches)", () => {
		expect(toPayload({ ...base, scope_branch: false }, 1, 2, SCOPED).branch_id).toBeNull();
		expect(toPayload({ ...base, scope_branch: true }, 1, 2, SCOPED).branch_id).toBe(2);
		expect(toPayload(base, 1, 2, SCOPED).co_id).toBe(1);
	});

	it("strips the product for a non-scoped code and keeps it for a scoped one", () => {
		expect(toPayload({ ...base, product: "SACKING" }, 1, 2, SCOPED).product).toBeNull();
		expect(
			toPayload({ ...base, param_code: "REALISATION_PER_T", product: "SACKING" }, 1, 2, SCOPED).product
		).toBe("SACKING");
	});

	it("passes the number through once and turns blanks into null", () => {
		const p = toPayload({ ...base, param_value: 182000, source: "  ", remarks: " proxy " }, 1, 2, SCOPED);
		expect(p.param_value).toBe(182000);
		expect(typeof p.param_value).toBe("number");
		expect(p.source).toBeNull();
		expect(p.remarks).toBe("proxy");
		expect(p.uom).toBe("₹/hand-day");
	});
});

describe("edit mapping", () => {
	const row: CostParamRow = {
		cost_param_id: 5,
		co_id: 1,
		branch_id: 2,
		branch_name: "Factory",
		scope: "branch",
		effective_date: "2026-10-01",
		param_code: "WAGE_PER_HAND_DAY",
		param_label: "Wage per hand-day",
		param_value: 400,
		uom: "₹/hand-day",
		product: null,
		source: "proxy",
		remarks: null,
		active: 1,
		in_force: true,
	};

	it("fromRow fills the form and toUpdatePayload sends only the editable fields", () => {
		const f = fromRow(row);
		expect(f).toMatchObject({ param_code: "WAGE_PER_HAND_DAY", scope_branch: true, active: true, param_value: 400 });
		const u = toUpdatePayload({ ...f, param_value: 420, active: false }, row);
		expect(u).toEqual({
			effective_date: "2026-10-01",
			param_value: 420,
			uom: "₹/hand-day",
			source: "proxy",
			remarks: null,
			active: 0,
		});
		expect("param_code" in u).toBe(false);
		expect("branch_id" in u).toBe(false);
	});

	it("drops `active` when the date moves — the backend files a new ACTIVE row then", () => {
		const f = fromRow(row);
		expect(isDateMoved("2026-10-18", row)).toBe(true);
		expect(isDateMoved("2026-10-01", row)).toBe(false);
		expect(isDateMoved("2026-10-18", null)).toBe(false);
		const u = toUpdatePayload({ ...f, effective_date: "2026-10-18", param_value: 420, active: false }, row);
		expect(u).toEqual({
			effective_date: "2026-10-18",
			param_value: 420,
			uom: "₹/hand-day",
			source: "proxy",
			remarks: null,
		});
		expect("active" in u).toBe(false);
	});

	it("an all-branch row opens with the scope switch off", () => {
		expect(fromRow({ ...row, branch_id: null, scope: "all" }).scope_branch).toBe(false);
	});
});

describe("display helpers", () => {
	it("isFutureDated compares ISO dates", () => {
		expect(isFutureDated("2026-11-01", "2026-10-19")).toBe(true);
		expect(isFutureDated("2026-10-19", "2026-10-19")).toBe(false);
		expect(isFutureDated("2026-10-01", "2026-10-19")).toBe(false);
	});

	it("uomOf reads the setup list", () => {
		expect(uomOf("WAGE_PER_HAND_DAY", SETUP_CODES)).toBe("₹/hand-day");
		expect(uomOf("NOPE", SETUP_CODES)).toBe("");
	});

	it("fmtParamValue keeps small factors to 4 dp and money to 2 dp", () => {
		expect(fmtParamValue(1.12)).toBe("1.12");
		expect(fmtParamValue(1.1234)).toBe("1.1234");
		expect(fmtParamValue(14)).toBe("14.00");
		expect(fmtParamValue(182000)).toBe("1,82,000.00");
		expect(fmtParamValue(null)).toBe("—");
	});
});
