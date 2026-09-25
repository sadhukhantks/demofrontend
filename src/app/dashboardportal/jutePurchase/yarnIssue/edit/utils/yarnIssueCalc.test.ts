import { describe, expect, it } from "vitest";

import type { YarnIssueLot } from "@/utils/yarnIssueService";
import type { EditableYarnIssueLine } from "../types/yarnIssueTypes";
import {
	buildLotBalanceMap,
	computeLineBalance,
	computeLineBalances,
	findLotOverdraws,
	lineHasAnyData,
	lotBalanceForType,
	resolveLotBalance,
	sumLines,
	toNumber,
	usedOnLotByOtherLines,
} from "./yarnIssueCalc";
import { applyLotToLine, buildSaveInput, createBlankLine, lotOptionFromLine, mapApiLineToEditable } from "./yarnIssueMappers";

/**
 * The lot balance is what stops the floor from drawing yarn the godown does not
 * have. These tests pin the arithmetic: a line's available kg is the lot balance
 * minus the OTHER lines of the same document on that lot — never minus itself.
 */

const line = (overrides: Partial<EditableYarnIssueLine> = {}): EditableYarnIssueLine => ({
	...createBlankLine(),
	id: "l1",
	...overrides,
});

const lot = (overrides: Partial<YarnIssueLot> = {}): YarnIssueLot => ({
	yarn_purchase_li_id: 101,
	yarn_purchase_id: 11,
	purchase_no: "24/25-0001",
	tran_date: "2026-09-01",
	supp_name: "Acme Yarn",
	item_id: 335556,
	item_name: "13 LBS SKWP",
	item_code: "Y-13",
	package_type: "BALE",
	received_kg: 1000,
	bal_kg: 600,
	bal_pkgs: 12,
	...overrides,
});

describe("toNumber / lotBalanceForType / buildLotBalanceMap", () => {
	it("parses text-box values and treats blanks and junk as null", () => {
		expect(toNumber("12.5")).toBe(12.5);
		expect(toNumber(" 7 ")).toBe(7);
		expect(toNumber("")).toBeNull();
		expect(toNumber("abc")).toBeNull();
		expect(toNumber(null)).toBeNull();
	});

	it("ISSUE draws on the godown balance, RETURN on the floor balance", () => {
		const both = lot({ bal_kg: 600, floor_bal_kg: 150 });
		expect(lotBalanceForType(both, "ISSUE")).toBe(600);
		expect(lotBalanceForType(both, "RETURN")).toBe(150);
		expect(lotBalanceForType(lot({ bal_kg: 600 }), "RETURN")).toBeNull();
	});

	it("builds the balance map per type and skips lots with no figure", () => {
		const lots = [lot({ yarn_purchase_li_id: 1, bal_kg: 600, floor_bal_kg: 100 }), lot({ yarn_purchase_li_id: 2, bal_kg: 50 })];
		expect([...buildLotBalanceMap(lots, "ISSUE")]).toEqual([
			[1, 600],
			[2, 50],
		]);
		expect([...buildLotBalanceMap(lots, "RETURN")]).toEqual([[1, 100]]);
	});
});

describe("usedOnLotByOtherLines / computeLineBalance", () => {
	const lines = [
		line({ id: "a", yarnPurchaseLiId: 101, weightKg: "250" }),
		line({ id: "b", yarnPurchaseLiId: 101, weightKg: "200" }),
		line({ id: "c", yarnPurchaseLiId: 102, weightKg: "999" }),
		line({ id: "d" }),
	];

	it("sums the other lines on the same lot and excludes the line itself", () => {
		expect(usedOnLotByOtherLines(lines, 101, "a")).toBe(200);
		expect(usedOnLotByOtherLines(lines, 101, "b")).toBe(250);
		expect(usedOnLotByOtherLines(lines, 101, "zzz")).toBe(450);
		expect(usedOnLotByOtherLines(lines, 102, "c")).toBe(0);
	});

	it("available = lot balance − other lines; a single line on a lot sees the full balance", () => {
		expect(computeLineBalance(lines[2], lines, 1000)).toEqual({ lotBalance: 1000, usedByOtherLines: 0, available: 1000, overBy: 0 });
	});

	it("two lines on one lot split the balance and only over-draw together", () => {
		// Lot 101 holds 600 kg. a=250, b=200 → both fit.
		expect(computeLineBalance(lines[0], lines, 600)).toEqual({ lotBalance: 600, usedByOtherLines: 200, available: 400, overBy: 0 });
		expect(computeLineBalance(lines[1], lines, 600)).toEqual({ lotBalance: 600, usedByOtherLines: 250, available: 350, overBy: 0 });
		// With only 400 kg in the lot, line b (200) has 150 left after a's 250 → over by 50.
		expect(computeLineBalance(lines[1], lines, 400).overBy).toBe(50);
		expect(computeLineBalance(lines[0], lines, 400).overBy).toBe(50);
	});

	it("reports no over-draw when the balance is unknown or the line has no lot", () => {
		expect(computeLineBalance(lines[0], lines, null)).toEqual({ lotBalance: null, usedByOtherLines: 200, available: null, overBy: 0 });
		expect(computeLineBalance(lines[3], lines, 600)).toEqual({ lotBalance: null, usedByOtherLines: 0, available: null, overBy: 0 });
	});

	it("computeLineBalances resolves balances from the loaded lots per line id", () => {
		const balances = new Map<number, number>([
			[101, 600],
			[102, 500],
		]);
		const byLine = computeLineBalances(lines, balances, "ISSUE");
		expect(byLine.get("a")?.available).toBe(400);
		expect(byLine.get("c")?.overBy).toBe(499);
		expect(byLine.get("d")?.available).toBeNull();
	});
});

