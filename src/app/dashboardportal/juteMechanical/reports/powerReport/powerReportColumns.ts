/**
 * Pure column / row helpers for the Power & DG report (ITM-004): the day-wise
 * table's column set (one extra column per meter), the grid rows flattened
 * from the API's `kwh_by_meter`, the totals rows shared by the on-screen
 * table and the print-out, and the chart measures. No React, no MUI — unit
 * tested beside it.
 */

import type {
  MechPowerReport,
  MechPowerReportDay,
  MechPowerReportMeter,
} from "@/utils/juteMechanicalService";
import type { Col } from "./tableColumns";

/** What the trend chart can plot — one measure at a time, never a dual axis. */
export type PowerMeasure = "kwh_per_t_cloth" | "kwh_per_t_yarn" | "kwh_total";

export const MEASURES: ReadonlyArray<PowerMeasure> = Object.freeze([
  "kwh_per_t_cloth",
  "kwh_per_t_yarn",
  "kwh_total",
]);

export const MEASURE_LABEL: Record<PowerMeasure, string> = {
  kwh_per_t_cloth: "kWh per t cloth",
  kwh_per_t_yarn: "kWh per t yarn",
  kwh_total: "Total kWh",
};

/** Decimals each measure prints with (kWh/t and kWh are whole numbers). */
export const MEASURE_DECIMALS: Record<PowerMeasure, number> = {
  kwh_per_t_cloth: 0,
  kwh_per_t_yarn: 0,
  kwh_total: 0,
};

/** kWh / DG fields the API sends as 0.0 on an UNKEYED day; the grid shows them as null ("—"). */
type ZeroWhenUnkeyed = "kwh_total" | "kwh_grid" | "kwh_dg" | "kwh_solar" | "dg_hours" | "dg_litres";

/**
 * One day-wise grid row: the API day with `id`, the kWh fields nullable
 * (null on an unkeyed day) and one `m_<meter_code>` column per meter.
 */
export type PowerDayGridRow = Omit<MechPowerReportDay, ZeroWhenUnkeyed> & {
  id: string;
  kwh_total: number | null;
  kwh_grid: number | null;
  kwh_dg: number | null;
  kwh_solar: number | null;
  dg_hours: number | null;
  dg_litres: number | null;
  [meterField: `m_${string}`]: number | null;
};

/** The grid field that carries one meter's kWh. */
export function meterField(meterCode: string): `m_${string}` {
  return `m_${meterCode}`;
}

/** "17/10/26" from "2026-10-17"; anything shorter is echoed. */
export function ddmmyy(iso: string | null | undefined): string {
  if (!iso || iso.length < 10) return iso ?? "";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
}

