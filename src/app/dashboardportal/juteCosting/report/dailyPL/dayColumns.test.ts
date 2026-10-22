import { describe, expect, it } from "vitest";
import type { DailyPlDay } from "./_service";
import { dayCols, fmtLakh, fmtMoney, fmtParam, fmtRupee, fmtRupeeShort, fmtT, shortDate, visibleDayCols } from "./dayColumns";
import { cellText, phoneColumns, toGridColumns, type Col } from "./tableColumns";

/** The hand-calculated day of the backend tests (2026-07-12, power not keyed). */
const day: DailyPlDay = {
  date: "2026-07-12",
  weekday: "Sun",
  sacking_t: 10,
  hessian_t: 2,
  cloth_t: 12,
  yarn_t: 11.5,
  purchased_yarn_t: 0.5,
  yarn_surplus_t: 0,
  hands: 500,
  hours: 4000,
  spindle_hours: 2900,
  jute_issued_t: 6,
  jute_issue_value: 900000,
  jute_unvalued_t: 0,
  stores_value: 50000,
  dust_kg: 100,
  power_kwh: null,
  money: {
    realisation: 2240000,
    jute_cost: 900000,
    jute_waste_cost: 0,
    wages: 200000,
    power: null,
    stores: 50000,
    dust_credit: 100,
    contribution: 1090100,
    overheads: 24000,
    operating_profit: 1066100,
    capital_cost: null,
    net: null,
  },
  per_t_cloth: {
    realisation: 186666.67,
    jute_cost: 75000,
    jute_waste_cost: 0,
    wages: 16666.67,
    power: null,
    stores: 4166.67,
    dust_credit: 8.33,
    contribution: 90841.67,
    overheads: 2000,
    operating_profit: 88841.67,
    capital_cost: null,
    net: null,
  },
  per_t_yarn: { jute_cost: 78260.87, wages: 17391.3, contribution: 94791.3 },
  per_100_spindles: { contribution_per_100_spindle_hours: 37589.66, contribution_per_100_spindle_days: 902151.72 },
  flags: { power_excluded: true, realisation_partial: false, overheads_estimated: true },
};

function col(field: string): Col<DailyPlDay> {
  const c = dayCols.find((x) => x.field === field);
  if (!c) throw new Error(`no column ${field}`);
  return c;
}

describe("dayCols", () => {
  it("prints '—' for a null power money cell", () => {
    expect(cellText(col("money_power"), day)).toBe("—");
    expect(cellText(col("per_t_contribution"), { ...day, per_t_cloth: { ...day.per_t_cloth, contribution: null } })).toBe("—");
  });

  it("formats the decimals per column (0 dp money, 3 dp tonnes, 1 dp hands)", () => {
    expect(cellText(col("money_contribution"), day)).toBe("1090100");
    expect(cellText(col("per_t_contribution"), day)).toBe("90842");
    expect(cellText(col("per_100sh_contribution"), day)).toBe("37590");
    expect(cellText(col("cloth_t"), day)).toBe("12.000");
    expect(cellText(col("hands"), day)).toBe("500.0");
    expect(cellText(col("spindle_hours"), day)).toBe("2900");
  });

  it("prints the date as dd/mm and keeps the weekday off phones", () => {
    expect(cellText(col("date"), day)).toBe("12/07");
    expect(cellText(col("weekday"), day)).toBe("Sun");
    expect(col("weekday").phone).toBe(false);
  });

  it("hides every phone:false column on phones and keeps the essentials", () => {
    const phone = phoneColumns(dayCols).map((c) => c.field);
    dayCols
      .filter((c) => c.phone === false)
      .forEach((c) => expect(phone).not.toContain(c.field));
    expect(phone).toEqual(expect.arrayContaining(["date", "cloth_t", "money_contribution", "per_t_contribution", "money_power"]));
    expect(phone[0]).toBe("date"); // the sticky first column
  });

  it("carries the ITM-027 money and per-t columns and prints '—' until capital is available", () => {
    expect(cellText(col("money_overheads"), day)).toBe("24000");
    expect(cellText(col("money_operating_profit"), day)).toBe("1066100");
    expect(cellText(col("per_t_operating_profit"), day)).toBe("88842");
    expect(cellText(col("per_t_overheads"), day)).toBe("2000");
    expect(cellText(col("money_capital_cost"), day)).toBe("—");
    expect(cellText(col("money_net"), day)).toBe("—");
    expect(cellText(col("per_t_net"), day)).toBe("—");
    expect(dayCols.find((c) => c.field === "money_fixed")).toBeUndefined();
    // Order: operating profit sits right after contribution money, before the per-t block.
    const fields = dayCols.map((c) => c.field);
    expect(fields.indexOf("money_operating_profit")).toBeGreaterThan(fields.indexOf("money_contribution"));
    expect(fields.indexOf("money_net")).toBeLessThan(fields.indexOf("per_t_contribution"));
  });

  it("hides the jute-waste column while the range books no waste", () => {
    const none = visibleDayCols([day, { ...day, money: { ...day.money, jute_waste_cost: null } }]).map((c) => c.field);
    expect(none).not.toContain("money_jute_waste_cost");
    expect(none).toContain("money_jute_cost");
    const some = visibleDayCols([day, { ...day, money: { ...day.money, jute_waste_cost: 1200 } }]).map((c) => c.field);
    expect(some).toContain("money_jute_waste_cost");
    expect(some.indexOf("money_jute_waste_cost")).toBe(some.indexOf("money_jute_cost") + 1);
    expect(cellText(col("money_jute_waste_cost"), { ...day, money: { ...day.money, jute_waste_cost: 1200 } })).toBe("1200");
  });

  it("gives number columns type 'number' in the grid and a getter for nested values", () => {
    const grid = toGridColumns(dayCols);
    grid.forEach((g, i) => {
      if (dayCols[i].num) expect(g.type).toBe("number");
      else expect(g.type).toBeUndefined();
    });
    const contrib = grid.find((g) => g.field === "money_contribution");
    expect(contrib?.valueGetter).toBeDefined();
  });
});

