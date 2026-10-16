import { describe, expect, it } from "vitest";
import { isEmptyMrLine, splitEmptyMrLines } from "./mrLineVisibility";

describe("isEmptyMrLine (TKT-000224)", () => {
	it("is empty when quantity, mill weight and advised weight are all 0 or blank", () => {
		expect(isEmptyMrLine({ actualQty: 0, actualWeight: 0, challanWeight: 0 })).toBe(true);
		expect(isEmptyMrLine({ actualQty: null, actualWeight: null, challanWeight: null })).toBe(true);
		expect(isEmptyMrLine({ actualQty: 0, actualWeight: null, challanWeight: 0 })).toBe(true);
	});

	it("keeps a line that has a quantity or a mill weight (incomplete, not empty)", () => {
		expect(isEmptyMrLine({ actualQty: 234, actualWeight: 9370, challanWeight: 9400 })).toBe(false);
		expect(isEmptyMrLine({ actualQty: 12, actualWeight: 0, challanWeight: 0 })).toBe(false);
		expect(isEmptyMrLine({ actualQty: null, actualWeight: 500, challanWeight: null })).toBe(false);
	});

	it("keeps a line with an advised weight even when nothing was received", () => {
		// The printed MR totals the advised weight, so the line must stay visible.
		expect(isEmptyMrLine({ actualQty: 0, actualWeight: 0, challanWeight: 12313 })).toBe(false);
	});

	it("treats a negative or NaN figure as nothing", () => {
		expect(isEmptyMrLine({ actualQty: -1, actualWeight: Number.NaN, challanWeight: -5 })).toBe(true);
	});
});

describe("splitEmptyMrLines", () => {
	it("partitions in order without losing a line", () => {
		const a = { id: "a", actualQty: 0, actualWeight: 0, challanWeight: 0 };
		const b = { id: "b", actualQty: 234, actualWeight: 9370, challanWeight: 9400 };
		const c = { id: "c", actualQty: null, actualWeight: null, challanWeight: null };
		const { visible, empty } = splitEmptyMrLines([a, b, c]);
		expect(visible.map((l) => l.id)).toEqual(["b"]);
		expect(empty.map((l) => l.id)).toEqual(["a", "c"]);
	});

	it("hides nothing on an MR with no empty lines", () => {
		const { visible, empty } = splitEmptyMrLines([{ actualQty: 1, actualWeight: 40, challanWeight: 40 }]);
		expect(visible).toHaveLength(1);
		expect(empty).toHaveLength(0);
	});
});
