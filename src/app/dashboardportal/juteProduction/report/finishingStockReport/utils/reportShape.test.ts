import { describe, expect, it } from "vitest";
import type {
  FinishingStockBaleBlock,
  FinishingStockReport,
} from "@/utils/finishingStockService";
import { reportTotalLevel } from "@/components/reports/ReportGrid";
import {
  EXPORT_COLUMNS,
  SERIES_SECTION,
  flattenReport,
  isReportEmpty,
} from "./reportShape";

const baleLine = (
  name: string,
  bales: number,
  per: number | null,
  mt: number,
  inspected: number | null = null,
) => ({
  finishing_quality_id: 1,
  item_id: 10,
  item_name: name,
  bales,
  per_wt_kg: per,
  wt_mt: mt,
  inspected_bales: inspected,
});

const block = (
  name: string,
  isOwn: boolean,
  over: Partial<FinishingStockBaleBlock> = {},
): FinishingStockBaleBlock => ({
  owner_co_id: isOwn ? null : 2,
  owner_co_name: name,
  is_own: isOwn,
  hessian: [],
  sacking: [],
  hessian_total: { bales: 0, wt_mt: 0 },
  sacking_total: { bales: 0, wt_mt: 0 },
  total: { bales: 0, wt_mt: 0 },
  series: [],
  series_total: { bales: 0, inspected_bales: 0, wt_mt: 0 },
  ...over,
});

const seriesLine = (
  series: string | null,
  quality: string,
  bales: number,
  inspected: number,
  per: number | null,
  mt: number,
  seriesId = 1,
  qualityId = 2,
) => ({
  bale_series_id: seriesId,
  series_name: series,
  finishing_quality_id: qualityId,
  item_name: quality,
  bales,
  inspected_bales: inspected,
  per_wt_kg: per,
  wt_mt: mt,
});

const report = (
  over: Partial<FinishingStockReport> = {},
): FinishingStockReport => ({
  tran_date: "2026-09-16",
  co_name: "The Empire Jute Company Limited",
  branch_name: "Factory",
  bales: [],
  loose: {
    hessian: [],
    sacking: [],
    hessian_total_mt: 0,
    sacking_total_mt: 0,
    total_mt: 0,
  },
  loose_lines: [],
  despatch: [],
  totals: { bales_mt: 0, loose_mt: 0, stock_mt: 0 },
  bale_source: "MANUAL",
  ...over,
});

describe("flattenReport — bale blocks", () => {
  const rows = flattenReport(
    report({
      bales: [
        block("EMPIRE", true, {
          hessian: [baleLine("HESSIAN CLOTH 40-6.5", 70, 228.6, 16.002)],
          sacking: [baleLine("SACKING B-TWILL", 4, 290, 1.16)],
          hessian_total: { bales: 70, wt_mt: 16.002 },
          sacking_total: { bales: 4, wt_mt: 1.16 },
          total: { bales: 74, wt_mt: 17.162 },
        }),
      ],
    }),
  );

  it("emits one row per bale line, tagged with its section and owner block", () => {
    expect(rows[0]).toEqual({
      block: "EMPIRE",
      section: "HESSIAN",
      item: "HESSIAN CLOTH 40-6.5",
      bales: 70,
      inspected: null,
      per_wt_kg: 228.6,
      wt_mt: 16.002,
    });
    expect(rows[2]).toMatchObject({
      block: "EMPIRE",
      section: "SACKING",
      item: "SACKING B-TWILL",
      bales: 4,
      wt_mt: 1.16,
    });
  });

  it("appends a TOTAL row per section and a GRAND TOTAL row for the block", () => {
    expect(rows[1]).toMatchObject({
      section: "HESSIAN",
      item: "TOTAL",
      bales: 70,
      per_wt_kg: null,
      wt_mt: 16.002,
    });
    expect(rows[3]).toMatchObject({
      section: "SACKING",
      item: "TOTAL",
      bales: 4,
      wt_mt: 1.16,
    });
    expect(rows[4]).toMatchObject({
      block: "EMPIRE",
      item: "GRAND TOTAL",
      bales: 74,
      wt_mt: 17.162,
    });
    expect(rows).toHaveLength(5);
  });

  it("keeps each owner block separate, in the order the API sent them", () => {
    const multi = flattenReport(
      report({
        bales: [
          block("EMPIRE", true, {
            hessian: [baleLine("H1", 1, 100, 0.1)],
            hessian_total: { bales: 1, wt_mt: 0.1 },
            total: { bales: 1, wt_mt: 0.1 },
          }),
          block("NEXGEN", false, {
            sacking: [baleLine("S1", 2, 200, 0.4)],
            sacking_total: { bales: 2, wt_mt: 0.4 },
            total: { bales: 2, wt_mt: 0.4 },
          }),
        ],
      }),
    );
    expect(multi.map((r) => r.block)).toEqual([
      "EMPIRE",
      "EMPIRE",
      "EMPIRE",
      "NEXGEN",
      "NEXGEN",
      "NEXGEN",
    ]);
  });
});

