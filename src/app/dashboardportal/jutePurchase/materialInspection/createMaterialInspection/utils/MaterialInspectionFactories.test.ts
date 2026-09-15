/**
 * @description Tests for mergePoLinesIntoLineItems — picking a PO must never
 * throw away line items the user already typed. The PO is a quick-entry aid:
 * existing rows keep every value they hold, only their blank fields get filled,
 * and PO lines that match no row are appended.
 */
import { describe, it, expect } from "vitest";

import { createBlankLine, mergePoLinesIntoLineItems } from "./MaterialInspectionFactories";
import type { GateEntryLineItem, POLineItemForGateEntry } from "../types/MaterialInspectionTypes";

const row = (overrides: Partial<GateEntryLineItem>): GateEntryLineItem => ({
	...createBlankLine(),
	...overrides,
});

const poLine = (overrides: Partial<POLineItemForGateEntry>): POLineItemForGateEntry => ({
	jute_po_li_id: 1,
	item_grp_id: 10,
	jute_group_name: "RAW JUTE",
	item_id: 500,
	quality_name: "TD-4",
	quantity: 20,
	jute_uom: "LOOSE",
	allowable_moisture: 18,
	...overrides,
});

describe("mergePoLinesIntoLineItems", () => {
	it("keeps a user row of the same quality, fills only its blanks and links the PO line", () => {
		const existing = [row({ id: "r1", challanQuality: "500", challanQty: "7", remarks: "kept" })];

		const merged = mergePoLinesIntoLineItems(existing, [poLine({ jute_po_li_id: 99 })], "BALE");

		expect(merged).toHaveLength(1);
		expect(merged[0].id).toBe("r1");
		expect(merged[0].remarks).toBe("kept");
		expect(merged[0].jutePoLiId).toBe("99");
		// blank fields filled from the PO
		expect(merged[0].challanItem).toBe("10");
		expect(merged[0].actualQuality).toBe("500");
		expect(merged[0].actualQty).toBe("20");
		expect(merged[0].juteUom).toBe("LOOSE");
		expect(merged[0].allowableMoisture).toBe("18");
	});

	it("keeps a user row of a different quality with no PO link and appends the PO line", () => {
		const existing = [row({ id: "r1", challanQuality: "777", challanQty: "5", jutePoLiId: "42" })];

		const merged = mergePoLinesIntoLineItems(existing, [poLine({ jute_po_li_id: 99 })], "LOOSE");

		expect(merged).toHaveLength(2);
		expect(merged[0].id).toBe("r1");
		expect(merged[0].challanQuality).toBe("777");
		expect(merged[0].challanQty).toBe("5");
		// stale link to the PREVIOUS PO must be cleared
		expect(merged[0].jutePoLiId).toBe("");
		expect(merged[1].jutePoLiId).toBe("99");
		expect(merged[1].challanQuality).toBe("500");
		expect(merged[1].jute_mr_li_id).toBeNull();
		expect(merged[1].id).not.toBe("r1");
	});

	it("drops blank placeholder rows", () => {
		const existing = [row({ id: "r1", challanQuality: "500", challanQty: "7" }), row({ id: "blank" })];

		const merged = mergePoLinesIntoLineItems(existing, [poLine({})], "LOOSE");

		expect(merged.map((li) => li.id)).toEqual(["r1"]);
	});

	it("lets two PO lines of the same quality consume two existing rows in order", () => {
		const existing = [
			row({ id: "r1", challanQuality: "500", challanQty: "7" }),
			row({ id: "r2", challanQuality: "500", challanQty: "9" }),
		];
		const poLines = [poLine({ jute_po_li_id: 1 }), poLine({ jute_po_li_id: 2 })];

		const merged = mergePoLinesIntoLineItems(existing, poLines, "LOOSE");

		expect(merged).toHaveLength(2);
		expect(merged.map((li) => li.id)).toEqual(["r1", "r2"]);
		expect(merged.map((li) => li.jutePoLiId)).toEqual(["1", "2"]);
		expect(merged.map((li) => li.challanQty)).toEqual(["7", "9"]);
	});

	it("skips a second PO line of a quality the user already typed once", () => {
		const existing = [row({ id: "r1", challanQuality: "500", challanQty: "7" })];
		const poLines = [poLine({ jute_po_li_id: 1 }), poLine({ jute_po_li_id: 2 })];

		const merged = mergePoLinesIntoLineItems(existing, poLines, "LOOSE");

		expect(merged.map((li) => li.id)).toEqual(["r1"]);
		expect(merged[0].jutePoLiId).toBe("1");
	});

	it("never overwrites a non-empty user value", () => {
		const existing = [
			row({
				id: "r1",
				challanItem: "11",
				challanQuality: "500",
				challanQty: "7",
				juteUom: "BALE",
				allowableMoisture: "12",
				actualItem: "11",
				actualQuality: "500",
				actualQty: "6",
			}),
		];

		const merged = mergePoLinesIntoLineItems(existing, [poLine({})], "LOOSE");

		expect(merged[0]).toMatchObject({
			challanItem: "11",
			challanQty: "7",
			juteUom: "BALE",
			allowableMoisture: "12",
			actualItem: "11",
			actualQty: "6",
		});
	});

	it("matches on the PO line id when the quality does not line up", () => {
		const existing = [row({ id: "r1", jutePoLiId: "99", challanQty: "7" })];

		const merged = mergePoLinesIntoLineItems(existing, [poLine({ jute_po_li_id: 99 })], "LOOSE");

		expect(merged).toHaveLength(1);
		expect(merged[0].id).toBe("r1");
		expect(merged[0].challanQuality).toBe("500");
		expect(merged[0].actualQuality).toBe("500");
		expect(merged[0].challanQty).toBe("7");
	});
});
