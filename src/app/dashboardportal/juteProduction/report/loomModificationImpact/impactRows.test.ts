import { describe, expect, it } from "vitest";
import type { ImpactChain, ImpactComparison, ImpactSegment, ImpactVerdict, ImpactWindows } from "./_service";
import {
  comparisonBasisNote,
  comparisonRows,
  coverageLine,
  dayRowClass,
  deltaState,
  doneByLabel,
  flagLegend,
  flagsText,
  fmtDate,
  fmtDeltaPts,
  fmtSigned,
  fmtSignedPct,
  ladderRowClass,
  ladderRows,
  loomsImprovedLine,
  markersText,
  mechanicalRows,
  noComparisonReason,
  phaseKind,
  ROW_CLASS_CONTROL,
  ROW_CLASS_EXCLUDED,
  stageSubline,
  thresholdPctFor,
  thresholdRows,
  verdictChipColor,
  verdictLabel,
  windowLine,
  withIds,
} from "./impactRows";

const segment = (v: Partial<ImpactSegment>): ImpactSegment => ({
  seq: 1,
  label: "After-1 (Initial)",
  stage_seq: 1,
  kind: "INITIAL",
  date_from: "2026-09-05",
  date_to: "2026-09-25",
  days: 21,
  looms_n: 5,
  looms_total: 12,
  loom_days: 100,
  days_run: 95,
  producing_days: 20,
  eff_days: 18,
  hours_run: 1500,
  std_coverage_pct: 92,
  hours_coverage_pct: 88,
  efficiency_pct: 58.2,
  efficiency_at_baseline_std_pct: 58.2,
  delta_vs_baseline_pts: 2.1,
  delta_vs_baseline_pct: 3.7,
  delta_vs_previous_pts: null,
  delta_vs_previous_pct: null,
  net_vs_control_pct: 2.9,
  se: 0.8,
  verdict: "IMPROVED",
  is_control: false,
  ...v,
});

describe("formatting", () => {
  it("writes ISO dates as dd-Mon-yy and tolerates blanks", () => {
    expect(fmtDate("2026-08-31")).toBe("31-Aug-26");
    expect(fmtDate("2026-08-31T00:00:00")).toBe("31-Aug-26");
    expect(fmtDate(null)).toBe("—");
    expect(fmtDate("bad")).toBe("bad");
  });

  it("signs numbers and percentages", () => {
    expect(fmtSigned(2.1)).toBe("+2.10");
    expect(fmtSigned(-1)).toBe("-1.00");
    expect(fmtSigned(0)).toBe("0.00");
    expect(fmtSigned(null)).toBe("—");
    expect(fmtSignedPct(3.94)).toBe("+3.9%");
    expect(fmtSignedPct(-0.05)).toBe("-0.1%");
  });

  it("writes efficiency changes in points with the relative size", () => {
    expect(fmtDeltaPts(2.1, 3.9)).toBe("+2.10 pts (+3.9%)");
    expect(fmtDeltaPts(-12.3, -3.9)).toBe("-12.30 pts (-3.9%)");
    expect(fmtDeltaPts(1.5, null)).toBe("+1.50 pts");
    expect(fmtDeltaPts(null, 3.9)).toBe("—");
  });

  it("assigns row ids in order", () => {
    expect(withIds([{ a: 1 }, { a: 2 }])).toEqual([
      { a: 1, row_id: 0 },
      { a: 2, row_id: 1 },
    ]);
    expect(withIds(undefined)).toEqual([]);
  });
});

describe("doneByLabel", () => {
  it("maps the MOD_DONE_BY codes to labels and passes unknown codes through", () => {
    expect(doneByLabel("INHOUSE")).toBe("In-house");
    expect(doneByLabel("VENDOR")).toBe("Vendor");
    expect(doneByLabel("vendor")).toBe("Vendor");
    expect(doneByLabel("OTHER")).toBe("OTHER");
    expect(doneByLabel(null)).toBe("");
    expect(doneByLabel("INHOUSE", "Own workshop")).toBe("Own workshop");
  });
});

