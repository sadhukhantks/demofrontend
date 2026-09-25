/**
 * Outstanding PO Position — response contract of
 * `GET /api/juteReports/po-outstanding-position?co_id&branch_id[&as_on]`
 * (../vowerp3be/src/juteProcurement/po_position.py). Every response is wrapped
 * as `{ data: PoPositionReport }`.
 *
 * Weights arrive in the unit the PO was entered in (kg on current POs) — the
 * backend never converts. The page converts once to metric tonnes when it
 * builds grid rows (`*_mt` fields below), so the grids and the Excel sheets
 * carry the same whole-MT numbers. `balance_value` is the unreceived fraction
 * of the PO line's own stored value.
 *
 * The settlement fields (`stale`, `settle_suggest`, `days_since_receipt`,
 * `rule`, `totals.stale_pos`, `totals.settle_suggest_pos`) come from the PO
 * settlement feature (docs/claude/modules/jute-purchase/po-settlement-spec.md
 * §6) and are optional so the page keeps working against a backend that has
 * not shipped them yet.
 */

/** Company settlement rule as reported by the backend (spec §4 / §6). */
export interface PoSettleRule {
  lorry_rule_enabled: boolean;
  /** Rev 2 (§11.1): weight tolerance as a fraction of one lorry (0.5 = half a lorry). */
  tolerance_lorry_fraction?: number | null;
  /** Rev 1 field, gone once the backend ships §11.1; kept optional for the transition. */
  weight_tolerance_pct?: number | null;
  stale_days: number;
  /** true when the company has no rule row and the defaults apply. */
  is_default: boolean;
}

/** One PO item that still has a balance as on the report date. */
export interface PoPositionDetailRow {
  jute_po_id: number;
  po_label: string;
  po_date: string | null;
  age_days: number | null;
  due_date: string | null;
  overdue: boolean;
  po_status: string | number | null;
  party_name: string | null;
  mukam: string | null;
  vehicle_quantity: number | null;
  received_lorries: number;
  pending_lorries: number;
  po_weight: number | null;
  po_received_weight: number | null;
  po_pending_weight: number | null;
  item_id: number | null;
  item_code: string | null;
  item_name: string | null;
  po_uom: string | null;
  po_rate: number | null;
  ordered_qty: number | null;
  received_qty: number | null;
  balance_qty: number | null;
  /** null when the PO lines carry no weight share (legacy rows). */
  ordered_wt: number | null;
  received_wt: number | null;
  balance_wt: number | null;
  balance_pct: number | null;
  ordered_value: number | null;
  balance_value: number | null;
  mr_count: number;
  last_receipt_date: string | null;
  /** as_on − last_receipt_date; null when nothing has been received. */
  days_since_receipt?: number | null;
  /** overdue AND (no receipt OR days_since_receipt ≥ rule.stale_days). */
  stale?: boolean;
  /** Receipts already meet the settlement rule but the PO is still live. */
  settle_suggest?: boolean;
  /** Returned MRs (status 48) against the PO up to as_on — never counted as received (§11.2). */
  returned_lorries?: number | null;
  returned_weight?: number | null;
}

/** Aggregate figures shared by the quality / supplier roll-ups and the totals. */
export interface PoPositionBucket {
  po_count: number;
  overdue_pos: number;
  ordered_qty: number | null;
  received_qty: number | null;
  balance_qty: number | null;
  ordered_wt: number | null;
  received_wt: number | null;
  balance_wt: number | null;
  balance_pct: number | null;
  ordered_value: number | null;
  balance_value: number | null;
  /** Balance-weighted average PO rate; null when nothing is outstanding. */
  avg_rate: number | null;
  /** Distinct stale POs (totals only; optional until the backend ships it). */
  stale_pos?: number;
  /** Distinct POs whose receipts meet the rule but are still live. */
  settle_suggest_pos?: number;
  /** Lorry counts / weights over distinct POs (§11.2; totals only until the backend ships them). */
  order_lorries?: number | null;
  received_lorries?: number | null;
  returned_lorries?: number | null;
  pending_lorries?: number | null;
  returned_weight?: number | null;
}

