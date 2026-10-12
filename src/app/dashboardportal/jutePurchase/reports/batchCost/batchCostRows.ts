/**
 * TKT-000213 (owner comment 2026-10-08): the Batch Cost Report opens with a
 * yarn-quality-wise table of batch cost per ton, and the jute-quality breakup
 * of each yarn quality sits below it.
 *
 * Pure helpers over the rows GET /api/juteReports/batch-cost already returns
 * (one row per yarn quality x jute quality) — no extra request.
 *
 * Cost per ton = value / weight (kg) x 1000, from the report's Value column,
 * so cost per ton x weight always equals the value shown (on the Accounts
 * basis that is the accounts value). A jute quality's "cost/ton share" is its
 * value / its yarn quality's total weight x 1000, so the shares of one yarn
 * quality add up to that yarn quality's cost per ton, and its "mix %" is its
 * weight / the yarn quality's total weight x 100.
 *
 * Jute waste re-issued into a batch (rows with is_waste = 1, owner ruling
 * 2026-10-08) is NOT part of the batch cost: it is left out of every weight,
 * value, cost per ton, mix % and Total, and shows only as memo lines under its
 * yarn quality's Total (and as memo waste columns in the summary).
 */
import type { BatchCostReportRow } from "../types/reportTypes";

/** Per-ton cost of `value` spread over `weightKg`; 0 when nothing was issued. */
export function costPerTon(value: number, weightKg: number): number {
  return weightKg > 0 ? (value / weightKg) * 1000 : 0;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const yarnKey = (r: { yarn_type_id: number | null }) => String(r.yarn_type_id);

/** Jute waste re-issued into the batch — a memo line, not batch cost. */
export const isWasteRow = (r: BatchCostReportRow): boolean => num(r.is_waste) === 1;

/** One row of the yarn-quality summary table. */
export interface BatchCostYarnSummaryRow {
  id: string;
  yarn_type_name: string;
  day_weight: number;
  day_value: number;
  day_cost_per_ton: number;
  mtd_weight: number;
  mtd_value: number;
  mtd_cost_per_ton: number;
  /** Memo: waste re-issued into the yarn quality, kg — not in the cost above. */
  day_waste_weight: number;
  mtd_waste_weight: number;
}

/** A breakup-grid row: a jute quality line, the yarn quality's subtotal
 * closing its group (item_name "Total", which the grid and Excel shade), or a
 * waste memo line after that Total (not counted in it). */
export interface BatchCostBreakupRow extends BatchCostReportRow {
  row_kind: "line" | "subtotal" | "waste";
  day_mix_pct: number;
  day_cost_per_ton_share: number;
  mtd_mix_pct: number;
  mtd_cost_per_ton_share: number;
}

interface Totals {
  name: string;
  dayWt: number;
  dayVal: number;
  mtdWt: number;
  mtdVal: number;
  dayWasteWt: number;
  mtdWasteWt: number;
}

function totalsByYarn(rows: BatchCostReportRow[]): Map<string, Totals> {
  const out = new Map<string, Totals>();
  for (const r of rows) {
    const k = yarnKey(r);
    const t = out.get(k) ?? {
      name: r.yarn_type_name,
      dayWt: 0,
      dayVal: 0,
      mtdWt: 0,
      mtdVal: 0,
      dayWasteWt: 0,
      mtdWasteWt: 0,
    };
    if (isWasteRow(r)) {
      t.dayWasteWt += num(r.actual_weight);
      t.mtdWasteWt += num(r.mtd_actual_weight);
    } else {
      t.dayWt += num(r.actual_weight);
      t.dayVal += num(r.issue_value);
      t.mtdWt += num(r.mtd_actual_weight);
      t.mtdVal += num(r.mtd_issue_value);
    }
    out.set(k, t);
  }
  return out;
}

const byName = (a: string, b: string) =>
  (a ?? "").localeCompare(b ?? "", undefined, { sensitivity: "base" });

/**
 * The summary table: one row per yarn quality (by name) plus a Grand Total
 * whose cost per ton is weighted (total value / total weight), never an
 * average of the yarn rows. Subtotal rows in the input are ignored.
 */
export function batchCostYarnSummary(
  rows: BatchCostReportRow[],
): BatchCostYarnSummaryRow[] {
  // Breakup subtotals are ignored; waste rows feed only the memo columns.
  const lines = rows.filter(
    (r) => (r as Partial<BatchCostBreakupRow>).row_kind !== "subtotal",
  );
  const totals = totalsByYarn(lines);
  const out: BatchCostYarnSummaryRow[] = [...totals.entries()]
    .sort(([, a], [, b]) => byName(a.name, b.name))
    .map(([k, t]) => ({
      id: k,
      yarn_type_name: t.name,
      day_weight: t.dayWt,
      day_value: t.dayVal,
      day_cost_per_ton: costPerTon(t.dayVal, t.dayWt),
      mtd_weight: t.mtdWt,
      mtd_value: t.mtdVal,
      mtd_cost_per_ton: costPerTon(t.mtdVal, t.mtdWt),
      day_waste_weight: t.dayWasteWt,
      mtd_waste_weight: t.mtdWasteWt,
    }));
  if (out.length === 0) return out;
  const g = out.reduce(
    (acc, r) => ({
      dayWt: acc.dayWt + r.day_weight,
      dayVal: acc.dayVal + r.day_value,
      mtdWt: acc.mtdWt + r.mtd_weight,
      mtdVal: acc.mtdVal + r.mtd_value,
      dayWaste: acc.dayWaste + r.day_waste_weight,
      mtdWaste: acc.mtdWaste + r.mtd_waste_weight,
    }),
    { dayWt: 0, dayVal: 0, mtdWt: 0, mtdVal: 0, dayWaste: 0, mtdWaste: 0 },
  );
  out.push({
    id: "__grand_total__",
    yarn_type_name: "Grand Total",
    day_weight: g.dayWt,
    day_value: g.dayVal,
    day_cost_per_ton: costPerTon(g.dayVal, g.dayWt),
    mtd_weight: g.mtdWt,
    mtd_value: g.mtdVal,
    mtd_cost_per_ton: costPerTon(g.mtdVal, g.mtdWt),
    day_waste_weight: g.dayWaste,
    mtd_waste_weight: g.mtdWaste,
  });
  return out;
}

/**
 * The breakup grid: each yarn quality's jute-quality lines (by name) with
 * their mix % and cost/ton share, closed by a "Total" subtotal row whose
 * cost/ton share is the yarn quality's cost per ton. Yarn qualities in name
 * order, the same order as the summary table above.
 */
export function batchCostBreakupRows(
  rows: BatchCostReportRow[],
): BatchCostBreakupRow[] {
  const totals = totalsByYarn(rows);
  const groups = new Map<string, BatchCostReportRow[]>();
  for (const r of rows) {
    const k = yarnKey(r);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const out: BatchCostBreakupRow[] = [];
  const keys = [...groups.keys()].sort((a, b) =>
    byName(totals.get(a)!.name, totals.get(b)!.name),
  );
  for (const k of keys) {
    const t = totals.get(k)!;
    const pct = (w: number, tot: number) => (tot > 0 ? (w / tot) * 100 : 0);
    const sorted = [...groups.get(k)!].sort((a, b) =>
      byName(a.item_name, b.item_name),
    );
    const lines = sorted.filter((r) => !isWasteRow(r));
    const waste = sorted.filter(isWasteRow);
    for (const r of lines) {
      out.push({
        ...r,
        row_kind: "line",
        day_mix_pct: pct(num(r.actual_weight), t.dayWt),
        day_cost_per_ton_share: costPerTon(num(r.issue_value), t.dayWt),
        mtd_mix_pct: pct(num(r.mtd_actual_weight), t.mtdWt),
        mtd_cost_per_ton_share: costPerTon(num(r.mtd_issue_value), t.mtdWt),
      });
    }
    const sum = (f: keyof BatchCostReportRow) =>
      lines.reduce((s, r) => s + num(r[f]), 0);
    const first = lines[0] ?? sorted[0];
    out.push({
      yarn_type_id: first.yarn_type_id,
      yarn_type_name: t.name,
      item_id: first.item_id,
      item_name: "Total",
      item_grp_id: first.item_grp_id,
      item_group_name: "",
      planned_weight: sum("planned_weight"),
      actual_weight: t.dayWt,
      // Weight-averaged line rates (per quintal) — the backend's day rate is
      // stored value / weight, which on the Accounts basis is not the Value
      // column, so this is NOT dayVal / dayWt there.
      actual_rate:
        t.dayWt > 0
          ? lines.reduce(
              (s, r) => s + num(r.actual_rate) * num(r.actual_weight),
              0,
            ) / t.dayWt
          : 0,
      issue_value: t.dayVal,
      variance: sum("variance"),
      mtd_planned_weight: sum("mtd_planned_weight"),
      mtd_actual_weight: t.mtdWt,
      mtd_actual_rate: t.mtdWt > 0 ? (t.mtdVal / t.mtdWt) * 100 : 0,
      mtd_issue_value: t.mtdVal,
      mtd_variance: sum("mtd_variance"),
      row_kind: "subtotal",
      day_mix_pct: t.dayWt > 0 ? 100 : 0,
      day_cost_per_ton_share: costPerTon(t.dayVal, t.dayWt),
      mtd_mix_pct: t.mtdWt > 0 ? 100 : 0,
      mtd_cost_per_ton_share: costPerTon(t.mtdVal, t.mtdWt),
    });
    // Memo: waste re-issued into this yarn quality — weights only, never in
    // the Total above or in any cost figure.
    for (const r of waste) {
      out.push({
        ...r,
        item_name: `${r.item_name} (waste re-issued, memo)`,
        actual_rate: 0,
        issue_value: 0,
        mtd_actual_rate: 0,
        mtd_issue_value: 0,
        row_kind: "waste",
        day_mix_pct: 0,
        day_cost_per_ton_share: 0,
        mtd_mix_pct: 0,
        mtd_cost_per_ton_share: 0,
      });
    }
  }
  return out;
}
