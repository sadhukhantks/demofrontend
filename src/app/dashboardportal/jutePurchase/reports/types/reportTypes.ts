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

/** API response wrapper */
export interface ReportApiResponse<T> {
  data: T[];
}

/** Paginated API response wrapper */
export interface PaginatedReportApiResponse<T> {
  data: T[];
  total: number;
}

/** Branch option for the selector */
export interface BranchOption {
  branch_id: number;
  branch_name: string;
}
