/** Row from GET /api/juteReports/stock */
export interface JuteStockReportRow {
  item_grp_id: number;
  item_group_name: string;
  item_id: number;
  item_name: string;
  opening_weight: number;
  receipt_weight: number;
  issue_weight: number;
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
