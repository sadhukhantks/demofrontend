import { describe, expect, it } from "vitest";
import { deriveRates, initialManual, type DiffItem } from "../deriveRates";

// TD-5 base; TD-6 = TD-5 − 200; TD-7 = TD-6 − 150
const ITEMS: DiffItem[] = [
	{ item_id: 5, base_item_id: null, diff_amount: null },
	{ item_id: 6, base_item_id: 5, diff_amount: -200 },
	{ item_id: 7, base_item_id: 6, diff_amount: -150 },
];

describe("deriveRates", () => {
	it("chains from the base item", () => {
		expect(deriveRates(ITEMS, { 5: "7000" }, new Set([5]))).toEqual({ 5: "7000", 6: "6800", 7: "6650" });
	});

	it("keeps a manual override and derives downstream from it", () => {
		const out = deriveRates(ITEMS, { 5: "7000", 6: "6900" }, new Set([5, 6]));
		expect(out[6]).toBe("6900");
		expect(out[7]).toBe("6750");
	});

	it("blanks derived items when the base is blank", () => {
		expect(deriveRates(ITEMS, { 5: "" }, new Set())).toEqual({ 5: "", 6: "", 7: "" });
	});

	it("does not hang on a cycle", () => {
		const loop: DiffItem[] = [
			{ item_id: 1, base_item_id: 2, diff_amount: 10 },
			{ item_id: 2, base_item_id: 1, diff_amount: 10 },
		];
		expect(() => deriveRates(loop, { 1: "100" }, new Set())).not.toThrow();
	});
});

describe("initialManual", () => {
	it("treats saved rates matching the diff as auto", () => {
		expect([...initialManual(ITEMS, { 5: 7000, 6: 6800, 7: 6700 })].sort()).toEqual([5, 7]);
	});
});
