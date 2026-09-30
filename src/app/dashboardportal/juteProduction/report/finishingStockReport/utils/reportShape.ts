/**
 * Flattens the Finishing Stock report into one tabular row list.
 *
 * The page renders the report as the mill's Excel does — per-owner bale cards,
 * a loose-stock card and a despatch table — but Excel export and any future
 * grid need a single flat sheet. `flattenReport` is that projection, kept pure
 * (and unit-tested) so the page component stays presentation only.
 */

import type { GridColDef } from "@mui/x-data-grid";
import type {
  FinishingStockBaleLine,
  FinishingStockReport,
} from "@/utils/finishingStockService";

export interface FlatRow {
  /** Owner company name, "LOOSE STOCK" or "DESPATCH". */
  block: string;
  /** "HESSIAN", "SACKING" or "DESPATCH". */
  section: string;
  /** Quality / item name, or "TOTAL" / "GRAND TOTAL" on a summary row. */
  item: string;
  bales: number | null;
  per_wt_kg: number | null;
  wt_mt: number;
}

const LOOSE_BLOCK = "LOOSE STOCK";
const DESPATCH_BLOCK = "DESPATCH";

/**
 * Columns of the flattened Excel sheet (the screen layout is hand-laid).
 *
 * `item` leads on purpose: the shared exporter shades summary rows through
 * `reportTotalLevel`, which reads the level off the FIRST column — "Grand
 * Total" there means the grand shade, any other non-empty value means a group
 * subtotal. `item` is the column carrying "TOTAL" / "GRAND TOTAL"; with `block`
 * (the owner name) leading, every summary row would come out the same mid
 * shade. Covered by reportShape.test.ts.
 */
export const EXPORT_COLUMNS: GridColDef<FlatRow>[] = [
  { field: "item", headerName: "Quality / Item", width: 280 },
  { field: "block", headerName: "Block", width: 220 },
  { field: "section", headerName: "Section", width: 120 },
  { field: "bales", headerName: "Bales", type: "number", width: 100 },
  { field: "per_wt_kg", headerName: "Per-bale Kg", type: "number", width: 130 },
  { field: "wt_mt", headerName: "MT", type: "number", width: 110 },
];

const baleRow = (
  block: string,
  section: string,
  line: FinishingStockBaleLine,
): FlatRow => ({
  block,
  section,
  item: line.item_name ?? "",
  bales: line.bales,
  per_wt_kg: line.per_wt_kg,
  wt_mt: line.wt_mt,
});

/** Section subtotal / block grand total. Per-bale kg is meaningless on a
 * summary row (it is a weighted average of mixed qualities), so it stays null. */
const totalRow = (
  block: string,
  section: string,
  item: string,
  bales: number | null,
  wt_mt: number,
): FlatRow => ({ block, section, item, bales, per_wt_kg: null, wt_mt });

export function flattenReport(report: FinishingStockReport): FlatRow[] {
  const rows: FlatRow[] = [];

  for (const b of report.bales) {
    const block = b.owner_co_name;
    if (b.hessian.length) {
      for (const line of b.hessian) rows.push(baleRow(block, "HESSIAN", line));
      rows.push(
        totalRow(
          block,
          "HESSIAN",
          "TOTAL",
          b.hessian_total.bales,
          b.hessian_total.wt_mt,
        ),
      );
    }
    if (b.sacking.length) {
      for (const line of b.sacking) rows.push(baleRow(block, "SACKING", line));
      rows.push(
        totalRow(
          block,
          "SACKING",
          "TOTAL",
          b.sacking_total.bales,
          b.sacking_total.wt_mt,
        ),
      );
    }
    if (b.hessian.length || b.sacking.length) {
      rows.push(
        totalRow(block, "", "GRAND TOTAL", b.total.bales, b.total.wt_mt),
      );
    }
  }

  const { loose } = report;
  if (loose.hessian.length) {
    for (const line of loose.hessian) {
      rows.push(
        totalRow(
          LOOSE_BLOCK,
          "HESSIAN",
          line.item_name ?? "",
          null,
          line.wt_mt,
        ),
      );
    }
    rows.push(
      totalRow(LOOSE_BLOCK, "HESSIAN", "TOTAL", null, loose.hessian_total_mt),
    );
  }
  if (loose.sacking.length) {
    for (const line of loose.sacking) {
      rows.push(
        totalRow(
          LOOSE_BLOCK,
          "SACKING",
          line.item_name ?? "",
          null,
          line.wt_mt,
        ),
      );
    }
    rows.push(
      totalRow(LOOSE_BLOCK, "SACKING", "TOTAL", null, loose.sacking_total_mt),
    );
  }
  if (loose.hessian.length || loose.sacking.length) {
    rows.push(totalRow(LOOSE_BLOCK, "", "GRAND TOTAL", null, loose.total_mt));
  }

  for (const d of report.despatch) {
    rows.push({
      block: DESPATCH_BLOCK,
      section: DESPATCH_BLOCK,
      item: d.item_name ?? "",
      bales: d.bales,
      per_wt_kg: null,
      wt_mt: d.qty,
    });
  }

  return rows;
}

const isZeroBale = (l: FinishingStockBaleLine): boolean =>
  l.bales === 0 && l.wt_mt === 0;

/**
 * True when the day carries nothing to show. The own bale block and the loose
 * block are ZERO-FILLED by the backend — every active quality of the company is
 * listed with 0 bales / 0.000 MT, because that is how the Excel prints — so a
 * day with no entries still arrives with full arrays. Emptiness is therefore a
 * question of values, never of array length: every bale line 0 bales and
 * 0 MT, every loose line 0 MT, and no stage or despatch line at all.
 * (`[].every(...)` is true, so genuinely empty arrays pass the same test.)
 */
export function isReportEmpty(report: FinishingStockReport): boolean {
  return (
    report.bales.every(
      (b) => b.hessian.every(isZeroBale) && b.sacking.every(isZeroBale),
    ) &&
    report.loose.hessian.every((l) => l.wt_mt === 0) &&
    report.loose.sacking.every((l) => l.wt_mt === 0) &&
    !report.loose_lines.length &&
    !report.despatch.length
  );
}
