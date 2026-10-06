import { describe, expect, it } from "vitest";
import { isReportTotalRow } from "@/components/reports/ReportGrid";
import type { JuteIssueYarnWiseApiRow } from "../types/reportTypes";
import {
  GRAND_TOTAL_ROW_ID,
  WASTAGE_MODE_TEXT,
  formatIssueWeight,
  formatReportDay,
  issueTotals,
  issueYarnWiseView,
  monthStartIso,
  toIssueYarnWiseRows,
} from "./issueYarnWiseRows";

const api = (
  over: Partial<JuteIssueYarnWiseApiRow>,
): JuteIssueYarnWiseApiRow => ({
  yarn_type_id: 28,
  yarn_type_name: "13-SKWP",
  day_issue_kg: 0,
  mtd_issue_kg: 0,
  day_waste_kg: 0,
  mtd_waste_kg: 0,
  ...over,
});

/** sls branch 29 on 2026-10-04, as the endpoint returned it — no wastage. */
const SLS_BR29_4_OCT: JuteIssueYarnWiseApiRow[] = [
  api({ yarn_type_id: 28, yarn_type_name: "13-SKWP", day_issue_kg: 7869, mtd_issue_kg: 23657 }),
  api({ yarn_type_id: 24, yarn_type_name: "16-HSWP", day_issue_kg: 1360, mtd_issue_kg: 1360 }),
  api({ yarn_type_id: 29, yarn_type_name: "16-SKWP", day_issue_kg: 6976, mtd_issue_kg: 26227 }),
  api({ yarn_type_id: 53, yarn_type_name: "7.5 LBS-HSWP", day_issue_kg: 2163, mtd_issue_kg: 6964 }),
  api({ yarn_type_id: 26, yarn_type_name: "9.5-HSWT", day_issue_kg: 972, mtd_issue_kg: 3466 }),
];

/** A month with wastage: on two qualities, and one quality issued wastage only. */
const WITH_WASTAGE: JuteIssueYarnWiseApiRow[] = [
  api({ yarn_type_id: 28, yarn_type_name: "13-SKWP", day_issue_kg: 6643, mtd_issue_kg: 151775, day_waste_kg: 0, mtd_waste_kg: 4742 }),
  api({ yarn_type_id: 29, yarn_type_name: "16-SKWP", day_issue_kg: 7653, mtd_issue_kg: 218138, day_waste_kg: 300, mtd_waste_kg: 7317 }),
  api({ yarn_type_id: 53, yarn_type_name: "7.5 LBS-HSWP", day_issue_kg: 2927, mtd_issue_kg: 14063 }),
  api({ yarn_type_id: 99, yarn_type_name: "WASTE BLEND", day_issue_kg: 250, mtd_issue_kg: 250, day_waste_kg: 250, mtd_waste_kg: 250 }),
];

const cells = (rows: ReturnType<typeof issueYarnWiseView>) =>
  rows.map((r) => [r.yarn_type_name, r.day_issue_kg, r.mtd_issue_kg]);

