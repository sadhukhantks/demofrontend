import { describe, expect, it } from "vitest";
import { gridCellText, materializeGridRows } from "@/components/reports/gridExportRows";
import type {
  MechPowerReport,
  MechPowerReportDay,
  MechPowerReportMeter,
  MechPowerReportTotals,
} from "@/utils/juteMechanicalService";
import {
  buildDayCols,
  ddmm,
  ddmmyy,
  meterField,
  rowToneOf,
  toGridRows,
  totalsRows,
} from "./powerReportColumns";
import { cellText, phoneColumns, toGridColumns } from "./tableColumns";

const meters: MechPowerReportMeter[] = [
  { meter_code: "MAIN", meter_name: "Main grid meter", meter_type: "GRID" },
  { meter_code: "DG1", meter_name: "DG set 1", meter_type: "DG" },
];

const keyedDay: MechPowerReportDay = {
  date: "2026-10-15",
  weekday: "Thu",
  keyed: true,
  kwh_total: 18900,
  kwh_grid: 18000,
  kwh_dg: 900,
  kwh_solar: 0,
  kwh_by_meter: { MAIN: 18000, DG1: 900 },
  dg_hours: 2.5,
  dg_litres: 310,
  max_demand_kva: 1200,
  yarn_t: 30,
  cloth_t: 29,
  kwh_per_t_yarn: 630,
  kwh_per_t_cloth: 651.72,
  dg_share_pct: 4.76,
};

const unkeyedDay: MechPowerReportDay = {
  date: "2026-10-16",
  weekday: "Fri",
  keyed: false,
  kwh_total: 0,
  kwh_grid: 0,
  kwh_dg: 0,
  kwh_solar: 0,
  kwh_by_meter: { MAIN: null, DG1: null },
  dg_hours: 0,
  dg_litres: 0,
  max_demand_kva: null,
  yarn_t: 29,
  cloth_t: 28,
  kwh_per_t_yarn: null,
  kwh_per_t_cloth: null,
  dg_share_pct: null,
};

describe("buildDayCols", () => {
  it("adds one m_<code> column per meter, hidden on phones, between Total kWh and DG kWh", () => {
    const cols = buildDayCols(meters);
    const fields = cols.map((c) => c.field);
    const total = fields.indexOf("kwh_total");
    expect(fields.slice(total, total + 4)).toEqual(["kwh_total", "m_MAIN", "m_DG1", "kwh_dg"]);
    const main = cols.find((c) => c.field === "m_MAIN");
    expect(main).toMatchObject({ header: "Main grid meter", short: "MAIN", num: true, decimals: 0, phone: false });
    expect(meterField("DG1")).toBe("m_DG1");
  });

  it("phone view keeps Date / kWh / DG h / Cloth t / kWh per t / DG % and drops the rest", () => {
    expect(phoneColumns(buildDayCols(meters)).map((c) => c.field)).toEqual([
      "date",
      "kwh_total",
      "dg_hours",
      "cloth_t",
      "kwh_per_t_cloth",
      "kwh_per_t_yarn",
      "dg_share_pct",
    ]);
  });

  it("works with no meters at all", () => {
    expect(buildDayCols([]).some((c) => c.field.startsWith("m_"))).toBe(false);
  });
});

describe("toGridRows", () => {
  it("flattens kwh_by_meter into m_<code> fields and keys the row by date", () => {
    const [row] = toGridRows([keyedDay]);
    expect(row.id).toBe("2026-10-15");
    expect(row.m_MAIN).toBe(18000);
    expect(row.m_DG1).toBe(900);
    expect(row.kwh_total).toBe(18900);
    expect(rowToneOf(row)).toBeUndefined();
  });

  it("marks an unkeyed day: kWh / DG figures null, meter cells null, tone watch, tonnes kept", () => {
    const [row] = toGridRows([unkeyedDay]);
    expect(row.keyed).toBe(false);
    expect(row.kwh_total).toBeNull();
    expect(row.kwh_dg).toBeNull();
    expect(row.dg_hours).toBeNull();
    expect(row.m_MAIN).toBeNull();
    expect(row.cloth_t).toBe(28);
    expect(rowToneOf(row)).toBe("watch");
  });
});

