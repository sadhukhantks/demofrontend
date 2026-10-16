/**
 * @vitest-environment jsdom
 *
 * TKT-000173 — average count on three weightings, as a table and as a KPI card;
 * a blank standard shows "—".
 * TKT-000201 — the same weightings on the SQC actual count beside the std count.
 */
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import type { DprSpinningAvgCount } from "@/utils/juteProductionReportService";
import { DprAvgCountTable, avgCountKpi, avgCountNote, stdBasisText } from "./DprAvgCountTable";
import { KpiCard } from "./DprPieces";

/** sls co 2 br 29, 18-09-2026 — no quality-level standards entered. */
const SLS: DprSpinningAvgCount = {
  by_frames: 14.36,
  frame_shifts: 59,
  by_production: 14.52,
  production_kg: 20137.6,
  by_std_production: null,
  std_production_kg: 0,
  std_qualities: 0,
  qualities: 6,
  count_missing: [],
};

const FULL: DprSpinningAvgCount = {
  ...SLS,
  by_std_production: 14.1,
  std_production_kg: 23500,
  std_qualities: 6,
};

describe("stdBasisText", () => {
  it("explains a blank, a partial and a full std basis", () => {
    expect(stdBasisText(SLS)).toBe(
      "no std production (std TPI / efficiency or SQC count missing)",
    );
    expect(stdBasisText({ ...FULL, std_qualities: 4 })).toBe(
      "23,500 kg std expected · 4 of 6 qualities have std production",
    );
    expect(stdBasisText(FULL)).toBe("23,500 kg std expected");
  });
});

describe("DprAvgCountTable", () => {
  it("shows the three averages with what each was weighted over", () => {
    render(<DprAvgCountTable avg={FULL} />);
    const frames = within(screen.getByTestId("dpr-avg-count-frames"));
    expect(frames.getByText("14.36")).toBeInTheDocument();
    expect(frames.getByText("59 frame-shifts")).toBeInTheDocument();
    const prod = within(screen.getByTestId("dpr-avg-count-production"));
    expect(prod.getByText("14.52")).toBeInTheDocument();
    expect(prod.getByText("20,138 kg doffed")).toBeInTheDocument();
    const std = within(screen.getByTestId("dpr-avg-count-std"));
    expect(std.getByText("14.10")).toBeInTheDocument();
    expect(screen.queryByText(/left out of the third row/)).not.toBeInTheDocument();
    // Old payload (no act_* fields): one count column, as before TKT-000201.
    expect(screen.getByText("Average Count (lb)")).toBeInTheDocument();
    expect(screen.queryByText("SQC Actual Count (lb)")).not.toBeInTheDocument();
  });

  it("shows a dash — never 0 — when no standard is entered, and says where to enter it", () => {
    render(<DprAvgCountTable avg={SLS} />);
    const std = within(screen.getByTestId("dpr-avg-count-std"));
    expect(std.getByText("—")).toBeInTheDocument();
    expect(std.queryByText("0.00")).not.toBeInTheDocument();
    expect(
      std.getByText("no std production (std TPI / efficiency or SQC count missing)"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Spinning Target Map/)).toBeInTheDocument();
  });

  it("names qualities that have no count on the yarn master", () => {
    render(<DprAvgCountTable avg={{ ...FULL, count_missing: ["NEW YARN"] }} />);
    expect(screen.getByText(/left out of the std column: NEW YARN\./)).toBeInTheDocument();
  });
});