describe("resolveLotBalance", () => {
	it("prefers the loaded lot options, falls back to the stored godown balance for ISSUE only", () => {
		const saved = line({ yarnPurchaseLiId: 101, lotBalKg: 75 });
		expect(resolveLotBalance(saved, new Map([[101, 600]]), "ISSUE")).toBe(600);
		expect(resolveLotBalance(saved, new Map(), "ISSUE")).toBe(75);
		expect(resolveLotBalance(saved, new Map(), "RETURN")).toBeNull();
		expect(resolveLotBalance(line(), new Map([[101, 600]]), "ISSUE")).toBeNull();
	});
});

describe("findLotOverdraws", () => {
	const balances = new Map<number, number>([
		[101, 600],
		[102, 100],
	]);

	it("flags a lot only when the document's total on it exceeds the balance", () => {
		const ok = findLotOverdraws(
			[
				{ yarn_purchase_li_id: 101, weight_kg: 300 },
				{ yarn_purchase_li_id: 101, weight_kg: 300 },
			],
			balances,
		);
		expect(ok.size).toBe(0);

		const over = findLotOverdraws(
			[
				{ yarn_purchase_li_id: 101, weight_kg: 300 },
				{ yarn_purchase_li_id: 101, weight_kg: 300.5 },
				{ yarn_purchase_li_id: 102, weight_kg: 100 },
			],
			balances,
		);
		expect([...over.values()]).toEqual([{ lotId: 101, balance: 600, requested: 600.5, overBy: 0.5 }]);
	});

	it("ignores lots whose balance is not known", () => {
		expect(findLotOverdraws([{ yarn_purchase_li_id: 999, weight_kg: 5000 }], balances).size).toBe(0);
	});
});

describe("lineHasAnyData / sumLines", () => {
	it("ignores the trailing blank row", () => {
		expect(lineHasAnyData(line())).toBe(false);
		expect(lineHasAnyData(line({ yarnPurchaseLiId: 101 }))).toBe(true);
		expect(lineHasAnyData(line({ weightKg: "1" }))).toBe(true);
	});

	it("totals packages and kg over real lines only", () => {
		const totals = sumLines([
			line({ id: "a", yarnPurchaseLiId: 101, noOfPackages: "10", weightKg: "500" }),
			line({ id: "b", yarnPurchaseLiId: 102, noOfPackages: "4", weightKg: "201.25" }),
			line({ id: "c" }),
		]);
		expect(totals).toEqual({ packages: 14, weightKg: 701.25 });
	});
});

describe("mappers", () => {
	it("picking a lot fills the item and the display snapshot; clearing it empties them", () => {
		const picked = applyLotToLine(line({ weightKg: "10" }), lot());
		expect(picked).toMatchObject({
			yarnPurchaseLiId: 101,
			itemId: 335556,
			itemName: "13 LBS SKWP",
			purchaseNo: "24/25-0001",
			lotTranDate: "2026-09-01",
			lotBalKg: 600,
			weightKg: "10",
		});
		const cleared = applyLotToLine(picked, null);
		expect(cleared).toMatchObject({ yarnPurchaseLiId: null, itemId: null, itemName: null, lotBalKg: null, weightKg: "10" });
	});

	it("maps a GET line and can rebuild a stand-in lot option from it", () => {
		const editable = mapApiLineToEditable({
			yarn_issue_li_id: 7,
			item_id: 335556,
			item_name: "13 LBS SKWP",
			item_code: "Y-13",
			yarn_purchase_li_id: 101,
			purchase_no: "24/25-0001",
			lot_tran_date: "2026-09-01",
			lot_bal_kg: 600,
			no_of_packages: 2,
			weight_kg: 98.5,
			remarks: null,
		});
		expect(editable.weightKg).toBe("98.5");
		expect(editable.noOfPackages).toBe("2");
		expect(lotOptionFromLine(editable)).toMatchObject({ yarn_purchase_li_id: 101, item_name: "13 LBS SKWP", bal_kg: 600 });
		expect(lotOptionFromLine(line())).toBeNull();
	});

	it("builds the save body with numbers, nulls for blanks, and no trailing blank line", () => {
		const input = buildSaveInput({
			coId: 1,
			branchId: 29,
			form: { tranDate: "2026-09-25", issueType: "ISSUE", deptId: 3, remarks: "  " },
			lines: [line({ id: "a", yarnPurchaseLiId: 101, itemId: 335556, noOfPackages: "2", weightKg: "98.5", remarks: " floor A " }), line({ id: "b" })],
		});
		expect(input.remarks).toBeNull();
		expect(input.issue_type).toBe("ISSUE");
		expect(input.dept_id).toBe(3);
		expect(input.lines).toEqual([{ item_id: 335556, yarn_purchase_li_id: 101, no_of_packages: 2, weight_kg: 98.5, remarks: "floor A" }]);
	});
});