describe("cell text", () => {
  const cols = buildDayCols(meters);
  const rows = toGridRows([keyedDay, unkeyedDay]);
  const col = (field: string) => {
    const found = cols.find((c) => c.field === field);
    if (!found) throw new Error(`no column ${field}`);
    return found;
  };

  it("prints the date as dd/mm/yy and numbers with their decimals", () => {
    expect(cellText(col("date"), rows[0])).toBe("15/10/26");
    expect(cellText(col("kwh_total"), rows[0])).toBe("18900");
    expect(cellText(col("dg_hours"), rows[0])).toBe("2.5");
    expect(cellText(col("cloth_t"), rows[0])).toBe("29.000");
    expect(cellText(col("kwh_per_t_cloth"), rows[0])).toBe("652");
  });

  it("prints an em dash for null ratios and for an unkeyed day's kWh", () => {
    expect(cellText(col("kwh_per_t_cloth"), rows[1])).toBe("—");
    expect(cellText(col("kwh_total"), rows[1])).toBe("—");
    expect(cellText(col("m_MAIN"), rows[1])).toBe("—");
    expect(cellText(col("cloth_t"), rows[1])).toBe("28.000");
  });

  it("the grid formatter agrees with the phone table and the Excel export stays numeric / blank", () => {
    const grid = toGridColumns(cols);
    const kwh = grid.find((c) => c.field === "kwh_total");
    const ratio = grid.find((c) => c.field === "kwh_per_t_cloth");
    if (!kwh || !ratio) throw new Error("missing grid columns");
    expect(gridCellText(kwh, rows[0])).toBe("18900");
    expect(gridCellText(ratio, rows[1])).toBe("—");
    const out = materializeGridRows(grid, rows);
    expect(out.rows[0]).toMatchObject({ date: "15/10/26", kwh_total: 18900, m_MAIN: 18000 });
    expect(out.rows[1].kwh_total).toBeNull();
    expect(out.rows[1].kwh_per_t_cloth).toBeNull();
  });
});

describe("date helpers", () => {
  it("ddmmyy / ddmm", () => {
    expect(ddmmyy("2026-10-17")).toBe("17/10/26");
    expect(ddmm("2026-10-17")).toBe("17/10");
    expect(ddmmyy("")).toBe("");
    expect(ddmm(null)).toBe("");
  });
});

describe("totalsRows", () => {
  const totals: MechPowerReportTotals = {
    days: 14,
    days_keyed: 3,
    kwh_total: 57400,
    kwh_grid: 55300,
    kwh_dg: 2100,
    kwh_solar: 0,
    dg_hours: 5.5,
    dg_litres: 710,
    max_demand_kva: 1250,
    yarn_t: 91,
    cloth_t: 88,
    kwh_per_t_yarn: 630.77,
    kwh_per_t_cloth: 652.27,
    dg_share_pct: 3.66,
    avg_kwh_per_keyed_day: 19133.33,
  };
  const data: MechPowerReport = {
    meters,
    days: [keyedDay, unkeyedDay],
    totals,
    mtd: { ...totals, days: 17, days_keyed: 3 },
    std: {
      basis: "30-day median ending 2026-10-17",
      days_used: 3,
      kwh_total: 19250,
      kwh_per_t_cloth: 652.53,
      kwh_per_t_yarn: 630,
      dg_share_pct: 4.1,
    },
    meta: {
      co_id: 1,
      branch_id: 2,
      date_from: "2026-10-04",
      date_to: "2026-10-17",
      window_from: "2026-09-18",
      days_keyed: 3,
      notes: [],
    },
  };

  it("lists the eleven lines with std only where the API has a 30-day median", () => {
    const rows = totalsRows(data);
    expect(rows.map((r) => r.label)).toEqual([
      "Total kWh",
      "Grid kWh",
      "DG kWh",
      "Solar kWh",
      "DG hours",
      "DG litres",
      "Cloth t (keyed days)",
      "Yarn t (keyed days)",
      "kWh per t cloth",
      "kWh per t yarn",
      "DG share %",
    ]);
    expect(rows[0]).toMatchObject({ range: 57400, mtd: 57400, std: 19250, decimals: 0 });
    expect(rows[1].std).toBeNull();
    expect(rows[8]).toMatchObject({ range: 652.27, std: 652.53 });
    expect(rows[10]).toMatchObject({ range: 3.66, std: 4.1, decimals: 1 });
  });
});