export interface PoPositionQualityRow extends PoPositionBucket {
  item_id: number | null;
  item_code: string | null;
  item_name: string | null;
}

export interface PoPositionSupplierRow extends PoPositionBucket {
  party_name: string | null;
  oldest_po_date: string | null;
}

export interface PoPositionReport {
  as_on: string;
  branch_id: number;
  branch_name: string | null;
  detail: PoPositionDetailRow[];
  by_quality: PoPositionQualityRow[];
  by_supplier: PoPositionSupplierRow[];
  totals: PoPositionBucket;
  rule?: PoSettleRule | null;
}

// ------------------------------------------------------------ grid rows ----

/** Weight columns in whole metric tonnes (kg / 1000, rounded to 0 dp). */
export interface MtWeights {
  ordered_mt: number | null;
  received_mt: number | null;
  balance_mt: number | null;
}

export interface QualityGridRow extends PoPositionQualityRow, MtWeights {
  id: string;
}

/** Lorry-and-weight figures (§11.2) — counts plus the matching weights in MT. */
export interface LorryFigures {
  order_lorries: number | null;
  order_wt_mt: number | null;
  received_lorries: number | null;
  received_wt_mt: number | null;
  returned_lorries: number | null;
  returned_wt_mt: number | null;
  pending_lorries: number | null;
  pending_wt_mt: number | null;
}

/** Grid strings "n (MT)" for the four lorry-and-weight pairs. */
export interface LorryLabels {
  order_lw: string;
  recv_lw: string;
  returned_lw: string;
  bal_lw: string;
}

/** Bucket fields that `LorryFigures` redefines as required (client-side summed). */
type BucketLorryKeys = "order_lorries" | "received_lorries" | "returned_lorries" | "pending_lorries";

export interface SupplierGridRow
  extends Omit<PoPositionSupplierRow, BucketLorryKeys>, MtWeights, LorryFigures, LorryLabels {
  id: string;
}

/**
 * One row per PO in the PO Detail tab (§11.2): the API's item rows grouped
 * client-side by `jute_po_id`. PO-level figures come from the first item row
 * (they repeat across a PO's items); `balance_value` is the sum over items.
 */
export interface PoGridRow extends LorryFigures, LorryLabels {
  id: string;
  jute_po_id: number;
  po_label: string;
  po_date: string | null;
  age_days: number | null;
  due_date: string | null;
  overdue: boolean;
  overdue_label: string;
  po_status: string | number | null;
  party_name: string | null;
  mukam: string | null;
  /** One quality per line: "D TD 6 ×250 bl\nD TD 5 ×83 bl" */
  qualities: string;
  /** Item ids of the PO — the quality drill-down filters on these. */
  item_ids: (number | null)[];
  /** po_pending_weight / po_weight × 100 (2 dp); null when no PO weight. */
  balance_pct: number | null;
  ordered_value: number | null;
  balance_value: number | null;
  mr_count: number;
  last_receipt_date: string | null;
  days_since_receipt: number | null;
  stale: boolean;
  stale_label: string;
  settle_suggest: boolean;
  settle_label: string;
}

export interface DetailGridRow extends PoPositionDetailRow, MtWeights {
  id: string;
  /** "Yes" / "" — a string so the grid and the Excel sheet show the same thing. */
  overdue_label: string;
  stale_label: string;
  settle_label: string;
  /** PO-level weights in MT (repeat across a PO's item rows). */
  po_weight_mt: number | null;
  po_received_mt: number | null;
  po_pending_mt: number | null;
}

// ------------------------------------------------------------ endpoints ----

/** `POST /api/jutePO/bulk_close_jute_po` → `{ data: BulkCloseResult }`. */
export interface BulkCloseResult {
  closed: number[];
  skipped: { jute_po_id: number; reason: string }[];
}

/** `POST /api/jutePO/recompute_settlement` → `{ data: RecomputeResult }`. */
export interface RecomputeResult {
  closed: number;
  reopened: number;
  unchanged: number;
}
