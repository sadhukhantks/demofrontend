/** Row from GET /api/juteReports/stock */
export interface JuteStockReportRow {
  item_grp_id: number;
  /** null only on the client-added Grand Total row (sorts last in the grid) */
  item_group_name: string | null;
  item_id: number;
  item_name: string;
  opening_weight: number;
  receipt_weight: number;
  issue_weight: number;
  sold_weight: number;
  closing_weight: number;
  mtd_receipt_weight: number;
  mtd_issue_weight: number;
  /** 1 when the item's group is Jute Waste (item_grp_mst.item_type_id = 3),
   * 0 for purchased raw jute. Drives the waste/raw split on the summary cards. */
  is_waste: number;
}

/** Row from GET /api/juteReports/qty-wise (backs Quantity Wise #2 + Inventory Snapshot #14) */
export interface JuteQtyWiseReportRow {
  item_grp_id: number;
  item_group_name: string;
  item_id: number;
  item_name: string;
  opening_weight: number;
  opening_qty: number;
  receipt_weight: number;
  receipt_qty: number;
  issue_weight: number;
  issue_qty: number;
  sold_weight: number;
  sold_qty: number;
  closing_weight: number;
  closing_qty: number;
}

/** Row from GET /api/juteReports/txn-summary (Issue & Receipt Summary #3) */
export interface JuteTxnSummaryRow {
  txn_type: "R" | "I";
  txn_date: string | null;
  mr_number: string | null;
  quality: string | null;
  weight: number | null;
  qty: number | null;
  rate: number | null;
  value: number | null;
  status_name: string | null;
}

/** Row from GET /api/juteReports/period-wise (Month Wise #10 / Day Wise #11) */
export interface JutePeriodWiseRow {
  period: string;
  receipt_weight: number;
  receipt_qty: number;
  issue_weight: number;
  issue_qty: number;
}

/** Row from GET /api/juteReports/with-value (Jute with Value #1) */
export interface JuteWithValueRow {
  item_grp_id: number;
  item_group_name: string;
  item_id: number;
  item_name: string;
  opening_weight: number;
  opening_qty: number;
  receipt_weight: number;
  receipt_qty: number;
  receipt_value: number;
  issue_weight: number;
  issue_qty: number;
  issue_value: number;
  sold_weight: number;
  sold_qty: number;
  closing_weight: number;
  closing_qty: number;
  avg_issue_rate: number | null;
}

/** Row from GET /api/juteReports/percent-claims (Jute Percent Claims #7) */
export interface JutePercentClaimsRow {
  supplier_id: number | null;
  supplier_name: string | null;
  total_mr: number;
  pass_count: number;
  claim_count: number;
  pass_percent: number;
  claim_percent: number;
}

/** Row from GET /api/juteReports/mukham-moisture (Mukham Moisture #9) */
export interface JuteMukhamMoistureRow {
  supplier_id: number | null;
  supplier_name: string | null;
  mukam_name: string | null;
  avg_supplied_moisture: number | null;
  avg_allowed_moisture: number | null;
  deviation: number | null;
}

/** Row from GET /api/juteReports/mr-in-stock (Jute MR in Stock #4) */
export interface JuteMrInStockRow {
  jute_mr_li_id: number;
  mr_number: string | null;
  jute_mr_date: string | null;
  jute_gate_entry_no: number | string | null;
  warehouse_name: string | null;
  quality: string | null;
  received_qty: number | null;
  received_weight: number | null;
  balance_qty: number | null;
  balance_weight: number | null;
}

/** Row from GET /api/juteReports/mr-wise (MR Wise #6) */
export interface JuteMrWiseRow {
  jute_mr_li_id: number;
  mr_number: string | null;
  jute_mr_date: string | null;
  warehouse_name: string | null;
  quality: string | null;
  received_qty: number | null;
  received_weight: number | null;
  issued_qty: number | null;
  issued_weight: number | null;
  balance_qty: number | null;
  balance_weight: number | null;
}

/** Row from GET /api/juteReports/godown-wise (Godown Wise Stock #5) */
export interface JuteGodownWiseRow {
  warehouse_name: string;
  quality: string | null;
  balance_qty: number | null;
  balance_weight: number | null;
}

