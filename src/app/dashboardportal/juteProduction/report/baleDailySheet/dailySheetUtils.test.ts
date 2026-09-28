import { describe, expect, it } from "vitest";
import { isReportTotalRow, reportTotalLevel } from "@/components/reports/ReportGrid";
import {
  entryTypeParam,
  flattenDailySheetForExcel,
  fmtSignedPct,
  fmtWeighTime,
  qualityTypeLabel,
} from "./dailySheetUtils";
import type { BaleDailySheet } from "./types";

describe("fmtWeighTime", () => {
  it("reads the wall clock straight off the ISO string (no timezone shift)", () => {
    expect(fmtWeighTime("2026-09-16T10:23:45")).toBe("10:23");
    expect(fmtWeighTime("2026-09-16T10:23:45Z")).toBe("10:23");
    expect(fmtWeighTime("2026-09-16T10:23:45+05:30")).toBe("10:23");
    expect(fmtWeighTime("2026-09-16 07:05:00")).toBe("07:05");
  });

  it("blanks null / unparsable values", () => {
    expect(fmtWeighTime(null)).toBe("");
    expect(fmtWeighTime("")).toBe("");
    expect(fmtWeighTime("not a time")).toBe("");
  });
});

describe("filter / label helpers", () => {
  it("omits the entry_type param for ALL and passes PROD/REPACK through", () => {
    expect(entryTypeParam("ALL")).toBeUndefined();
    expect(entryTypeParam("PROD")).toBe("PROD");
    expect(entryTypeParam("REPACK")).toBe("REPACK");
  });

  it("maps type codes and signs the deviation", () => {
    expect(qualityTypeLabel(1)).toBe("Hessian");
    expect(qualityTypeLabel(2)).toBe("Sacking");
    expect(fmtSignedPct(2.083)).toBe("+2.08");
    expect(fmtSignedPct(-0.594)).toBe("-0.59");
    expect(fmtSignedPct(null)).toBe("");
  });
});

const SHEET: BaleDailySheet = {
  tran_date: "2026-09-16",
  branch_name: "Factory",
  blocks: [
    {
      finishing_quality_id: 12,
      item_name: '40.00"- 8x 8 - 6.50 Code:1189/J',
      quality_type: 1,
      std_bale_wt: 369,
      packsheet_wt: 5,
      rows: [
        {
          sl_no: 1, entry_type: "PROD", series_name: '40"-6.50', bale_no: 206,
          original_bale_no: null, spell_code: "A1", gross_wt: 380, trolly_name: "61",
          net_wt: 375, weigh_time: "2026-09-16T08:10:00",
        },
        {
          sl_no: 2, entry_type: "REPACK", series_name: '40"-6.50', bale_no: 207,
          original_bale_no: 198, spell_code: "A1", gross_wt: 372, trolly_name: "61",
          net_wt: 367, weigh_time: "2026-09-16T08:14:00",
        },
      ],
      prod_bales: 1, repack_bales: 1, total_gross: 752, total_net: 742,
      avg_net: 375, dev_pct: 1.63,
    },
    {
      finishing_quality_id: 15,
      item_name: "Govt-BT-WILL 580 GM BAG",
      quality_type: 2,
      std_bale_wt: 290,
      packsheet_wt: 5,
      rows: [
        {
          sl_no: 1, entry_type: "PROD", series_name: "PUNJAB", bale_no: 24747,
          original_bale_no: null, spell_code: "A2", gross_wt: 294, trolly_name: "62",
          net_wt: 289, weigh_time: "2026-09-16T11:02:00",
        },
      ],
      prod_bales: 1, repack_bales: 0, total_gross: 294, total_net: 289,
      avg_net: 289, dev_pct: -0.34,
    },
  ],
  totals: {
    by_type: [
      { quality_type: 1, prod_bales: 1, repack_bales: 1, total_gross: 752, total_net: 742 },
      { quality_type: 2, prod_bales: 1, repack_bales: 0, total_gross: 294, total_net: 289 },
    ],
    overall: { prod_bales: 2, repack_bales: 1, total_gross: 1046, total_net: 1031 },
  },
};

describe("flattenDailySheetForExcel", () => {
  it("emits bale rows with a Quality column, then footers, type totals and the overall", () => {
    const rows = flattenDailySheetForExcel(SHEET);
    expect(rows.map((r) => `${r.quality}|${r.sl_no}`)).toEqual([
      '40.00"- 8x 8 - 6.50 Code:1189/J|1',
      '40.00"- 8x 8 - 6.50 Code:1189/J|2',
      '40.00"- 8x 8 - 6.50 Code:1189/J|Total',
      "Govt-BT-WILL 580 GM BAG|1",
      "Govt-BT-WILL 580 GM BAG|Total",
      "HESSIAN|Total",
      "SACKING|Total",
      "Grand Total|",
    ]);
  });

  it("flags repack rows with the original bale no and formats the time", () => {
    const [prod, repack] = flattenDailySheetForExcel(SHEET);
    expect(prod.entry_type).toBe("Prod");
    expect(prod.original_bale_no).toBeNull();
    expect(prod.weigh_time).toBe("08:10");
    expect(repack.entry_type).toBe("Repack");
    expect(repack.original_bale_no).toBe(198);
    expect(repack.type).toBe("Hessian");
  });

  it("carries block totals, avg net and deviation only on the footer rows", () => {
    const rows = flattenDailySheetForExcel(SHEET);
    const footer = rows[2];
    expect(footer.series_name).toBe("PROD 1 · REPACK 1");
    expect(footer.gross_wt).toBe(752);
    expect(footer.net_wt).toBe(742);
    expect(footer.avg_net).toBe(375);
    expect(footer.dev_pct).toBe(1.63);
    expect(rows[0].avg_net).toBeNull();
    expect(rows[0].dev_pct).toBeNull();
    const overall = rows[rows.length - 1];
    expect(overall.series_name).toBe("PROD 2 · REPACK 1");
    expect(overall.gross_wt).toBe(1046);
    expect(overall.net_wt).toBe(1031);
    expect(new Set(rows.map((r) => r.__id)).size).toBe(rows.length);
  });

  it("marks summary rows the way the shared grid/export kit recognises them", () => {
    const rows = flattenDailySheetForExcel(SHEET);
    expect(rows.filter(isReportTotalRow)).toHaveLength(5);
    // Block footer and type totals shade as group totals; the overall as grand.
    expect(reportTotalLevel(rows[2], "quality")).toBe("group");
    expect(reportTotalLevel(rows[5], "quality")).toBe("group");
    expect(reportTotalLevel(rows[rows.length - 1], "quality")).toBe("grand");
    expect(reportTotalLevel(rows[0], "quality")).toBeNull();
  });
});