/** "17/10" from "2026-10-17" — the chart's tick label. */
export function ddmm(iso: string | null | undefined): string {
  if (!iso || iso.length < 10) return iso ?? "";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/**
 * The day-wise columns. Meter columns (one per entry of `meters`, header =
 * meter name, phone header = meter code) sit between Total kWh and DG kWh and
 * are hidden on phones along with yarn t, DG litres and Max kVA; the phone
 * keeps Date / kWh / DG h / Cloth t / kWh per t / DG %.
 */
export function buildDayCols(meters: ReadonlyArray<MechPowerReportMeter>): Col<PowerDayGridRow>[] {
  const meterCols: Col<PowerDayGridRow>[] = meters.map((m) => ({
    field: meterField(m.meter_code),
    header: m.meter_name,
    short: m.meter_code,
    description: `${m.meter_code} (${m.meter_type}) kWh`,
    num: true,
    decimals: 0,
    width: 120,
    phone: false,
  }));
  return [
    { field: "date", header: "Date", short: "Dt", width: 110, value: (r) => ddmmyy(r.date) },
    { field: "weekday", header: "Day", width: 60, phone: false },
    { field: "kwh_total", header: "Total kWh", short: "kWh", num: true, decimals: 0, width: 110 },
    ...meterCols,
    { field: "kwh_dg", header: "DG kWh", num: true, decimals: 0, width: 100, phone: false },
    { field: "dg_hours", header: "DG hrs", short: "DG h", num: true, decimals: 1, width: 90 },
    { field: "dg_litres", header: "DG litres", short: "DG l", num: true, decimals: 0, width: 100, phone: false },
    { field: "max_demand_kva", header: "Max kVA", num: true, decimals: 0, width: 100, phone: false },
    { field: "cloth_t", header: "Cloth t", num: true, decimals: 3, width: 100 },
    { field: "yarn_t", header: "Yarn t", num: true, decimals: 3, width: 100, phone: false },
    { field: "kwh_per_t_cloth", header: "kWh / t cloth", short: "kWh/t cl", num: true, decimals: 0, width: 120 },
    { field: "kwh_per_t_yarn", header: "kWh / t yarn", short: "kWh/t yn", num: true, decimals: 0, width: 120 },
    { field: "dg_share_pct", header: "DG share %", short: "DG %", num: true, decimals: 1, width: 100 },
  ];
}

/**
 * API days -> grid rows. `kwh_by_meter` is flattened into `m_<code>` fields;
 * on an UNKEYED day the kWh / DG figures become null (the API sends 0.0) so
 * the table prints "—" rather than a zero that looks like a reading.
 */
export function toGridRows(days: ReadonlyArray<MechPowerReportDay>): PowerDayGridRow[] {
  return days.map((d) => {
    const row: PowerDayGridRow = {
      ...d,
      id: d.date,
      kwh_total: d.keyed ? d.kwh_total : null,
      kwh_grid: d.keyed ? d.kwh_grid : null,
      kwh_dg: d.keyed ? d.kwh_dg : null,
      kwh_solar: d.keyed ? d.kwh_solar : null,
      dg_hours: d.keyed ? d.dg_hours : null,
      dg_litres: d.keyed ? d.dg_litres : null,
    };
    for (const [code, kwh] of Object.entries(d.kwh_by_meter ?? {})) {
      row[meterField(code)] = d.keyed ? (kwh ?? null) : null;
    }
    return row;
  });
}

/** Row tint: an unkeyed day is flagged "watch" (and says so through its "—" cells). */
export function rowToneOf(row: PowerDayGridRow): "watch" | undefined {
  return row.keyed ? undefined : "watch";
}

/** One line of the Range | MTD | Std totals table (and its print twin). */
export interface TotalsRow {
  label: string;
  range: number | null;
  mtd: number | null;
  /** 30-day median; null for the measures that have no std (only four do). */
  std: number | null;
  decimals: number;
}

/**
 * The totals lines in display order. Std is filled only where the API gives
 * a 30-day median (total kWh, the two kWh/t ratios and DG share); everything
 * else prints "—" in that column.
 */
export function totalsRows(data: MechPowerReport): TotalsRow[] {
  const { totals, mtd, std } = data;
  return [
    { label: "Total kWh", range: totals.kwh_total, mtd: mtd.kwh_total, std: std.kwh_total, decimals: 0 },
    { label: "Grid kWh", range: totals.kwh_grid, mtd: mtd.kwh_grid, std: null, decimals: 0 },
    { label: "DG kWh", range: totals.kwh_dg, mtd: mtd.kwh_dg, std: null, decimals: 0 },
    { label: "Solar kWh", range: totals.kwh_solar, mtd: mtd.kwh_solar, std: null, decimals: 0 },
    { label: "DG hours", range: totals.dg_hours, mtd: mtd.dg_hours, std: null, decimals: 1 },
    { label: "DG litres", range: totals.dg_litres, mtd: mtd.dg_litres, std: null, decimals: 0 },
    { label: "Cloth t (keyed days)", range: totals.cloth_t, mtd: mtd.cloth_t, std: null, decimals: 3 },
    { label: "Yarn t (keyed days)", range: totals.yarn_t, mtd: mtd.yarn_t, std: null, decimals: 3 },
    { label: "kWh per t cloth", range: totals.kwh_per_t_cloth, mtd: mtd.kwh_per_t_cloth, std: std.kwh_per_t_cloth, decimals: 0 },
    { label: "kWh per t yarn", range: totals.kwh_per_t_yarn, mtd: mtd.kwh_per_t_yarn, std: std.kwh_per_t_yarn, decimals: 0 },
    { label: "DG share %", range: totals.dg_share_pct, mtd: mtd.dg_share_pct, std: std.dg_share_pct, decimals: 1 },
  ];
}
