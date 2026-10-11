import { describe, expect, it } from "vitest";
import type {
  DprHandsSection,
  DprHandsStages,
  DprKpi,
  DprYarnBalance,
} from "@/utils/juteProductionReportService";
import {
  commonSplitLabel,
  fallbackHandsText,
  handsKpiSub,
  stageDeptsText,
  yarnBalanceText,
} from "./dprHands";

/** sls co 2 br 29, 09-10-2026 — the TKT-000185 golden case. */
const stages: DprHandsStages = {
  available: true,
  yarn: {
    label: "Yarn stage (jute → spinning)",
    basis_label: "spinning output",
    depts: ["BATCHING(EJM)", "JUTE(EJM)", "PREPARING(EJM)", "SPINNING(EJM)"],
    direct_day_hands: 296.43,
    direct_mtd_hands: 296.43,
    common_day_hands: 59.15,
    common_mtd_hands: 59.15,
    day_hands: 355.58,
    mtd_hands: 355.58,
    day_mt: 30.031,
    mtd_mt: 30.031,
    hands_per_mt: 11.84,
    mtd_hands_per_mt: 11.84,
  },
  cloth: {
    label: "Cloth stage (winding → finishing)",
    basis_label: "weaving output",
    depts: ["BEAMING(EJM)", "WEAVING(EJM)"],
    direct_day_hands: 404.02,
    direct_mtd_hands: 404.02,
    common_day_hands: 80.62,
    common_mtd_hands: 80.62,
    day_hands: 484.64,
    mtd_hands: 484.64,
    day_mt: 29.073,
    mtd_mt: 29.073,
    hands_per_mt: 16.67,
    mtd_hands_per_mt: 16.67,
  },
  common: {
    label: "Common (spread pro-rata)",
    depts: ["ELECTRICAL(EJM)", "MILL MECHANICAL(EJM)"],
    day_hands: 139.77,
    mtd_hands: 139.77,
    yarn_share_pct: 42.3,
    mtd_yarn_share_pct: 42.3,
  },
  total: { day_hands: 840.22, mtd_hands: 840.22, hands_per_mt: 28.51, mtd_hands_per_mt: 28.51 },
};

const balance: DprYarnBalance = {
  purchased_available: true,
  day: { spun_mt: 30.005, purchased_issued_mt: 6.253, woven_mt: 27.226, surplus_mt: 9.032 },
  mtd: { spun_mt: 300.05, purchased_issued_mt: 42.71, woven_mt: 272.26, surplus_mt: 70.5 },
};

const kpi = {
  spinning_mt: 30.031,
  total_hands: 840.22,
  hands_per_mt: 28.51,
  hands_per_mt_yarn: 11.84,
  hands_per_mt_cloth: 16.67,
  hands_per_mt_mtd: 28.3,
  hands_stage_basis: true,
  hands_per_mt_spinning_basis: 27.98,
} as DprKpi;

describe("handsKpiSub", () => {
  it("names the two addends, the MTD figure and the previous basis", () => {
    expect(handsKpiSub(kpi)).toBe("yarn 11.8 + cloth 16.7 · MTD 28.3 · all hands ÷ spinning 28.0");
  });

  it("falls back to the all-hands ÷ spinning arithmetic (TKT-000117)", () => {
    expect(handsKpiSub({ ...kpi, hands_stage_basis: false, hands_per_mt: 27.98 })).toBe(
      "840 hands ÷ 30.031 MT spinning · MTD 28.3",
    );
  });

  it("prints a dash when a stage produced nothing", () => {
    expect(
      handsKpiSub({
        ...kpi,
        hands_per_mt: null,
        hands_per_mt_yarn: null,
        hands_per_mt_mtd: null,
        hands_per_mt_spinning_basis: null,
      }),
    ).toBe("yarn — + cloth 16.7 · MTD — · all hands ÷ spinning —");
  });
});

describe("yarnBalanceText", () => {
  it("spells out spun + purchased − woven with a signed surplus", () => {
    expect(yarnBalanceText(balance)).toBe(
      "Yarn balance: spun 30.005 MT + purchased yarn issued 6.253 MT − woven 27.226 MT = " +
        "+9.032 MT to yarn stock / sale (MTD +70.5 MT).",
    );
  });

  it("shows a deficit negative and says when purchased yarn is not tracked", () => {
    expect(
      yarnBalanceText({
        purchased_available: false,
        day: { spun_mt: 20, purchased_issued_mt: null, woven_mt: 25, surplus_mt: -5 },
        mtd: { spun_mt: 200, purchased_issued_mt: null, woven_mt: 250, surplus_mt: -50 },
      }),
    ).toBe(
      "Yarn balance: spun 20.000 MT (purchased yarn not tracked on this tenant) − woven " +
        "25.000 MT = -5.000 MT to yarn stock / sale (MTD -50.0 MT).",
    );
  });
});

describe("stageDeptsText / commonSplitLabel", () => {
  it("lists the departments behind each stage", () => {
    expect(stageDeptsText(stages)).toBe(
      "Departments — Yarn stage (jute → spinning): BATCHING(EJM), JUTE(EJM), PREPARING(EJM), " +
        "SPINNING(EJM); Cloth stage (winding → finishing): BEAMING(EJM), WEAVING(EJM); " +
        "Common (spread pro-rata): ELECTRICAL(EJM), MILL MECHANICAL(EJM).",
    );
  });

  it("says none for an empty stage", () => {
    expect(stageDeptsText({ ...stages, common: { ...stages.common, depts: [] } })).toContain(
      "Common (spread pro-rata): none.",
    );
  });

  it("states the common split both ways", () => {
    expect(commonSplitLabel(stages)).toBe("Common (spread pro-rata): 42% yarn / 58% cloth");
  });
});

describe("fallbackHandsText", () => {
  it("keeps the TKT-000117 sentence with the MTD figure", () => {
    const hands = {
      total: { day_hours: 3241, day_hands: 405.13, mtd_hours: 38000, mtd_hands: 9500 },
      hands_per_mt: 26.71,
      mtd_hands_per_mt: 27.1,
      basis_label: "spinning output (departments not mapped to stages)",
      spinning_basis: {
        label: "All hands ÷ spinning output (previous basis)",
        day_hands: 405.13,
        mtd_hands: 9500,
        day_mt: 15.165,
        mtd_mt: 350,
        hands_per_mt: 26.71,
        mtd_hands_per_mt: 27.1,
      },
      yarn_balance: balance,
    } as DprHandsSection;
    expect(fallbackHandsText(hands)).toBe(
      "Overall labour productivity: 405.13 hands ÷ 15.165 MT (spinning output (departments " +
        "not mapped to stages)) = 26.7 hands per MT (MTD 27.1).",
    );
  });
});
