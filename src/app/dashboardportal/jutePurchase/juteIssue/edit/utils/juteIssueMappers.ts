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
    is_waste: Boolean(item.is_waste),
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
 *
 * A line carries exactly ONE key, and the key column wins over `source`: a
 * purchased-waste slice is saved with jute_mr_li_id (its MR line) and must key
 * as "MR-<id>" whatever the backend labels it, or every such line would
 * collapse onto the empty key "W-".
 */
export const buildStockKey = (
  source: JuteIssueLineItem["source"],
  juteMrLiId: number | null | undefined,
  wasteEntryId: number | null | undefined
): string => {
  if (juteMrLiId) return `MR-${juteMrLiId}`;
  if (source === "WASTE" || wasteEntryId) return `W-${wasteEntryId ?? ""}`;
  return `MR-${juteMrLiId ?? ""}`;
};

/** The fields a saved or draft line needs for its source label. */
export type LineSourceFields = Pick<EditableLineItem, "source" | "item_id"> & {
  is_waste?: boolean | number | null;
};

/**
 * Item ids the page KNOWS are jute waste, from the data it already holds.
 *
 * Used only as the fallback when a saved line does not carry `is_waste` (a
 * backend older than the 2026-09-25 line-items query, which derives the flag
 * from the item group): an item is waste if the picker serves it as a grouped
 * waste row, or if another saved line on the same item is a Waste Entry
 * (PROD) slice — the usual sibling of a purchased slice, since one draw from
 * the pool fans out over both legs. Neither is guaranteed to exist — a mill
 * that only BUYS waste and drains the pool in one draw has no WI row and no
 * PROD sibling — which is why the backend flag is the primary path.
 */
export const collectWasteItemIds = (
  stock: readonly Pick<StockOutstandingItem, "source" | "item_id">[],
  lines: readonly LineSourceFields[]
): ReadonlySet<string> => {
  const ids = new Set<string>();
  stock.forEach((s) => {
    if (s.source === "WASTE" && s.item_id) ids.add(String(s.item_id));
  });
  lines.forEach((l) => {
    if ((l.source === "WASTE" || Boolean(l.is_waste)) && l.item_id) ids.add(String(l.item_id));
  });
  return ids;
};

/**
 * Is this saved line a slice of PURCHASED waste — an MR line (source "MR",
 * keyed on jute_mr_li_id) whose item is jute waste?
 *
 * The backend flag wins; `wasteItemIds` (from collectWasteItemIds) covers the
 * case where the flag is absent. Group NAMES are deliberately not matched.
 */
export const isPurchasedWasteLine = (
  line: LineSourceFields,
  wasteItemIds?: ReadonlySet<string>
): boolean =>
  line.source === "MR" &&
  (Boolean(line.is_waste) || (wasteItemIds?.has(String(line.item_id)) ?? false));

/** Label for a saved/draft line's Source chip. */
export type LineSourceLabel = "Waste" | "Waste (purchased)" | "MR";

/**
 * Describe the source of a saved or draft line for its Source chip.
 *
 * One draw from a grouped waste row can reload as TWO kinds of saved line —
 * a Waste Entry slice (source "WASTE") and a purchased-waste slice (source
 * "MR", keyed on its MR line). Both are waste; the purchased one is called out
 * so it is not read as ordinary raw-jute MR stock next to its sibling.
 */
export const describeLineSource = (
  line: LineSourceFields,
  wasteItemIds?: ReadonlySet<string>
): LineSourceLabel => {
  if (line.source === "WASTE") return "Waste";
  if (isPurchasedWasteLine(line, wasteItemIds)) return "Waste (purchased)";
  return "MR";
};

/**
 * Describe where a stock row came from, for the picker's provenance column.
 * Waste has no gate entry or MR number — its department and collection area
 * are the equivalent identifiers.
 */
export const describeStockOrigin = (stock: StockOutstandingItem): string => {
  if (stock.source === "WASTE") {
    // Grouped waste rows carry no department or area — they sum every booking
    // for the item — so the fallback is the normal case, not an edge one.
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
 * Exactly one stock source is sent — the backend rejects zero or many, since a
 * line has to draw on one identifiable balance:
 *   MR    -> jute_mr_li_id (the MR line);
 *   WASTE -> waste_item_id (the grouped item balance). The server walks that
 *            item's pool FIFO — Waste Entry bookings AND purchased-waste MR
 *            lines, by inward date — and writes one jute_issue row per slice
 *            consumed, carrying waste_entry_id (PROD) or jute_mr_li_id
 *            (purchased). So ONE POST here can create several lines, of both
 *            kinds; they reload as source "WASTE" and source "MR" + is_waste.
 */
export const mapEditableToCreatePayload = (
  line: EditableLineItem,
  branchId: number,
  issueDate: string
) => ({
  branch_id: branchId,
  issue_date: issueDate,
  jute_mr_li_id: line.source === "WASTE" ? null : Number(line.jute_mr_li_id),
  waste_entry_id: null,
  waste_item_id: line.source === "WASTE" ? Number(line.item_id) : null,
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
