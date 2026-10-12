import { describe, expect, it } from "vitest";
import type { BaleStockSeriesLine, BaleStockSummaryLine } from "@/utils/baleStockService";
import type { FinishingStockRow } from "@/utils/finishingStockService";
import {
  buildDisplayRows,
  DERIVED_GROUP,
  isSubtotalRow,
  seriesLinesFor,
  seriesName,
  toSeriesRow,
} from "./displayRows";

function row(over: Partial<FinishingStockRow>): FinishingStockRow {
  return {
    finishing_stock_id: 1,
    co_id: 1,
    branch_id: 2,
    tran_date: "2026-10-12",
    bucket: "BALE",
    finishing_quality_id: 1,
    item_id: 100,
    item_code: null,
    item_name: "HESSIAN CLOTH 40-6.5",
    quality_type: 1,
    stage: null,
    stage_label: null,
    work_by: 0,
    owner_co_id: null,
    owner_co_name: "The Empire Jute Company Limited",
    qty: 0,
    qty_uom: "BALE",
    wt_per_unit_kg: null,
    wt_kg: null,
    total_kg: 0,
    remarks: null,
    ...over,
  };
}

function derivedLine(over: Partial<BaleStockSummaryLine>): BaleStockSummaryLine {
  return {
    finishing_quality_id: 1,
    item_id: 100,
    item_name: "HESSIAN CLOTH 40-6.5",
    quality_type: 1,
    bales: 0,
    inspected_bales: 0,
    total_kg: 0,
    inspected_kg: 0,
    per_wt_kg: null,
    wt_mt: 0,
    despatched_bales: 0,
    ...over,
  };
}

function seriesLine(over: Partial<BaleStockSeriesLine>): BaleStockSeriesLine {
  return {
    ...derivedLine({ finishing_quality_id: 2, item_id: 270011, item_name: "PRINTED TYPE A", quality_type: 2 }),
    bale_series_id: 1,
    series_name: "PUNJAB",
    ...over,
  };
}

const hessian = derivedLine({ bales: 70, inspected_bales: 0, per_wt_kg: 228.6, wt_mt: 16.002 });
const sackingA = derivedLine({
  finishing_quality_id: 2,
  item_id: 270011,
  item_name: "PRINTED TYPE A",
  quality_type: 2,
  bales: 120,
  inspected_bales: 80,
  per_wt_kg: 290,
  wt_mt: 34.8,
});
const sackingB = derivedLine({
  finishing_quality_id: 3,
  item_id: 270012,
  item_name: "B TWILL",
  quality_type: 2,
  bales: 10,
  inspected_bales: 10,
  per_wt_kg: 290,
  wt_mt: 2.9,
});
const series = [
  seriesLine({ bale_series_id: 1, series_name: "PUNJAB", bales: 100, inspected_bales: 60, per_wt_kg: 290, wt_mt: 29 }),
  seriesLine({ bale_series_id: 2, series_name: "BIHAR", bales: 20, inspected_bales: 20, per_wt_kg: 290, wt_mt: 5.8 }),
  seriesLine({
    bale_series_id: 1,
    series_name: "PUNJAB",
    finishing_quality_id: 3,
    item_id: 270012,
    item_name: "B TWILL",
    bales: 10,
    inspected_bales: 10,
    per_wt_kg: 290,
    wt_mt: 2.9,
  }),
];

describe("seriesName / seriesLinesFor", () => {
  it("names a series, falling back to Series #id", () => {
    expect(seriesName(seriesLine({}))).toBe("PUNJAB");
    expect(seriesName(seriesLine({ bale_series_id: 9, series_name: null }))).toBe("Series #9");
  });

  it("picks the series lines of one quality, sorted by series name", () => {
    expect(seriesLinesFor(series, 2).map((s) => s.series_name)).toEqual(["BIHAR", "PUNJAB"]);
    expect(seriesLinesFor(series, 3).map((s) => s.series_name)).toEqual(["PUNJAB"]);
    expect(seriesLinesFor(series, 99)).toEqual([]);
  });
});

describe("toSeriesRow", () => {
  it("is an information-only child line: ↳ name, bales, kg/bale, MT, inspected, no actions", () => {
    const r = toSeriesRow(series[0], "G");
    expect(r).toMatchObject({
      id: "derived-2-series-1",
      group: "G",
      source: null,
      derived: null,
      item_name: "↳ PUNJAB",
      qty: 100,
      qty_uom: "BALE",
      wt_per_unit_kg: 290,
      inspected: "60",
      mt: 29,
      superseded: false,
    });
    expect(r.series).toBe(series[0]);
    expect(isSubtotalRow(r)).toBe(false);
  });
});

