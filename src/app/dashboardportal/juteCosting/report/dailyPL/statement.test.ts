import { describe, expect, it } from "vitest";
import type { DailyPlStatement, StatementHead } from "./_service";
import { conversionText } from "./_components/KpiStrip";
import {
  capitalFgLabel,
  conversionCostPerT,
  conversionRow,
  fgDetail,
  headReason,
  kgPerKgVerdict,
  lineDetail,
  netShown,
  statementCoverage,
  vsBenchmark,
} from "./statement";

const head = (key: StatementHead["key"], per_t: number | null, extra: Partial<StatementHead> = {}): StatementHead => ({
  no: 1,
  key,
  label: key,
  period: per_t == null ? null : per_t * 100,
  per_t,
  benchmark_per_t: null,
  benchmark_label: null,
  estimated: false,
  available: per_t != null,
  lines: [],
  has_breakdown: false,
  ...extra,
});

const statement: DailyPlStatement = {
  realisation: { period: 100, per_t: 180000, lines: [] },
  heads: [
    head("raw_material", 104000),
    head("stores", 6500),
    head("power", 4000),
    head("wages", 16500),
    head("overheads", 2000),
    head("capital", 50),
  ],
  contribution: { period: 50, per_t: 49000 },
  operating_profit: { period: 40, per_t: 47000 },
  net: { period: 38, per_t: 46950 },
  conversion_cost: { period: 12, per_t: 12500, benchmark_per_t: 10000 },
};

describe("vsBenchmark", () => {
  it("says below / above the rule of thumb in words, with the tone following the words", () => {
    expect(vsBenchmark(2914, 4000, "industry rule of thumb")).toEqual({ text: "₹1,086 below rule of thumb", tone: "good" });
    expect(vsBenchmark(12279, 4000, "industry rule of thumb")).toEqual({ text: "₹8,279 above rule of thumb", tone: "warn" });
    expect(vsBenchmark(4000.2, 4000, null)).toEqual({ text: "at rule of thumb", tone: "good" });
  });
  it("names a keyed benchmark and is blank without one", () => {
    expect(vsBenchmark(3500, 4000, "keyed").text).toBe("₹500 below keyed benchmark");
    expect(vsBenchmark(3500, null, "keyed")).toEqual({ text: "", tone: undefined });
    expect(vsBenchmark(null, 4000, "keyed")).toEqual({ text: "", tone: undefined });
  });
  it("does not tone an estimated head that sits exactly on its benchmark", () => {
    // Overheads are estimated AT the ₹2,000/t rule of thumb, so "at rule of thumb" would be a tautology.
    expect(vsBenchmark(2000, 2000, "industry rule of thumb", true)).toEqual({ text: "estimate = benchmark", tone: undefined });
    expect(vsBenchmark(2000, 2000, "industry rule of thumb", false)).toEqual({ text: "at rule of thumb", tone: "good" });
    // A part-keyed estimate that differs from the benchmark still gets the real verdict.
    expect(vsBenchmark(2600, 2000, "industry rule of thumb", true)).toEqual({ text: "₹600 above rule of thumb", tone: "warn" });
  });
});

describe("kgPerKgVerdict", () => {
  it("uses the jute-issue check's bands: below 0.90 is LOW and above 1.25 is HIGH, both warn", () => {
    const low = kgPerKgVerdict(0.803, 1.06);
    expect(low.tone).toBe("warn");
    expect(low.text).toBe("std 1.06 · LOW — issue lines may be missing or under-weighed");
    expect(low.text).not.toMatch(/below std/);
    const high = kgPerKgVerdict(1.31, 1.06);
    expect(high.tone).toBe("warn");
    expect(high.text).toBe("std 1.06 · HIGH — over-issue or production under-booked");
  });
  it("tones good only inside the band, and always names the std", () => {
    expect(kgPerKgVerdict(1.06, 1.06)).toEqual({ text: "std 1.06 · at std", tone: "good" });
    expect(kgPerKgVerdict(0.95, 1.06)).toEqual({ text: "std 1.06 · 0.11 below std", tone: "good" });
    expect(kgPerKgVerdict(1.2, 1.06)).toEqual({ text: "std 1.06 · 0.14 above std", tone: "good" });
    expect(kgPerKgVerdict(0.9, 1.06).tone).toBe("good"); // the band edges are not flagged
    expect(kgPerKgVerdict(1.25, 1.06).tone).toBe("good");
  });
  it("says why there is no verdict", () => {
    expect(kgPerKgVerdict(null, 1.06)).toEqual({ text: "no cloth or no jute issued in the range", tone: undefined });
    expect(kgPerKgVerdict(1, null)).toEqual({ text: "no std", tone: undefined });
  });
});

