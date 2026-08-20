import { describe, expect, it } from "vitest";
import type { WindingQualityGroupRow } from "@/utils/juteProductionReportService";
import { variesFromSpinning } from "./varianceTint";

const row = (v: Partial<WindingQualityGroupRow>): WindingQualityGroupRow =>
  ({
    item_grp_id: 1,
    item_grp_name: "G",
    wnd_winders_A: 0,
    wnd_winders_B: 0,
    wnd_winders_C: 0,
    wnd_winders_total: 0,
    wnd_prod_A: 0,
    wnd_prod_B: 0,
    wnd_prod_C: 0,
    wnd_prod_total: 0,
    spg_winding_qty: 0,
    spg_prod_A: 0,
    spg_prod_B: 0,
    spg_prod_C: 0,
    spg_prod_total: 0,
    variance_A: 0,
    variance_B: 0,
    variance_C: 0,
    variance_total: 0,
    ...v,
  }) as WindingQualityGroupRow;

describe("variesFromSpinning", () => {
  it("does not tint a matching group", () => {
    expect(variesFromSpinning(row({}))).toBe(false);
  });

  it("tints on any single shift, Shift A included (the legacy bug)", () => {
    expect(variesFromSpinning(row({ variance_A: 5 }))).toBe(true);
    expect(variesFromSpinning(row({ variance_B: -5 }))).toBe(true);
    expect(variesFromSpinning(row({ variance_C: 5 }))).toBe(true);
    expect(variesFromSpinning(row({ variance_total: -5 }))).toBe(true);
  });

  it("ignores floating-point dust below the epsilon", () => {
    expect(variesFromSpinning(row({ variance_A: 0.0000001 }))).toBe(false);
    expect(variesFromSpinning(row({ variance_total: 1e-12 }))).toBe(false);
  });
});