describe("buildDisplayRows — series child rows (BALE_PROD)", () => {
  const rows = buildDisplayRows([], [hessian, sackingA, sackingB], series, "BALE_PROD");
  const sackingGroup = `${DERIVED_GROUP} · Sacking`;

  it("prints each sacking quality line followed by its series rows, then one subtotal", () => {
    expect(rows.map((r) => r.item_name)).toEqual([
      "HESSIAN CLOTH 40-6.5",
      "Subtotal",
      "PRINTED TYPE A",
      "↳ BIHAR",
      "↳ PUNJAB",
      "B TWILL",
      "↳ PUNJAB",
      "Subtotal",
    ]);
    expect(rows.filter((r) => r.series).every((r) => r.group === sackingGroup)).toBe(true);
    expect(rows.filter((r) => r.series).map((r) => r.id)).toEqual([
      "derived-2-series-2",
      "derived-2-series-1",
      "derived-3-series-1",
    ]);
  });

  it("does NOT count the series rows in the sacking subtotal (they are a breakup, not extra stock)", () => {
    const subtotal = rows[rows.length - 1];
    expect(isSubtotalRow(subtotal)).toBe(true);
    expect(subtotal).toMatchObject({ item_name: "Subtotal", qty: 130, inspected: "90", mt: 37.7 });
    // Sanity: had the children been summed too, the figures would double.
    const children = rows.filter((r) => r.series);
    expect(children.reduce((n, r) => n + (r.qty ?? 0), 0)).toBe(130);
    expect(subtotal.qty).toBe(130);
  });

  it("never attaches series rows to a hessian line", () => {
    const hess = buildDisplayRows(
      [],
      [hessian],
      [seriesLine({ finishing_quality_id: 1, quality_type: 1, series_name: "HESS" })],
      "BALE_PROD",
    );
    expect(hess.map((r) => r.item_name)).toEqual(["HESSIAN CLOTH 40-6.5", "Subtotal"]);
  });

  it("prints a sacking quality with no series split as a bare line", () => {
    const bare = buildDisplayRows([], [sackingA], [], "BALE_PROD");
    expect(bare.map((r) => r.item_name)).toEqual(["PRINTED TYPE A", "Subtotal"]);
  });

  it("ignores derived and series lines in MANUAL mode", () => {
    const manual = buildDisplayRows(
      [row({ finishing_stock_id: 1, qty: 70, wt_per_unit_kg: 228.6 })],
      [sackingA],
      series,
      "MANUAL",
    );
    expect(manual.map((r) => r.item_name)).toEqual(["HESSIAN CLOTH 40-6.5", "Subtotal"]);
    expect(manual.some((r) => r.series)).toBe(false);
  });
});

describe("buildDisplayRows — sheet order", () => {
  it("own derived block, manual own, superseded, other owners, then loose", () => {
    const rows = buildDisplayRows(
      [
        row({ finishing_stock_id: 1, quality_type: 2, qty: 4, wt_per_unit_kg: 290 }),
        row({ finishing_stock_id: 2, qty: 5, wt_per_unit_kg: 200, superseded: true }),
        row({ finishing_stock_id: 3, owner_co_id: 9, owner_co_name: "NEXGEN JUTE", qty: 10, wt_per_unit_kg: 200 }),
        row({ finishing_stock_id: 4, bucket: "LOOSE", qty_uom: "CUTS", qty: 19, wt_kg: 246 }),
      ],
      [hessian],
      [],
      "BALE_PROD",
    );
    expect(rows.map((r) => r.group)).toEqual([
      `${DERIVED_GROUP} · Hessian`,
      `${DERIVED_GROUP} · Hessian`,
      "Bales · Sacking",
      "Bales · Sacking",
      "Manual own-company bales (not counted)",
      "Bales · Others (NEXGEN JUTE)",
      "Bales · Others (NEXGEN JUTE)",
      "Loose · Hessian",
      "Loose · Hessian",
    ]);
    expect(rows.filter(isSubtotalRow).map((r) => r.id)).toEqual([
      "sub-DERIVED-1",
      "sub-BALE-2",
      "sub-BALE-OWNER-NEXGEN JUTE",
      "sub-LOOSE-1",
    ]);
  });
});
