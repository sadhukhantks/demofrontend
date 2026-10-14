import type {
  BaleStockSeriesLine,
  BaleStockSource,
  BaleStockSummaryLine,
} from "@/utils/baleStockService";
import type { FinishingStockRow } from "@/utils/finishingStockService";
import {
  derivedSectionTotals,
  groupRows,
  isSuperseded,
  kgToMt,
  lineTotalKg,
  qualityTypeLabel,
  sectionTotals,
  WORK_BY_LABELS,
} from "./stockCalc";

/**
 * The day grid's row model — pure, so `displayRows.test.ts` can pin the sheet
 * order and the subtotal rules down without rendering the DataGrid.
 */

export const DERIVED_GROUP = "Bales · from Bale Production";
export const SUPERSEDED_GROUP = "Manual own-company bales (not counted)";
/** Only sacking is ever inspected. */
const SACKING = 2;

/**
 * A grid line: a manual stock row, a derived Bale-Production line, a series
 * child line under a derived sacking quality, or the synthetic subtotal
 * closing a group.
 */
export interface DisplayRow {
  id: string;
  group: string;
  /** The manual row behind this line — null on derived, series and subtotal lines. */
  source: FinishingStockRow | null;
  /** The derived Bale-Production line behind this line — null elsewhere. */
  derived: BaleStockSummaryLine | null;
  /** The series line behind a "↳ PUNJAB" child row — null elsewhere. Series
   * rows are information only: no actions, and never counted in a subtotal
   * (their parent quality line already is). */
  series: BaleStockSeriesLine | null;
  /** Own-company manual row no longer counted (greyed, delete-only). */
  superseded: boolean;
  item_name: string;
  stage_label: string;
  work_by_label: string;
  qty: number | null;
  qty_uom: string;
  wt_per_unit_kg: number | null;
  /** Inspected bales as printed: a count on derived sacking lines, "—" on
   * derived hessian (never inspected), "" on manual / loose lines. */
  inspected: string;
  mt: number;
  remarks: string;
}

export function toDisplayRow(row: FinishingStockRow, group: string): DisplayRow {
  return {
    id: `row-${row.finishing_stock_id}`,
    group,
    source: row,
    derived: null,
    series: null,
    superseded: isSuperseded(row),
    item_name: row.item_name ?? `#${row.item_id}`,
    stage_label: row.bucket === "LOOSE" ? (row.stage_label ?? row.stage ?? "—") : "",
    work_by_label: row.bucket === "LOOSE" ? (WORK_BY_LABELS[row.work_by] ?? "") : "",
    qty: row.qty,
    qty_uom: row.qty_uom,
    wt_per_unit_kg: row.wt_per_unit_kg,
    inspected: "",
    mt: kgToMt(lineTotalKg(row)),
    remarks: row.remarks ?? "",
  };
}

function subtotalRow(
  id: string,
  group: string,
  rows: ReadonlyArray<FinishingStockRow>,
  showBales: boolean,
): DisplayRow {
  const totals = sectionTotals(rows);
  return {
    id,
    group,
    source: null,
    derived: null,
    series: null,
    superseded: false,
    item_name: "Subtotal",
    stage_label: "",
    work_by_label: "",
    qty: showBales ? totals.bales : null,
    qty_uom: showBales ? "BALE" : "",
    wt_per_unit_kg: null,
    inspected: "",
    mt: totals.mt,
    remarks: "",
  };
}

/** Only sacking is ever inspected; hessian prints a dash so the column never reads as "0 inspected". */
function inspectedLabel(qualityType: number, inspected: number): string {
  return qualityType === SACKING ? String(inspected) : "—";
}

export function toDerivedRow(line: BaleStockSummaryLine, group: string): DisplayRow {
  return {
    id: `derived-${line.finishing_quality_id}`,
    group,
    source: null,
    derived: line,
    series: null,
    superseded: false,
    item_name: line.item_name ?? `Quality #${line.finishing_quality_id}`,
    stage_label: "",
    work_by_label: "",
    qty: line.bales,
    qty_uom: "BALE",
    wt_per_unit_kg: line.per_wt_kg,
    inspected: inspectedLabel(line.quality_type, line.inspected_bales),
    mt: line.wt_mt,
    remarks: "",
  };
}

/** Display name of a series line — the series name, or "Series #id" when unnamed. */
export function seriesName(line: Pick<BaleStockSeriesLine, "bale_series_id" | "series_name">): string {
  const name = line.series_name?.trim();
  return name ? name : `Series #${line.bale_series_id}`;
}

/**
 * The series lines of one derived quality, sorted by series name — the child
 * rows printed under that quality line.
 */
