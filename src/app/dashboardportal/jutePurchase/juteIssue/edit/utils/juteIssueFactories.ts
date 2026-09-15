/**
 * Factory functions for Jute Issue module.
 */

import type { EditableLineItem } from "../types/juteIssueTypes";

let lineIdSeed = 0;

/**
 * Generate a unique line ID for UI purposes.
 */
export const generateLineId = (): string => {
  lineIdSeed += 1;
  return `jute-issue-line-${lineIdSeed}`;
};

/**
 * Reset line ID seed (useful for testing).
 */
export const resetLineIdSeed = (): void => {
  lineIdSeed = 0;
};

/**
 * Create a blank line item for adding new rows.
 */
export const createBlankLine = (): EditableLineItem => ({
  id: generateLineId(),
  jute_issue_id: undefined,
  stock_key: "",
  source: "MR",
  jute_mr_li_id: "",
  waste_entry_id: "",
  yarn_type_id: "",
  item_grp_id: "",
  item_id: "",
  quantity: "",
  weight: "",
  unit_conversion: "",
  actual_rate: 0,
  issue_value: 0,
  branch_mr_no: undefined,
  mr_num: undefined,
  jute_gate_entry_no: undefined,
  dept_name: undefined,
  area_name: undefined,
  item_name: undefined,
  jute_group_name: undefined,
  balqty: undefined,
  balweight: undefined,
});

/**
 * Build default form values for header.
 */
export const buildDefaultFormValues = (): Record<string, unknown> => ({
  branch: "",
  date: new Date().toISOString().slice(0, 10),
});

/**
 * Check if a line item has any data entered.
 */
export const lineHasAnyData = (line: EditableLineItem): boolean =>
  Boolean(
    line.stock_key ||
    line.yarn_type_id ||
    line.item_id ||
    line.quantity ||
    line.weight
  );

/**
 * Check if a line item is complete (has all required fields).
 *
 * Gated on stock_key rather than jute_mr_li_id: a waste line legitimately has
 * no MR line, so the old check would have called every waste line incomplete.
 */
export const lineIsComplete = (line: EditableLineItem): boolean => {
  const qty = Number(line.quantity);
  const weight = Number(line.weight);
  return Boolean(
    line.stock_key &&
    line.yarn_type_id &&
    Number.isFinite(qty) &&
    qty > 0 &&
    Number.isFinite(weight) &&
    weight > 0
  );
};

/**
 * Calculate issue value from weight and rate.
 * Rate is per quintal (100 kg), weight is in kg.
 */
/**
 * Day totals over the saved + draft lines. A REJECTED (4) line gave its stock
 * back, so it stays listed for the audit trail but never counts (TKT-000160).
 */
export const sumLineTotals = (
  lines: EditableLineItem[]
): { totalWeight: number; totalValue: number; totalQty: number } => {
  let totalWeight = 0;
  let totalValue = 0;
  let totalQty = 0;
  for (const item of lines) {
    if (Number(item.status_id) === 4) continue;
    totalWeight += Number(item.weight) || 0;
    totalValue += Number(item.issue_value) || 0;
    totalQty += Number(item.quantity) || 0;
  }
  return {
    totalWeight: Math.round(totalWeight * 100) / 100,
    totalValue: Math.round(totalValue * 100) / 100,
    totalQty: Math.round(totalQty * 100) / 100,
  };
};

export const calculateIssueValue = (weight: number, rate: number): number => {
  if (!weight || !rate) return 0;
  return Math.round(((weight / 100) * rate) * 100) / 100;
};
