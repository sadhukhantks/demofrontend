import type { MRLineItem } from "../types/mrTypes";

type MrLineFigures = Pick<MRLineItem, "actualQty" | "actualWeight" | "challanWeight">;

const positive = (v: number | null | undefined): boolean => Number(v) > 0;

/**
 * An MR line that carries nothing: no quantity (bales / drums), no mill weight
 * AND no advised (challan) weight. Such lines come from the gate entry / PO (a
 * quality on the order that did not arrive) and only clutter the MR; the
 * reporter asked for them to be hidden (TKT-000224, sls co 74 br 20 — e.g.
 * MR 28540: "D TD-5" 0 / 0 beside the real D TD-6 line).
 *
 * Not empty, so still shown: a line with a quantity but no weight yet (or the
 * reverse) — incomplete, not empty — and a line with an advised weight but
 * nothing received, because the printed MR totals the advised weight and must
 * keep showing where it came from.
 */
export function isEmptyMrLine(li: MrLineFigures): boolean {
	return !positive(li.actualQty) && !positive(li.actualWeight) && !positive(li.challanWeight);
}

/** The lines to show by default and the empty ones held back (order kept). */
export function splitEmptyMrLines<T extends MrLineFigures>(items: T[]): { visible: T[]; empty: T[] } {
	const visible: T[] = [];
	const empty: T[] = [];
	for (const li of items) (isEmptyMrLine(li) ? empty : visible).push(li);
	return { visible, empty };
}