describe("verdict helpers", () => {
  it("labels and colours the four verdicts", () => {
    expect(verdictLabel("IMPROVED")).toBe("IMPROVED");
    expect(verdictLabel("NO_CLEAR_CHANGE")).toBe("NO CLEAR CHANGE");
    expect(verdictLabel("NOT_ENOUGH_DATA")).toBe("NOT ENOUGH DATA");
    expect(verdictLabel(null)).toBe("—");
    expect(verdictChipColor("IMPROVED")).toBe("success");
    expect(verdictChipColor("WORSE")).toBe("error");
    expect(verdictChipColor("NO_CLEAR_CHANGE")).toBe("warning");
    expect(verdictChipColor("NOT_ENOUGH_DATA")).toBe("default");
  });

  it("tile state follows the threshold", () => {
    expect(deltaState(3.5, 3)).toBe("good");
    expect(deltaState(-3, 3)).toBe("bad");
    expect(deltaState(1, 3)).toBeUndefined();
    expect(deltaState(null, 3)).toBeUndefined();
  });

  it("reads the efficiency threshold from meta.thresholds, defaulting to 3", () => {
    expect(thresholdPctFor({ VERDICT_THRESHOLD_PCT: 2.5 })).toBe(2.5);
    expect(thresholdPctFor({ VERDICT_THRESHOLD_PCT: "3" })).toBe(3);
    expect(thresholdPctFor({ VERDICT_THRESHOLD_PCT: Number.NaN })).toBe(3);
    expect(thresholdPctFor(null)).toBe(3);
    expect(thresholdPctFor({})).toBe(3);
  });

  const chain: ImpactChain = {
    root_modification_id: 5,
    title: "Shuttle guard",
    loom_group: null,
    stages: [
      { modification_id: 5, seq: 1, mod_kind: "INITIAL", mod_kind_label: "Initial", mod_date: "2026-08-20", mod_to_date: null, settle_days: 3, title: "Shuttle guard", mod_category: "MECHANICAL", mod_category_label: "Mechanical", done_by: "INHOUSE", done_by_label: "In-house", loom_count: 12, root_loom_count: 12, control_description: null },
      { modification_id: 6, seq: 2, mod_kind: "RECTIFY", mod_kind_label: "Rectification", mod_date: "2026-08-31", mod_to_date: null, settle_days: 3, title: "small tweak", mod_category: null, mod_category_label: null, done_by: null, done_by_label: null, loom_count: 5, root_loom_count: 12, control_description: null },
    ],
  };
  const verdict: ImpactVerdict = {
    verdict: "IMPROVED",
    stage_seq: 2,
    since_date: "2026-08-31",
    stage_label: "After-2",
    efficiency: null,
    efficiency_at_baseline_std: null,
    looms_improved: 4,
    looms_total: 5,
    eff_days_before: 50,
    eff_days_after: 18,
    coverage_before_pct: 91,
    coverage_after_pct: 87.4,
    reason: null,
    other_stage_note: null,
    comparison: null,
  };

  it("builds the stage sub-line, the looms-improved line and the coverage line", () => {
    expect(stageSubline(verdict, chain)).toBe(
      "since 31-Aug-26 · Rectification: small tweak (stage 2 of 2, 5 of 12 looms)",
    );
    expect(stageSubline({ ...verdict, stage_seq: 9 }, chain)).toBe("since 31-Aug-26 · After-2");
    expect(loomsImprovedLine(verdict)).toBe("4 of 5 looms improved");
    expect(loomsImprovedLine({ ...verdict, looms_improved: null })).toBe("");
    expect(loomsImprovedLine(null)).toBe("");
    expect(coverageLine(verdict)).toBe("before 91 % (50 eff days) · after 87 % (18 eff days)");
    expect(coverageLine({ ...verdict, eff_days_before: null, eff_days_after: null })).toBe(
      "before 91 % · after 87 %",
    );
    expect(coverageLine({ ...verdict, coverage_after_pct: null, eff_days_after: null })).toBe(
      "before 91 % (50 eff days)",
    );
    expect(coverageLine(null)).toBe("");
  });
});

