/**
 * Pure validation logic helpers for the PO module.
 * These functions are side-effect-free and fully unit-testable.
 */

import { PO_TYPE, PO_VALIDATION_LOGIC, isValidPOTypeExpenseCombo } from "./poConstants";

// ---------------------------------------------------------------------------
// Validation logic matrix
// ---------------------------------------------------------------------------

/**
 * Determines which validation logic (1/2/3) applies for a direct PO based on
 * PO type and expense type name. Mirrors the backend `VALIDATION_LOGIC_MAP`.
 *
 * Logic 1 — Regular + General/Maintenance/Production/Overhaul
 *   → Stock check + max/min formula (includes outstanding_po_qty)
 * Logic 2 — Open + General/Maintenance/Production
 *   → FY PO check + max qty forced, rate entry only
 * Logic 3 — Regular + Capital, or any unmapped combination
 *   → Free entry, no validation
 */
export const determineValidationLogic = (poType: string, expenseTypeName: string): 1 | 2 | 3 => {
	const key = `${poType}|${expenseTypeName}`;
	const map: Record<string, 1 | 2 | 3> = {
		// Regular
		"Regular|General": 1,
		"Regular|Maintenance": 1,
		"Regular|Production": 1,
		"Regular|Overhaul": 1,
		"Regular|Capital": 3,
		// Open
		"Open|General": 2,
		"Open|Maintenance": 2,
		"Open|Production": 2,
	};
	return map[key] ?? 3;
};

// ---------------------------------------------------------------------------
// Max PO qty formula (Logic 1)
// ---------------------------------------------------------------------------

/**
 * Calculate the maximum allowable PO quantity for a direct Regular PO (Logic 1).
 *
 * Formula:
 *   available = maxQty - branchStock - outstandingIndentQty - outstandingPoQty
 *   if available < reorderQty  → reorderQty
 *   else                       → ROUNDUP(available / reorderQty) * reorderQty
 *
 * Returns null when:
 *   - reorderQty is 0 / undefined (cannot round up)
 *   - available ≤ 0 (no room to order)
 */
export const computeMaxPoQty = (
	maxQty: number | null,
	branchStock: number,
	outstandingIndentQty: number,
	outstandingPoQty: number,
	reorderQty: number | null,
): number | null => {
	if (maxQty === null || maxQty === undefined) return null;
	if (!reorderQty || reorderQty <= 0) return null;
	const available = maxQty - branchStock - outstandingIndentQty - outstandingPoQty;
	if (available <= 0) return null;
	if (available < reorderQty) return reorderQty;
	return Math.ceil(available / reorderQty) * reorderQty;
};

// ---------------------------------------------------------------------------
// Indent-sourced line ceiling (spec §5 L112 / §10.5)
// ---------------------------------------------------------------------------

/**
 * Min/max + stock block returned per indent line by GET /procurementPO/get_indent_line_items.
 *
 * `max_po_qty` / `min_po_qty` are the view's own precomputed limits and carry
 * sentinels (-1 = no minmax, -2 = open outstanding). They deduct outstanding PO
 * qty, which the Open-indent rule does not, so they are deliberately unused here
 * — the ceiling is derived from maxqty/branch_stock/min_order_qty instead.
 */
export type IndentLineMinMax = {
	indent_type?: string;
	outstanding_qty?: number;
	qty?: number;
	has_minmax?: boolean | number | null;
	maxqty?: number | null;
	minqty?: number | null;
	min_order_qty?: number | null;
	branch_stock?: number | null;
	outstanding_po_qty?: number | null;
	max_po_qty?: number | null;
	min_po_qty?: number | null;
};

export type IndentLineCap = {
	/** Max enterable qty. null = no enforceable ceiling (free entry). */
	cap: number | null;
	/** Min enterable qty; undefined unless a floor exists that the cap can satisfy. */
	minPoQty?: number;
	/** Suggested prefill qty for the line. */
	prefill: number;
	/** Why the cap is what it is — shown when the user exceeds it. */
	reason: string;
	/** Breakdown shown next to the qty cell so the cap is self-explanatory. */
	hint: string | null;
	/** Non-blocking advisory (unconfigured master data, open PO already out). */
	warning?: string;
	/** True when the source indent is Open and the min/max ceiling applies. */
	isOpen: boolean;
};

