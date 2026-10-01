import { describe, expect, it } from "vitest";
import { buildQtyHint } from "./IndentLineItemsTable";
import type { ItemValidationResult } from "../types/indentTypes";

// TKT-000193: branch stock ("current stock") was computed by the backend
// validation call but never surfaced in the create-indent UI. buildQtyHint
// now includes it in the quantity-field hint, independent of min/max.
function makeResult(overrides: Partial<ItemValidationResult>): ItemValidationResult {
	return {
		validationLogic: 1,
		errors: [],
		branchStock: 0,
		minqty: null,
		maxqty: null,
		minIndentQty: null,
		minOrderQty: null,
		leadTime: null,
		outstandingIndentQty: 0,
		hasOpenIndent: false,
		stockExceedsMax: false,
		maxIndentQty: null,
		hasMinMax: false,
		fyDuplicateIndentNo: null,
		forcedQty: null,
		regularBomOutstanding: 0,
		warnings: [],
		...overrides,
	};
}

describe("buildQtyHint", () => {
	it("returns null when no result is available", () => {
		expect(buildQtyHint(null)).toBeNull();
		expect(buildQtyHint(undefined)).toBeNull();
	});

	it("shows stock even when the item has no min/max (Logic 3 items previously showed nothing)", () => {
		const hint = buildQtyHint(makeResult({ branchStock: 42 }));
		expect(hint).toBe("Stock: 42");
	});

	it("shows stock alongside min/max/reorder for Logic 1/2 items", () => {
		const hint = buildQtyHint(
			makeResult({
				branchStock: 10,
				minIndentQty: 5,
				maxIndentQty: 20,
				minOrderQty: 2,
			})
		);
		expect(hint).toBe("Stock: 10 · Min: 5 · Max: 20 · Reorder: 2");
	});

	it("omits stock when branchStock is not present but keeps min/max", () => {
		const hint = buildQtyHint(
			makeResult({ branchStock: null as unknown as number, maxIndentQty: 20 })
		);
		expect(hint).toBe("Max: 20");
	});

	it("returns null when there is nothing to show", () => {
		const hint = buildQtyHint(makeResult({ branchStock: null as unknown as number }));
		expect(hint).toBeNull();
	});
});