describe("flattenReport — inspected bales (BALE_PROD)", () => {
  const rows = flattenReport(
    report({
      bale_source: "BALE_PROD",
      bales: [
        block("EMPIRE", true, {
          hessian: [baleLine("H1", 70, 228.6, 16.002, 0)],
          sacking: [baleLine("S1", 4, 290, 1.16, 3)],
          hessian_total: { bales: 70, wt_mt: 16.002 },
          sacking_total: { bales: 4, wt_mt: 1.16 },
          total: { bales: 74, wt_mt: 17.162 },
        }),
        block("NEXGEN", false, {
          sacking: [baleLine("S2", 2, 200, 0.4)],
          sacking_total: { bales: 2, wt_mt: 0.4 },
          total: { bales: 2, wt_mt: 0.4 },
        }),
      ],
    }),
  );

  it("carries inspected_bales onto each bale line and leaves the totals null", () => {
    expect(rows[0]).toMatchObject({ item: "H1", inspected: 0 });
    expect(rows[1]).toMatchObject({ item: "TOTAL", inspected: null });
    expect(rows[2]).toMatchObject({ item: "S1", inspected: 3 });
    expect(rows[3]).toMatchObject({ item: "TOTAL", inspected: null });
    expect(rows[4]).toMatchObject({ item: "GRAND TOTAL", inspected: null });
  });

  it("is null on another owner's manual lines", () => {
    expect(rows[5]).toMatchObject({ block: "NEXGEN", item: "S2", inspected: null });
  });
});

describe("flattenReport — sacking by series (BALE_PROD, own block)", () => {
  const rows = flattenReport(
    report({
      bale_source: "BALE_PROD",
      bales: [
        block("EMPIRE", true, {
          hessian: [baleLine("H1", 70, 228.6, 16.002, 0)],
          sacking: [baleLine("S1", 120, 290, 34.8, 80)],
          hessian_total: { bales: 70, wt_mt: 16.002 },
          sacking_total: { bales: 120, wt_mt: 34.8 },
          total: { bales: 190, wt_mt: 50.802 },
          series: [
            seriesLine("BIHAR", "S1", 20, 20, 290, 5.8, 2),
            seriesLine("PUNJAB", "S1", 100, 60, 290, 29, 1),
          ],
          series_total: { bales: 120, inspected_bales: 80, wt_mt: 34.8 },
        }),
        block("NEXGEN", false, {
          sacking: [baleLine("S2", 2, 200, 0.4)],
          sacking_total: { bales: 2, wt_mt: 0.4 },
          total: { bales: 2, wt_mt: 0.4 },
        }),
      ],
    }),
  );

  it("emits the series rows right after the block's GRAND TOTAL, in the order sent", () => {
    expect(rows[4]).toMatchObject({ block: "EMPIRE", item: "GRAND TOTAL" });
    expect(rows[5]).toEqual({
      block: "EMPIRE",
      section: SERIES_SECTION,
      item: "BIHAR",
      bales: 20,
      inspected: 20,
      per_wt_kg: 290,
      wt_mt: 5.8,
    });
    expect(rows[6]).toEqual({
      block: "EMPIRE",
      section: SERIES_SECTION,
      item: "PUNJAB",
      bales: 100,
      inspected: 60,
      per_wt_kg: 290,
      wt_mt: 29,
    });
  });

  it("closes the section with a TOTAL row from series_total (no per-bale kg)", () => {
    expect(rows[7]).toEqual({
      block: "EMPIRE",
      section: SERIES_SECTION,
      item: "TOTAL",
      bales: 120,
      inspected: 80,
      per_wt_kg: null,
      wt_mt: 34.8,
    });
    expect(SERIES_SECTION).toBe("SACKING BY SERIES");
  });

  it("leaves the block's own GRAND TOTAL alone — the series rows are a breakup, not extra stock", () => {
    expect(rows[4]).toMatchObject({ bales: 190, wt_mt: 50.802 });
  });

  it("emits no series rows for a block without any, and keeps the next block after them", () => {
    expect(rows[8]).toMatchObject({ block: "NEXGEN", item: "S2" });
    expect(rows.filter((r) => r.section === SERIES_SECTION).map((r) => r.block)).toEqual([
      "EMPIRE",
      "EMPIRE",
      "EMPIRE",
    ]);
    expect(rows).toHaveLength(11);
  });

  it("renders an unnamed series as an empty cell rather than the word null", () => {
    const unnamed = flattenReport(
      report({
        bale_source: "BALE_PROD",
        bales: [
          block("EMPIRE", true, {
            sacking: [baleLine("S1", 1, 290, 0.29, 0)],
            sacking_total: { bales: 1, wt_mt: 0.29 },
            total: { bales: 1, wt_mt: 0.29 },
            series: [seriesLine(null, "S1", 1, 0, 290, 0.29, 9)],
            series_total: { bales: 1, inspected_bales: 0, wt_mt: 0.29 },
          }),
        ],
      }),
    );
    expect(unnamed.find((r) => r.section === SERIES_SECTION)?.item).toBe("");
  });
});

