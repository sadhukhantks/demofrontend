import { describe, expect, it } from "vitest";
import type {
  DprSpinningQualityRow,
  DprSpinningSection,
} from "@/utils/juteProductionReportService";
import {
  qualityMissingText,
  spinningMissingHeadline,
  spinningMissingLines,
} from "./dprSpinningMissing";

const q = (code: string, extra: Partial<DprSpinningQualityRow> = {}): DprSpinningQualityRow => ({
  item_id: 1,
  item_code: code,
  item_name: code,
  act_count: 12,
  std_count: 12,
  production_kg: 1000,
  kg_per_frame_shift: 100,
  target_per_frame_shift: null,
  winding_kg: 0,
  eff_pct: null,
  ...extra,
});

/** sls co 106 br 87, 16-10-2026 shape (TKT-000234). */
const section = (over: Partial<DprSpinningSection> = {}): DprSpinningSection =>
  ({
    standards_missing: ["12-S/WARP", "19-S/WEFT"],
    targets_missing: ["10.5-SKWP", "12-S/WARP", "19-S/WEFT"],
    missing_summary: [
      {
        code: "machine_std",
        label: "Frame standard speed / spindles not set",
        where: "Spinning Target Map > Machine > Standard",
        qualities: ["19-S/WEFT"],
      },
      {
        code: "target_eff",
        label: "Quality target Eff % not set",
        where: "Spinning Target Map > Quality > Target",
        qualities: ["10.5-SKWP", "12-S/WARP", "19-S/WEFT"],
      },
      {
        code: "sqc_count",
        label: "No Spinning SQC count entered for the day",
        where: "Spinning SQC (count entry)",
        qualities: ["19-S/WEFT"],
      },
    ],
    ...over,
  }) as DprSpinningSection;

describe("spinningMissingHeadline", () => {
  it("counts blank target and eff columns", () => {
    expect(spinningMissingHeadline(section())).toBe(
      "Target not shown for 3 qualities; Eff % not shown for 2 qualities.",
    );
  });
  it("is null when everything is configured", () => {
    expect(
      spinningMissingHeadline(section({ standards_missing: [], targets_missing: [] })),
    ).toBeNull();
  });
  it("tolerates an older payload without targets_missing", () => {
    expect(
      spinningMissingHeadline(section({ targets_missing: undefined, standards_missing: ["A"] })),
    ).toBe("Eff % not shown for 1 quality.");
  });
});

describe("spinningMissingLines", () => {
  it("one line per reason with where to set it", () => {
    const lines = spinningMissingLines(section());
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe(
      "Quality target Eff % not set — 3: 10.5-SKWP, 12-S/WARP, 19-S/WEFT. Set in Spinning Target Map > Quality > Target.",
    );
  });
  it("is empty for an older payload", () => {
    expect(spinningMissingLines(section({ missing_summary: undefined }))).toEqual([]);
  });
});

describe("qualityMissingText", () => {
  it("joins the row's reasons and names frames", () => {
    const row = q("19-S/WEFT", {
      missing: ["machine_std", "target_eff", "sqc_count"],
      missing_frames: ["SP-07"],
    });
    expect(qualityMissingText(section(), row)).toBe(
      "Frame standard speed / spindles not set (SP-07); Quality target Eff % not set; No Spinning SQC count entered for the day",
    );
  });
  it("is empty when the row has no codes", () => {
    expect(qualityMissingText(section(), q("X"))).toBe("");
  });
});

describe("standard Eff % fallback for Target (owner ruling 2026-10-24)", () => {
  const sp = section({
    standards_missing: [],
    targets_missing: [],
    missing_summary: [
      {
        code: "target_eff_fallback",
        label: "Target uses Standard Eff % (Target Eff % not set)",
        where: "Spinning Target Map > Quality > Target",
        qualities: ["10.5-SKWP"],
      },
    ],
  });
  const row = q("10.5-SKWP", {
    target_per_frame_shift: 92.5,
    eff_pct: 87.4,
    target_basis: "standard",
    target_std_eff_pct: 65,
    missing: ["target_eff_fallback"],
  });

  it("target cell hint names the standard used", () => {
    expect(qualityMissingText(sp, row, "target")).toBe(
      "Target Eff % not set — using Standard Eff % (65%)",
    );
  });
  it("eff cell gets no hint for a target-only reason", () => {
    expect(qualityMissingText(sp, row, "eff")).toBe("");
  });
  it("section line wording", () => {
    expect(spinningMissingLines(sp)).toEqual([
      "Target uses Standard Eff % for 1 quality (Target Eff % not set): 10.5-SKWP — set in Spinning Target Map > Quality > Target.",
    ]);
  });
  it("no headline when nothing is blank", () => {
    expect(spinningMissingHeadline(sp)).toBeNull();
  });
});
