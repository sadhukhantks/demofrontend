import { describe, expect, it } from "vitest";

import type { JuteIssueLineItem, StockOutstandingItem } from "../types/juteIssueTypes";
import {
	buildStockKey,
	createLineFromStock,
	describeStockOrigin,
	mapApiLineItemsToEditable,
	buildItemFilterOptions,
	mapEditableToCreatePayload,
	mapStockToOption,
} from "./juteIssueMappers";
import { lineIsComplete } from "./juteIssueFactories";

/**
 * Jute stock has TWO sources — purchased jute (MR lines) and process waste
 * (Waste Entry bookings) — merged into one picker list. Everything here guards
 * the seam between them: the wrong link column on a save writes an issue line
 * against the wrong stock, and a wrong stock_key nets a draft against a balance
 * it is not actually drawing on.
 */

const mrStock: StockOutstandingItem = {
	stock_key: "MR-24143",
	source: "MR",
	jute_mr_li_id: 24143,
	waste_entry_id: null,
	dept_name: null,
	area_name: null,
	jute_gate_entry_no: 1492,
	warehouse_name: "EJM_JUTE",
	branch_id: 29,
	branch_mr_no: 898,
	mr_num: "EJM/F/JMR/23-24/00898",
	jute_mr_id: 15243,
	item_grp_id: 1711,
	jute_group_name: "JUTE > SEMI NORTHERN",
	item_id: 72,
	item_name: "SN-1-TD 5",
	actual_qty: 78,
	actual_weight: 390,
	actual_rate: 4500,
	unit_conversion: "BALE",
	balqty: 78,
	balweight: 390,
};

const wasteStock: StockOutstandingItem = {
	stock_key: "W-1",
	source: "WASTE",
	jute_mr_li_id: null,
	waste_entry_id: 1,
	dept_name: "SPINNING(EJM)",
	area_name: "Frame Bay",
	jute_gate_entry_no: null,
	warehouse_name: null,
	branch_id: 29,
	branch_mr_no: null,
	mr_num: null,
	jute_mr_id: null,
	item_grp_id: 2681,
	jute_group_name: "Jute Waste",
	item_id: 335637,
	item_name: "Thread Wastage",
	actual_qty: 500,
	actual_weight: 500,
	actual_rate: 850,
	unit_conversion: "KG",
	balqty: 500,
	balweight: 500,
};

describe("buildStockKey", () => {
	it("keys MR lines on the MR line id", () => {
		expect(buildStockKey("MR", 24143, null)).toBe("MR-24143");
	});

	it("keys waste lines on the waste entry id", () => {
		expect(buildStockKey("WASTE", null, 1)).toBe("W-1");
	});

	it("treats a waste_entry_id as decisive even if source is missing", () => {
		// Defends against an older/partial API payload that omits `source`.
		expect(buildStockKey(undefined as never, null, 7)).toBe("W-7");
	});

	it("keeps the two sources in separate key spaces", () => {
		// id 1 in both sources must NOT collide, or a waste draft would be netted
		// against an unrelated MR line's balance.
		expect(buildStockKey("MR", 1, null)).not.toBe(buildStockKey("WASTE", null, 1));
	});
});

describe("createLineFromStock", () => {
	it("carries the MR link and leaves the waste link empty", () => {
		const line = createLineFromStock(mrStock, "5", 10, 50);
		expect(line.source).toBe("MR");
		expect(line.stock_key).toBe("MR-24143");
		expect(line.jute_mr_li_id).toBe("24143");
		expect(line.waste_entry_id).toBe("");
	});

	it("carries the waste link and leaves the MR link empty", () => {
		const line = createLineFromStock(wasteStock, "5", 100, 100);
		expect(line.source).toBe("WASTE");
		expect(line.stock_key).toBe("W-1");
		expect(line.waste_entry_id).toBe("1");
		expect(line.jute_mr_li_id).toBe("");
	});

	it("prices a waste line from the waste rate (per quintal)", () => {
		// 120 kg = 1.2 quintal at 850 => 1020
		expect(createLineFromStock(wasteStock, "5", 120, 120).issue_value).toBeCloseTo(1020);
	});

	it("keeps waste provenance for display", () => {
		const line = createLineFromStock(wasteStock, "5", 100, 100);
		expect(line.dept_name).toBe("SPINNING(EJM)");
		expect(line.area_name).toBe("Frame Bay");
	});
});

