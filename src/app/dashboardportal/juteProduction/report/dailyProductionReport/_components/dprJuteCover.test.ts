import { describe, expect, it } from "vitest";
import type { DprJuteSection } from "@/utils/juteProductionReportService";
import { isoToDdMmYyyy, juteCoverKpiSub, juteCoverSubtitle } from "./dprJuteCover";

const totals = {
  opening_weight: 113904,
  receipt_weight: 11590,
  issue_weight: 0,
  sold_weight: 0,
  closing_weight: 125494,
  mtd_receipt_weight: 272452,
  mtd_issue_weight: 193779,
};

/** sls co 2 br 29, 18-09-2026 — the TKT-000172 golden case. */
const jute: DprJuteSection = {
  groups: [],
  totals,
  days_stock: 6.2,
  days_stock_raw_jute: 3.8,
  raw_jute_closing_weight: 75883,
  waste_closing_weight: 49611,
  cover_basis: {
    date: "2026-09-18",
    production_kg: 20137.6,
    shifts: 3,
    is_report_date: true,
    basis_label: "spinning production",
  },
  days_stock_mtd_issue: 11.7,
};

describe("isoToDdMmYyyy", () => {
  it("reorders an ISO date and leaves anything else alone", () => {
    expect(isoToDdMmYyyy("2026-09-18")).toBe("18-09-2026");
    expect(isoToDdMmYyyy("18/09/2026")).toBe("18/09/2026");
  });
});

describe("juteCoverKpiSub", () => {
  it("shows the cover with its divisor and date", () => {
    expect(juteCoverKpiSub(jute)).toBe("6.2 days cover · ÷ 20,138 kg spinning on 18-09-2026");
  });

  it("flags a fallback day", () => {
    const sunday: DprJuteSection = {
      ...jute,
      days_stock: 3.1,
      cover_basis: { ...jute.cover_basis!, date: "2026-09-12", production_kg: 25077.1, is_report_date: false },
    };
    expect(juteCoverKpiSub(sunday)).toBe(
      "3.1 days cover · ÷ 25,077 kg spinning on 12-09-2026 (last full day)",
    );
  });

  it("never shows the superseded MTD-issue figure", () => {
    expect(juteCoverKpiSub(jute)).not.toContain("11.7");
  });

  it("covers the no-branch and no-production cases", () => {
    expect(juteCoverKpiSub(null)).toBe("select a branch");
    expect(juteCoverKpiSub({ ...jute, days_stock: null, cover_basis: null })).toBe(
      "no recent spinning production",
    );
  });
});

describe("juteCoverSubtitle", () => {
  it("spells out the hand calculation and the raw-jute-only cover", () => {
    expect(juteCoverSubtitle(jute)).toBe(
      "Days of cover: 6.2 = closing 1,25,494 kg ÷ 20,138 kg spinning on 18-09-2026 · " +
        "raw jute alone (excl. 49,611 kg process waste): 3.8 days",
    );
  });

  it("says why another day was used", () => {
    const sunday: DprJuteSection = {
      ...jute,
      cover_basis: { ...jute.cover_basis!, date: "2026-09-12", is_report_date: false },
    };
    expect(juteCoverSubtitle(sunday)).toContain("(last full day)");
    expect(juteCoverSubtitle(sunday)).toContain("report date was a holiday / part day");
  });

  it("drops the raw-jute clause when there is no waste in stock", () => {
    expect(juteCoverSubtitle({ ...jute, waste_closing_weight: 0 })).not.toContain("raw jute alone");
  });

  it("shows a dash when there is no production to divide by", () => {
    expect(juteCoverSubtitle({ ...jute, days_stock: null, cover_basis: null })).toContain("—");
  });
});
