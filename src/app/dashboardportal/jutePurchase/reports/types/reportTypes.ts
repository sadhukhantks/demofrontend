/** Row from GET /api/juteReports/stock */
export interface JuteStockReportRow {
  item_grp_id: number;
  item_group_name: string;
  item_id: number;
  item_name: string;
  opening_weight: number;
  receipt_weight: number;
  issue_weight: number;
  sold_weight: number;
  closing_weight: number;
  mtd_receipt_weight: number;
  mtd_issue_weight: number;
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
  variance: number;
}

/** Row from GET /api/juteReports/mr-list */
export interface MrListReportRow {
  jute_mr_id: number;
  mr_number: string;
  jute_mr_date: string | null;
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

/** Generic row shape for the tally-download CSV endpoint */
export type TallyRow = Record<string, string | number | null>;

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
