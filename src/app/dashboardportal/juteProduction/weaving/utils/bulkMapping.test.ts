import { describe, expect, it } from "vitest";
import type { LoomQualityMapRow } from "../types/weavingTypes";
import type { CarryForwardCell } from "@/utils/weavingQualityMapService";
import {
	applyQualityToSelection,
	loomsInGroup,
	loomsWithQuality,
	manualEditCount,
	rangeBetween,
	selectionState,
	setIds,
	summarizeFill,
} from "./bulkMapping";

function row(id: number, saved: number | null, prev: number | null = null): LoomQualityMapRow {
	return {
		machine_id: id,
		mech_code: `L${id}`,
		mech_posting_code: id,
		machine_name: `Loom ${id}`,
		line_no: 1,
		weaving_quality_id: saved,
		weaving_quality_code: null,
		weaving_quality_name: null,
		prev_quality_id: prev,
		prev_quality_code: null,
		prev_quality_name: null,
		prev_date: null,
	};
}

const rows = [row(1, 10), row(2, 10), row(3, 20), row(4, null, 10), row(5, null)];

describe("loomsWithQuality", () => {
	it("matches the current pick: edit first, else saved", () => {
		expect(loomsWithQuality(rows, {}, 10)).toEqual([1, 2]);
		// Loom 2 edited away from 10, loom 4 prefilled to 10 -> both follow the edit.
		expect(loomsWithQuality(rows, { 2: 20, 4: 10 }, 10)).toEqual([1, 4]);
		expect(loomsWithQuality(rows, { 1: "" }, 10)).toEqual([2]);
	});
});

describe("loomsInGroup", () => {
	it("keeps only members that are looms of this grid", () => {
		const g = { source: "loom_group" as const, group_id: 1, group_code: "W1", group_name: null, machine_ids: [3, 1, 99] };
		expect(loomsInGroup(rows, g)).toEqual([1, 3]);
	});
});

describe("rangeBetween", () => {
	const ids = [5, 3, 9, 1, 7];
	it("is inclusive in either direction", () => {
		expect(rangeBetween(ids, 3, 1)).toEqual([3, 9, 1]);
		expect(rangeBetween(ids, 1, 3)).toEqual([3, 9, 1]);
		expect(rangeBetween(ids, 9, 9)).toEqual([9]);
	});
	it("returns [] when an end is not shown", () => {
		expect(rangeBetween(ids, 3, 42)).toEqual([]);
	});
});

describe("setIds / selectionState", () => {
	it("adds and removes without mutating", () => {
		const s = new Set([1]);
		const on = setIds(s, [2, 3], true);
		expect([...on].sort()).toEqual([1, 2, 3]);
		expect([...s]).toEqual([1]);
		expect([...setIds(on, [1, 3], false)]).toEqual([2]);
	});
	it("reports none/some/all for the visible rows", () => {
		expect(selectionState([1, 2], new Set())).toBe("none");
		expect(selectionState([1, 2], new Set([2, 9]))).toBe("some");
		expect(selectionState([1, 2], new Set([1, 2]))).toBe("all");
	});
});

describe("applyQualityToSelection", () => {
	it("sets the quality on every selected loom and counts real changes", () => {
		const { edits, changed } = applyQualityToSelection({ 1: 10, 3: 20 }, new Set([1, 3, 5]), 20);
		expect(edits).toEqual({ 1: 20, 3: 20, 5: 20 });
		expect(changed).toBe(2);
	});
	it("leaves unselected looms alone", () => {
		const { edits } = applyQualityToSelection({ 2: 10 }, new Set([1]), 30);
		expect(edits[2]).toBe(10);
	});
});

describe("manualEditCount", () => {
	it("ignores untouched, saved-equal and prefill-equal cells", () => {
		// 1 equals saved, 4 equals its prefill, 3 changed, 5 changed from blank.
		expect(manualEditCount(rows, { 1: 10, 3: 10, 4: 10, 5: 20 })).toBe(2);
		expect(manualEditCount(rows, {})).toBe(0);
	});
});

describe("summarizeFill", () => {
	it("totals the per-cell counts", () => {
		const cell = (o: Partial<CarryForwardCell>): CarryForwardCell => ({
			tran_date: "2026-10-08",
			spell_id: 1,
			spell_code: "A1",
			locked: false,
			already_mapped: 0,
			to_fill: 0,
			no_previous: 0,
			from_production: 0,
			restamp: 0,
			skipped_locked: 0,
			...o,
		});
		expect(
			summarizeFill([
				cell({ to_fill: 485, restamp: 3 }),
				cell({ locked: true, skipped_locked: 485 }),
				cell({ already_mapped: 485, no_previous: 1, from_production: 2 }),
			])
		).toEqual({
			toFill: 485,
			alreadyMapped: 485,
			noPrevious: 1,
			fromProduction: 2,
			restamp: 3,
			lockedCells: 1,
			skippedLocked: 485,
			cells: 3,
		});
	});
});