/**
 * `proc_indent.indent_type_id` is a free varchar and tenants disagree on case —
 * sls stores "OPEN"/"REGULAR", dev3 stores "Open"/"Regular"/"BOM". SQL comparisons
 * survive this under the _ci collation; a JS `===` would not. Always compare folded.
 */
export const isOpenIndentType = (indentType: string | null | undefined): boolean =>
	String(indentType ?? "").trim().toUpperCase() === "OPEN";

/**
 * Quantity ceiling for an Open-indent line — mirrors `validate_indent_line_qty`
 * in src/procurement/po.py. Keep the two in step.
 *
 *     lots    = ROUNDUP((maxqty - stock) / reorder)
 *     ceiling = lots * reorder
 *
 * Rounding *up* is deliberate: the reorder lot is indivisible, so the ceiling
 * may exceed maxqty. Outstanding PO qty is NOT deducted — this is why the
 * view's own `max_po_qty` column cannot be used here, as it subtracts it.
 *
 * Returns null when there is nothing to enforce (no max configured), and 0 when
 * stock already meets the max.
 */
export const computeOpenIndentCeiling = (
	maxQty: number | null | undefined,
	stock: number,
	reorder: number | null | undefined,
): number | null => {
	if (maxQty == null || maxQty <= 0) return null;
	const available = maxQty - stock;
	if (available <= 0) return 0;
	if (!reorder || reorder <= 0) return maxQty;
	return Math.ceil(available / reorder) * reorder;
};

/**
 * Decide the quantity ceiling for a line pulled in from an indent.
 *
 * Regular/BOM → trust the indent stage; ceiling is the line's own outstanding qty.
 * Open        → the indent carries no committed qty, so the branch min/max
 *               position governs (see computeOpenIndentCeiling).
 *
 * Ceiling is evaluated per line, not per PO header — one PO may club lines from
 * several indents of differing types.
 */
export const computeIndentLineCap = (item: IndentLineMinMax): IndentLineCap => {
	const outstanding = item.outstanding_qty != null ? item.outstanding_qty : (item.qty ?? 0);

	if (!isOpenIndentType(item.indent_type)) {
		return {
			cap: outstanding,
			prefill: outstanding,
			reason: `Cannot exceed outstanding indent qty (${outstanding})`,
			hint: null,
			isOpen: false,
		};
	}

	const stock = item.branch_stock ?? 0;
	const maxQty = item.maxqty ?? null;
	const minQty = item.minqty ?? null;
	const reorder = item.min_order_qty ?? null;

	// No item_minmax_mst row for this item+branch — the view returns no row at all.
	if (!item.has_minmax || maxQty === null || maxQty <= 0) {
		return {
			cap: null,
			prefill: 0,
			reason: "",
			hint: null,
			warning: "Open indent: no min/max configured for this item at this branch — quantity is unrestricted.",
			isOpen: true,
		};
	}

	const ceiling = computeOpenIndentCeiling(maxQty, stock, reorder);
	if (ceiling === null) {
		return {
			cap: null,
			prefill: 0,
			reason: "",
			hint: buildCapHint(stock, minQty, maxQty, reorder, null),
			warning: "Open indent: no maximum stock qty set for this item — quantity is unrestricted.",
			isOpen: true,
		};
	}

	// Only enforce a floor the ceiling can actually satisfy.
	const minPoQty = minQty !== null && minQty > 0 && minQty <= ceiling ? minQty : undefined;

	return {
		cap: ceiling,
		minPoQty,
		// Prefill one reorder lot rather than the ceiling — ordering the maximum
		// by default is rarely what is wanted, and the lot is the smallest valid qty.
		prefill: reorder && reorder > 0 && reorder <= ceiling ? reorder : ceiling,
		reason: `Open indent: max orderable is ${ceiling} (max ${maxQty} − stock ${stock}, rounded up to the reorder lot)`,
		hint: buildCapHint(stock, minQty, maxQty, reorder, ceiling),
		warning:
			ceiling === 0
				? `Open indent: stock (${stock}) already meets the max (${maxQty}) — nothing to order.`
				: undefined,
		isOpen: true,
	};
};

