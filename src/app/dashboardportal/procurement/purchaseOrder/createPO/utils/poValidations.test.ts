/**
 * @vitest-environment node
 * Tests for pure PO validation helpers in poValidations.ts
 */
import { describe, it, expect } from "vitest";
import {
	determineValidationLogic,
	computeMaxPoQty,
	computeIndentLineCap,
	computeOpenIndentCeiling,
	isOpenIndentType,
	resolveEditLineBounds,
} from "./poValidations";

// ---------------------------------------------------------------------------
// Open-indent quantity rule
//
//   lots    = ROUNDUP((maxqty - stock) / reorder)
//   ceiling = lots * reorder
//
// Rounding up is deliberate (the reorder lot is indivisible), so the ceiling may
// exceed maxqty. Outstanding PO qty is NOT deducted. Mirrors
// validate_indent_line_qty in src/procurement/po.py — keep the two in step.
// ---------------------------------------------------------------------------

/** sls PO 12718 / indent 3953, item 280208 @ branch 29. */
const REF = {
	indent_type: "OPEN",
	outstanding_qty: 0,
	qty: 0,
	has_minmax: true,
	maxqty: 420,
	minqty: 210,
	min_order_qty: 210,
	branch_stock: 0.5,
	outstanding_po_qty: 1088,
};

describe("computeOpenIndentCeiling", () => {
	it("matches the reference case: ceil(419.5/210) = 2 lots -> 420", () => {
		expect(computeOpenIndentCeiling(420, 0.5, 210)).toBe(420);
	});

	it("matches worked example 1: max 100, stock 8, reorder 10 -> 100", () => {
		expect(computeOpenIndentCeiling(100, 8, 10)).toBe(100);
	});

	it("matches worked example 2: max 100, stock 2, reorder 5 -> 100", () => {
		expect(computeOpenIndentCeiling(100, 2, 5)).toBe(100);
	});

	it("may exceed maxqty because the reorder lot is indivisible", () => {
		// ceil(99/30) = 4 lots -> 120, above the max of 100. Intended.
		expect(computeOpenIndentCeiling(100, 1, 30)).toBe(120);
	});

	it("ignores outstanding PO qty entirely", () => {
		// Same inputs regardless of how much is already on order.
		expect(computeOpenIndentCeiling(420, 0.5, 210)).toBe(420);
	});

	it("returns 0 when stock already meets or exceeds the max", () => {
		expect(computeOpenIndentCeiling(420, 420, 210)).toBe(0);
		expect(computeOpenIndentCeiling(420, 500, 210)).toBe(0);
	});

	it("falls back to maxqty when no reorder lot is configured", () => {
		expect(computeOpenIndentCeiling(420, 0.5, null)).toBe(420);
		expect(computeOpenIndentCeiling(420, 0.5, 0)).toBe(420);
	});

	it("returns null when no max is configured", () => {
		expect(computeOpenIndentCeiling(null, 5, 10)).toBeNull();
		expect(computeOpenIndentCeiling(0, 5, 10)).toBeNull();
	});
});