describe("flattenReport — loose stock", () => {
  const rows = flattenReport(
    report({
      loose: {
        hessian: [
          {
            finishing_quality_id: 3,
            item_id: 30,
            item_name: "H CUTS",
            wt_mt: 10.674,
          },
        ],
        sacking: [
          {
            finishing_quality_id: 4,
            item_id: 40,
            item_name: "S BAGS",
            wt_mt: 18.645,
          },
        ],
        hessian_total_mt: 10.674,
        sacking_total_mt: 18.645,
        total_mt: 29.319,
      },
    }),
  );

  it("emits loose lines under the LOOSE STOCK block with no bale counts", () => {
    expect(rows[0]).toEqual({
      block: "LOOSE STOCK",
      section: "HESSIAN",
      item: "H CUTS",
      bales: null,
      inspected: null,
      per_wt_kg: null,
      wt_mt: 10.674,
    });
    expect(rows[2]).toMatchObject({
      section: "SACKING",
      item: "S BAGS",
      wt_mt: 18.645,
    });
  });

  it("appends the section totals and the loose grand total", () => {
    expect(rows[1]).toMatchObject({
      section: "HESSIAN",
      item: "TOTAL",
      wt_mt: 10.674,
    });
    expect(rows[3]).toMatchObject({
      section: "SACKING",
      item: "TOTAL",
      wt_mt: 18.645,
    });
    expect(rows[4]).toMatchObject({
      block: "LOOSE STOCK",
      item: "GRAND TOTAL",
      bales: null,
      wt_mt: 29.319,
    });
  });
});

describe("flattenReport — despatch", () => {
  it("carries the despatched quantity in wt_mt and keeps its bale count", () => {
    const rows = flattenReport(
      report({
        despatch: [
          {
            item_id: 270002,
            item_name: "HESSIAN CLOTH 40",
            bales: 22,
            qty: 6.123,
            uom_name: "MT",
          },
          {
            item_id: 270003,
            item_name: "SACKING",
            bales: null,
            qty: 1.5,
            uom_name: "MT",
          },
        ],
      }),
    );
    expect(rows).toEqual([
      {
        block: "DESPATCH",
        section: "DESPATCH",
        item: "HESSIAN CLOTH 40",
        bales: 22,
        inspected: null,
        per_wt_kg: null,
        wt_mt: 6.123,
      },
      {
        block: "DESPATCH",
        section: "DESPATCH",
        item: "SACKING",
        bales: null,
        inspected: null,
        per_wt_kg: null,
        wt_mt: 1.5,
      },
    ]);
  });

  it("renders a missing item name as an empty cell rather than the word null", () => {
    const rows = flattenReport(
      report({
        despatch: [
          { item_id: 1, item_name: null, bales: null, qty: 2, uom_name: null },
        ],
      }),
    );
    expect(rows[0].item).toBe("");
  });
});

