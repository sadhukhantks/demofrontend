/**
 * @vitest-environment jsdom
 *
 * TKT-000173 — average count on three weightings, as a table and as a KPI card;
 * a blank standard shows "—".
 */
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import type { DprSpinningAvgCount } from "@/utils/juteProductionReportService";
import { DprAvgCountTable, avgCountKpi, stdBasisText } from "./DprAvgCountTable";
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
    expect(stdBasisText(SLS)).toBe("no std TPI / efficiency entered");
    expect(stdBasisText({ ...FULL, std_qualities: 4 })).toBe(
      "23,500 kg std expected · 4 of 6 qualities have a standard",
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
    expect(screen.queryByText(/left out of the third figure/)).not.toBeInTheDocument();
  });

  it("shows a dash — never 0 — when no standard is entered, and says where to enter it", () => {
    render(<DprAvgCountTable avg={SLS} />);
    const std = within(screen.getByTestId("dpr-avg-count-std"));
    expect(std.getByText("—")).toBeInTheDocument();
    expect(std.queryByText("0.00")).not.toBeInTheDocument();
    expect(std.getByText("no std TPI / efficiency entered")).toBeInTheDocument();
    expect(screen.getByText(/Spinning Target Map/)).toBeInTheDocument();
  });

  it("names qualities that have no count on the yarn master", () => {
    render(<DprAvgCountTable avg={{ ...FULL, count_missing: ["NEW YARN"] }} />);
    expect(screen.getByText(/left out of all three: NEW YARN\./)).toBeInTheDocument();
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
