import { describe, expect, it } from "vitest";
import {
  DEFAULT_TOLERANCE_LORRY_FRACTION,
  jutePOSettleRuleInputSchema,
  jutePOSettleRuleSaveResultSchema,
  jutePOSettleRuleSchema,
} from "./jutePOService";

describe("jutePOSettleRuleSchema (rev 2 contract, rev 1 tolerated)", () => {
  it("reads tolerance_lorry_fraction and normalises the flag", () => {
    const r = jutePOSettleRuleSchema.parse({
      lorry_rule_enabled: 1,
      tolerance_lorry_fraction: "0.25",
      stale_days: "45",
      is_default: false,
    });
    expect(r).toEqual({
      lorry_rule_enabled: true,
      tolerance_lorry_fraction: 0.25,
      stale_days: 45,
      is_default: false,
      legacy_pct_contract: false,
    });
  });

  it("falls back to the default fraction on an old percentage-only payload and flags it", () => {
    const r = jutePOSettleRuleSchema.parse({ lorry_rule_enabled: true, weight_tolerance_pct: 5, stale_days: 30 });
    expect(r.tolerance_lorry_fraction).toBe(DEFAULT_TOLERANCE_LORRY_FRACTION);
    expect(r.legacy_pct_contract).toBe(true);
    expect(r.is_default).toBe(false);
  });
});

describe("jutePOSettleRuleSaveResultSchema", () => {
  it("reads the flat rev-2 shape with counts", () => {
    const r = jutePOSettleRuleSaveResultSchema.parse({
      lorry_rule_enabled: false,
      tolerance_lorry_fraction: 0.5,
      stale_days: 30,
      is_default: false,
      counts: { closed: 3, reopened: 1, unchanged: 40 },
    });
    expect(r.lorry_rule_enabled).toBe(false);
    expect(r.counts).toEqual({ closed: 3, reopened: 1, unchanged: 40 });
  });

  it("tolerates the rev-1 `recompute` key and a missing counts object", () => {
    const withRecompute = jutePOSettleRuleSaveResultSchema.parse({
      lorry_rule_enabled: true,
      tolerance_lorry_fraction: 0.5,
      stale_days: 30,
      recompute: { closed: 2, reopened: 0 },
    });
    expect(withRecompute.counts).toEqual({ closed: 2, reopened: 0, unchanged: 0 });
    const none = jutePOSettleRuleSaveResultSchema.parse({ lorry_rule_enabled: true, tolerance_lorry_fraction: 0.5, stale_days: 30 });
    expect(none.counts).toEqual({ closed: 0, reopened: 0, unchanged: 0 });
  });
});

describe("jutePOSettleRuleInputSchema", () => {
  it("bounds the fraction to 0–1 and stale days to 1–365 whole days", () => {
    expect(jutePOSettleRuleInputSchema.safeParse({ lorry_rule_enabled: true, tolerance_lorry_fraction: 0.5, stale_days: 30 }).success).toBe(true);
    expect(jutePOSettleRuleInputSchema.safeParse({ lorry_rule_enabled: true, tolerance_lorry_fraction: 1, stale_days: 365 }).success).toBe(true);
    expect(jutePOSettleRuleInputSchema.safeParse({ lorry_rule_enabled: true, tolerance_lorry_fraction: 1.05, stale_days: 30 }).success).toBe(false);
    expect(jutePOSettleRuleInputSchema.safeParse({ lorry_rule_enabled: true, tolerance_lorry_fraction: -0.1, stale_days: 30 }).success).toBe(false);
    expect(jutePOSettleRuleInputSchema.safeParse({ lorry_rule_enabled: true, tolerance_lorry_fraction: 0.5, stale_days: 0 }).success).toBe(false);
    expect(jutePOSettleRuleInputSchema.safeParse({ lorry_rule_enabled: true, tolerance_lorry_fraction: 0.5, stale_days: 2.5 }).success).toBe(false);
    expect(jutePOSettleRuleInputSchema.safeParse({ lorry_rule_enabled: true, tolerance_lorry_fraction: Number.NaN, stale_days: 30 }).success).toBe(false);
  });
});