describe("lineDetail", () => {
  it("reads the quantity fields of each head", () => {
    expect(lineDetail({ label: "Sacking", period: 1, per_t: 1, tonnes: 300.5, rate: 62000 })).toBe("300.500 t × ₹62,000/t");
    expect(lineDetail({ label: "GRID", period: 1, per_t: 1, kwh: 150000, rate: 8.5 })).toBe("1,50,000 kWh × ₹8.50/kWh");
    expect(lineDetail({ label: "hands", period: 1, per_t: 1, qty: 13083.3, rate: 400 })).toBe("13,083.3 hand-days × ₹400");
    expect(lineDetail({ label: "staff", period: 1, per_t: 1, value_per_day: 50000, days: 19 })).toBe("₹50,000/day × 19 days");
    expect(lineDetail({ label: "jute stock", period: 1, per_t: 1, base_value: 55300000 })).toBe("on ₹ 553.00 L");
    expect(lineDetail({ label: "jute", period: 1, per_t: 1, qty_t: 633.2 })).toBe("633.200 t");
    expect(lineDetail({ label: "estimate", period: 1, per_t: 1, code: "BENCH_OVERHEAD_PER_T", value_per_day: null, rate_per_t: 2000, days: 15 })).toBe(
      "₹2,000/t × cloth (rule of thumb)",
    );
    expect(lineDetail({ label: "plain", period: 1, per_t: 1 })).toBe("");
  });
});

describe("conversionCostPerT", () => {
  it("sums stores + power + wages + overheads and adds wages to the ₹10,000 rule of thumb", () => {
    const c = conversionCostPerT(statement);
    expect(c.perT).toBe(29000);
    expect(c.wagesPerT).toBe(16500);
    expect(c.benchmarkPerT).toBe(26500);
    expect(c.missing).toEqual([]);
  });
  it("leaves out an unavailable head and names it", () => {
    const s = { ...statement, heads: statement.heads.map((h) => (h.key === "power" ? head("power", null, { label: "Electricity" }) : h)) };
    const c = conversionCostPerT(s);
    expect(c.perT).toBe(25000);
    expect(c.missing).toEqual(["electricity"]);
    expect(conversionCostPerT(null).perT).toBeNull();
  });
});

describe("conversionRow", () => {
  // The real sls statement of 2026-10-01..19: the backend's conversion cost INCLUDES wages
  // (stores 4,727.70 + power 4,028.72 + wages 12,109.32 + overheads 2,000) while its
  // benchmark_per_t (₹10,000) does not.
  const sls: DailyPlStatement = {
    ...statement,
    heads: [
      head("raw_material", 104562.68),
      head("stores", 4727.7),
      head("power", 4028.72),
      head("wages", 12109.32),
      head("overheads", 2000, { estimated: true }),
      head("capital", 4160.6),
    ],
    conversion_cost: { period: 7236501.55, per_t: 22865.73, benchmark_per_t: 10000, benchmark_label: "industry rule of thumb (owner, 2026-10-20)" },
  };

  it("compares the wages-inclusive cost with the benchmark PLUS wages — not with the bare ₹10,000", () => {
    const row = conversionRow(sls);
    expect(row.benchmarkPerT).toBeCloseTo(22109.32, 2);
    expect(row.benchmarkText).toBe("₹22,109 · rule of thumb ₹10,000 + wages");
    expect(row.verdict).toEqual({ text: "₹756 above rule of thumb", tone: "warn" });
    expect(row.verdict.text).not.toMatch(/12,866/); // the old, wages-blind verdict
  });

  it("agrees with the KPI tile: same benchmark and the same gap", () => {
    const tile = conversionCostPerT(sls);
    const row = conversionRow(sls);
    expect(row.benchmarkPerT).toBe(tile.benchmarkPerT);
    const tileGap = Math.round((tile.perT ?? 0) - (tile.benchmarkPerT ?? 0));
    const rowGap = Math.round((row.perT ?? 0) - (row.benchmarkPerT ?? 0));
    expect(rowGap).toBe(tileGap);
    expect(row.verdict.text).toBe(`₹${tileGap} above rule of thumb`);
    // …and with the words the tile itself prints.
    const tileText = conversionText(tile.perT, tile.benchmarkPerT, tile.wagesPerT, tile.missing);
    expect(tileText.state).toBe(row.verdict.tone);
    expect(tileText.text).toContain(`₹${tileGap} above`);
  });

  it("names a keyed benchmark, and says so when wages are not available", () => {
    const keyed = conversionRow({ ...sls, conversion_cost: { ...sls.conversion_cost, benchmark_label: "keyed" } });
    expect(keyed.benchmarkText).toBe("₹22,109 · keyed ₹10,000 + wages");
    expect(keyed.verdict.text).toBe("₹756 above keyed benchmark");
    const noWages = conversionRow({ ...sls, heads: sls.heads.map((h) => (h.key === "wages" ? head("wages", null) : h)) });
    expect(noWages.benchmarkPerT).toBe(10000);
    expect(noWages.benchmarkText).toBe("₹10,000 · rule of thumb ₹10,000 (wages not available)");
  });

  it("is blank without a benchmark", () => {
    const none = conversionRow({ ...sls, conversion_cost: { ...sls.conversion_cost, benchmark_per_t: null } });
    expect(none.benchmarkPerT).toBeNull();
    expect(none.benchmarkText).toBe("—");
    expect(none.verdict).toEqual({ text: "", tone: undefined });
  });
});

