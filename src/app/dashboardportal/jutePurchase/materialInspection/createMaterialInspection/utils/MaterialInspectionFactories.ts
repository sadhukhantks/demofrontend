/**
 * @file gateEntryFactories.ts
 * @description Factory functions for creating default values and blank items.
 */

import type {
	GateEntryFormValues,
	GateEntryLineItem,
	POLineItemForGateEntry,
} from "../types/MaterialInspectionTypes";

let lineIdSeed = 0;

/**
 * Generate a unique line ID.
 */
export const generateLineId = (): string => {
	lineIdSeed += 1;
	return `ge-line-${lineIdSeed}`;
};

/**
 * Create a blank line item for the gate entry.
 */
export const createBlankLine = (): GateEntryLineItem => ({
	id: generateLineId(),
	jute_mr_li_id: null,  // New lines don't have a database ID yet
	jutePoLiId: "",
	challanItem: "",
	challanQuality: "",
	challanQty: "",
	challanWeight: "",
	actualItem: "",
	actualQuality: "",
	actualQty: "",
	actualWeight: "",
	juteUom: "",
	allowableMoisture: "",
	warehouseId: "",
	remarks: "",
	moistureReadings: [],
	averageMoisture: null,
});

/**
 * Build default form values for create mode.
 */
export const buildDefaultFormValues = (): GateEntryFormValues => {
	const now = new Date();
	const dateStr = now.toISOString().slice(0, 10);
	const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

	return {
		branch: "",
		entryDate: dateStr,
		entryTime: timeStr,
		challanNo: "",
		challanDate: dateStr,
		vehicleNo: "",
		vehicleType: "",
		driverName: "",
		transporter: "",
		poId: "",
		juteUom: "LOOSE",
		mukam: "",
		supplier: "",
		party: "",
		partyBranch: "",
		grossWeight: "",
		tareWeight: "",
		challanWeight: "",
		netWeight: "",
		variableShortage: "",
		actualWeight: "",
		marketingSlip: false,
		remarks: "",
		outDate: "",
		outTime: "",
	};
};

/**
 * Check if a line item has any user-entered data.
 */
export const lineHasAnyData = (line: GateEntryLineItem): boolean =>
	Boolean(
		// A persisted row is never "blank" — useLineItems prunes trailing blank
		// rows, and pruning a DB row would drop it from the save payload, which
		// the backend reconcile then deactivates
		line.jute_mr_li_id ||
			line.challanItem ||
			line.challanQuality ||
			line.challanQty ||
			line.challanWeight ||
			line.actualItem ||
			line.actualQuality ||
			line.actualQty ||
			line.actualWeight ||
			line.allowableMoisture ||
			(line.moistureReadings?.length ?? 0) > 0 ||
			line.remarks
	);

/**
 * Check if a line item is complete (has required fields).
 */
export const lineIsComplete = (line: GateEntryLineItem): boolean => {
	const challanQty = Number(line.challanQty);
	return Boolean(line.challanItem && line.challanQuality && Number.isFinite(challanQty) && challanQty > 0);
};

/**
 * Merge a PO's lines into the grid the user has already typed.
 *
 * Entered data wins: the PO is a reference/quick-entry aid, the challan line the
 * user keyed supersedes it. Every row with data survives; each PO line links to
 * the first unconsumed row of the same quality (fallback: the same PO line id)
 * and fills ONLY that row's blank fields. PO lines of a quality not typed at all are
 * appended (a second PO line of an already-typed quality is skipped); rows that match nothing keep their data with the stale link cleared.
 */
export const mergePoLinesIntoLineItems = (
	existing: GateEntryLineItem[],
	poLines: POLineItemForGateEntry[],
	poUom: string
): GateEntryLineItem[] => {
	const rows = existing.filter(lineHasAnyData).map((row) => ({ ...row }));
	const consumed = rows.map(() => false);
	const appended: GateEntryLineItem[] = [];

	for (const poli of poLines) {
		const poLiId = String(poli.jute_po_li_id);
		const itemGrp = poli.item_grp_id ? String(poli.item_grp_id) : "";
		const quality = poli.item_id ? String(poli.item_id) : "";
		const qty = poli.quantity ? String(poli.quantity) : "";
		const uom = poli.jute_uom ?? poUom;
		const moisture = poli.allowable_moisture != null ? String(poli.allowable_moisture) : "";

		// Quality (= item id) is the match key; the old PO link is only a fallback
		let idx = quality ? rows.findIndex((r, i) => !consumed[i] && r.challanQuality === quality) : -1;
		if (idx === -1) idx = rows.findIndex((r, i) => !consumed[i] && r.jutePoLiId === poLiId);

		if (idx === -1) {
			// Ruling 2026-09-15: a PO line whose quality the user already typed (row
			// consumed by an earlier PO line of the same quality) is skipped, not appended
			if (quality && rows.some((r) => r.challanQuality === quality)) continue;
			appended.push({
				id: generateLineId(),
				jute_mr_li_id: null,
				jutePoLiId: poLiId,
				challanItem: itemGrp,
				challanQuality: quality,
				challanQty: qty,
				challanWeight: "",
				actualItem: itemGrp,
				actualQuality: quality,
				actualQty: qty,
				actualWeight: "",
				juteUom: uom,
				allowableMoisture: moisture,
				warehouseId: "",
				remarks: "",
				moistureReadings: [],
				averageMoisture: null,
			});
			continue;
		}

		consumed[idx] = true;
		const row = rows[idx];
		rows[idx] = {
			...row,
			jutePoLiId: poLiId,
			challanItem: row.challanItem || itemGrp,
			challanQuality: row.challanQuality || quality,
			challanQty: row.challanQty || qty,
			juteUom: row.juteUom || uom,
			allowableMoisture: row.allowableMoisture || moisture,
			actualItem: row.actualItem || itemGrp,
			actualQuality: row.actualQuality || quality,
			actualQty: row.actualQty || qty,
		};
	}

	// An unmatched row's link may still point at a line of the PREVIOUS PO
	return [...rows.map((row, i) => (consumed[i] ? row : { ...row, jutePoLiId: "" })), ...appended];
};
