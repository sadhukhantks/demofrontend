/**
 * Mapper functions for Jute Issue module.
 * Convert API responses to UI types.
 */

import type {
  JuteIssueLineItem,
  EditableLineItem,
  StockOutstandingItem,
  JuteItemRecord,
  YarnTypeRecord,
  BranchRecord,
  Option,
} from "../types/juteIssueTypes";
import { generateLineId, calculateIssueValue } from "./juteIssueFactories";

/**
 * Map API line items to editable line items.
 */
export const mapApiLineItemsToEditable = (
  items: JuteIssueLineItem[]
): EditableLineItem[] => {
  return items.map((item) => ({
    id: generateLineId(),
    jute_issue_id: item.jute_issue_id,
    stock_key: buildStockKey(item.source, item.jute_mr_li_id, item.waste_entry_id),
    source: item.source ?? "MR",
    jute_mr_li_id: String(item.jute_mr_li_id || ""),
    waste_entry_id: String(item.waste_entry_id || ""),
    yarn_type_id: String(item.yarn_type_id || ""),
    item_grp_id: String(item.item_grp_id || ""),
    item_id: String(item.item_id || ""),
    quantity: String(item.quantity ?? ""),
    weight: String(item.weight ?? ""),
    unit_conversion: item.unit_conversion || "",
    actual_rate: item.actual_rate || 0,
    issue_value: item.issue_value || 0,
    status_id: item.status_id,
    jute_gate_entry_no: item.jute_gate_entry_no,
    gate_entry_num: item.gate_entry_num,
    branch_mr_no: item.branch_mr_no,
    mr_num: item.mr_num,
    dept_name: item.dept_name,
    area_name: item.area_name,
    item_name: item.item_name,
    jute_group_name: item.jute_group_name,
    balqty: undefined, // Will be populated from stock
    balweight: undefined,
  }));
};

/**
 * Rebuild the stock key for a saved line.
 *
 * The stock picker gets `stock_key` straight from the API, but a saved issue
 * line only carries its link column — so the key is reconstructed here using
 * the same format the backend emits. Keep the two in step: this string is what
 * nets a draft line against the balance it is drawing on.
 */
export const buildStockKey = (
  source: JuteIssueLineItem["source"],
  juteMrLiId: number | null | undefined,
  wasteEntryId: number | null | undefined
): string => {
  if (source === "WASTE" || wasteEntryId) return `W-${wasteEntryId ?? ""}`;
  return `MR-${juteMrLiId ?? ""}`;
};

/**
 * Describe where a stock row came from, for the picker's provenance column.
 * Waste has no gate entry or MR number — its department and collection area
 * are the equivalent identifiers.
 */
export const describeStockOrigin = (stock: StockOutstandingItem): string => {
  if (stock.source === "WASTE") {
    return [stock.dept_name, stock.area_name].filter(Boolean).join(" / ") || "Waste";
  }
  return `GE ${stock.jute_gate_entry_no ?? "-"}`;
};

/**
 * Map stock outstanding item to option for dropdown.
 */
export const mapStockToOption = (stock: StockOutstandingItem): Option => ({
  label: `${describeStockOrigin(stock)} - ${stock.item_name || "Unknown"} (Bal: ${stock.balqty?.toFixed(2) ?? 0} / ${stock.balweight?.toFixed(2) ?? 0} kg)`,
  value: stock.stock_key,
});

/**
 * Options for the stock picker's "Filter by Item" dropdown.
 *
 * Cascades from "Filter by Jute Type": only items that actually have stock
 * under `groupId` (every item when no group is chosen), one entry per item_id,
 * sorted by name. Built off the unfiltered list it offered every item at the
 * branch under whatever group was selected.
 */
export const buildItemFilterOptions = (
  stock: StockOutstandingItem[],
  groupId: string | undefined
): Option[] => {
  const seen = new Map<string, string>();
  stock.forEach((s) => {
    if (groupId && String(s.item_grp_id) !== groupId) return;
    if (s.item_id && s.item_name && !seen.has(String(s.item_id))) {
      seen.set(String(s.item_id), s.item_name);
    }
  });
  return Array.from(seen.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
};

/**
 * Map jute items to options.
 */
export const mapJuteItemsToOptions = (items: JuteItemRecord[]): Option[] =>
  items.map((item) => ({
    label: item.item_grp_desc,
    value: String(item.item_grp_id),
  }));

/**
 * Map yarn types to options.
 */
export const mapYarnTypesToOptions = (types: YarnTypeRecord[]): Option[] =>
  types.map((type) => ({
    label: type.jute_yarn_type_name,
    value: String(type.jute_yarn_type_id),
  }));

/**
 * Map branches to options.
 */
export const mapBranchesToOptions = (branches: BranchRecord[]): Option[] =>
  branches.map((branch) => ({
    label: branch.branch_name,
    value: String(branch.branch_id),
  }));

/**
 * Create editable line item from stock selection.
 */
export const createLineFromStock = (
  stock: StockOutstandingItem,
  yarnTypeId: string,
  quantity: number,
  weight: number
): EditableLineItem => {
  const issueValue = calculateIssueValue(weight, stock.actual_rate || 0);
  
  return {
    id: generateLineId(),
    jute_issue_id: undefined,
    stock_key: stock.stock_key,
    source: stock.source,
    jute_mr_li_id: String(stock.jute_mr_li_id ?? ""),
    waste_entry_id: String(stock.waste_entry_id ?? ""),
    yarn_type_id: yarnTypeId,
    item_grp_id: String(stock.item_grp_id || ""),
    item_id: String(stock.item_id || ""),
    quantity: String(quantity),
    weight: String(weight),
    unit_conversion: stock.unit_conversion || "",
    actual_rate: stock.actual_rate || 0,
    issue_value: issueValue,
    branch_mr_no: stock.branch_mr_no,
    mr_num: stock.mr_num,
    jute_gate_entry_no: stock.jute_gate_entry_no,
    gate_entry_num: stock.gate_entry_num,
    dept_name: stock.dept_name,
    area_name: stock.area_name,
    item_name: stock.item_name,
    jute_group_name: stock.jute_group_name,
    balqty: stock.balqty,
    balweight: stock.balweight,
  };
};

/**
 * Map editable line item to API create payload.
 *
 * Exactly one of jute_mr_li_id / waste_entry_id is sent — the backend rejects
 * zero or both, since a line has to draw on one identifiable stock row.
 */
export const mapEditableToCreatePayload = (
  line: EditableLineItem,
  branchId: number,
  issueDate: string
) => ({
  branch_id: branchId,
  issue_date: issueDate,
  jute_mr_li_id: line.source === "WASTE" ? null : Number(line.jute_mr_li_id),
  waste_entry_id: line.source === "WASTE" ? Number(line.waste_entry_id) : null,
  yarn_type_id: Number(line.yarn_type_id),
  item_id: Number(line.item_id),
  quantity: Number(line.quantity) || 0,
  weight: Number(line.weight) || 0,
  unit_conversion: line.unit_conversion || null,
});

/**
 * Build label map for lookups.
 */
export const buildLabelMap = <T>(
  items: T[],
  getId: (item: T) => string,
  getLabel: (item: T) => string
): Record<string, string> => {
  const map: Record<string, string> = {};
  for (const item of items) {
    map[getId(item)] = getLabel(item);
  }
  return map;
};

/**
 * Create label resolver from a map.
 */
export const createLabelResolver =
  (map: Record<string, string>) =>
  (id: string): string =>
    map[id] || id || "";
