import { describe, expect, it } from "vitest";
import type { DoffSummaryRow, FramePivotRow } from "./doffAnalysisService";
import {
  bandOf,
  deriveBands,
  deriveSpellTotals,
  emptySel,
  matchSel,
  perfRank,
  scoreDetails,
  scorePivot,
} from "./perf";

function sRow(over: Partial<DoffSummaryRow>): DoffSummaryRow {
  return {
    spell_code: "A",
    frame: "1",
    item_id: 1,
    quality_name: "8 lbs",
    net_wt: 100,
    num_doffs: 10,
    avg_wt: 40,
    max_wt: 42,
    min_wt: 38,
    last_doff_wt: 40,
    ...over,
  };
}

function pRow(over: Partial<FramePivotRow>): FramePivotRow {
  return {
    frame: "1",
    quality_name: "8 lbs",
    per_date: {},
    avg: 40,
    max: 42,
    min: 38,
    ...over,
  };
}

describe("scoreDetails", () => {
  it("flags a frame far below its quality+spell peers on avg weight", () => {
    const rows = [
      sRow({ frame: "1", avg_wt: 40 }),
      sRow({ frame: "2", avg_wt: 40 }),
      sRow({ frame: "3", avg_wt: 40 }),
      sRow({ frame: "4", avg_wt: 30 }), // 75% of median 40 -> low
      sRow({ frame: "5", avg_wt: 35 }), // 87.5% -> watch
    ];
    const scores = scoreDetails(rows);
    expect(scores[0].status).toBe("ok");
    expect(scores[3].status).toBe("low");
    expect(scores[3].wtPct).toBeCloseTo(0.75);
    expect(scores[3].wtMedian).toBe(40);
    expect(scores[4].status).toBe("watch");
  });

  it("flags a low doff count even when weight is fine", () => {
    const rows = [
      sRow({ frame: "1", num_doffs: 10 }),
      sRow({ frame: "2", num_doffs: 10 }),
      sRow({ frame: "3", num_doffs: 4 }), // 40% of median 10 -> low
    ];
    const scores = scoreDetails(rows);
    expect(scores[2].status).toBe("low");
    expect(scores[2].doffPct).toBeCloseTo(0.4);
    expect(scores[2].doffMedian).toBe(10);
    expect(scores[0].status).toBe("ok");
  });

  it("compares only within the same quality and spell", () => {
    const rows = [
      sRow({ frame: "1", quality_name: "8 lbs", avg_wt: 40 }),
      sRow({ frame: "2", quality_name: "8 lbs", avg_wt: 40 }),
      // Lighter yarn, lighter doffs — its own peer group, all equal -> ok.
      sRow({ frame: "3", quality_name: "6 lbs", avg_wt: 28 }),
      sRow({ frame: "4", quality_name: "6 lbs", avg_wt: 28 }),
      // Same quality, other spell — also its own group.
      sRow({ frame: "1", spell_code: "B", avg_wt: 20 }),
    ];
    const scores = scoreDetails(rows);
    expect(scores.map((s) => s.status)).toEqual(["ok", "ok", "ok", "ok", "ok"]);
  });

  it("a lone frame in its group is ok (nothing to compare)", () => {
    const scores = scoreDetails([sRow({ avg_wt: 12 })]);
    expect(scores[0].status).toBe("ok");
    expect(scores[0].wtPct).toBe(1);
  });

  it("ignores zero weights in the median but flags the zero row", () => {
    const rows = [
      sRow({ frame: "1", avg_wt: 40 }),
      sRow({ frame: "2", avg_wt: 40 }),
      sRow({ frame: "3", avg_wt: 0, num_doffs: 10 }),
    ];
    const scores = scoreDetails(rows);
    expect(scores[0].wtMedian).toBe(40); // zero not dragging the median
    expect(scores[2].status).toBe("low");
    expect(scores[2].wtPct).toBe(0);
  });

  it("90% exactly is still ok; just below is watch", () => {
    const rows = [
      sRow({ frame: "1", avg_wt: 40 }),
      sRow({ frame: "2", avg_wt: 40 }),
      sRow({ frame: "3", avg_wt: 40 }),
      sRow({ frame: "4", avg_wt: 36 }), // exactly 0.9 of the median 40
      sRow({ frame: "5", avg_wt: 35.9 }),
    ];
    const scores = scoreDetails(rows);
    expect(scores[3].status).toBe("ok");
    expect(scores[4].status).toBe("watch");
  });
});

