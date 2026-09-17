import { describe, expect, it } from "vitest";
import type { FinishingStockRow } from "@/utils/finishingStockService";
import {
  footerTotals,
  groupRows,
  kgToMt,
  lineTotalKg,
  prefillWtKg,
  sectionTotals,
  todayISO,
  unitWtFor,
} from "./stockCalc";

/** Minimal row builder — only the fields the calculators read. */
function row(over: Partial<FinishingStockRow>): FinishingStockRow {
  return {
    finishing_stock_id: 1,
    co_id: 1,
    branch_id: 2,
    tran_date: "2026-09-16",
    bucket: "BALE",
    finishing_quality_id: 1,
    item_id: 100,
    item_code: null,
    item_name: "HESSIAN CLOTH 40-6.5",
    quality_type: 1,
    stage: null,
    stage_label: null,
    work_by: 0,
    owner_co_id: null,
    owner_co_name: "The Empire Jute Company Limited",
    qty: 0,
    qty_uom: "BALE",
    wt_per_unit_kg: null,
    wt_kg: null,
    total_kg: 0,
    remarks: null,
    ...over,
  };
}

describe("kgToMt", () => {
  it("prints the sheet's 16002 kg as 16.002 MT", () => {
    expect(kgToMt(16002)).toBe(16.002);
  });

  it("rounds to 3 decimals and never leaks float noise", () => {
    expect(kgToMt(1234.5678)).toBe(1.235);
    expect(kgToMt(100 + 200)).toBe(0.3);
  });

  it("treats non-numbers as zero", () => {
    expect(kgToMt(Number.NaN)).toBe(0);
  });
});

describe("lineTotalKg", () => {
  it("BALE = bales x per-bale kg", () => {
    expect(lineTotalKg(row({ bucket: "BALE", qty: 70, wt_per_unit_kg: 228.6 }))).toBe(16002);
  });

  it("LOOSE = the weighed kg, ignoring the count", () => {
    expect(
      lineTotalKg(row({ bucket: "LOOSE", qty: 130, qty_uom: "CUTS", wt_kg: 1885.5 })),
    ).toBe(1885.5);
  });

  it("is zero when the weight is missing", () => {
    expect(lineTotalKg(row({ bucket: "BALE", qty: 70, wt_per_unit_kg: null }))).toBe(0);
    expect(lineTotalKg(row({ bucket: "LOOSE", qty: 130, wt_kg: null }))).toBe(0);
  });
});

describe("unitWtFor", () => {
  const quality = { cut_wt_kg: 12.95, bag_wt_kg: 0.725, bundle_wt_kg: 14.5 };

  it("maps each counted UoM to its own standard", () => {
    expect(unitWtFor(quality, "CUTS")).toBe(12.95);
    expect(unitWtFor(quality, "BDL")).toBe(14.5);
    expect(unitWtFor(quality, "PCS")).toBe(0.725);
  });

  it("has no standard for an unknown UoM or a missing quality", () => {
    expect(unitWtFor(quality, "BALE")).toBeNull();
    expect(unitWtFor(quality, "")).toBeNull();
    expect(unitWtFor(null, "BDL")).toBeNull();
    expect(unitWtFor(undefined, "BDL")).toBeNull();
  });

  it("treats an unresolved standard (null / undefined / NaN) as none", () => {
    expect(unitWtFor({ cut_wt_kg: null, bag_wt_kg: null, bundle_wt_kg: null }, "CUTS")).toBeNull();
    // A backend that predates the addendum omits the fields entirely.
    expect(
      unitWtFor({ bag_wt_kg: 0.725 } as Parameters<typeof unitWtFor>[0], "BDL"),
    ).toBeNull();
    expect(
      unitWtFor({ cut_wt_kg: Number.NaN, bag_wt_kg: null, bundle_wt_kg: null }, "CUTS"),
    ).toBeNull();
  });
});

describe("prefillWtKg", () => {
  it("multiplies the count by the standard unit weight", () => {
    expect(prefillWtKg(130, 14.5)).toBe("1885");
    expect(prefillWtKg("130", 14.5)).toBe("1885");
    expect(prefillWtKg(712, 14.5)).toBe("10324");
  });

  it("rounds to the printed 3 decimals", () => {
    expect(prefillWtKg(3, 0.7255)).toBe("2.177");
  });

  it("prefills zero for a zero count", () => {
    expect(prefillWtKg(0, 14.5)).toBe("0");
    expect(prefillWtKg("0", 14.5)).toBe("0");
  });

  it("prefills nothing without a standard", () => {
    expect(prefillWtKg(130, null)).toBe("");
  });

  it("prefills nothing for an unusable count", () => {
    expect(prefillWtKg(Number.NaN, 14.5)).toBe("");
    expect(prefillWtKg("abc", 14.5)).toBe("");
    expect(prefillWtKg("", 14.5)).toBe("");
    expect(prefillWtKg(-5, 14.5)).toBe("");
  });
});