describe("comparison block", () => {
  const comparison: ImpactComparison = {
    basis: "efficiency",
    stage_seq: 1,
    description: "43 un-modified looms of the same dept in the study speed bands (dept 15009)",
    study: { looms_n: 6, before: 56.1, after: 58.2, delta_pts: 2.1, delta_pct: 3.7 },
    control: { looms_n: 43, before: 55.5, after: 55.9, delta_pts: 0.4, delta_pct: 0.8 },
    net_delta_pts: 1.7,
    net_delta_pct: 2.9,
  };
  const meta = { flags_legend: null, notes: [] as string[], thresholds: {}, source: null, server_ms: null, control: null };

  it("builds study, control and net rows with the change in pts and %, tinted by the threshold", () => {
    const rows = comparisonRows(comparison, 3);
    expect(rows.map((r) => [r.row_id, r.kind, r.label])).toEqual([
      [0, "study", "This loom set (modified)"],
      [1, "control", "Other looms (not modified)"],
      [2, "net", "Difference (net effect)"],
    ]);
    expect(rows[0]).toMatchObject({ looms: "6", before: "56.10 %", after: "58.20 %", change: "+2.10 pts (+3.7%)", state: "good" });
    expect(rows[1]).toMatchObject({ looms: "43", before: "55.50 %", after: "55.90 %", change: "+0.40 pts (+0.8%)", state: undefined });
    expect(rows[2]).toMatchObject({ looms: "", before: "", after: "", change: "+1.70 pts (+2.9%)", state: undefined });
    expect(comparisonRows({ ...comparison, net_delta_pct: -3.5, net_delta_pts: -2 }, 3)[2]).toMatchObject({
      change: "-2.00 pts (-3.5%)",
      state: "bad",
    });
  });

  it("has only the study row without a control, dashes blanks, and reads an absent block as no rows", () => {
    const rows = comparisonRows({ ...comparison, control: null, net_delta_pts: null, net_delta_pct: null }, 3);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("study");
    const blank = comparisonRows(
      { ...comparison, study: { looms_n: null, before: null, after: null, delta_pts: null, delta_pct: null } },
      3,
    )[0];
    expect(blank).toMatchObject({ looms: "—", before: "—", after: "—", change: "—", state: undefined });
    // net figure in pts only when the control is too thin for the % (the existing net figure is null)
    expect(comparisonRows({ ...comparison, net_delta_pct: null }, 3)[2].change).toBe("+1.70 pts");
    expect(comparisonRows(null, 3)).toEqual([]);
    expect(comparisonRows(undefined, 3)).toEqual([]);
  });

  it("notes the baseline-standard basis only when it applies", () => {
    expect(comparisonBasisNote(comparison)).toBe("");
    expect(comparisonBasisNote({ ...comparison, basis: "efficiency_at_baseline_std" })).toMatch(
      /at the baseline standard speed.*flag S/,
    );
    expect(comparisonBasisNote(null)).toBe("");
  });

  it("explains a missing comparison set from the mode, the server note, or the default", () => {
    expect(noComparisonReason({ ...meta, control: { mode: "none", looms_n: 0, description: "none" } })).toBe(
      "control set to None in the filters",
    );
    expect(
      noComparisonReason({
        ...meta,
        notes: ["Recomputed live.", "No eligible controls (no other active looms in the study looms' departments)."],
        control: { mode: "same_dept", looms_n: 0, description: "0 un-modified looms" },
      }),
    ).toBe("No eligible controls (no other active looms in the study looms' departments)");
    expect(
      noComparisonReason({
        ...meta,
        notes: ["2 same-dept looms excluded as controls (modified inside the span): S301 — modified 10-Aug (Guard)."],
        control: { mode: "speed_band", looms_n: 0, description: "0 un-modified looms" },
      }),
    ).toBe("2 same-dept looms excluded as controls (modified inside the span): S301 — modified 10-Aug (Guard)");
    expect(noComparisonReason({ ...meta, control: { mode: "speed_band", looms_n: 0, description: null } })).toBe(
      "no eligible un-modified looms",
    );
    expect(noComparisonReason(null)).toBe("no eligible un-modified looms");
  });
});

describe("windows", () => {
  const windows: ImpactWindows = {
    window_days: 60,
    settle_days: 3,
    last_data_date: "2026-09-25",
    before: { date_from: "2026-07-01", date_to: "2026-08-29", days: 60, extended: false },
    excluded: [{ stage_seq: 1, date_from: "2026-08-30", date_to: "2026-09-04" }],
    after: [{ stage_seq: 1, date_from: "2026-09-05", date_to: "2026-09-25", days: 21, cut_reason: "last_data_date" }],
  };

  it("writes the window line with the cut reason", () => {
    expect(windowLine(windows)).toBe(
      "Before 01-Jul-26..29-Aug-26 (60 d) | Excluded-1 30-Aug-26..04-Sep-26 | After-1 05-Sep-26..25-Sep-26 (21 d, cut by last data date)",
    );
    expect(
      windowLine({
        ...windows,
        before: { ...windows.before, extended: true },
        after: [{ ...windows.after[0], cut_reason: "window", days: 60 }],
      }),
    ).toContain("(60 d, extended) |");
    expect(windowLine(null)).toBe("");
  });
});