/** Row from GET /api/juteReports/batch-cost */
export interface BatchCostReportRow {
  yarn_type_id: number;
  yarn_type_name: string;
  item_id: number;
  item_name: string;
  item_grp_id: number;
  item_group_name: string;
  planned_weight: number;
  actual_weight: number;
  actual_rate: number;
  issue_value: number;
  /** Month-to-date counterparts of the day fields (planned_weight ..
   * variance): 1st of the report date's month through the date, TKT-000213.
   * Rate = MTD value / MTD weight x 100 (per qtl). */
  mtd_planned_weight: number;
  mtd_actual_weight: number;
  mtd_actual_rate: number;
  mtd_issue_value: number;
  mtd_variance: number;
  variance: number;
  /** 1 = jute waste re-issued into the batch: a memo line, NOT part of the
   * batch cost (owner ruling 2026-10-08). Absent on older backends = 0. */
  is_waste?: number;
}

/** Row from GET /api/juteReports/issue-yarn-wise (TKT-000214) — jute issued
 * per yarn quality on the report date and month-to-date. Weights are kg. */
export interface JuteIssueYarnWiseApiRow {
  /** null = issues carrying no yarn quality ("(unassigned)") */
  yarn_type_id: number | null;
  yarn_type_name: string;
  /** Raw jute + wastage. */
  day_issue_kg: number;
  mtd_issue_kg: number;
  /** The wastage part of the figure above: process waste re-issued, plus MR
   * lines of a jute-waste item (purchased waste). Raw jute = issue - waste. */
  day_waste_kg: number;
  mtd_waste_kg: number;
}

/** Row from GET /api/juteReports/mr-list */
export interface MrListReportRow {
  jute_mr_id: number;
  mr_number: string;
  /** Set when the MR is approved / finalised; null while Open or out on a transfer chain. */
  jute_mr_date: string | null;
  jute_gate_entry_date?: string | null;
  jute_gate_entry_no?: number | null;
  /** 1 when the lorry was sent back to the supplier (the retained material stays). */
  is_returned?: number | null;
  branch_id: number | null;
  branch_name: string | null;
  party_id: number | null;
  party_name: string | null;
  vehicle_no: string | null;
  challan_no: string | null;
  challan_date: string | null;
  gross_weight: number | null;
  net_weight: number | null;
  actual_weight: number | null;
  total_amount: number | null;
  net_total: number | null;
  status_id: number | null;
  status_name: string | null;
}

/** Row from GET /api/juteReports/mr-issue-detail — one issue against an MR
 * line; the MR columns repeat, and an MR line with no issues comes back with
 * every issue field NULL. */
export interface JuteMrIssueDetailRow {
  jute_mr_id: number;
  jute_mr_li_id: number;
  /** Formatted MR number — NULL until the MR is approved (branch_mr_no is
   * assigned then), so roughly half the rows have none. Never bind a column
   * to this: 510/558 dev3 rows are NULL. Use mr_label. */
  mr_number: string | null;
  /** Guaranteed non-null display label (mr_number, else GE-<n>, else MR-<id>). */
  mr_label: string;
  /** Display date: jute_mr_date COALESCEd with out_date. */
  mr_date: string | null;
  /** Provenance only — not shown as columns. */
  jute_mr_date: string | null;
  out_date: string | null;
  jute_gate_entry_no: string | null;
  party_name: string | null;
  warehouse_name: string | null;
  quality: string | null;
  marka: string | null;
  crop_year: string | number | null;
  received_qty: number | null;
  received_weight: number | null;
  actual_rate: number | null;
  jute_issue_id: number | null;
  issue_date: string | null;
  issued_qty: number | null;
  issued_weight: number | null;
  issue_value: number | null;
  issue_item_name: string | null;
  yarn_type_name: string | null;
  issue_status: string | null;
  updated_by: string | null;
  update_date_time: string | null;
  /** Only present when the backend could join vw_jute_stock_outstanding. */
  balance_qty?: number | null;
  balance_weight?: number | null;
  // Reconciliation columns (2026-09-03, jute transfer chain review §E3) —
  // computed per MR line, repeated on every issue row of that line so a grid
  // sorted/filtered by line still shows them; use the "Sync issued weights"
  // action (POST /juteIssue/sync_issue_weights) when weight_diff is non-zero.
  /** MR line's approved weight (jute_mr_li.accepted_weight). */
  accepted_weight?: number | null;
  /** actual_weight / actual_qty for the line — the per-bale weight basis. */
  unit_weight?: number | null;
  /** Count of non-rejected issues on this MR line. */
  line_issue_count?: number | null;
  /** Sum of issue.weight across all non-rejected issues on this line. */
  total_issued_weight?: number | null;
  /** Sum of issue.quantity * unit_weight across the same issues. */
  expected_issued_weight?: number | null;
  /** total_issued_weight - expected_issued_weight; non-zero means a sync is due. */
  weight_diff?: number | null;
}