describe("toIssueYarnWiseRows (TKT-000214)", () => {
  it("carries kg and derives MT as kg / 1000", () => {
    const [r] = toIssueYarnWiseRows([
      api({ day_issue_kg: 7869, mtd_issue_kg: 23657 }),
    ]);
    expect(r).toMatchObject({
      yarn_type_id: 28,
      yarn_type_name: "13-SKWP",
      day_issue_kg: 7869,
      mtd_issue_kg: 23657,
      day_issue_mt: 7.869,
      mtd_issue_mt: 23.657,
    });
  });

  it("loads raw jute, wastage and total side by side, in kg and MT", () => {
    const [r] = toIssueYarnWiseRows([
      api({ day_issue_kg: 7653, mtd_issue_kg: 218138, day_waste_kg: 300, mtd_waste_kg: 7317 }),
    ]);
    expect(r).toMatchObject({
      day_raw_kg: 7353,
      day_waste_kg: 300,
      day_total_kg: 7653,
      mtd_raw_kg: 210821,
      mtd_waste_kg: 7317,
      mtd_total_kg: 218138,
      day_raw_mt: 7.353,
      day_waste_mt: 0.3,
      day_total_mt: 7.653,
      mtd_raw_mt: 210.821,
      mtd_waste_mt: 7.317,
      mtd_total_mt: 218.138,
      // the loaded row prints the total
      day_issue_kg: 7653,
      mtd_issue_kg: 218138,
    });
  });

  it("raw + wastage = total to the kg, and at three decimals in MT, on every row", () => {
    const rows = toIssueYarnWiseRows([
      ...WITH_WASTAGE,
      // decimals: total 10.6 -> 11, wastage 10.3 -> 10, so raw prints 1
      api({ yarn_type_id: 7, day_issue_kg: 10.6, mtd_issue_kg: 10.6, day_waste_kg: 10.3, mtd_waste_kg: 10.3 }),
    ]);
    for (const r of rows) {
      expect(r.day_raw_kg + r.day_waste_kg).toBe(r.day_total_kg);
      expect(r.mtd_raw_kg + r.mtd_waste_kg).toBe(r.mtd_total_kg);
      expect((r.day_raw_mt + r.day_waste_mt).toFixed(3)).toBe(r.day_total_mt.toFixed(3));
      expect((r.mtd_raw_mt + r.mtd_waste_mt).toFixed(3)).toBe(r.mtd_total_mt.toFixed(3));
    }
    expect(rows[4]).toMatchObject({ day_raw_kg: 1, day_waste_kg: 10, day_total_kg: 11 });
  });

  it("rounds to whole kg and takes MT from the rounded kg", () => {
    // dev3 carries decimal weights: 1468.23 kg / 20669.64 kg.
    const [r] = toIssueYarnWiseRows([
      api({ day_issue_kg: 1468.23, mtd_issue_kg: 20669.64 }),
    ]);
    expect(r.day_issue_kg).toBe(1468);
    expect(r.mtd_issue_kg).toBe(20670);
    expect(r.day_issue_mt).toBe(1.468);
    expect(r.mtd_issue_mt).toBe(20.67);
  });

  it("keeps a quality with nothing on the day but an issue in the month", () => {
    const rows = toIssueYarnWiseRows([
      api({ day_issue_kg: 0, mtd_issue_kg: 28262.47 }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].day_issue_kg).toBe(0);
    expect(rows[0].mtd_issue_kg).toBe(28262);
  });

  it("drops a row whose figures both round to zero", () => {
    expect(
      toIssueYarnWiseRows([api({ day_issue_kg: 0.2, mtd_issue_kg: 0.4 })]),
    ).toEqual([]);
  });

  it("tolerates missing / non-numeric weights without printing NaN", () => {
    const [r] = toIssueYarnWiseRows([
      {
        yarn_type_id: 28,
        yarn_type_name: "13-SKWP",
        day_issue_kg: null as unknown as number,
        mtd_issue_kg: "150" as unknown as number,
        // an older backend without the wastage fields reads as "no wastage"
      } as JuteIssueYarnWiseApiRow,
    ]);
    expect(r.day_issue_kg).toBe(0);
    expect(r.mtd_issue_kg).toBe(150);
    expect(r.day_waste_kg).toBe(0);
    expect(r.mtd_waste_kg).toBe(0);
  });

  it("gives every row a unique id, including the unassigned bucket", () => {
    const rows = toIssueYarnWiseRows([
      api({ yarn_type_id: null, yarn_type_name: "(unassigned)", mtd_issue_kg: 300 }),
      api({ yarn_type_id: 28, mtd_issue_kg: 10 }),
      api({ yarn_type_id: 28, mtd_issue_kg: 20 }),
    ]);
    expect(new Set(rows.map((r) => r.id)).size).toBe(3);
    expect(rows[0].yarn_type_id).toBeNull();
  });
});

describe("issueYarnWiseView — raw jute + wastage (default)", () => {
  it("prints every quality at its total with a Grand Total (sls br 29, 4 Oct 2026)", () => {
    const rows = issueYarnWiseView(toIssueYarnWiseRows(SLS_BR29_4_OCT), "all");
    expect(rows).toHaveLength(6);
    const total = rows[rows.length - 1];
    expect(total).toMatchObject({
      id: GRAND_TOTAL_ROW_ID,
      yarn_type_name: "Grand Total",
      day_issue_kg: 19340,
      mtd_issue_kg: 61674,
      day_issue_mt: 19.34,
      mtd_issue_mt: 61.674,
    });
    expect(isReportTotalRow(total)).toBe(true);
    expect(rows.slice(0, -1).some((r) => isReportTotalRow(r))).toBe(false);
  });

  it("includes wastage in every figure", () => {
    expect(cells(issueYarnWiseView(toIssueYarnWiseRows(WITH_WASTAGE), "all"))).toEqual([
      ["13-SKWP", 6643, 151775],
      ["16-SKWP", 7653, 218138],
      ["7.5 LBS-HSWP", 2927, 14063],
      ["WASTE BLEND", 250, 250],
      ["Grand Total", 17473, 384226],
    ]);
  });

  it("carries raw, wastage and total on every row and on the Grand Total", () => {
    const six = (r: ReturnType<typeof issueYarnWiseView>[number]) => [
      r.yarn_type_name,
      r.day_raw_kg, r.day_waste_kg, r.day_total_kg,
      r.mtd_raw_kg, r.mtd_waste_kg, r.mtd_total_kg,
    ];
    const rows = issueYarnWiseView(toIssueYarnWiseRows(WITH_WASTAGE), "all");
    expect(rows.map(six)).toEqual([
      ["13-SKWP", 6643, 0, 6643, 147033, 4742, 151775],
      ["16-SKWP", 7353, 300, 7653, 210821, 7317, 218138],
      ["7.5 LBS-HSWP", 2927, 0, 2927, 14063, 0, 14063],
      ["WASTE BLEND", 0, 250, 250, 0, 250, 250],
      ["Grand Total", 16923, 550, 17473, 371917, 12309, 384226],
    ]);
    const total = rows[rows.length - 1];
    expect(total.day_raw_kg + total.day_waste_kg).toBe(total.day_total_kg);
    expect(total.mtd_raw_kg + total.mtd_waste_kg).toBe(total.mtd_total_kg);
    expect(total.mtd_raw_mt).toBe(371.917);
    expect(total.mtd_total_mt).toBe(384.226);
  });

  it("the Grand Total is the sum of the printed (rounded) rows", () => {
    // 10.6 + 10.6 prints 11 + 11, so the total must read 22, not 21.
    const rows = issueYarnWiseView(
      toIssueYarnWiseRows([
        api({ yarn_type_id: 1, mtd_issue_kg: 10.6 }),
        api({ yarn_type_id: 2, mtd_issue_kg: 10.6 }),
      ]),
      "all",
    );
    expect(rows[rows.length - 1].mtd_issue_kg).toBe(22);
  });

  it("adds no total row to an empty report", () => {
    expect(issueYarnWiseView([], "all")).toEqual([]);
    expect(issueYarnWiseView([], "raw")).toEqual([]);
  });
});

describe("issueYarnWiseView — wastage excluded", () => {
  const loaded = toIssueYarnWiseRows(WITH_WASTAGE);

  it("prints raw jute only, on the rows and on the Grand Total", () => {
    expect(cells(issueYarnWiseView(loaded, "raw"))).toEqual([
      ["13-SKWP", 6643, 147033], // 151,775 - 4,742
      ["16-SKWP", 7353, 210821], // 7,653 - 300 ; 218,138 - 7,317
      ["7.5 LBS-HSWP", 2927, 14063], // no wastage: unchanged
      ["Grand Total", 16923, 371917],
    ]);
  });

  it("drops a quality that was issued wastage only, instead of a line of zeros", () => {
    const names = issueYarnWiseView(loaded, "raw").map((r) => r.yarn_type_name);
    expect(names).not.toContain("WASTE BLEND");
    expect(issueYarnWiseView(loaded, "all").map((r) => r.yarn_type_name)).toContain("WASTE BLEND");
  });

  it("keeps the MT column equal to the kg column / 1000", () => {
    for (const r of issueYarnWiseView(loaded, "raw")) {
      expect(r.day_issue_mt).toBe(r.day_issue_kg / 1000);
      expect(r.mtd_issue_mt).toBe(r.mtd_issue_kg / 1000);
    }
  });

  it("raw + wastage equals the total for every quality and for the Grand Total", () => {
    const all = issueYarnWiseView(loaded, "all");
    const raw = issueYarnWiseView(loaded, "raw");
    for (const a of all) {
      const r = raw.find((x) => x.id === a.id);
      // a quality the raw view dropped has raw = 0
      expect((r?.day_issue_kg ?? 0) + a.day_waste_kg).toBe(a.day_issue_kg);
      expect((r?.mtd_issue_kg ?? 0) + a.mtd_waste_kg).toBe(a.mtd_issue_kg);
    }
  });

  it("stays exact when kg values carry decimals", () => {
    // total 10.6 -> 11, wastage 10.3 -> 10: raw prints 1, and 1 + 10 = 11.
    const rows = toIssueYarnWiseRows([
      api({ day_issue_kg: 10.6, mtd_issue_kg: 10.6, day_waste_kg: 10.3, mtd_waste_kg: 10.3 }),
    ]);
    const [raw] = issueYarnWiseView(rows, "raw");
    const [all] = issueYarnWiseView(rows, "all");
    expect(raw.mtd_issue_kg + all.mtd_waste_kg).toBe(all.mtd_issue_kg);
  });

  it("changes nothing when there is no wastage (sls br 29, 4 Oct 2026)", () => {
    const rows = toIssueYarnWiseRows(SLS_BR29_4_OCT);
    expect(cells(issueYarnWiseView(rows, "raw"))).toEqual(cells(issueYarnWiseView(rows, "all")));
  });

  it("still returns a Grand Total when every quality was wastage only", () => {
    const rows = toIssueYarnWiseRows([
      api({ yarn_type_id: 99, yarn_type_name: "WASTE BLEND", day_issue_kg: 250, mtd_issue_kg: 250, day_waste_kg: 250, mtd_waste_kg: 250 }),
    ]);
    expect(cells(issueYarnWiseView(rows, "raw"))).toEqual([["Grand Total", 0, 0]]);
  });

  it("can be switched back and forth on its own output", () => {
    const raw = issueYarnWiseView(loaded, "raw");
    // Re-viewing a view never double-counts the Grand Total. (The dropped
    // quality is gone from `raw` itself — the page always views the LOADED
    // rows, which is why ReportPanel keeps them.)
    expect(cells(issueYarnWiseView(raw, "raw"))).toEqual(cells(raw));
    expect(cells(issueYarnWiseView(issueYarnWiseView(loaded, "all"), "raw"))).toEqual(cells(raw));
  });
});

describe("issueTotals — the summary cards", () => {
  const loaded = toIssueYarnWiseRows(WITH_WASTAGE);

  it("splits the default view into raw jute and wastage", () => {
    expect(issueTotals(issueYarnWiseView(loaded, "all"))).toEqual({
      day: { shown: 17473, total: 17473, raw: 16923, wastage: 550 },
      mtd: { shown: 384226, total: 384226, raw: 371917, wastage: 12309 },
    });
  });

  it("shows raw jute and still knows the wastage it left out — dropped rows included", () => {
    // WASTE BLEND's 250 kg is not on any visible row of the raw view.
    expect(issueTotals(issueYarnWiseView(loaded, "raw"))).toEqual({
      day: { shown: 16923, total: 17473, raw: 16923, wastage: 550 },
      mtd: { shown: 371917, total: 384226, raw: 371917, wastage: 12309 },
    });
  });

  it("reports no wastage for sls br 29 on 4 Oct 2026", () => {
    const t = issueTotals(issueYarnWiseView(toIssueYarnWiseRows(SLS_BR29_4_OCT), "all"));
    expect(t.day).toEqual({ shown: 19340, total: 19340, raw: 19340, wastage: 0 });
    expect(t.mtd).toEqual({ shown: 61674, total: 61674, raw: 61674, wastage: 0 });
  });

  it("is all zeros for an empty report", () => {
    const zero = { shown: 0, total: 0, raw: 0, wastage: 0 };
    expect(issueTotals([])).toEqual({ day: zero, mtd: zero });
  });
});

describe("formatIssueWeight", () => {
  it("prints whole kg with Indian grouping", () => {
    expect(formatIssueWeight(455631, "kg")).toBe("4,55,631 kg");
    expect(formatIssueWeight(0, "kg")).toBe("0 kg");
  });

  it("prints MT to three places (1 kg)", () => {
    expect(formatIssueWeight(19340, "mt")).toBe("19.340 MT");
    expect(formatIssueWeight(455631, "mt")).toBe("455.631 MT");
    expect(formatIssueWeight(0, "mt")).toBe("0.000 MT");
  });
});

describe("wastage mode wording", () => {
  it("names both states differently everywhere a figure can be read", () => {
    for (const k of ["button", "title", "file"] as const) {
      expect(WASTAGE_MODE_TEXT.all[k]).not.toBe(WASTAGE_MODE_TEXT.raw[k]);
    }
    expect(WASTAGE_MODE_TEXT.raw.title).toMatch(/wastage excluded/);
    expect(WASTAGE_MODE_TEXT.all.title).toMatch(/\+ wastage/);
  });
});

describe("report period helpers", () => {
  it("formats the day without a timezone shift", () => {
    expect(formatReportDay("2026-10-04")).toBe("04 Oct 2026");
    expect(formatReportDay("2026-01-01")).toBe("01 Jan 2026");
    expect(formatReportDay("2026-12-31")).toBe("31 Dec 2026");
  });

  it("returns anything that is not YYYY-MM-DD unchanged", () => {
    expect(formatReportDay("")).toBe("");
    expect(formatReportDay("04-10-2026")).toBe("04-10-2026");
    expect(formatReportDay("2026-13-01")).toBe("2026-13-01");
  });

  it("month-to-date starts on the 1st of the report date's month", () => {
    expect(monthStartIso("2026-10-04")).toBe("2026-10-01");
    expect(monthStartIso("2026-10-01")).toBe("2026-10-01");
    expect(monthStartIso("2024-02-29")).toBe("2024-02-01");
    expect(monthStartIso("")).toBe("");
  });
});