describe("flattenReport — ordering and empties", () => {
  it("returns nothing for a day with no rows at all", () => {
    expect(flattenReport(report())).toEqual([]);
  });

  it("orders the sheet bales then loose then despatch", () => {
    const rows = flattenReport(
      report({
        bales: [
          block("EMPIRE", true, {
            hessian: [baleLine("H1", 1, 100, 0.1)],
            hessian_total: { bales: 1, wt_mt: 0.1 },
            total: { bales: 1, wt_mt: 0.1 },
          }),
        ],
        loose: {
          hessian: [
            {
              finishing_quality_id: 3,
              item_id: 30,
              item_name: "H CUTS",
              wt_mt: 2,
            },
          ],
          sacking: [],
          hessian_total_mt: 2,
          sacking_total_mt: 0,
          total_mt: 2,
        },
        despatch: [
          { item_id: 1, item_name: "D1", bales: null, qty: 3, uom_name: "MT" },
        ],
      }),
    );
    expect(rows.map((r) => r.block)).toEqual([
      "EMPIRE",
      "EMPIRE",
      "EMPIRE",
      "LOOSE STOCK",
      "LOOSE STOCK",
      "LOOSE STOCK",
      "DESPATCH",
    ]);
  });
});

describe("isReportEmpty", () => {
  it("is true when the day has no bale, loose or despatch line", () => {
    expect(isReportEmpty(report())).toBe(true);
  });

  // The backend never sends empty arrays for the own company: it lists every
  // active quality at 0 bales / 0.000 MT, the way the Excel prints them. An
  // empty day therefore arrives FULL, and emptiness has to be read off the
  // values.
  it("is true when the own bale block is zero-filled with every quality", () => {
    expect(
      isReportEmpty(
        report({
          bales: [
            block("EMPIRE", true, {
              hessian: [baleLine("HESSIAN CLOTH 40-6.5", 0, 228.6, 0)],
              sacking: [baleLine("SACKING B-TWILL", 0, 290, 0)],
            }),
          ],
        }),
      ),
    ).toBe(true);
  });

  it("is true when the loose block is zero-filled with every quality", () => {
    expect(
      isReportEmpty(
        report({
          loose: {
            hessian: [
              {
                finishing_quality_id: 3,
                item_id: 30,
                item_name: "H",
                wt_mt: 0,
              },
            ],
            sacking: [
              {
                finishing_quality_id: 4,
                item_id: 40,
                item_name: "S",
                wt_mt: 0,
              },
            ],
            hessian_total_mt: 0,
            sacking_total_mt: 0,
            total_mt: 0,
          },
        }),
      ),
    ).toBe(true);
  });

  it("is false when a zero-filled block hides one counted bale line", () => {
    expect(
      isReportEmpty(
        report({
          bales: [
            block("EMPIRE", true, {
              hessian: [
                baleLine("H ZERO", 0, 228.6, 0),
                baleLine("H COUNTED", 70, 228.6, 16.002),
              ],
              sacking: [baleLine("S ZERO", 0, 290, 0)],
            }),
          ],
        }),
      ),
    ).toBe(false);
  });

  it("is false when a zero-filled loose block hides one weighed line", () => {
    expect(
      isReportEmpty(
        report({
          loose: {
            hessian: [
              {
                finishing_quality_id: 3,
                item_id: 30,
                item_name: "H",
                wt_mt: 0,
              },
            ],
            sacking: [
              {
                finishing_quality_id: 4,
                item_id: 40,
                item_name: "S",
                wt_mt: 0.246,
              },
            ],
            hessian_total_mt: 0,
            sacking_total_mt: 0.246,
            total_mt: 0.246,
          },
        }),
      ),
    ).toBe(false);
  });

  it("is false when a block lists bales by series (they always come with a counted sacking line)", () => {
    expect(
      isReportEmpty(
        report({
          bale_source: "BALE_PROD",
          bales: [
            block("EMPIRE", true, {
              hessian: [baleLine("H ZERO", 0, 228.6, 0, 0)],
              sacking: [baleLine("S1", 20, 290, 5.8, 20)],
              series: [seriesLine("BIHAR", "S1", 20, 20, 290, 5.8, 2)],
              series_total: { bales: 20, inspected_bales: 20, wt_mt: 5.8 },
            }),
          ],
        }),
      ),
    ).toBe(false);
    // Defensive: a series line with bales is enough on its own.
    expect(
      isReportEmpty(
        report({
          bale_source: "BALE_PROD",
          bales: [
            block("EMPIRE", true, {
              sacking: [baleLine("S1", 0, 290, 0, 0)],
              series: [seriesLine("BIHAR", "S1", 20, 20, 290, 5.8, 2)],
            }),
          ],
        }),
      ),
    ).toBe(false);
  });

  it("stays true for an empty block whose series list is empty", () => {
    expect(
      isReportEmpty(
        report({
          bale_source: "BALE_PROD",
          bales: [block("EMPIRE", true, { sacking: [baleLine("S1", 0, 290, 0, 0)], series: [] })],
        }),
      ),
    ).toBe(true);
  });

  it("is false when only the stage detail carries lines", () => {
    expect(
      isReportEmpty(
        report({
          loose_lines: [
            {
              stage: "HEMMING",
              stage_label: "Hemming",
              work_by: 0,
              quality_type: 2,
              item_name: "S",
              qty: 130,
              qty_uom: "CUTS",
              wt_mt: 1.885,
            },
          ],
        }),
      ),
    ).toBe(false);
  });

  it("is false as soon as any block carries a line", () => {
    expect(
      isReportEmpty(
        report({
          bales: [
            block("EMPIRE", true, { hessian: [baleLine("H1", 1, 100, 0.1)] }),
          ],
        }),
      ),
    ).toBe(false);
    expect(
      isReportEmpty(
        report({
          loose: {
            hessian: [],
            sacking: [
              {
                finishing_quality_id: 4,
                item_id: 40,
                item_name: "S",
                wt_mt: 1,
              },
            ],
            hessian_total_mt: 0,
            sacking_total_mt: 1,
            total_mt: 1,
          },
        }),
      ),
    ).toBe(false);
    expect(
      isReportEmpty(
        report({
          despatch: [
            {
              item_id: 1,
              item_name: "D1",
              bales: null,
              qty: 3,
              uom_name: "MT",
            },
          ],
        }),
      ),
    ).toBe(false);
  });
});