/** Row from GET /api/juteReports/mr-movement-detail — the Issue Detail row plus
 * raw-jute sales. One row per MOVEMENT, so exactly one of the issue block and
 * the sale block is populated and issued_weight / sold_weight are both
 * summable. An MR line with neither movement comes back once with
 * movement_type null. */
export interface JuteMrMovementDetailRow
  extends Omit<JuteMrIssueDetailRow, "jute_mr_id" | "jute_mr_li_id" | "mr_label"> {
  /** 0 = filed under an MR line, 1 = the unattributed-sales block. */
  row_group: 0 | 1;
  /** null on unattributed sale rows — they belong to no MR. */
  jute_mr_id: number | null;
  jute_mr_li_id: number | null;
  mr_label: string | null;
  /** null on an MR line that has neither an issue nor a sale. */
  movement_type: "Issue" | "Sale" | "Sale (unattributed)" | null;
  /** issue_date on Issue rows, invoice_date on Sale rows — the sort key. */
  movement_date: string | null;
  invoice_id: number | null;
  /** Unique per sale row; part of the grid row id. */
  invoice_line_item_id: number | null;
  invoice_no: string | number | null;
  invoice_date: string | null;
  customer_name: string | null;
  sale_item_name: string | null;
  sold_qty: number | null;
  /** Raw sales_invoice_dtl.sales_weight — no fallback to quantity, which is a
   * different unit on some rows. */
  sold_weight: number | null;
  sale_rate: number | null;
  /** amount_without_tax, so it compares with issue_value. */
  sale_value: number | null;
  invoice_status: string | null;
  /** What sales_invoice_jute asserted. Populated on unattributed rows so the
   * user can see WHY the sale did not file under an MR. */
  claimed_mr_id: number | null;
  claimed_mr_no: string | null;
}

/** Row from GET /api/juteReports/mr-options — feeds the MR picker. */
export interface JuteMrOptionRow {
  jute_mr_id: number;
  /** NULL on unapproved MRs — never use it as the picker label. */
  mr_number: string | null;
  /** Guaranteed non-null display label (mr_number, else GE-<n>, else MR-<id>). */
  mr_label: string;
  mr_date: string | null;
  party_name: string | null;
}

/** Row from GET /api/juteReports/po-options — feeds the PO picker. */
export interface JutePoOptionRow {
  jute_po_id: number;
  /** NULL when po_no or po_date is missing — never use it as the label. */
  po_number: string | null;
  /** Guaranteed non-null display label (po_number, else PO-<id>). */
  po_label: string;
  po_date: string | null;
  party_name: string | null;
  po_weight: number | null;
  po_status: string | number | null;
}

/** Row from GET /api/juteReports/po-mr-receipt-detail. One row per
 * (PO item x matched MR line); row_group 1 = a receipt whose item matches no
 * PO item (ordered columns NULL). PO/ordered columns repeat across a PO's
 * receipt rows — only the MR-side columns are summable. */
