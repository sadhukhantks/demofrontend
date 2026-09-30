import { describe, expect, it } from "vitest";
import type { DprJuteSection } from "@/utils/juteProductionReportService";
import { isoToDdMm, isoToDdMmYyyy, juteCoverKpiSub, juteCoverSubtitle } from "./dprJuteCover";

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
  days_stock_waste: 2.5,
  raw_jute_closing_weight: 75883,
  waste_closing_weight: 49611,
  cover_basis: {
    mode: "report_date",
    date: "2026-09-18",
    date_from: "2026-09-18",
    date_to: "2026-09-18",
    days: 1,
    production_kg: 20137.6,
    shifts: 3,
    is_report_date: true,
    basis_label: "spinning production",
  },
  days_stock_mtd_issue: 11.7,
};

/** Sunday 13-09-2026 (shift A only): divisor = 7-producing-day average,
 * 140,419.5 / 7 = 20,059.929 kg/day -> 77,634 / 20,059.929 = 3.9 days. */
const sunday: DprJuteSection = {
  ...jute,
  totals: { ...totals, closing_weight: 77634 },
  days_stock: 3.9,
  days_stock_raw_jute: 2.0,
  days_stock_waste: 1.9,
  raw_jute_closing_weight: 39327,
  waste_closing_weight: 38307,
  cover_basis: {
    mode: "average",
    date: "2026-09-13",
    date_from: "2026-09-07",
    date_to: "2026-09-13",
    days: 7,
    production_kg: 20059.929,
    shifts: null,
    is_report_date: false,
    basis_label: "average daily spinning production",
  },
  days_stock_mtd_issue: 5.8,
};

describe("isoToDdMmYyyy", () => {
  it("reorders an ISO date and leaves anything else alone", () => {
    expect(isoToDdMmYyyy("2026-09-18")).toBe("18-09-2026");
    expect(isoToDdMmYyyy("18/09/2026")).toBe("18/09/2026");
    expect(isoToDdMm("2026-09-07")).toBe("07-09");
  });
});

describe("juteCoverKpiSub", () => {
  it("shows the cover with its divisor and date", () => {
    expect(juteCoverKpiSub(jute)).toBe(
      "Jute 75,883 + Waste 49,611 kg · 6.2 days cover · ÷ 20,138 kg spinning on 18-09-2026",
    );
  });

  it("leaves the jute / waste split out when there is no waste in stock", () => {
    expect(juteCoverKpiSub({ ...jute, waste_closing_weight: 0 })).toBe(
      "6.2 days cover · ÷ 20,138 kg spinning on 18-09-2026",
    );
  });

  it("names the 7-producing-day average and why it was used on a part day", () => {
    expect(juteCoverKpiSub(sunday)).toBe(
      "Jute 39,327 + Waste 38,307 kg · 3.9 days cover · ÷ 20,060 kg/day avg spinning, last 7 producing days (07-09 to 13-09) — " +
        "report date was a holiday / part day",
    );
  });

  it("does not claim a part day when the report date's own production is the divisor", () => {
    expect(juteCoverKpiSub(jute)).not.toContain("part day");
    expect(juteCoverKpiSub(jute)).not.toContain("avg");
  });

  it("never shows the superseded MTD-issue figure", () => {
    expect(juteCoverKpiSub(jute)).not.toContain("11.7");
  });

  it("covers the no-branch and no-production cases", () => {
    expect(juteCoverKpiSub(null)).toBe("select a branch");
    expect(juteCoverKpiSub({ ...jute, days_stock: null, cover_basis: null })).toBe(
      "Jute 75,883 + Waste 49,611 kg · no recent spinning production",
    );
  });
});

describe("juteCoverSubtitle", () => {
  it("spells out the hand calculation and states jute and waste stock separately", () => {
    expect(juteCoverSubtitle(jute)).toBe(
      "Days of cover: 6.2 = closing 1,25,494 kg ÷ 20,138 kg spinning on 18-09-2026 · " +
        "of which jute stock 75,883 kg (3.8 days) + waste stock 49,611 kg (2.5 days)",
    );
  });

  it("spells out the average divisor, the reason, and keeps raw jute on the same divisor", () => {
    expect(juteCoverSubtitle(sunday)).toBe(
      "Days of cover: 3.9 = closing 77,634 kg ÷ 20,060 kg/day avg spinning, last 7 producing days " +
        "(07-09 to 13-09) · report date was a holiday / part day · " +
        "of which jute stock 39,327 kg (2.0 days) + waste stock 38,307 kg (1.9 days)",
    );
  });

  it("uses the singular when only one producing day was found", () => {
    const one: DprJuteSection = {
      ...sunday,
      cover_basis: { ...sunday.cover_basis!, days: 1, date_from: "2026-09-12", date_to: "2026-09-12" },
    };
    expect(juteCoverSubtitle(one)).toContain("last 1 producing day (12-09 to 12-09)");
  });

  it("drops the jute / waste clause when there is no waste in stock", () => {
    expect(juteCoverSubtitle({ ...jute, waste_closing_weight: 0 })).not.toContain("waste stock");
  });

  it("shows a dash when there is no production to divide by", () => {
    expect(juteCoverSubtitle({ ...jute, days_stock: null, cover_basis: null })).toContain("—");
  });
});
