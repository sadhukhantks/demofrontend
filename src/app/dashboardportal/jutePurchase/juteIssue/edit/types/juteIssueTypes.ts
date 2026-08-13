/**
 * Jute Issue specific TypeScript definitions.
 * Used across hooks, utils, and components.
 */

/**
 * Basic label/value tuple used across forms.
 */
export type Option = {
  label: string;
  value: string;
};

/**
 * Which stock source a row came from.
 *
 * "MR"    — purchased jute, one row per MR line (vw_jute_stock_outstanding).
 * "WASTE" — process waste booked on the Waste Entry page, one row per booking
 *           (vw_jute_waste_stock_outstanding). Waste is kg-only and is priced
 *           from the Waste Rate master, not from a purchase.
 */
export type StockSource = "MR" | "WASTE";

/**
 * A row of available jute stock, from either source.
 *
 * The backend concatenates both sources into one list, so the MR-only fields
 * (gate entry, MR number, warehouse, jute_mr_li_id) are null on a waste row and
 * the waste-only fields (waste_entry_id, dept_name, area_name) are null on an
 * MR row. Always key rows on `stock_key` — jute_mr_li_id is NOT unique across
 * the merged list because it is null for every waste row.
 */
export type StockOutstandingItem = {
  /** Unique across BOTH sources: "MR-<jute_mr_li_id>" or "W-<waste_entry_id>". */
  stock_key: string;
  source: StockSource;
  jute_mr_li_id: number | null;
  waste_entry_id: number | null;
  /** Waste only — the department and collection area the waste came from. */
  dept_name?: string | null;
  area_name?: string | null;
  jute_gate_entry_no?: number | null;
  warehouse_name?: string | null;
  branch_id: number;
  branch_mr_no: number | null;
  mr_num?: string | null;
  jute_mr_id: number | null;
  item_grp_id: number;
  jute_group_name: string;
  item_id: number;
  item_name: string;
  actual_qty: number;
  actual_weight: number;
  actual_rate: number;
  /** "KG" for every waste row; the MR's own unit (BALE / LOOSE / DRUM) otherwise. */
  unit_conversion: string;
  balqty: number;
  balweight: number;
};

/**
 * Jute issue line item as returned from API.
 */
export type JuteIssueLineItem = {
  jute_issue_id: number;
  branch_id: number;
  branch_name: string;
  issue_date: string;
  status_id: number;
  status: string;
  source: StockSource;
  jute_mr_li_id: number | null;
  waste_entry_id: number | null;
  /** Waste only — provenance of the originating Waste Entry booking. */
  dept_name?: string | null;
  area_name?: string | null;
  waste_date?: string | null;
  jute_mr_id: number | null;
  jute_gate_entry_no?: number | null;
  branch_mr_no: number | null;
  mr_num?: string | null;
  item_grp_id?: number;
  jute_group_name?: string;
  item_id: number;
  item_name: string;
  yarn_type_id: number;
  yarn_type_name: string;
  quantity: number;
  weight: number;
  unit_conversion: string;
  actual_rate: number;
  issue_value: number;
  updated_by?: string;
  update_date_time?: string;
};

/**
 * Editable line item for UI (new or existing).
 */
export type EditableLineItem = {
  id: string; // UI-only row ID
  jute_issue_id?: number; // Backend ID (null for new)
  /**
   * Which stock row this line draws on — "MR-<id>" or "W-<id>". This, not
   * jute_mr_li_id, is what draft quantities are netted against, because a
   * waste line has no MR line and every waste row would otherwise collide on
   * the same empty key.
   */
  stock_key: string;
  source: StockSource;
  jute_mr_li_id: string;
  waste_entry_id: string;
  yarn_type_id: string;
  item_grp_id: string;
  item_id: string;
  quantity: string;
  weight: string;
  unit_conversion: string;
  actual_rate: number;
  issue_value: number;
  status_id?: number; // Item-level status for approval workflow
  // Display fields (from stock outstanding)
  jute_gate_entry_no?: number | null;
  branch_mr_no?: number | null;
  mr_num?: string | null;
  dept_name?: string | null;
  area_name?: string | null;
  item_name?: string;
  jute_group_name?: string;
  balqty?: number;
  balweight?: number;
};

/**
 * Jute item (item_grp_id 2 or 3) option.
 */
export type JuteItemRecord = {
  item_grp_id: number;
  item_grp_desc: string;
  parent_grp_id?: number;
  parent_grp_name?: string;
};

/**
 * Yarn type option.
 */
export type YarnTypeRecord = {
  jute_yarn_type_id: number;
  jute_yarn_type_name: string;
};

/**
 * Branch option.
 */
export type BranchRecord = {
  branch_id: number;
  branch_name: string;
};

/**
 * Setup data returned from get_issue_create_setup.
 */
export type JuteIssueSetupData = {
  jute_groups: JuteItemRecord[];
  yarn_types: YarnTypeRecord[];
  branches: BranchRecord[];
};

/**
 * Summary data returned from get_issues_by_date.
 */
export type JuteIssueSummary = {
  total_entries: number;
  total_weight: number;
  total_value: number;
  total_qty: number;
  status: string;
  status_id: number;
};

/**
 * Page mode for the transaction page.
 */
export type JuteIssueMode = "create" | "edit" | "view";