describe("mapEditableToCreatePayload", () => {
	it("sends only jute_mr_li_id for an MR line", () => {
		const payload = mapEditableToCreatePayload(
			createLineFromStock(mrStock, "5", 10, 50),
			29,
			"2026-08-10"
		);
		expect(payload.jute_mr_li_id).toBe(24143);
		expect(payload.waste_entry_id).toBeNull();
	});

	it("sends only waste_entry_id for a waste line", () => {
		const payload = mapEditableToCreatePayload(
			createLineFromStock(wasteStock, "5", 100, 100),
			29,
			"2026-08-10"
		);
		expect(payload.waste_entry_id).toBe(1);
		expect(payload.jute_mr_li_id).toBeNull();
	});

	it("never sends both links — the backend rejects that", () => {
		for (const stock of [mrStock, wasteStock]) {
			const payload = mapEditableToCreatePayload(
				createLineFromStock(stock, "5", 1, 1),
				29,
				"2026-08-10"
			);
			const supplied = [payload.jute_mr_li_id, payload.waste_entry_id].filter(
				(v) => v !== null
			);
			expect(supplied).toHaveLength(1);
		}
	});
});

describe("mapApiLineItemsToEditable", () => {
	const savedWasteLine = {
		jute_issue_id: 9001,
		branch_id: 29,
		branch_name: "FACTORY",
		issue_date: "2026-08-10",
		status_id: 21,
		status: "Draft",
		source: "WASTE",
		jute_mr_li_id: null,
		waste_entry_id: 1,
		dept_name: "SPINNING(EJM)",
		area_name: "Frame Bay",
		jute_mr_id: null,
		jute_gate_entry_no: null,
		branch_mr_no: null,
		item_id: 335637,
		item_name: "Thread Wastage",
		yarn_type_id: 5,
		yarn_type_name: "10-SKWP",
		quantity: 100,
		weight: 100,
		unit_conversion: "KG",
		actual_rate: 850,
		issue_value: 850,
	} as unknown as JuteIssueLineItem;

	it("rebuilds the stock key of a saved waste line", () => {
		const [line] = mapApiLineItemsToEditable([savedWasteLine]);
		expect(line.stock_key).toBe("W-1");
		expect(line.source).toBe("WASTE");
	});

	it("marks a saved line complete even with no MR line", () => {
		// The completeness check used to require jute_mr_li_id, which every
		// waste line legitimately lacks.
		const [line] = mapApiLineItemsToEditable([savedWasteLine]);
		expect(lineIsComplete(line)).toBe(true);
	});
});

describe("picker labels", () => {
	it("shows gate entry for MR stock", () => {
		expect(describeStockOrigin(mrStock)).toBe("GE 1492");
	});

	it("shows department and area for waste stock", () => {
		expect(describeStockOrigin(wasteStock)).toBe("SPINNING(EJM) / Frame Bay");
	});

	it("falls back to 'Waste' when the booking has no area", () => {
		expect(describeStockOrigin({ ...wasteStock, dept_name: null, area_name: null })).toBe(
			"Waste"
		);
	});

	it("uses stock_key as the option value so the two sources cannot collide", () => {
		expect(mapStockToOption(mrStock).value).toBe("MR-24143");
		expect(mapStockToOption(wasteStock).value).toBe("W-1");
	});
});

/**
 * "Filter by Item" in the stock picker must cascade from "Filter by Jute Type":
 * with CUTTACK selected it offered A TD-8 (U) / B BOT etc. because the options
 * were built off the UNFILTERED stock list (2026-08-22, sls br 87).
 */
describe("buildItemFilterOptions", () => {
	const cuttack = { ...mrStock, stock_key: "MR-1", item_grp_id: 10, item_id: 1, item_name: "C TD-5" };
	const cuttack2 = { ...mrStock, stock_key: "MR-2", item_grp_id: 10, item_id: 1, item_name: "C TD-5" };
	const cuttackW6 = { ...mrStock, stock_key: "MR-3", item_grp_id: 10, item_id: 3, item_name: "C W6" };
	const assam = { ...mrStock, stock_key: "MR-4", item_grp_id: 20, item_id: 2, item_name: "A TD-8 (U)" };
	const rows = [assam, cuttackW6, cuttack, cuttack2];

	it("lists only items of the selected group, deduped and sorted by name", () => {
		expect(buildItemFilterOptions(rows, "10")).toEqual([
			{ value: "1", label: "C TD-5" },
			{ value: "3", label: "C W6" },
		]);
	});

	it("lists every distinct item when no group is selected", () => {
		expect(buildItemFilterOptions(rows, undefined).map((o) => o.label)).toEqual([
			"A TD-8 (U)",
			"C TD-5",
			"C W6",
		]);
	});

	it("returns nothing for a group with no stock", () => {
		expect(buildItemFilterOptions(rows, "99")).toEqual([]);
	});
});