describe("row classes", () => {
  it("greys settling days and reads phases case-insensitively", () => {
    expect(phaseKind("BEFORE")).toBe("before");
    expect(phaseKind("Excluded")).toBe("excluded");
    expect(phaseKind("AFTER-2")).toBe("after");
    expect(dayRowClass({ phase: "EXCLUDED" })).toBe(ROW_CLASS_EXCLUDED);
    expect(dayRowClass({ phase: "AFTER-1" })).toBe("");
  });

  it("shades control rows, reds a segment at or past −threshold, ambers thin ones", () => {
    expect(ladderRowClass(segment({ is_control: true }), 3)).toBe(ROW_CLASS_CONTROL);
    expect(ladderRowClass(segment({ seq: 0, delta_vs_baseline_pct: -9 }), 3)).toBe("");
    expect(ladderRowClass(segment({ delta_vs_baseline_pct: -3 }), 3)).toBe("report-perf-low");
    expect(ladderRowClass(segment({ delta_vs_baseline_pct: -2.9 }), 3)).toBe("");
    expect(ladderRowClass(segment({ delta_vs_baseline_pct: null, verdict: "NOT_ENOUGH_DATA" }), 3)).toBe(
      "report-perf-watch",
    );
    expect(ladderRowClass(segment({ delta_vs_baseline_pct: 4 }), 3)).toBe("");
  });
});

describe("ladder rows", () => {
  it("formats segment, dates, looms, efficiency deltas and verdict per row", () => {
    const rows = ladderRows([
      segment({ seq: 0, label: "Before", stage_seq: null, delta_vs_baseline_pts: null, delta_vs_baseline_pct: null, verdict: null }),
      segment({ delta_vs_previous_pts: -0.5, delta_vs_previous_pct: -0.9 }),
      segment({ is_control: true, label: "After-1" }),
    ]);
    expect(rows.map((r) => r.row_id)).toEqual([0, 1, 2]);
    expect(rows[0].segment).toBe("Before");
    expect(rows[0].delta_vs_baseline_text).toBe("—");
    expect(rows[0].verdict_text).toBe("");
    expect(rows[1].dates).toBe("05-Sep-26..25-Sep-26 (21 d)");
    expect(rows[1].looms).toBe("5 of 12");
    expect(rows[1].delta_vs_baseline_text).toBe("+2.10 pts (+3.7%)");
    expect(rows[1].delta_vs_previous_text).toBe("-0.50 pts (-0.9%)");
    expect(rows[1].net_vs_control_text).toBe("+2.9%");
    expect(rows[1].verdict_text).toBe("IMPROVED");
    expect(rows[2].segment).toBe("Control · After-1");
    expect(ladderRows(null)).toEqual([]);
  });
});

describe("flags, markers, mechanical", () => {
  it("orders flags S H W D N and dashes a loom outside the stage", () => {
    expect(flagsText(["W", "S", "D"])).toBe("S W D");
    expect(flagsText([])).toBe("");
    expect(flagsText(["S"], false)).toBe("—");
  });

  it("merges the server legend over the default and has no Q flag", () => {
    const legend = flagLegend({ flags_legend: { S: "standard changed" }, notes: [], thresholds: {}, source: null, server_ms: null, control: null });
    expect(legend[0]).toEqual({ flag: "S", text: "standard changed" });
    expect(legend.map((l) => l.flag)).toEqual(["S", "H", "W", "D", "N"]);
    expect(legend[4].text).toBe("no standard");
    expect(flagLegend(null)).toHaveLength(5);
  });

  it("joins markers and labels the mechanical total row", () => {
    expect(markersText(["STD SPEED 148 → 160 on 3 looms", "", "Event"])).toBe(
      "STD SPEED 148 → 160 on 3 looms · Event",
    );
    expect(markersText(null)).toBe("");
    const rows = mechanicalRows([
      { machine_id: 1, loom: "S293", side: "BEFORE", mech_stoppage_hours: 4.5, breakdown_count: 1, breakdown_minutes: 30, row_kind: "loom" },
      { machine_id: null, loom: null, side: "AFTER", mech_stoppage_hours: 9, breakdown_count: 2, breakdown_minutes: 60, row_kind: "total" },
    ]);
    expect(rows[0].row_id).toBe(0);
    expect(rows[0].loom_label).toBe("S293");
    expect(rows[1].loom_label).toBe("TOTAL");
    expect(mechanicalRows(null)).toEqual([]);
  });

  it("flattens thresholds, null as a dash", () => {
    expect(thresholdRows({ SE_MULTIPLIER: 2, VERDICT_THRESHOLD_PCT: 3, n1: null })).toEqual([
      { row_id: 0, key: "SE_MULTIPLIER", value: "2" },
      { row_id: 1, key: "VERDICT_THRESHOLD_PCT", value: "3" },
      { row_id: 2, key: "n1", value: "—" },
    ]);
    expect(thresholdRows(null)).toEqual([]);
  });
});