describe("computeIndentLineCap", () => {
	it("caps a Regular line at its outstanding qty, ignoring min/max", () => {
		const r = computeIndentLineCap({ ...REF, indent_type: "Regular", outstanding_qty: 12, qty: 30 });
		expect(r.isOpen).toBe(false);
		expect(r.cap).toBe(12);
		expect(r.prefill).toBe(12);
	});

	it("falls back to indent qty when outstanding is absent", () => {
		expect(computeIndentLineCap({ indent_type: "Regular", qty: 7 }).cap).toBe(7);
	});

	it("caps an Open line by the min/max rule, not the indent qty", () => {
		// Indent qty is 0 — the old code prefilled and capped at 0.
		const r = computeIndentLineCap(REF);
		expect(r.isOpen).toBe(true);
		expect(r.cap).toBe(420);
		expect(r.minPoQty).toBe(210);
	});

	it("prefills one reorder lot rather than the maximum", () => {
		expect(computeIndentLineCap(REF).prefill).toBe(210);
	});

	it("shows stock, min, max, reorder and the ceiling", () => {
		const r = computeIndentLineCap(REF);
		expect(r.hint).toContain("Stock: 0.5");
		expect(r.hint).toContain("Min: 210");
		expect(r.hint).toContain("Max: 420");
		expect(r.hint).toContain("Reorder: 210");
		expect(r.hint).toContain("Can order: 420");
	});

	// The state hitting 13 of indent 3953's 14 lines on sls today.
	it("leaves an Open line uncapped and warns when the item has no minmax row", () => {
		const r = computeIndentLineCap({
			...REF,
			has_minmax: false,
			maxqty: null,
			minqty: null,
			min_order_qty: null,
		});
		expect(r.cap).toBeNull();
		expect(r.warning).toMatch(/no min\/max configured/i);
	});

	it("leaves an Open line uncapped when max qty is zero", () => {
		const r = computeIndentLineCap({ ...REF, maxqty: 0 });
		expect(r.cap).toBeNull();
		expect(r.warning).toMatch(/no min\/max configured/i);
	});

	it("caps at zero and warns when stock already meets the max", () => {
		const r = computeIndentLineCap({ ...REF, branch_stock: 420 });
		expect(r.cap).toBe(0);
		expect(r.warning).toMatch(/nothing to order/i);
	});

	it("does not demand a minimum the ceiling cannot satisfy", () => {
		// stock 420 -> ceiling 0, but minqty is still 210.
		expect(computeIndentLineCap({ ...REF, branch_stock: 420 }).minPoQty).toBeUndefined();
	});
});

describe("resolveEditLineBounds", () => {
	/** Same item, reopened from PO 12718 where 180 is already committed. */
	const EDIT = {
		branch_stock: 0.5,
		minqty: 210,
		maxqty: 420,
		min_order_qty: 210,
		has_minmax: true,
	};

	it("keeps a Regular line capped at its committed qty", () => {
		const r = resolveEditLineBounds(EDIT, 180, false);
		expect(r.cap).toBe(180);
		expect(r.minPoQty).toBeUndefined();
		expect(r.reason).toContain("outstanding indent qty");
	});

	it("applies the min/max ceiling to an Open line", () => {
		const r = resolveEditLineBounds(EDIT, 180, true);
		expect(r.cap).toBe(420);
		expect(r.minPoQty).toBe(210);
		expect(r.reason).toContain("max orderable is 420");
		expect(r.reason).not.toMatch(/outstanding indent qty/i);
	});

	it("never caps an Open line below what is already committed", () => {
		// Ceiling 0, but 180 is already saved — freezing it would make the PO uneditable.
		const r = resolveEditLineBounds({ ...EDIT, branch_stock: 420 }, 180, true);
		expect(r.cap).toBe(180);
		expect(r.reason).toMatch(/only be reduced/i);
		expect(r.warning).toMatch(/nothing further is orderable/i);
	});

	it("does not enforce a minimum above the cap (the reported bug)", () => {
		// cap 180 with minqty 210 produced "cannot exceed 180" and "below min 210"
		// contradicting each other.
		const r = resolveEditLineBounds({ ...EDIT, branch_stock: 420 }, 180, true);
		expect(r.minPoQty).toBeUndefined();
	});

	it("leaves an Open line uncapped when the item has no minmax row", () => {
		const r = resolveEditLineBounds(
			{ ...EDIT, has_minmax: false, maxqty: null, minqty: null, min_order_qty: null },
			180,
			true,
		);
		expect(r.cap).toBeUndefined();
		expect(r.minPoQty).toBeUndefined();
		expect(r.warning).toMatch(/no min\/max configured/i);
	});
});

describe("isOpenIndentType", () => {
	// sls stores "OPEN"/"REGULAR"; dev3 stores "Open"/"Regular"/"BOM".
	it.each(["Open", "OPEN", "open", " Open "])("treats %s as Open", (v) => {
		expect(isOpenIndentType(v)).toBe(true);
	});

	it.each(["Regular", "REGULAR", "BOM", "", null, undefined])("treats %s as not Open", (v) => {
		expect(isOpenIndentType(v as string | null | undefined)).toBe(false);
	});
});

