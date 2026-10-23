"use client";

/**
 * The range at a glance: total kWh, the two kWh-per-tonne ratios beside their
 * 30-day median ("std", in words — never an achievement %), DG hours and
 * share, and the month to date. Values stay in text ink; the captions carry
 * the context. Tiles are sized so a phone shows two per row.
 */

import React from "react";
import { Box } from "@mui/material";
import type { MechPowerReport } from "@/utils/juteMechanicalService";
import { fmt, KpiCard } from "@/app/dashboardportal/juteProduction/report/dailyProductionReport/_components/DprPieces";

function stdText(value: number | null, decimals: number, unit = ""): string {
  return value == null ? "no 30-day median yet" : `std ${fmt(value, decimals)}${unit} (30-day median)`;
}

export default function PowerKpiStrip({ data }: { data: MechPowerReport }) {
  const { totals, mtd, std } = data;
  const nothingKeyed = totals.days_keyed === 0;

  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
      <KpiCard
        label="Total kWh"
        value={nothingKeyed ? "—" : fmt(totals.kwh_total, 0)}
        sub={`${totals.days_keyed} of ${totals.days} days keyed`}
        state={nothingKeyed ? "warn" : undefined}
      />
      <KpiCard
        label="kWh per t cloth"
        value={fmt(totals.kwh_per_t_cloth, 0)}
        sub={stdText(std.kwh_per_t_cloth, 0)}
      />
      <KpiCard
        label="kWh per t yarn"
        value={fmt(totals.kwh_per_t_yarn, 0)}
        sub={stdText(std.kwh_per_t_yarn, 0)}
      />
      <KpiCard
        label="DG hours"
        value={nothingKeyed ? "—" : fmt(totals.dg_hours, 1)}
        sub={nothingKeyed ? "no readings in range" : `${fmt(totals.dg_litres, 0)} litres`}
      />
      <KpiCard
        label="DG share"
        value={totals.dg_share_pct == null ? "—" : `${fmt(totals.dg_share_pct, 1)} %`}
        sub={stdText(std.dg_share_pct, 1, " %")}
      />
      <KpiCard
        label="MTD kWh"
        value={mtd.days_keyed === 0 ? "—" : fmt(mtd.kwh_total, 0)}
        sub={
          mtd.days_keyed === 0
            ? "nothing keyed this month"
            : `${mtd.days_keyed} days · ${fmt(mtd.kwh_per_t_cloth, 0)} kWh/t cloth`
        }
      />
    </Box>
  );
}
