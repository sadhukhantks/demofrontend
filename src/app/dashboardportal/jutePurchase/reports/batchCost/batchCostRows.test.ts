import { describe, expect, it } from "vitest";
import type { BatchCostReportRow } from "../types/reportTypes";
import {
  batchCostBreakupRows,
  batchCostYarnSummary,
  costPerTon,
} from "./batchCostRows";

function row(p: Partial<BatchCostReportRow>): BatchCostReportRow {
  return {
    yarn_type_id: 1,
    yarn_type_name: "Hessian Warp",
    item_id: 10,
    item_name: "TD-4",
    item_grp_id: 5,
    item_group_name: "Jute",
    planned_weight: 0,
    actual_weight: 0,
    actual_rate: 0,
    issue_value: 0,
    variance: 0,
    mtd_planned_weight: 0,
    mtd_actual_weight: 0,
    mtd_actual_rate: 0,
    mtd_issue_value: 0,
    mtd_variance: 0,
    ...p,
  };
}

const rows: BatchCostReportRow[] = [
  // Hessian Warp: 600 kg @ 6000 + 400 kg @ 3000 on the day -> 9000 / 1 t
  row({ item_id: 11, item_name: "TD-5", actual_weight: 400, issue_value: 3000, actual_rate: 750, mtd_actual_weight: 4000, mtd_issue_value: 30000, planned_weight: 500, variance: -100 }),
  row({ item_id: 10, item_name: "TD-4", actual_weight: 600, issue_value: 6000, actual_rate: 1000, mtd_actual_weight: 6000, mtd_issue_value: 60000, planned_weight: 500, variance: 100 }),
  // Sacking Weft: nothing on the day, 2 t MTD for 10000
  row({ yarn_type_id: 2, yarn_type_name: "Sacking Weft", item_id: 12, item_name: "Bimli", mtd_actual_weight: 2000, mtd_issue_value: 10000 }),
];

describe("costPerTon", () => {
  it("is value per 1000 kg, 0 when nothing was issued", () => {
    expect(costPerTon(9000, 1000)).toBe(9000);
    expect(costPerTon(500, 0)).toBe(0);
  });
});

describe("batchCostYarnSummary", () => {
  it("gives one row per yarn quality by name plus a weighted Grand Total", () => {
    const s = batchCostYarnSummary(rows);
    expect(s.map((r) => r.yarn_type_name)).toEqual([
      "Hessian Warp",
      "Sacking Weft",
      "Grand Total",
    ]);
    expect(s[0]).toMatchObject({ day_weight: 1000, day_value: 9000, day_cost_per_ton: 9000, mtd_weight: 10000, mtd_value: 90000, mtd_cost_per_ton: 9000 });
    expect(s[1]).toMatchObject({ day_weight: 0, day_cost_per_ton: 0, mtd_cost_per_ton: 5000 });
    // (90000 + 10000) / 12 t — not the average of 9000 and 5000
    expect(s[2].mtd_cost_per_ton).toBeCloseTo(100000 / 12, 6);
  });

  it("ignores the breakup's subtotal rows", () => {
    expect(batchCostYarnSummary(batchCostBreakupRows(rows))).toEqual(
      batchCostYarnSummary(rows),
    );
  });

  it("is empty for no rows", () => {
    expect(batchCostYarnSummary([])).toEqual([]);
  });
});

describe("batchCostBreakupRows", () => {
  const b = batchCostBreakupRows(rows);

  it("orders lines under their yarn quality, each group closed by a Total", () => {
    expect(b.map((r) => `${r.yarn_type_name}/${r.item_name}`)).toEqual([
      "Hessian Warp/TD-4",
      "Hessian Warp/TD-5",
      "Hessian Warp/Total",
      "Sacking Weft/Bimli",
      "Sacking Weft/Total",
    ]);
  });

  it("splits the yarn quality's cost per ton by jute quality", () => {
    const [td4, td5, total] = b;
    expect(td4.day_mix_pct).toBeCloseTo(60);
    expect(td4.day_cost_per_ton_share).toBeCloseTo(6000);
    expect(td5.day_cost_per_ton_share).toBeCloseTo(3000);
    expect(td4.day_cost_per_ton_share + td5.day_cost_per_ton_share).toBeCloseTo(
      total.day_cost_per_ton_share,
    );
    expect(total).toMatchObject({
      row_kind: "subtotal",
      actual_weight: 1000,
      issue_value: 9000,
      planned_weight: 1000,
      variance: 0,
      day_mix_pct: 100,
      mtd_cost_per_ton_share: 9000,
    });
    // weight-averaged line rates: (1000*600 + 750*400) / 1000
    expect(total.actual_rate).toBeCloseTo(900);
    expect(total.mtd_actual_rate).toBeCloseTo(900);
  });

  it("reads 0 for day shares when the yarn quality issued nothing that day", () => {
    const [bimli, total] = b.slice(3);
    expect(bimli.day_mix_pct).toBe(0);
    expect(bimli.day_cost_per_ton_share).toBe(0);
    expect(total.day_mix_pct).toBe(0);
    expect(bimli.mtd_mix_pct).toBeCloseTo(100);
  });
});

describe("jute waste re-issued (owner ruling 2026-10-08: memo only)", () => {
  const withWaste: BatchCostReportRow[] = [
    ...rows,
    row({ item_id: 90, item_name: "THREAD WASTE", is_waste: 1, actual_weight: 250, mtd_actual_weight: 900, planned_weight: 300 }),
  ];

  it("leaves waste out of the yarn quality's weight, value and cost per ton", () => {
    const hw = batchCostYarnSummary(withWaste).find((r) => r.yarn_type_name === "Hessian Warp")!;
    expect(hw.day_weight).toBe(1000);
    expect(hw.day_cost_per_ton).toBe(9000);
    expect(hw.mtd_weight).toBe(10000);
    expect(hw.day_waste_weight).toBe(250);
    expect(hw.mtd_waste_weight).toBe(900);
  });

  it("keeps waste out of the Grand Total cost but sums its memo kg", () => {
    const g = batchCostYarnSummary(withWaste).at(-1)!;
    expect(g.day_weight).toBe(1000);
    expect(g.day_waste_weight).toBe(250);
  });

  it("lists waste as memo lines after the yarn quality's Total, not inside it", () => {
    const hw = batchCostBreakupRows(withWaste).filter((r) => r.yarn_type_id === 1);
    expect(hw.map((r) => r.row_kind)).toEqual(["line", "line", "subtotal", "waste"]);
    const total = hw[2];
    expect(total.actual_weight).toBe(1000);
    expect(total.planned_weight).toBe(1000);
    expect(hw[0].day_mix_pct + hw[1].day_mix_pct).toBeCloseTo(100);
    expect(hw[3].item_name).toBe("THREAD WASTE (waste re-issued, memo)");
    expect(hw[3].actual_weight).toBe(250);
    expect(hw[3].issue_value).toBe(0);
  });

  it("a yarn quality with only waste still gets a zero Total and its memo line", () => {
    const only = batchCostBreakupRows([
      row({ yarn_type_id: 3, yarn_type_name: "Weft", item_id: 90, item_name: "SWEEP", is_waste: 1, actual_weight: 40 }),
    ]);
    expect(only.map((r) => r.row_kind)).toEqual(["subtotal", "waste"]);
    expect(only[0].actual_weight).toBe(0);
  });
});
