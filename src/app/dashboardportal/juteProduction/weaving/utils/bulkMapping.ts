// Pure helpers for the Loom -> Quality bulk tools (TKT-000119): multi-loom selection and
// "apply one quality to all selected looms", plus the fill-from-previous summary.
// No React here, so every rule is unit-tested in bulkMapping.test.ts.

import type { LoomQualityMapRow } from "../types/weavingTypes";
import type { CarryForwardCell, LoomGrouping } from "@/utils/weavingQualityMapService";

/** Loom id -> picked weaving_quality_id ("" = none), the grid's edit state. */
export type QualityEdits = Record<number, number | "">;

/** Looms whose CURRENT pick (edit, else saved) is the given quality. */
export function loomsWithQuality(
	rows: readonly LoomQualityMapRow[],
	edits: QualityEdits,
	qualityId: number
): number[] {
	return rows
		.filter((r) => (edits[r.machine_id] ?? r.weaving_quality_id ?? "") === qualityId)
		.map((r) => r.machine_id);
}

/** Members of a grouping that are looms of this grid (the group may hold other machines). */
export function loomsInGroup(rows: readonly LoomQualityMapRow[], group: LoomGrouping): number[] {
	const members = new Set(group.machine_ids);
	return rows.filter((r) => members.has(r.machine_id)).map((r) => r.machine_id);
}

/** Ids between two ids of an ordered list, inclusive (shift-click range). [] if either is absent. */
export function rangeBetween(orderedIds: readonly number[], a: number, b: number): number[] {
	const i = orderedIds.indexOf(a);
	const j = orderedIds.indexOf(b);
	if (i < 0 || j < 0) return [];
	const [lo, hi] = i <= j ? [i, j] : [j, i];
	return orderedIds.slice(lo, hi + 1);
}

/** New selection with ids switched on or off. */
export function setIds(selected: ReadonlySet<number>, ids: readonly number[], on: boolean): Set<number> {
	const next = new Set(selected);
	ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
	return next;
}

/** Header checkbox state for the visible rows. */
export function selectionState(
	visibleIds: readonly number[],
	selected: ReadonlySet<number>
): "none" | "some" | "all" {
	const n = visibleIds.filter((id) => selected.has(id)).length;
	if (n === 0) return "none";
	return n === visibleIds.length ? "all" : "some";
}

/**
 * Set one quality on every selected loom (edit state only — Save Map persists it, with the
 * same lock/permission checks as a one-by-one change). Returns the new edits and how many
 * looms actually changed.
 */
export function applyQualityToSelection(
	edits: QualityEdits,
	selected: ReadonlySet<number>,
	qualityId: number
): { edits: QualityEdits; changed: number } {
	const next: QualityEdits = { ...edits };
	let changed = 0;
	selected.forEach((id) => {
		if (next[id] !== qualityId) changed += 1;
		next[id] = qualityId;
	});
	return { edits: next, changed };
}

/**
 * Looms whose pick differs from BOTH what is saved and the prior-day prefill — i.e. a
 * change the operator typed. A fill reloads the grid, so these would be lost.
 */
export function manualEditCount(rows: readonly LoomQualityMapRow[], edits: QualityEdits): number {
	return rows.filter((r) => {
		const e = edits[r.machine_id];
		if (e === undefined) return false;
		const baseline = r.weaving_quality_id ?? r.prev_quality_id ?? "";
		return e !== baseline;
	}).length;
}

export type FillSummary = {
	toFill: number;
	alreadyMapped: number;
	noPrevious: number;
	fromProduction: number;
	restamp: number;
	lockedCells: number;
	skippedLocked: number;
	cells: number;
};

/** Totals over the per-cell counts the backend returns. */
export function summarizeFill(cells: readonly CarryForwardCell[]): FillSummary {
	return cells.reduce<FillSummary>(
		(s, c) => ({
			toFill: s.toFill + c.to_fill,
			alreadyMapped: s.alreadyMapped + c.already_mapped,
			noPrevious: s.noPrevious + c.no_previous,
			fromProduction: s.fromProduction + c.from_production,
			restamp: s.restamp + c.restamp,
			lockedCells: s.lockedCells + (c.locked ? 1 : 0),
			skippedLocked: s.skippedLocked + c.skipped_locked,
			cells: s.cells + 1,
		}),
		{
			toFill: 0,
			alreadyMapped: 0,
			noPrevious: 0,
			fromProduction: 0,
			restamp: 0,
			lockedCells: 0,
			skippedLocked: 0,
			cells: 0,
		}
	);
}
