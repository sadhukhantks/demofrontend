import { describe, expect, it } from "vitest";
import {
  buildHeavyLightGridRows,
  classifyDeviation,
  fmtSignedPct,
  qualityTypeLabel,
} from "./heavyLightUtils";
import type { BaleHeavyLight } from "./types";

describe("classifyDeviation", () => {
  it("reads positive as heavy and negative as light (spec §1.2 sign convention)", () => {
    expect(classifyDeviation(2.08)).toBe("heavy");
    expect(classifyDeviation(-0.59)).toBe("light");
    expect(classifyDeviation("+3.16")).toBe("heavy");
    expect(classifyDeviation("-3.16")).toBe("light");
  });

  it("treats zero, null and non-numeric as level (no tint)", () => {
    expect(classifyDeviation(0)).toBe("level");
    expect(classifyDeviation(null)).toBe("level");
    expect(classifyDeviation(undefined)).toBe("level");
    expect(classifyDeviation("")).toBe("level");
    expect(classifyDeviation("n/a")).toBe("level");
  });
});

describe("fmtSignedPct / qualityTypeLabel", () => {
  it("keeps the sign visible and blanks nulls", () => {
    expect(fmtSignedPct(2.0833)).toBe("+2.08");
    expect(fmtSignedPct(-0.594)).toBe("-0.59");
    expect(fmtSignedPct(0)).toBe("0.00");
    expect(fmtSignedPct(null)).toBe("");
  });

  it("maps the finishing-quality type codes", () => {
    expect(qualityTypeLabel(1)).toBe("Hessian");
    expect(qualityTypeLabel(2)).toBe("Sacking");
    expect(qualityTypeLabel(null)).toBe("");
  });
});

const SAMPLE: BaleHeavyLight = {
  date_from: "2026-01-27",
  date_to: "2026-01-27",
  rows: [
    {
      finishing_quality_id: 12,
      item_name: '40.00"- 8x 8 - 6.50 Code:1189/J',
      quality_type: 1,
      bales: 9,
      weft_count: 9,
      avg_mr: 19.11,
      mr_source: "item",
      std_bale_wt: 369,
      std_mr_pct: 16,
      obs_per_bale: 376.67,
      corr_per_bale: 366.83,
      obs_pct: 2.08,
      corr_pct: -0.59,
      total_std: 3321,
      total_obs: 3390,
      total_corr: 3301.49,
    },
    {
      finishing_quality_id: 15,
      item_name: "Govt-BT-WILL 580 GM BAG",
      quality_type: 2,
      bales: 4,
      weft_count: 12,
      avg_mr: null,
      mr_source: "none",
      std_bale_wt: 290,
      std_mr_pct: 20,
      obs_per_bale: 280.85,
      corr_per_bale: null,
      obs_pct: -3.16,
      corr_pct: null,
      total_std: 1160,
      total_obs: 1123.4,
      total_corr: null,
    },
  ],
  groups: [
    { label: "SACKING", bales: 4, total_std: 1160, total_obs: 1123.4, total_corr: null, obs_pct: -3.16, corr_pct: null },
    { label: "HESSIAN", bales: 9, total_std: 3321, total_obs: 3390, total_corr: 3301.49, obs_pct: 2.08, corr_pct: -0.59 },
    { label: "OVERALL", bales: 13, total_std: 4481, total_obs: 4513.4, total_corr: null, obs_pct: 0.72, corr_pct: null },
  ],
  notes: ["1 quality had no MR reading — corrected columns left blank"],
};

describe("buildHeavyLightGridRows", () => {
  it("emits quality rows then the three group rows, in backend order", () => {
    const rows = buildHeavyLightGridRows(SAMPLE);
    expect(rows.map((r) => r.quality)).toEqual([
      '40.00"- 8x 8 - 6.50 Code:1189/J',
      "Govt-BT-WILL 580 GM BAG",
      "SACKING",
      "HESSIAN",
      "OVERALL",
    ]);
    expect(rows.map((r) => r.__kind)).toEqual([
      "quality", "quality", "group", "group", "group",
    ]);
  });

  it("labels the type and keeps null corrected values as null (blank cells)", () => {
    const [hessian, sackingNoMr] = buildHeavyLightGridRows(SAMPLE);
    expect(hessian.type).toBe("Hessian");
    expect(hessian.corr_per_bale).toBe(366.83);
    expect(sackingNoMr.type).toBe("Sacking");
    expect(sackingNoMr.mr_source).toBe("none");
    expect(sackingNoMr.corr_per_bale).toBeNull();
    expect(sackingNoMr.corr_pct).toBeNull();
    expect(sackingNoMr.total_corr).toBeNull();
  });

  it("marks group rows as summary rows for the shared grid/export styling", () => {
    const rows = buildHeavyLightGridRows(SAMPLE);
    const groups = rows.filter((r) => r.__kind === "group");
    expect(groups.map((r) => r.__marker)).toEqual(["Total", "Total", "Grand Total"]);
    expect(groups.every((r) => r.type === "" && r.mr_source === "")).toBe(true);
    expect(rows.filter((r) => r.__kind === "quality").every((r) => r.__marker === "")).toBe(true);
    // Unique ids: two namespaces so a quality id can never collide with a group.
    expect(new Set(rows.map((r) => r.__id)).size).toBe(rows.length);
  });
});
