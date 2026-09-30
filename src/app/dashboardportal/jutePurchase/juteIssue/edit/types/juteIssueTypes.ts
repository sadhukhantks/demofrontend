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
 * "MR"    — purchased RAW jute, one row per MR line (vw_jute_stock_outstanding).
 *           The MR arm excludes waste items (item_type_id 3), so purchased
 *           waste never shows up here as its own row.
 * "WASTE" — the grouped waste POOL of one item (vw_jute_waste_stock_outstanding):
 *           process waste booked on the Waste Entry page (jute_prod_waste_entry)
 *           PLUS purchased waste, i.e. jute_mr_li lines whose item belongs to a
 *           type-3 (jute waste) group. One row per waste item, kg-only. The
 *           server draws FIFO across both legs; each PROD slice is priced from
 *           the Waste Rate master, each purchased slice at its MR line rate.
 */
export type StockSource = "MR" | "WASTE";

/**
 * A row of available jute stock, from either source.
 *
 * The backend concatenates both sources into one list, so the MR-only fields
 * (gate entry, MR number, warehouse, jute_mr_li_id) are null on a waste row.
 *
 * A waste row is a GROUPED item balance, not one booking (TKT-000147): it sums
 * every open Waste Entry for that item AND every open purchased-waste MR line
 * of that item, so waste_entry_id / jute_mr_li_id / dept_name / area_name are
 * null on it too. Issuing it sends `waste_item_id` and the server fans the draw
 * out FIFO across the underlying bookings and MR lines.
 *
 * `actual_rate` on a grouped waste row is the Waste Rate master rate (0 when
 * none is on file). It only prices the PROD slices — purchased slices are
 * priced server-side at their own MR line rate — so the client-side value is
 * indicative; the saved lines reload with the final per-slice value.
 *
 * Always key rows on `stock_key` — jute_mr_li_id is NOT unique across the
 * merged list because it is null for every waste row.
 */
export type StockOutstandingItem = {
  /** Unique across BOTH sources: "MR-<jute_mr_li_id>" or "WI-<item_id>". */
  stock_key: string;
  source: StockSource;
  jute_mr_li_id: number | null;
  /** Always null on a grouped waste row — it stands for several bookings. */
  waste_entry_id: number | null;
  /** Null on a grouped waste row; still populated on SAVED waste issue lines. */
  dept_name?: string | null;
  area_name?: string | null;
  jute_gate_entry_no?: number | null;
  /** Formatted gate entry number, e.g. "LCPL/JGE/25-26/00393" — MR rows only. */
  gate_entry_num?: string | null;
  jute_gate_entry_date?: string | null;
  vehicle_no?: string | null;
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
  /**
   * Set when the line's item belongs to a jute-waste (type-3) group. A saved
   * slice drawn from the waste pool comes back as `source: "MR"` when it was
   * PURCHASED waste (it is keyed on jute_mr_li_id, not waste_entry_id); this
   * flag is what lets the UI still label it as waste. Optional because older
   * backends do not send it — the page then falls back to what it can see in
   * the stock list.
   */
  is_waste?: number | boolean | null;
  /** Waste only — provenance of the originating Waste Entry booking. */
  dept_name?: string | null;
  area_name?: string | null;
  waste_date?: string | null;
  jute_mr_id: number | null;
  jute_gate_entry_no?: number | null;
  /** Formatted gate entry number, e.g. "LCPL/JGE/25-26/00393" — MR rows only. */
  gate_entry_num?: string | null;
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
  /** True when the item is jute waste — see JuteIssueLineItem.is_waste. */
  is_waste?: boolean;
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
  /** Formatted gate entry number, e.g. "LCPL/JGE/25-26/00393" — MR rows only. */
  gate_entry_num?: string | null;
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
