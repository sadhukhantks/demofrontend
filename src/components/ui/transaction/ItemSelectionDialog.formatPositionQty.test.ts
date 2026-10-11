import { describe, expect, it } from "vitest";
import { POSITION_COLUMNS, formatPositionQty } from "./ItemSelectionDialog";

// TKT-000193: the Add Items dialog shows stock / indent pending / PO pending /
// in-receipt quantities per item when a branch is known.
describe("formatPositionQty", () => {
	it("renders missing or non-finite values as 0", () => {
		expect(formatPositionQty(null)).toBe("0");
		expect(formatPositionQty(undefined)).toBe("0");
		expect(formatPositionQty(Number.NaN)).toBe("0");
	});

	it("renders zero and negative zero as 0", () => {
		expect(formatPositionQty(0)).toBe("0");
		expect(formatPositionQty(-0)).toBe("0");
		expect(formatPositionQty(0.0004)).toBe("0");
	});

	it("keeps up to three decimals and drops trailing zeros", () => {
		expect(formatPositionQty(2)).toBe("2");
		expect(formatPositionQty(12.5)).toBe("12.5");
		expect(formatPositionQty(0.125)).toBe("0.125");
		expect(formatPositionQty(1.23456)).toBe("1.235");
	});

	it("uses Indian digit grouping for large quantities", () => {
		expect(formatPositionQty(100000)).toBe("1,00,000");
		expect(formatPositionQty(1234.5)).toBe("1,234.5");
	});
});

describe("POSITION_COLUMNS", () => {
	it("covers the four position buckets in display order", () => {
		expect(POSITION_COLUMNS.map((c) => c.key)).toEqual([
			"cur_stock",
			"pending_indent_qty",
			"pending_po_qty",
			"in_process_qty",
		]);
		for (const col of POSITION_COLUMNS) {
			expect(col.label.length).toBeGreaterThan(0);
			expect(col.tooltip.length).toBeGreaterThan(0);
		}
	});
});