describe("formatters", () => {
  it("fmtMoney groups en-IN and prints '—' for null", () => {
    expect(fmtMoney(1090100)).toBe("10,90,100");
    expect(fmtMoney(90841.67, 2)).toBe("90,841.67");
    expect(fmtMoney(null)).toBe("—");
  });

  it("fmtT keeps 3 dp", () => {
    expect(fmtT(12)).toBe("12.000");
    expect(fmtT(null)).toBe("—");
  });

  it("fmtParam shows small factors to 4 dp and money to 2 dp", () => {
    expect(fmtParam(1.12)).toBe("1.12");
    expect(fmtParam(0.0125)).toBe("0.0125");
    expect(fmtParam(182000)).toBe("1,82,000.00");
  });

  it("fmtLakh prints the statement money in lakh with 2 dp and a leading sign", () => {
    expect(fmtLakh(18335339.05)).toBe("₹ 183.35 L");
    expect(fmtLakh(1500)).toBe("₹ 0.02 L");
    expect(fmtLakh(-50000)).toBe("−₹ 0.50 L");
    expect(fmtLakh(123456789)).toBe("₹ 1,234.57 L");
    expect(fmtLakh(0)).toBe("₹ 0.00 L");
    expect(fmtLakh(null)).toBe("—");
  });

  it("fmtRupee prefixes ₹ with Indian grouping and prints '—' for null", () => {
    expect(fmtRupee(57935.59)).toBe("₹57,936");
    expect(fmtRupee(null)).toBe("—");
  });

  it("fmtRupee puts a negative sign in front of the rupee, never inside it", () => {
    expect(fmtRupee(-43)).toBe("−₹43");
    expect(fmtRupee(-57935.59)).toBe("−₹57,936");
    expect(fmtRupee(-1234567)).toBe("−₹12,34,567");
    expect(fmtRupee(-0.2)).toBe("₹0");
    expect(fmtRupee(0)).toBe("₹0");
  });

  it("fmtRupeeShort uses k / L / Cr", () => {
    expect(fmtRupeeShort(850)).toBe("850");
    expect(fmtRupeeShort(90842)).toBe("91 k");
    expect(fmtRupeeShort(177000)).toBe("1.77 L");
    expect(fmtRupeeShort(14160000)).toBe("1.42 Cr");
    expect(fmtRupeeShort(-90842)).toBe("-91 k");
  });

  it("shortDate is dd/mm", () => {
    expect(shortDate("2026-07-12")).toBe("12/07");
    expect(shortDate("bad")).toBe("bad");
  });
});