describe("groupRows", () => {
  const own = row({ finishing_stock_id: 1, qty: 70, wt_per_unit_kg: 228.6 });
  const ownSacking = row({
    finishing_stock_id: 2,
    quality_type: 2,
    qty: 4,
    wt_per_unit_kg: 290,
  });
  const foreign = row({
    finishing_stock_id: 3,
    owner_co_id: 9,
    owner_co_name: "NEXGEN JUTE",
    qty: 10,
    wt_per_unit_kg: 200,
  });
  const looseHessian = row({
    finishing_stock_id: 4,
    bucket: "LOOSE",
    qty_uom: "CUTS",
    qty: 19,
    wt_kg: 246,
  });
  const looseSacking = row({
    finishing_stock_id: 5,
    bucket: "LOOSE",
    quality_type: 2,
    qty_uom: "CUTS",
    qty: 130,
    wt_kg: 1885,
  });
  const grouped = groupRows([own, ownSacking, foreign, looseHessian, looseSacking]);

  it("splits bale lines into own (owner_co_id null) and one bucket per foreign owner", () => {
    expect(grouped.bale.own.map((r) => r.finishing_stock_id)).toEqual([1, 2]);
    expect(Object.keys(grouped.bale.others)).toEqual(["NEXGEN JUTE"]);
    expect(grouped.bale.others["NEXGEN JUTE"].map((r) => r.finishing_stock_id)).toEqual([3]);
  });

  it("splits loose lines by quality_type", () => {
    expect(grouped.loose.hessian.map((r) => r.finishing_stock_id)).toEqual([4]);
    expect(grouped.loose.sacking.map((r) => r.finishing_stock_id)).toEqual([5]);
  });

  it("returns empty groups for an empty day", () => {
    const empty = groupRows([]);
    expect(empty.bale.own).toEqual([]);
    expect(empty.bale.others).toEqual({});
    expect(empty.loose.hessian).toEqual([]);
    expect(empty.loose.sacking).toEqual([]);
  });
});

describe("sectionTotals", () => {
  it("counts bales only for BALE lines and sums kg/MT across the section", () => {
    const totals = sectionTotals([
      row({ qty: 70, wt_per_unit_kg: 228.6 }),
      row({ finishing_stock_id: 2, qty: 4, wt_per_unit_kg: 290 }),
    ]);
    expect(totals.bales).toBe(74);
    expect(totals.kg).toBe(17162);
    expect(totals.mt).toBe(17.162);
  });

  it("reports zero bales for a loose section", () => {
    const totals = sectionTotals([
      row({ bucket: "LOOSE", qty: 19, qty_uom: "CUTS", wt_kg: 246 }),
    ]);
    expect(totals.bales).toBe(0);
    expect(totals.mt).toBe(0.246);
  });
});

describe("footerTotals", () => {
  it("splits bale MT by ownership and sums the day", () => {
    const totals = footerTotals([
      row({ finishing_stock_id: 1, qty: 70, wt_per_unit_kg: 228.6 }),
      row({ finishing_stock_id: 2, owner_co_id: 9, qty: 10, wt_per_unit_kg: 200 }),
      row({ finishing_stock_id: 3, bucket: "LOOSE", qty_uom: "CUTS", qty: 19, wt_kg: 246 }),
    ]);
    expect(totals.baleOwnMt).toBe(16.002);
    expect(totals.baleOthersMt).toBe(2);
    expect(totals.looseMt).toBe(0.246);
    expect(totals.totalMt).toBe(18.248);
  });

  it("is all zeros for an empty day", () => {
    expect(footerTotals([])).toEqual({
      baleOwnMt: 0,
      baleOthersMt: 0,
      looseMt: 0,
      totalMt: 0,
    });
  });
});

describe("todayISO", () => {
  it("returns the LOCAL calendar date, not the UTC one", () => {
    const d = new Date();
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
    expect(todayISO()).toBe(expected);
  });
});
