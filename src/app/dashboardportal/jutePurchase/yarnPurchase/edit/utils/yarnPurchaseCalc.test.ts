import { describe, expect, it } from "vitest";

import type { EditableYarnPurchaseLine } from "../types/yarnPurchaseTypes";
import {
	applyLineChange,
	computeAmount,
	computeLine,
	lineHasAnyData,
	packagesWeight,
	sumLines,
	toNumber,
} from "./yarnPurchaseCalc";
import { buildSaveInput, createBlankLine, mapApiLineToEditable } from "./yarnPurchaseMappers";

/**
 * Weight (kg) is the authoritative stock figure. These tests pin the one rule that
 * matters on the floor: packages × wt/package fills the weight box for the operator,
 * but never overwrites a weight they typed themselves.
 */

const line = (overrides: Partial<EditableYarnPurchaseLine> = {}): EditableYarnPurchaseLine => ({
	...createBlankLine(),
	id: "l1",
	...overrides,
});

describe("toNumber / packagesWeight / computeAmount", () => {
	it("parses text-box values and treats blanks and junk as null", () => {
		expect(toNumber("12.5")).toBe(12.5);
		expect(toNumber(" 7 ")).toBe(7);
		expect(toNumber("")).toBeNull();
		expect(toNumber("abc")).toBeNull();
		expect(toNumber(null)).toBeNull();
		expect(toNumber(Number.NaN)).toBeNull();
	});

	it("derives packages × wt/package only when both are positive", () => {
		expect(packagesWeight({ noOfPackages: 10, wtPerPackage: 50 })).toBe(500);
		expect(packagesWeight({ noOfPackages: "3", wtPerPackage: "33.333" })).toBe(100);
		expect(packagesWeight({ noOfPackages: 0, wtPerPackage: 50 })).toBeNull();
		expect(packagesWeight({ noOfPackages: 10, wtPerPackage: "" })).toBeNull();
	});

	it("amount is kg / 100 × rate per quintal, rounded to 2 dp", () => {
		expect(computeAmount(1234.5, 8100)).toBe(99994.5);
		expect(computeAmount("333.333", "100")).toBe(333.33);
		expect(computeAmount(500, null)).toBeNull();
		expect(computeAmount(null, 8100)).toBeNull();
	});
});

describe("computeLine", () => {
	it("auto-fills weight from packages when the weight is empty", () => {
		expect(computeLine({ noOfPackages: 10, wtPerPackage: 50, weightKg: "", ratePerQtl: null, weightAutoFilled: false })).toEqual({
			weightKg: 500,
			weightAutoFilled: true,
			amount: null,
		});
	});

	it("keeps a manually typed weight even though packages would give a different figure", () => {
		const result = computeLine({ noOfPackages: 10, wtPerPackage: 50, weightKg: 498.5, ratePerQtl: 8000, weightAutoFilled: false });
		expect(result.weightKg).toBe(498.5);
		expect(result.weightAutoFilled).toBe(false);
		expect(result.amount).toBe(39880);
	});

	it("re-derives an auto-filled weight when packages change", () => {
		const result = computeLine({ noOfPackages: 12, wtPerPackage: 50, weightKg: 500, ratePerQtl: null, weightAutoFilled: true });
		expect(result.weightKg).toBe(600);
		expect(result.weightAutoFilled).toBe(true);
	});

	it("leaves weight unknown when nothing can be derived", () => {
		expect(computeLine({ noOfPackages: "", wtPerPackage: "", weightKg: "", ratePerQtl: 8100, weightAutoFilled: true })).toEqual({
			weightKg: null,
			weightAutoFilled: true,
			amount: null,
		});
	});
});