describe("scorePivot", () => {
  it("scores weight only, within the same quality", () => {
    const rows = [
      pRow({ frame: "1", avg: 40 }),
      pRow({ frame: "2", avg: 40 }),
      pRow({ frame: "3", avg: 30 }),
      pRow({ frame: "4", quality_name: "6 lbs", avg: 28 }),
    ];
    const scores = scorePivot(rows);
    expect(scores[2].status).toBe("low");
    expect(scores[2].doffPct).toBeNull();
    expect(scores[3].status).toBe("ok");
  });
});

describe("perfRank", () => {
  it("orders low before watch before ok", () => {
    expect(perfRank("low")).toBeLessThan(perfRank("watch"));
    expect(perfRank("watch")).toBeLessThan(perfRank("ok"));
  });
});

describe("matchSel", () => {
  const row = { spell_code: "A", quality_name: "8 lbs", frame: "12" };

  it("empty selection matches everything", () => {
    expect(matchSel(emptySel(), row)).toBe(true);
  });

  it("filters by each dimension independently", () => {
    expect(matchSel({ ...emptySel(), spells: ["B"] }, row)).toBe(false);
    expect(matchSel({ ...emptySel(), spells: ["A", "B"] }, row)).toBe(true);
    expect(matchSel({ ...emptySel(), qualities: ["6 lbs"] }, row)).toBe(false);
    expect(matchSel({ ...emptySel(), frames: ["12"] }, row)).toBe(true);
  });

  it("dimensions the row lacks are not filtered on", () => {
    expect(matchSel({ ...emptySel(), spells: ["A"] }, { frame: "12" })).toBe(true);
  });
});

describe("deriveSpellTotals", () => {
  it("sums net weight per spell, sorted", () => {
    const rows = [
      sRow({ spell_code: "B", net_wt: 10 }),
      sRow({ spell_code: "A", net_wt: 5 }),
      sRow({ spell_code: "B", net_wt: 2.5 }),
    ];
    expect(deriveSpellTotals(rows)).toEqual([
      { spell_code: "A", net_wt: 5, target_wt: null, diff_wt: null, target_rows: 0, rows: 1 },
      { spell_code: "B", net_wt: 12.5, target_wt: null, diff_wt: null, target_rows: 0, rows: 2 },
    ]);
  });

  it("sums target and diff over the rows that have a target only", () => {
    const rows = [
      // diff = target - actual: +15.2 short, -14.8 over
      sRow({ net_wt: 300, target_wt: 315.2, diff_wt: 15.2 }),
      sRow({ net_wt: 330, target_wt: 315.2, diff_wt: -14.8 }),
      // standards not entered for this frame's quality: not a zero target
      sRow({ net_wt: 250, target_wt: null, diff_wt: null }),
    ];
    expect(deriveSpellTotals(rows)).toEqual([
      { spell_code: "A", net_wt: 880, target_wt: 630.4, diff_wt: 0.4, target_rows: 2, rows: 3 },
    ]);
  });
});

describe("bandOf / deriveBands", () => {
  it("mirrors the server's fixed 2 kg bands", () => {
    expect(bandOf(20)).toBe("<26");
    expect(bandOf(26)).toBe("26-28");
    expect(bandOf(27.99)).toBe("26-28");
    expect(bandOf(43.9)).toBe("42-44");
    expect(bandOf(44.5)).toBe("44-45");
    expect(bandOf(45)).toBe("44-45");
    expect(bandOf(45.01)).toBe(">45");
  });

  it("counts frames per band with the spell breakup, full axis", () => {
    const rows = [
      sRow({ spell_code: "A", avg_wt: 40 }),
      sRow({ spell_code: "B", avg_wt: 41 }),
      sRow({ spell_code: "A", avg_wt: 20 }),
    ];
    const bands = deriveBands(rows);
    expect(bands).toHaveLength(12); // <26, 26-28 .. 42-44, 44-45, >45
    const b40 = bands.find((b) => b.band === "40-42");
    expect(b40).toEqual({
      band: "40-42",
      frame_count: 2,
      spell_breakup: { A: 1, B: 1 },
    });
    expect(bands.find((b) => b.band === "<26")?.frame_count).toBe(1);
    expect(bands.find((b) => b.band === "30-32")?.frame_count).toBe(0);
  });
});