export interface JutePoMrReceiptDetailRow {
  row_group: 0 | 1;
  jute_po_id: number;
  po_label: string;
  po_date: string | null;
  po_status: string | number | null;
  party_name: string | null;
  mukam: string | null;
  item_id: number | null;
  item_name: string | null;
  ordered_qty: number | null;
  po_uom: string | null;
  po_rate: number | null;
  /** NULL on a PO item with no receipts. */
  jute_mr_id: number | null;
  jute_mr_li_id: number | null;
  mr_label: string | null;
  mr_date: string | null;
  jute_gate_entry_no: string | number | null;
  mr_status: string | number | null;
  challan_qty: number | null;
  challan_weight: number | null;
  received_qty: number | null;
  received_weight: number | null;
  accepted_weight: number | null;
  mr_rate: number | null;
  shortage_kgs: number | null;
}

/** Row from GET /api/juteReports/po-pending — one row per PO item of a live,
 * not-fully-received PO. The po_* columns repeat across a PO's item rows. */
export interface JutePoPendingRow {
  jute_po_id: number;
  po_label: string;
  po_date: string | null;
  po_status: string | number | null;
  party_name: string | null;
  mukam: string | null;
  delivery_days: number | null;
  due_date: string | null;
  vehicle_quantity: number | null;
  received_lorries: number;
  pending_lorries: number;
  po_weight: number | null;
  po_received_weight: number;
  po_pending_weight: number;
  item_id: number | null;
  item_name: string | null;
  po_uom: string | null;
  po_rate: number | null;
  ordered_qty: number | null;
  received_qty: number;
  pending_qty: number;
  received_weight: number;
}

/** Generic row shape for the tally-download CSV endpoint */
export type TallyRow = Record<string, string | number | null>;

/** Summary block from GET /api/juteReports/issue-planner */
export interface IssuePlannerSummary {
  report_date: string;
  production_date: string;
  window_from: string;
  window_to: string;
  snapshot_at: string;
  co_id: number;
  branch_id: number;
  total_reference_production_kg: number;
  total_required_issue_mt: number;
  total_required_issue_bales: number;
}

/** Previous-day production per yarn (issue planner) */
export interface IssuePlannerReferenceRow {
  item_id: number | null;
  jute_yarn_id: number | null;
  yarn_name: string | null;
  production_kg: number;
  reference_kg: number;
  reference_source: "actual" | "default";
  planned: boolean;
}

/** One batch daily assign in the plan window (issue planner) */
export interface IssuePlannerBatchPlanRow {
  assign_date: string;
  jute_yarn_id: number;
  yarn_name: string | null;
  batch_plan_id: number;
  plan_name: string | null;
  status_id: number;
}

/** Per-date per-quality requirement (issue planner) */
export interface IssuePlannerRequirementRow {
  assign_date: string;
  item_id: number;
  quality_name: string | null;
  requirement_kg: number;
  requirement_mt: number;
}

/** Required-issue line per jute quality (issue planner) */
export interface IssuePlannerRequiredIssueRow {
  item_id: number;
  quality_name: string | null;
  maturity_hours: number;
  maturity_source: "master" | "default";
  target_stock_date: string;
  target_date_clamped: boolean;
  target_stock_mt: number;
  current_roll_stock_mt: number;
  plan_issue_mt: number;
  required_issue_mt: number;
  required_issue_bales: number;
}

/** Godown stock coverage per quality (issue planner) */
export interface IssuePlannerCoverageRow {
  item_id: number;
  quality_name: string | null;
  godown_stock_kg: number;
  godown_stock_mt: number;
  avg_daily_requirement_mt: number;
  days_of_stock: number | null;
}

/** Full payload from GET /api/juteReports/issue-planner */
export interface IssuePlannerReport {
  summary: IssuePlannerSummary;
  reference_production: IssuePlannerReferenceRow[];
  batch_plan: IssuePlannerBatchPlanRow[];
  quality_requirement: IssuePlannerRequirementRow[];
  required_issue: IssuePlannerRequiredIssueRow[];
  stock_coverage: IssuePlannerCoverageRow[];
}

/** API response wrapper for the issue planner (object payload, not rows) */
export interface IssuePlannerApiResponse {
  data: IssuePlannerReport;
}

/** API response wrapper */
export interface ReportApiResponse<T> {
  data: T[];
}

/** Paginated API response wrapper */
export interface PaginatedReportApiResponse<T> {
  data: T[];
  total: number;
}

/** Branch option for the selector (now lives with the shared report components). */
export type { BranchOption } from "@/components/reports/types";