describe("applyLineChange", () => {
	it("typing packages then wt/package fills the weight box", () => {
		let next = applyLineChange(line(), "noOfPackages", "10");
		expect(next.weightKg).toBe("");
		next = applyLineChange(next, "wtPerPackage", "50");
		expect(next.weightKg).toBe("500");
		expect(next.weightAutoFilled).toBe(true);
	});

	it("a typed weight becomes authoritative and stops following packages", () => {
		let next = applyLineChange(line({ noOfPackages: "10", wtPerPackage: "50", weightKg: "500" }), "weightKg", "498.5");
		expect(next.weightAutoFilled).toBe(false);
		next = applyLineChange(next, "noOfPackages", "12");
		expect(next.weightKg).toBe("498.5");
	});

	it("keeps the partial text the operator is still typing in the weight box", () => {
		const next = applyLineChange(line({ noOfPackages: "10", wtPerPackage: "50", weightKg: "500" }), "weightKg", "49.");
		expect(next.weightKg).toBe("49.");
		expect(next.weightAutoFilled).toBe(false);
	});

	it("clearing the weight returns it to auto-fill immediately", () => {
		const manual = line({ noOfPackages: "12", wtPerPackage: "50", weightKg: "498.5", weightAutoFilled: false });
		const next = applyLineChange(manual, "weightKg", "");
		expect(next.weightKg).toBe("600");
		expect(next.weightAutoFilled).toBe(true);
	});

	it("clearing packages while auto-filled clears the derived weight", () => {
		const auto = line({ noOfPackages: "10", wtPerPackage: "50", weightKg: "500", weightAutoFilled: true });
		const next = applyLineChange(auto, "noOfPackages", "");
		expect(next.weightKg).toBe("");
		expect(next.weightAutoFilled).toBe(true);
	});

	it("rate and remarks edits never touch the weight", () => {
		const auto = line({ noOfPackages: "10", wtPerPackage: "50", weightKg: "500", weightAutoFilled: true });
		expect(applyLineChange(auto, "ratePerQtl", "8100").weightKg).toBe("500");
		expect(applyLineChange(auto, "remarks", "lot A").weightKg).toBe("500");
	});
});

describe("lineHasAnyData / sumLines", () => {
	it("ignores the trailing blank row", () => {
		expect(lineHasAnyData(line())).toBe(false);
		expect(lineHasAnyData(line({ itemId: 335556 }))).toBe(true);
		expect(lineHasAnyData(line({ weightKg: "1" }))).toBe(true);
	});

	it("totals packages, kg and amount over real lines only", () => {
		const totals = sumLines([
			line({ id: "a", itemId: 1, noOfPackages: "10", wtPerPackage: "50", weightKg: "500", ratePerQtl: "8000" }),
			line({ id: "b", itemId: 2, noOfPackages: "4", weightKg: "201.25", ratePerQtl: "10000" }),
			line({ id: "c" }),
		]);
		expect(totals).toEqual({ packages: 14, weightKg: 701.25, amount: 40000 + 20125 });
	});
});

describe("mappers", () => {
	it("marks a stored weight equal to packages × wt/package as auto-filled, otherwise manual", () => {
		const base = {
			yarn_purchase_li_id: 7,
			item_id: 335556,
			item_name: "13 LBS SKWP",
			item_code: "Y-13",
			quality_name: null,
			package_type: "BALE",
			no_of_packages: 10,
			wt_per_package: 50,
			rate_per_qtl: 8100,
			amount: 40500,
			remarks: null,
		};
		expect(mapApiLineToEditable({ ...base, weight_kg: 500 }).weightAutoFilled).toBe(true);
		expect(mapApiLineToEditable({ ...base, weight_kg: 498.5 }).weightAutoFilled).toBe(false);
		expect(mapApiLineToEditable({ ...base, weight_kg: 498.5 }).weightKg).toBe("498.5");
	});

	it("builds the save body with numbers, nulls for blanks, and no trailing blank line", () => {
		const input = buildSaveInput({
			coId: 1,
			branchId: 29,
			form: { tranDate: "2026-09-25", partyId: 5, challanNo: " CH-1 ", challanDate: "", vehicleNo: "", remarks: "" },
			lines: [
				line({ id: "a", itemId: 335556, packageType: "BALE", noOfPackages: "10", wtPerPackage: "50", weightKg: "500", ratePerQtl: "8100" }),
				line({ id: "b" }),
			],
		});
		expect(input.challan_no).toBe("CH-1");
		expect(input.challan_date).toBeNull();
		expect(input.vehicle_no).toBeNull();
		expect(input.lines).toEqual([
			{
				item_id: 335556,
				package_type: "BALE",
				no_of_packages: 10,
				wt_per_package: 50,
				weight_kg: 500,
				rate_per_qtl: 8100,
				remarks: null,
			},
		]);
	});
});
