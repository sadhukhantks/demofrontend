import { describe, expect, it } from "vitest";
import { OTHER_COLOR, SERIES_COLORS } from "./chartPalette";
import type {
  TrendDayQualityRow,
  TrendDayShiftRow,
  TrendQualityRow,
} from "./_service";
import {
  actualStdTgtLines,
  deltaState,
  fmtAxisKg,
  fmtDelta,
  fmtKg,
  longDate,
  OTHER_KEY,
  pivotDayQuality,
  pivotField,
  qualityLines,
  qualitySlots,
  shortDate,
  stackByQuality,
  stackByShift,
  vsStdState,
} from "./trendRows";

const q = (item_id: number | null, quality: string, kg: number, extra: Partial<TrendQualityRow> = {}): TrendQualityRow => ({
  item_id,
  quality,
  kg,
  share_pct: null,
  days: 1,
  frames: 1,
  frame_shifts: 2,
  doffs: 1,
  kg_per_frame_shift: kg / 2,
  avg_doff_kg: null,
  std_kg: null,
  std_ach_pct: null,
  std_coverage_pct: null,
  gap_kg: null,
  gap_share_pct: null,
  ...extra,
});

const dq = (date: string, item_id: number | null, quality: string, kg: number, frame_shifts = 1): TrendDayQualityRow => ({
  date,
  item_id,
  quality,
  kg,
  frames: 1,
  frame_shifts,
  doffs: 1,
  kg_per_frame_shift: frame_shifts ? Math.round((kg / frame_shifts) * 10) / 10 : null,
  std_kg: null,
  std_kg_per_frame_shift: null,
  std_ach_pct: null,
  tgt_kg: null,
  tgt_kg_per_frame_shift: null,
});

const DATES = ["2026-10-01", "2026-10-02"];

describe("qualitySlots", () => {
  it("assigns colours in volume order, never by input order", () => {
    const slots = qualitySlots([q(2, "B", 10), q(1, "A", 50), q(null, "Unmapped", 5)]);
    expect(slots.map((s) => s.label)).toEqual(["A", "B", "Unmapped"]);
    expect(slots.map((s) => s.color)).toEqual(SERIES_COLORS.slice(0, 3));
    expect(slots[2].key).toBe("null");
  });

  it("folds the tail into Other only past the cap + 1", () => {
    const eight = Array.from({ length: 8 }, (_, i) => q(i + 1, `Q${i + 1}`, 100 - i));
    expect(qualitySlots(eight)).toHaveLength(8);
    expect(qualitySlots(eight).at(-1)?.key).toBe("8");

    const nine = [...eight, q(9, "Q9", 1)];
    const slots = qualitySlots(nine);
    expect(slots).toHaveLength(8);
    const other = slots[7];
    expect(other.key).toBe(OTHER_KEY);
    expect(other.label).toBe("Other (2)");
    expect(other.color).toBe(OTHER_COLOR);
    expect(other.itemIds).toEqual([8, 9]);
  });
});

describe("stackByQuality", () => {
  it("fills every date for every slot, zero where nothing ran", () => {
    const slots = qualitySlots([q(1, "A", 50), q(2, "B", 10)]);
    const out = stackByQuality(
      DATES,
      [dq("2026-10-01", 1, "A", 30), dq("2026-10-02", 1, "A", 20), dq("2026-10-02", 2, "B", 10)],
      slots,
    );
    expect(out.dates).toEqual(DATES);
    expect(out.series.map((s) => s.data)).toEqual([
      [30, 20],
      [0, 10],
    ]);
  });

  it("sums folded qualities into the Other series", () => {
    const nine = Array.from({ length: 9 }, (_, i) => q(i + 1, `Q${i + 1}`, 100 - i));
    const slots = qualitySlots(nine);
    const out = stackByQuality(
      DATES,
      [dq("2026-10-01", 8, "Q8", 3), dq("2026-10-01", 9, "Q9", 4), dq("2026-10-02", 1, "Q1", 1)],
      slots,
    );
    expect(out.series[7].data).toEqual([7, 0]);
    expect(out.series[0].data).toEqual([0, 1]);
  });
});

