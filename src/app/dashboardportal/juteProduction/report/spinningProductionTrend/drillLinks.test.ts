import { describe, expect, it } from "vitest";
import {
  clampRange,
  doffAnalysisDayUrl,
  doffAnalysisFrameUrl,
  lowProducerUrl,
} from "./drillLinks";

const scope = { branchId: 29, dateFrom: "2026-07-01", dateTo: "2026-10-07", shift: "C", itemId: 335676 };

describe("clampRange", () => {
  it("leaves a short range alone", () => {
    expect(clampRange("2026-10-01", "2026-10-07", 31)).toEqual({ from: "2026-10-01", to: "2026-10-07", clamped: false });
  });
  it("shortens from the start, keeping the end", () => {
    expect(clampRange("2026-07-01", "2026-10-07", 31)).toEqual({ from: "2026-09-07", to: "2026-10-07", clamped: true });
  });
});

describe("links", () => {
  it("doff analysis frame drill carries the frame, the clamped range and the quality", () => {
    const { url, clamped } = doffAnalysisFrameUrl(scope, "33047");
    expect(clamped).toBe(true);
    expect(url).toBe(
      "/dashboardportal/juteProduction/report/doffAnalysis?branch_id=29&tab=frames&frame=33047&date_from=2026-09-07&date_to=2026-10-07&item_id=335676",
    );
  });

  it("doff details for one day", () => {
    expect(doffAnalysisDayUrl(29, "2026-10-07")).toBe(
      "/dashboardportal/juteProduction/report/doffAnalysis?branch_id=29&tab=details&date=2026-10-07",
    );
  });

  it("low producer keeps the active shift and quality, and can narrow to one day", () => {
    const period = lowProducerUrl({ ...scope, dateFrom: "2026-09-24" }, "33047");
    expect(period.clamped).toBe(false);
    expect(period.url).toBe(
      "/dashboardportal/juteProduction/report/spinningLowProducer?branch_id=29&date_from=2026-09-24&date_to=2026-10-07&frame=33047&shift=C&item_id=335676",
    );
    const day = lowProducerUrl({ ...scope, shift: null, itemId: null }, "33047", { date: "2026-10-07", shift: "B" });
    expect(day.url).toBe(
      "/dashboardportal/juteProduction/report/spinningLowProducer?branch_id=29&date_from=2026-10-07&date_to=2026-10-07&frame=33047&shift=B",
    );
  });
});
