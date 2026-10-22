"use client";

/**
 * One measure over the days (kWh per t cloth, kWh per t yarn or total kWh),
 * the actual as a solid line with markers and the 30-day median ("std") as a
 * dashed ink-grey line on the same axis — no achievement %, no dual axis.
 * Unkeyed days leave a gap (null, not zero). The measure is picked with the
 * three chips above the chart.
 */

import React from "react";
import { Box, Chip, Typography } from "@mui/material";
import { LineChart } from "@mui/x-charts/LineChart";
import type { MechPowerReportDay, MechPowerReportStd } from "@/utils/juteMechanicalService";
import {
  GRID_COLOR,
  SERIES_COLORS,
  STD_COLOR,
} from "@/app/dashboardportal/juteProduction/report/spinningProductionTrend/chartPalette";

/** The one actual line: slot 1 of the shared categorical palette. */
const ACTUAL_COLOR = SERIES_COLORS[0];
import { ddmm, ddmmyy, MEASURE_DECIMALS, MEASURE_LABEL, MEASURES, type PowerMeasure } from "../powerReportColumns";

const tickStyle = { fontSize: 11 } as const;

const chartSx = {
  "& .MuiChartsGrid-line": { stroke: GRID_COLOR, strokeDasharray: "none" },
  "& .MuiChartsAxis-line": { stroke: GRID_COLOR },
  "& .MuiChartsAxis-tick": { stroke: GRID_COLOR },
  "& .MuiLineElement-root": { strokeWidth: 2 },
  "& .MuiLineElement-series-std": { strokeDasharray: "6 4" },
} as const;

const legendBottom = {
  legend: {
    direction: "horizontal" as const,
    position: { vertical: "bottom" as const, horizontal: "center" as const },
  },
};

function fmtValue(value: number | null | undefined, decimals: number): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function dateTick(value: string, ctx: { location: string }): string {
  return ctx.location === "tick" ? ddmm(value) : ddmmyy(value);
}

export interface PowerTrendChartProps {
  days: ReadonlyArray<MechPowerReportDay>;
  std: MechPowerReportStd;
  measure: PowerMeasure;
  onMeasure: (measure: PowerMeasure) => void;
  isPhone: boolean;
}

export default function PowerTrendChart({ days, std, measure, onMeasure, isPhone }: PowerTrendChartProps) {
  const decimals = MEASURE_DECIMALS[measure];
  const label = MEASURE_LABEL[measure];
  const dates = React.useMemo(() => days.map((d) => d.date), [days]);
  // An unkeyed day has no reading — a gap, not a zero on the line.
  const actual = React.useMemo(
    () => days.map((d) => (d.keyed ? d[measure] : null)),
    [days, measure],
  );
  const stdValue = std[measure];
  const stdLine = React.useMemo(() => days.map(() => stdValue), [days, stdValue]);
  const hasStd = stdValue != null;

  return (
    <Box>
      <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", alignItems: "center", mb: 0.5 }}>
        {MEASURES.map((m) => (
          <Chip
            key={m}
            label={MEASURE_LABEL[m]}
            size="small"
            color={m === measure ? "primary" : "default"}
            variant={m === measure ? "filled" : "outlined"}
            onClick={() => onMeasure(m)}
          />
        ))}
        <Typography variant="caption" color="text.secondary" sx={{ ml: { sm: "auto" } }}>
          {hasStd ? `std ${fmtValue(stdValue, decimals)} — ${std.basis}` : "no 30-day median yet (no keyed days in the window)"}
        </Typography>
      </Box>
      <LineChart
        height={isPhone ? 230 : 300}
        xAxis={[
          {
            scaleType: "point",
            data: dates,
            valueFormatter: dateTick,
            tickLabelStyle: tickStyle,
            tickLabelMinGap: 8,
          },
        ]}
        yAxis={[
          {
            min: 0,
            width: 48,
            tickLabelStyle: tickStyle,
            valueFormatter: (v: number) => fmtValue(v, 0),
          },
        ]}
        series={[
          {
            id: "actual",
            label,
            color: ACTUAL_COLOR,
            data: actual,
            curve: "linear" as const,
            showMark: true,
            connectNulls: false,
            valueFormatter: (v: number | null) => fmtValue(v, decimals),
          },
          {
            id: "std",
            label: "30-day median (std)",
            color: STD_COLOR,
            data: hasStd ? stdLine : days.map(() => null),
            curve: "linear" as const,
            showMark: false,
            connectNulls: false,
            valueFormatter: (v: number | null) => fmtValue(v, decimals),
          },
        ]}
        grid={{ horizontal: true }}
        margin={{ left: 4, right: 12, top: 20, bottom: 4 }}
        slotProps={legendBottom}
        sx={chartSx}
      />
    </Box>
  );
}