describe("stackByShift", () => {
  it("keeps fixed slots per shift letter even when a shift is missing", () => {
    const ds = (date: string, shift: string, kg: number): TrendDayShiftRow => ({
      date,
      shift,
      kg,
      frames: 1,
      doffs: 1,
      frame_shifts: 1,
      kg_per_frame_shift: kg,
      std_kg: null,
      std_kg_per_frame_shift: null,
      std_ach_pct: null,
      tgt_kg: null,
      tgt_kg_per_frame_shift: null,
    });
    const rows: TrendDayShiftRow[] = [
      ds("2026-10-01", "A", 10),
      ds("2026-10-01", "C", 5),
      ds("2026-10-02", "C", 7),
    ];
    const out = stackByShift(DATES, rows);
    expect(out.series.map((s) => s.key)).toEqual(["A", "C"]);
    // C keeps slot 3's colour although it is the second series drawn.
    expect(out.series[1].color).toBe(SERIES_COLORS[2]);
    expect(out.series[1].label).toBe("Shift C");
    expect(out.series.map((s) => s.data)).toEqual([
      [10, 0],
      [5, 7],
    ]);
  });
});

describe("qualityLines", () => {
  it("is kg over frame-shifts per day, null on days the quality did not run", () => {
    const slots = qualitySlots([q(1, "A", 50), q(2, "B", 10)]);
    const out = qualityLines(
      DATES,
      [dq("2026-10-01", 1, "A", 300, 3), dq("2026-10-02", 2, "B", 90, 2)],
      slots,
    );
    expect(out[0].data).toEqual([100, null]);
    expect(out[1].data).toEqual([null, 45]);
  });

  it("weights the Other line by frame-shifts, not an average of averages", () => {
    const nine = Array.from({ length: 9 }, (_, i) => q(i + 1, `Q${i + 1}`, 100 - i));
    const slots = qualitySlots(nine);
    const out = qualityLines(
      DATES,
      [dq("2026-10-01", 8, "Q8", 100, 1), dq("2026-10-01", 9, "Q9", 60, 3)],
      slots,
    );
    // (100 + 60) / (1 + 3) = 40, not (100 + 20) / 2 = 60.
    expect(out[7].data).toEqual([40, null]);
  });
});

describe("pivotDayQuality", () => {
  const qualities = [q(1, "A", 50, { frame_shifts: 4, kg_per_frame_shift: 12.5 }), q(2, "B", 10)];
  const rows = [dq("2026-10-01", 1, "A", 30, 2), dq("2026-10-02", 1, "A", 20, 2), dq("2026-10-02", 2, "B", 10, 1)];

  it("kg: one row per quality, blank days null, total = period kg", () => {
    const out = pivotDayQuality(DATES, rows, qualities, "kg");
    expect(out).toHaveLength(2);
    expect(out[0].quality).toBe("A");
    expect(out[0][pivotField("2026-10-01")]).toBe(30);
    expect(out[0].total).toBe(50);
    expect(out[1][pivotField("2026-10-01")]).toBeNull();
    expect(out[1][pivotField("2026-10-02")]).toBe(10);
  });

  it("kg per frame-shift: total is the period ratio, not a sum of days", () => {
    const out = pivotDayQuality(DATES, rows, qualities, "kg_per_frame_shift");
    expect(out[0][pivotField("2026-10-01")]).toBe(15);
    expect(out[0].total).toBe(12.5);
  });

  it("frame-shifts", () => {
    const out = pivotDayQuality(DATES, rows, qualities, "frame_shifts");
    expect(out[0][pivotField("2026-10-02")]).toBe(2);
    expect(out[0].total).toBe(4);
  });
});

describe("formatting", () => {
  it("fmtKg groups Indian style and blanks null", () => {
    expect(fmtKg(26594.4)).toBe("26,594");
    expect(fmtKg(1234567)).toBe("12,34,567");
    expect(fmtKg(72.86, 1)).toBe("72.9");
    expect(fmtKg(null)).toBe("—");
  });

  it("fmtDelta signs with a true minus", () => {
    expect(fmtDelta(4.25)).toBe("+4.3%");
    expect(fmtDelta(-3.1)).toBe("−3.1%");
    expect(fmtDelta(0)).toBe("0.0%");
    expect(fmtDelta(null)).toBe("—");
  });

  it("deltaState follows direction x whether up is good", () => {
    expect(deltaState(4)).toBe("good");
    expect(deltaState(-4)).toBe("bad");
    expect(deltaState(-4, false)).toBe("good");
    expect(deltaState(0.3)).toBeUndefined();
    expect(deltaState(null)).toBeUndefined();
  });

  it("vsStdState bands actual against standard", () => {
    expect(vsStdState(101, 100)).toBe("good");
    expect(vsStdState(100, 100)).toBe("good");
    expect(vsStdState(96, 100)).toBe("warn");
    expect(vsStdState(80, 100)).toBe("bad");
    expect(vsStdState(80, null)).toBeUndefined();
    expect(vsStdState(null, 100)).toBeUndefined();
  });

  it("dates and axis ticks", () => {
    expect(shortDate("2026-10-07")).toBe("07/10");
    expect(longDate("2026-10-07")).toBe("07 Oct");
    expect(fmtAxisKg(26000)).toBe("26k");
    expect(fmtAxisKg(2500)).toBe("2.5k");
    expect(fmtAxisKg(850)).toBe("850");
  });
});