describe("EXPORT_COLUMNS", () => {
  // The shared exporter shades summary rows off the FIRST column via
  // reportTotalLevel, so the lead column has to be the one holding
  // "TOTAL" / "GRAND TOTAL" — with the owner name leading, every summary row
  // came out the same mid shade.
  const rows = flattenReport(
    report({
      bales: [
        block("EMPIRE", true, {
          hessian: [baleLine("H1", 70, 228.6, 16.002)],
          hessian_total: { bales: 70, wt_mt: 16.002 },
          total: { bales: 70, wt_mt: 16.002 },
        }),
      ],
    }),
  );
  const lead = String(EXPORT_COLUMNS[0].field);

  it("leads with the column that carries the total label", () => {
    expect(lead).toBe("item");
  });

  it("puts Inspected right after Bales", () => {
    const fields = EXPORT_COLUMNS.map((c) => c.field);
    expect(fields.indexOf("inspected")).toBe(fields.indexOf("bales") + 1);
  });

  it("shades a data row as nothing, a section total as a group, a block total as grand", () => {
    expect(reportTotalLevel(rows[0], lead)).toBeNull();
    expect(reportTotalLevel(rows[1], lead)).toBe("group");
    expect(reportTotalLevel(rows[2], lead)).toBe("grand");
  });

  it("covers every FlatRow field, so nothing is dropped from the sheet", () => {
    expect(EXPORT_COLUMNS.map((c) => c.field).sort()).toEqual(
      Object.keys(rows[0]).sort(),
    );
  });
});