describe("netShown", () => {
  it("is the operating profit while capital is excluded, the backend net when included", () => {
    expect(netShown(statement, false)).toEqual({ period: 40, per_t: 47000 });
    expect(netShown(statement, true)).toEqual({ period: 38, per_t: 46950 });
  });
});

describe("headReason", () => {
  it("prefers the head's own reason, then the matching not_keyed line", () => {
    expect(headReason(head("power", null, { not_keyed: "no rate" }), [])).toBe("no rate");
    expect(headReason(head("power", null), [{ key: "power", reason: "power: not keyed — POWER_RATE_PER_KWH missing" }])).toBe(
      "power: not keyed — POWER_RATE_PER_KWH missing",
    );
    expect(headReason(head("raw_material", 1), [{ key: "REALISATION_PER_T:SACKING", reason: "x" }])).toBeNull();
    expect(headReason(head("overheads", 2000, { estimated: true }), [])).toMatch(/estimated/);
  });
});

describe("statementCoverage", () => {
  it("names the priced days and says when unpriced days are left out", () => {
    expect(statementCoverage({ ...statement, priced_days: 15, calendar_days: 19, cloth_t: 316.478 })).toBe(
      "15 of 19 days priced · 316.478 t cloth · unpriced days are left out of the statement (see Not keyed)",
    );
    expect(statementCoverage({ ...statement, priced_days: 19, calendar_days: 19, cloth_t: 400 })).toBe("19 of 19 days priced · 400.000 t cloth");
    expect(statementCoverage(statement)).toBeNull();
  });
});

describe("capital finished goods", () => {
  const capital = {
    jute_stock_value: 55300000,
    jute_stock_kg: 633000,
    fg_value: 173500000,
    fg_t: 948,
    other: 0,
    pct: 14,
    fg_source: "bale_register" as const,
    fg_by_product: { SACKING: { tonnes: 900, rate: 185000, value: 166500000 }, HESSIAN: { tonnes: 48, rate: null, value: null } },
  };
  it("labels the line with its source and lists the products", () => {
    expect(capitalFgLabel(capital, "x")).toBe("Finished goods stock (948.000 t, from bale register)");
    expect(capitalFgLabel({ ...capital, fg_source: "keyed" }, "x")).toBe("Finished goods stock (948.000 t, keyed FG_STOCK_T)");
    expect(capitalFgLabel({ ...capital, fg_t: null }, "fallback")).toBe("fallback");
    expect(fgDetail(capital)).toBe("sacking 900.000 t × ₹1,85,000/t · hessian 48.000 t (no realisation rate — not valued)");
    expect(fgDetail({ ...capital, fg_by_product: [{ product: "SACKING", tonnes: 10, rate: 100, value: 1000 }] })).toBe("sacking 10.000 t × ₹100/t");
    expect(fgDetail(null)).toBe("");
  });
});