/** Subset of the validate_item_for_po response needed to bound an existing line. */
export type EditLineValidation = {
	branch_stock?: number | null;
	minqty?: number | null;
	maxqty?: number | null;
	min_order_qty?: number | null;
	max_po_qty?: number | null;
	min_po_qty?: number | null;
	has_minmax?: boolean;
};

export type EditLineBounds = {
	/** Max enterable qty; undefined = no enforceable ceiling. */
	cap: number | undefined;
	/** Min enterable qty; undefined unless a floor exists that the cap can actually satisfy. */
	minPoQty: number | undefined;
	reason: string | undefined;
	warning?: string;
};

/**
 * Bound an indent-sourced line that is being re-opened for edit.
 *
 * Regular/BOM keep the historical behaviour: the ceiling is the qty already
 * committed on the PO. Open lines are governed by the branch min/max ceiling,
 * which the backend has already adjusted to exclude this PO's own quantity.
 *
 * Two rules stop the checks contradicting each other:
 *  - the ceiling never drops below what is already committed, so a saved line is
 *    always editable downward rather than being frozen as invalid on load;
 *  - a minimum is only enforced when the ceiling can actually satisfy it. When
 *    stock + outstanding already exceed the max, `min_po_qty` still reports the
 *    reorder floor (e.g. 210) while nothing at all is orderable — enforcing both
 *    would demand a qty the cap forbids.
 */
export const resolveEditLineBounds = (
	result: EditLineValidation,
	committedQty: number,
	isOpen: boolean,
): EditLineBounds => {
	if (!isOpen) {
		return {
			cap: committedQty,
			minPoQty: undefined,
			reason: `Cannot exceed outstanding indent qty (${committedQty})`,
		};
	}

	const stock = result.branch_stock ?? 0;
	const maxQty = result.maxqty ?? null;
	const minQty = result.minqty ?? null;
	const reorder = result.min_order_qty ?? null;
	const ceiling = computeOpenIndentCeiling(maxQty, stock, reorder);

	if (ceiling === null || result.has_minmax === false) {
		return {
			cap: undefined,
			minPoQty: undefined,
			reason: undefined,
			warning:
				"Open indent: no min/max configured for this item at this branch — quantity is unrestricted.",
		};
	}

	// Never cap below what is already committed, or a saved line loads permanently
	// invalid and cannot even be reduced.
	const cap = Math.max(committedQty, ceiling);
	const minPoQty = minQty !== null && minQty > 0 && minQty <= cap ? minQty : undefined;

	const reason =
		ceiling < committedQty
			? `Open indent: stock (${stock}) already covers the max (${maxQty}) — this line can only be reduced, not increased beyond ${cap}.`
			: `Open indent: max orderable is ${cap} (max ${maxQty} − stock ${stock}, rounded up to the reorder lot)`;

	return {
		cap,
		minPoQty,
		reason,
		warning:
			ceiling === 0 && committedQty > 0
				? `Open indent: nothing further is orderable — stock (${stock}) already meets the max (${maxQty}).`
				: undefined,
	};
};

/** "Stock: 0.5 · Min: 210 · Max: 420 · Reorder: 210 · Can order: 0" */
export const buildCapHint = (
	stock: number,
	minQty: number | null,
	maxQty: number | null,
	reorder: number | null,
	cap: number | null,
): string | null => {
	if (maxQty === null) return null;
	const parts = [`Stock: ${stock}`];
	if (minQty != null && minQty > 0) parts.push(`Min: ${minQty}`);
	parts.push(`Max: ${maxQty}`);
	if (reorder != null && reorder > 0) parts.push(`Reorder: ${reorder}`);
	if (cap != null) parts.push(`Can order: ${cap}`);
	return parts.join(" · ");
};

// ---------------------------------------------------------------------------
// Combo guard (header-level)
// ---------------------------------------------------------------------------

export { isValidPOTypeExpenseCombo, PO_TYPE, PO_VALIDATION_LOGIC };