export function seriesLinesFor(
  series: ReadonlyArray<BaleStockSeriesLine>,
  finishingQualityId: number,
): BaleStockSeriesLine[] {
  return series
    .filter((s) => s.finishing_quality_id === finishingQualityId)
    .sort((a, b) => seriesName(a).localeCompare(seriesName(b)));
}

/** "↳ PUNJAB" child row under a derived sacking quality line. */
export function toSeriesRow(line: BaleStockSeriesLine, group: string): DisplayRow {
  return {
    id: `derived-${line.finishing_quality_id}-series-${line.bale_series_id}`,
    group,
    source: null,
    derived: null,
    series: line,
    superseded: false,
    item_name: `↳ ${seriesName(line)}`,
    stage_label: "",
    work_by_label: "",
    qty: line.bales,
    qty_uom: "BALE",
    wt_per_unit_kg: line.per_wt_kg,
    inspected: String(line.inspected_bales),
    mt: line.wt_mt,
    remarks: "",
  };
}

function derivedSubtotalRow(
  id: string,
  group: string,
  lines: ReadonlyArray<BaleStockSummaryLine>,
  qualityType: number,
): DisplayRow {
  const totals = derivedSectionTotals(lines);
  return {
    id,
    group,
    source: null,
    derived: null,
    series: null,
    superseded: false,
    item_name: "Subtotal",
    stage_label: "",
    work_by_label: "",
    qty: totals.bales,
    qty_uom: "BALE",
    wt_per_unit_kg: null,
    inspected: inspectedLabel(qualityType, totals.inspected),
    mt: totals.mt,
    remarks: "",
  };
}

/** True for the synthetic subtotal line closing a group. */
export function isSubtotalRow(row: DisplayRow): boolean {
  return row.source === null && row.derived === null && row.series === null;
}

/**
 * Flatten a day into the sheet's reading order — own bale block (Hessian then
 * Sacking), one block per foreign owner, then loose Hessian / Sacking — with a
 * subtotal line closing every non-empty group. In BALE_PROD mode the own bale
 * block is the derived one, each sacking quality line followed by one child
 * row per series it is split into (`derivedSeries`); the subtotal is the sum
 * of the quality lines only — the series rows are a breakup of them, not
 * additional stock. Own-company manual rows the backend flagged as superseded
 * follow it greyed, with no subtotal (they are not counted).
 */
export function buildDisplayRows(
  rows: ReadonlyArray<FinishingStockRow>,
  derived: ReadonlyArray<BaleStockSummaryLine>,
  derivedSeries: ReadonlyArray<BaleStockSeriesLine>,
  baleSource: BaleStockSource,
): DisplayRow[] {
  const grouped = groupRows(rows);
  const out: DisplayRow[] = [];

  const section = (
    id: string,
    group: string,
    sectionRows: FinishingStockRow[],
    showBales: boolean,
  ) => {
    if (sectionRows.length === 0) return;
    sectionRows.forEach((r) => out.push(toDisplayRow(r, group)));
    out.push(subtotalRow(id, group, sectionRows, showBales));
  };

  if (baleSource === "BALE_PROD") {
    ([1, 2] as const).forEach((qualityType) => {
      const lines = derived.filter((l) => l.quality_type === qualityType);
      if (lines.length === 0) return;
      const group = `${DERIVED_GROUP} · ${qualityTypeLabel(qualityType)}`;
      lines.forEach((l) => {
        out.push(toDerivedRow(l, group));
        if (qualityType === SACKING) {
          seriesLinesFor(derivedSeries, l.finishing_quality_id).forEach((s) =>
            out.push(toSeriesRow(s, group)),
          );
        }
      });
      out.push(derivedSubtotalRow(`sub-DERIVED-${qualityType}`, group, lines, qualityType));
    });
  }

  // Own-company manual bales. In BALE_PROD mode the backend flags these
  // superseded, so this block is normally empty there — anything it did not
  // flag stays visible rather than being dropped on the client.
  ([1, 2] as const).forEach((qualityType) => {
    section(
      `sub-BALE-${qualityType}`,
      `Bales · ${qualityTypeLabel(qualityType)}`,
      grouped.bale.own.filter((r) => r.quality_type === qualityType),
      true,
    );
  });

  grouped.bale.superseded.forEach((r) => out.push(toDisplayRow(r, SUPERSEDED_GROUP)));

  Object.keys(grouped.bale.others)
    .sort((a, b) => a.localeCompare(b))
    .forEach((owner) => {
      section(
        `sub-BALE-OWNER-${owner}`,
        `Bales · Others (${owner})`,
        grouped.bale.others[owner],
        true,
      );
    });

  section("sub-LOOSE-1", "Loose · Hessian", grouped.loose.hessian, false);
  section("sub-LOOSE-2", "Loose · Sacking", grouped.loose.sacking, false);

  return out;
}