describe("determineValidationLogic", () => {
	describe("Logic 1 — Regular + stock-checked expense types", () => {
		it.each([
			["Regular", "General"],
			["Regular", "Maintenance"],
			["Regular", "Production"],
			["Regular", "Overhaul"],
		])("returns 1 for PO type %s and expense type %s", (poType, expenseType) => {
			expect(determineValidationLogic(poType, expenseType)).toBe(1);
		});
	});

	describe("Logic 2 — Open + allowed expense types", () => {
		it.each([
			["Open", "General"],
			["Open", "Maintenance"],
			["Open", "Production"],
		])("returns 2 for PO type %s and expense type %s", (poType, expenseType) => {
			expect(determineValidationLogic(poType, expenseType)).toBe(2);
		});
	});

	describe("Logic 3 — free entry", () => {
		it("returns 3 for Regular + Capital", () => {
			expect(determineValidationLogic("Regular", "Capital")).toBe(3);
		});

		it("returns 3 for unknown PO type", () => {
			expect(determineValidationLogic("Unknown", "General")).toBe(3);
		});

		it("returns 3 for unknown expense type", () => {
			expect(determineValidationLogic("Regular", "UnknownExpense")).toBe(3);
		});

		it("returns 3 for empty strings", () => {
			expect(determineValidationLogic("", "")).toBe(3);
		});

		// Open + Capital and Open + Overhaul are blocked at the UI before reaching this (invalid combos)
		// but they still map to logic 3 if somehow passed through
		it("returns 3 for Open + Capital", () => {
			expect(determineValidationLogic("Open", "Capital")).toBe(3);
		});

		it("returns 3 for Open + Overhaul", () => {
			expect(determineValidationLogic("Open", "Overhaul")).toBe(3);
		});
	});
});

// ---------------------------------------------------------------------------
// computeMaxPoQty
// ---------------------------------------------------------------------------

describe("computeMaxPoQty", () => {
	it("returns null when maxQty is null (no item master min/max configured)", () => {
		expect(computeMaxPoQty(null, 10, 5, 2, 10)).toBeNull();
	});

	it("returns null when reorderQty is 0 or null", () => {
		expect(computeMaxPoQty(100, 10, 5, 2, 0)).toBeNull();
		expect(computeMaxPoQty(100, 10, 5, 2, null)).toBeNull();
	});

	it("calculates basic max qty and rounds up to next reorder multiple", () => {
		// available = 100 - 10 - 5 - 2 = 83
		// 83 / 10 = 8.3 → ROUNDUP → 9 * 10 = 90
		expect(computeMaxPoQty(100, 10, 5, 2, 10)).toBe(90);
	});

	it("returns reorderQty when available is less than reorderQty", () => {
		// available = 100 - 95 - 3 - 1 = 1
		// 1 < 10 (reorderQty) → return 10
		expect(computeMaxPoQty(100, 95, 3, 1, 10)).toBe(10);
	});

	it("returns null when available equals zero (stock already at max)", () => {
		// available = 50 - 25 - 15 - 10 = 0 → null (blocked by backend stock check)
		expect(computeMaxPoQty(50, 25, 15, 10, 5)).toBeNull();
	});

	it("works when some optional quantities are zero", () => {
		// available = 200 - 0 - 0 - 0 = 200
		// 200 / 50 = 4 → 4 * 50 = 200
		expect(computeMaxPoQty(200, 0, 0, 0, 50)).toBe(200);
	});

	it("available exactly divisible by reorderQty — no rounding needed", () => {
		// available = 100 - 40 - 10 - 0 = 50
		// 50 / 10 = 5 exactly → 5 * 10 = 50
		expect(computeMaxPoQty(100, 40, 10, 0, 10)).toBe(50);
	});

	it("returns null when available is negative (stock already exceeds max — backend blocks this)", () => {
		// available = 50 - 60 - 5 - 0 = -15 → null (back-end stock_exceeds_max would already have errored)
		expect(computeMaxPoQty(50, 60, 5, 0, 10)).toBeNull();
	});
});
