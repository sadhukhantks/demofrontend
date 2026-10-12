import { describe, expect, it } from "vitest";
import type { QualityShiftAvgRow } from "./doffAnalysisService";
import { pivotQualityShiftRows, qsKey } from "./qualityShift";

function q(over: Partial<QualityShiftAvgRow>): QualityShiftAvgRow {
  return {
    quality_name: "13-SKWP",
    shift: "A",
    avg_net_wt: 276.67,
    target_wt: 293.33,
    diff_wt: 16.67,
    diff_pct: 5.68,
    target_cells: 3,
    cells: 3,
    ...over,
  };
}

describe("pivotQualityShiftRows (TKT-000212)", () => {
  it("puts actual, std, diff and diff % side by side per shift", () => {
    const { shifts, rows } = pivotQualityShiftRows([
      q({}),
      q({ shift: "B", avg_net_wt: 300, target_wt: 290, diff_wt: -10, diff_pct: -3.45 }),
    ]);
    expect(shifts).toEqual(["A", "B"]);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.label).toBe("13-SKWP");
    expect([r[qsKey.actual("A")], r[qsKey.std("A")], r[qsKey.diff("A")], r[qsKey.diffPct("A")]])
      .toEqual([276.67, 293.33, 16.67, 5.68]);
    expect(r[qsKey.diff("B")]).toBe(-10);
    expect(r[qsKey.coverage("A")]).toBeNull();
  });

  it("keeps a missing standard blank, never zero", () => {
    const { rows } = pivotQualityShiftRows([
      q({ target_wt: null, diff_wt: null, diff_pct: null, target_cells: 0, cells: 4 }),
    ]);
    expect(rows[0][qsKey.std("A")]).toBeNull();
    expect(rows[0][qsKey.diff("A")]).toBeNull();
    expect(rows[0][qsKey.diffPct("A")]).toBeNull();
    expect(rows[0][qsKey.coverage("A")]).toBeNull();
  });

  it("tolerates an older server that sends no target fields", () => {
    const { rows } = pivotQualityShiftRows([
      { quality_name: "16-SKWP", shift: "C", avg_net_wt: 326.81 },
    ]);
    expect(rows[0][qsKey.actual("C")]).toBe(326.81);
    expect(rows[0][qsKey.std("C")]).toBeNull();
  });

  it("flags partial coverage as covered/total", () => {
    const { rows } = pivotQualityShiftRows([q({ target_cells: 1, cells: 2 })]);
    expect(rows[0][qsKey.coverage("A")]).toBe("1/2");
  });

  it("one row per quality, shifts sorted, missing labels as a dash", () => {
    const { shifts, rows } = pivotQualityShiftRows([
      q({ shift: "C" }),
      q({ quality_name: "16-SKWP", shift: "A" }),
      q({ quality_name: null, shift: null }),
    ]);
    expect(shifts).toEqual(["A", "C", "—"]);
    expect(rows.map((r) => r.label)).toEqual(["13-SKWP", "16-SKWP", "—"]);
    expect(rows.map((r) => r.id)).toEqual([0, 1, 2]);
  });
});