describe("standard and target lines", () => {
  it("qualityLines reads the standard per frame-shift and weights the fold by covered frame-shifts", () => {
    const nine = Array.from({ length: 9 }, (_, i) => q(i + 1, `Q${i + 1}`, 100 - i));
    const slots = qualitySlots(nine);
    const rows = [
      { ...dq("2026-10-01", 1, "Q1", 300, 3), std_kg: 450, std_kg_per_frame_shift: 150 },
      // folded: Q8 std 100 over 1 frame-shift, Q9 std 300 over 3 -> (100+300)/(1+3) = 100
      { ...dq("2026-10-01", 8, "Q8", 90, 1), std_kg: 100, std_kg_per_frame_shift: 100 },
      { ...dq("2026-10-01", 9, "Q9", 200, 3), std_kg: 300, std_kg_per_frame_shift: 100 },
    ];
    const std = qualityLines(DATES, rows, slots, "std");
    expect(std[0].data).toEqual([150, null]);
    expect(std[7].data).toEqual([100, null]);
    const tgt = qualityLines(DATES, rows, slots, "tgt");
    expect(tgt[0].data).toEqual([null, null]);
  });

  it("actualStdTgtLines dashes the standard, dots the target and drops an empty target", () => {
    const withTgt = actualStdTgtLines("Q1", "#2a78d6", [10, 12], [15, 15], [14, null]);
    expect(withTgt.map((s) => [s.key, s.dash])).toEqual([
      ["actual", undefined],
      ["std", "dash"],
      ["tgt", "dot"],
    ]);
    expect(withTgt[0].label).toBe("Q1 actual");
    const noTgt = actualStdTgtLines("Q1", "#2a78d6", [10], [15], [null]);
    expect(noTgt.map((s) => s.key)).toEqual(["actual", "std"]);
  });

  it("actualStdTgtLines adds the std-at-std-count line dash-dot between standard and target", () => {
    const all = actualStdTgtLines("Q1", "#2a78d6", [10, 12], [15, 15], [14, null], [13, 13]);
    expect(all.map((s) => [s.key, s.dash])).toEqual([
      ["actual", undefined],
      ["std", "dash"],
      ["stdc", "dashdot"],
      ["tgt", "dot"],
    ]);
    expect(all[2].label).toBe("Std at std count");
    const none = actualStdTgtLines("Q1", "#2a78d6", [10], [15], [null], [null]);
    expect(none.map((s) => s.key)).toEqual(["actual", "std"]);
  });

  it("qualityLines reads the std-at-std-count figure per frame-shift, null where absent", () => {
    const slots = qualitySlots([q(1, "Q1", 100)]);
    const rows = [{ ...dq("2026-10-01", 1, "Q1", 300, 3), stdc_kg: 360, stdc_kg_per_frame_shift: 120 }];
    expect(qualityLines(DATES, rows, slots, "stdc")[0].data).toEqual([120, null]);
    expect(qualityLines(DATES, [dq("2026-10-01", 1, "Q1", 300, 3)], slots, "stdc")[0].data).toEqual([null, null]);
  });

  it("pivot carries the standard per frame-shift and the standard kg", () => {
    const qualities = [q(1, "A", 50, { std_kg: 80, std_kg_per_frame_shift: 20 })];
    const rows = [{ ...dq("2026-10-01", 1, "A", 30, 2), std_kg: 40, std_kg_per_frame_shift: 20 }];
    const perFs = pivotDayQuality(DATES, rows, qualities, "std_kg_per_frame_shift");
    expect(perFs[0][pivotField("2026-10-01")]).toBe(20);
    expect(perFs[0].total).toBe(20);
    const kg = pivotDayQuality(DATES, rows, qualities, "std_kg");
    expect(kg[0][pivotField("2026-10-01")]).toBe(40);
    expect(kg[0].total).toBe(80);
  });
});