describe("avgCountKpi — the Avg Count (lb) KPI card", () => {
  it("packs frames / production / std into one line, in table order", () => {
    expect(avgCountKpi(FULL)).toEqual({
      value: "14.36 / 14.52 / 14.10",
      sub: "frames / production / std",
    });
  });

  it("shows a dash for a blank std figure and says it was not entered", () => {
    expect(avgCountKpi(SLS)).toEqual({
      value: "14.36 / 14.52 / —",
      sub: "frames / production / std (std not entered)",
    });
  });

  it("is all dashes on a day with no spinning", () => {
    const empty: DprSpinningAvgCount = {
      ...SLS, by_frames: null, by_production: null, frame_shifts: 0, production_kg: 0, qualities: 0,
    };
    expect(avgCountKpi(empty).value).toBe("— / — / —");
  });

  it("renders through the page's KpiCard like every other card", () => {
    render(<KpiCard label="Avg Count (lb)" {...avgCountKpi(SLS)} />);
    expect(screen.getByText("Avg Count (lb)")).toBeInTheDocument();
    expect(screen.getByText("14.36 / 14.52 / —")).toBeInTheDocument();
    expect(screen.getByText("frames / production / std (std not entered)")).toBeInTheDocument();
  });
});

/** sls co 2 br 29, 08-10-2026 — every quality had an SQC count reading. */
const ACT: DprSpinningAvgCount = {
  by_frames: 13.64,
  frame_shifts: 87,
  by_production: 14.12,
  production_kg: 30160.35,
  by_std_production: 13.95,
  std_production_kg: 41144,
  std_qualities: 6,
  qualities: 6,
  count_missing: [],
  act_by_frames: 13.33,
  act_by_production: 13.69,
  act_by_std_production: 13.56,
  act_measured_kg: 30160.35,
  act_fallback: [],
};

describe("TKT-000201 — SQC actual count beside the std count", () => {
  it("shows a Std Count and an SQC Actual Count column per weighting", () => {
    render(<DprAvgCountTable avg={ACT} />);
    expect(screen.getByText("Std Count (lb)")).toBeInTheDocument();
    expect(screen.getByText("SQC Actual Count (lb)")).toBeInTheDocument();
    const frames = within(screen.getByTestId("dpr-avg-count-frames"));
    expect(frames.getByText("13.64")).toBeInTheDocument();
    expect(frames.getByText("13.33")).toBeInTheDocument();
    const prod = within(screen.getByTestId("dpr-avg-count-production"));
    expect(prod.getByText("14.12")).toBeInTheDocument();
    expect(prod.getByText("13.69")).toBeInTheDocument();
    const std = within(screen.getByTestId("dpr-avg-count-std"));
    expect(std.getByText("13.95")).toBeInTheDocument();
    expect(std.getByText("13.56")).toBeInTheDocument();
    expect(screen.getByText(/entered in Spinning SQC/)).toBeInTheDocument();
  });

  it("KPI card headlines the SQC actual figures with the std figures in the caption", () => {
    expect(avgCountKpi(ACT)).toEqual({
      value: "13.33 / 13.69 / 13.56",
      sub: "SQC actual (frames / prod / std) · std count 13.64 / 14.12 / 13.95",
    });
    expect(
      avgCountKpi({ ...ACT, act_measured_kg: 29000, act_fallback: ["9-HSWP", "X"] }).sub,
    ).toMatch(/ · 2 w\/o SQC$/);
  });

  it("never labels std as actual when no SQC count was entered", () => {
    const none = { ...ACT, act_measured_kg: 0, act_fallback: ["A", "B"] };
    expect(avgCountKpi(none)).toEqual({
      value: "13.64 / 14.12 / 13.95",
      sub: "std count · frames / prod / std · no SQC count entered",
    });
    const note = avgCountNote(none);
    expect(note).toContain("No SQC count was entered for the day");
    expect(note).not.toContain("stands in the actual column");
  });

  it("names the qualities whose std count stood in, and the coverage", () => {
    const note = avgCountNote({ ...ACT, act_measured_kg: 29000, act_fallback: ["9-HSWP"] });
    expect(note).toContain("SQC count covers 29,000 of 30,160 kg.");
    expect(note).toContain("std count stands in the actual column: 9-HSWP.");
  });

  it("says moisture-corrected when the payload is on the corrected basis (from Oct-2026)", () => {
    expect(avgCountNote({ ...ACT, count_basis: "corrected" })).toContain(
      "the day's average moisture-corrected count entered in Spinning SQC",
    );
    expect(avgCountNote(ACT)).not.toContain("moisture-corrected");
  });
});
