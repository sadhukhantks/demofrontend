"use client";

/**
 * The chart forms of the Spinning Production Trend page, on MUI X Charts.
 * Each is one measure on one y-axis (never a dual axis), with a legend
 * whenever there is more than one series, an axis-wide tooltip that lists
 * every series at the hovered day, hairline grid, thin rounded bars and 2px
 * lines. The standard is drawn dashed and the target dotted, both in ink
 * greys, so the solid coloured actual is what the eye lands on. Colours come
 * in with the series — the charts never choose.
 */

import React from "react";
import { BarChart, BarPlot } from "@mui/x-charts/BarChart";
import { LineChart, LinePlot, MarkPlot } from "@mui/x-charts/LineChart";
import { ChartsReferenceLine } from "@mui/x-charts/ChartsReferenceLine";
import { ChartsDataProvider } from "@mui/x-charts/ChartsDataProvider";
import { ChartsWrapper } from "@mui/x-charts/ChartsWrapper";
import { ChartsSurface } from "@mui/x-charts/ChartsSurface";
import { ChartsLegend } from "@mui/x-charts/ChartsLegend";
import { ChartsTooltip } from "@mui/x-charts/ChartsTooltip";
import { ChartsXAxis } from "@mui/x-charts/ChartsXAxis";
import { ChartsYAxis } from "@mui/x-charts/ChartsYAxis";
import { ChartsGrid } from "@mui/x-charts/ChartsGrid";
import { ChartsAxisHighlight } from "@mui/x-charts/ChartsAxisHighlight";
import { ScatterChart } from "@mui/x-charts/ScatterChart";
import { GRID_COLOR, REFERENCE_COLOR, SERIES_COLORS, SHIFT_LABEL, SHIFT_ORDER, STD_COLOR } from "../chartPalette";
import {
  fmtAxisKg,
  fmtKg,
  longDate,
  shortDate,
  type LineSeries,
  type StackedChart,
} from "../trendRows";
import type { BridgeStep, FrameShiftPoint } from "../_service";

/** Recessive chrome: solid hairline grid and axes one step off the surface,
 * a 1px surface-colour stroke on bars so stacked segments read as separate
 * by the gap rather than by a border. */
const chartSx = {
  "& .MuiChartsGrid-line": { stroke: GRID_COLOR, strokeDasharray: "none" },
  "& .MuiChartsAxis-line": { stroke: GRID_COLOR },
  "& .MuiChartsAxis-tick": { stroke: GRID_COLOR },
  "& .MuiBarElement-root": { stroke: "#ffffff", strokeWidth: 1 },
  "& .MuiLineElement-root": { strokeWidth: 2 },
} as const;

const legendBottom = {
  legend: {
    direction: "horizontal" as const,
    position: { vertical: "bottom" as const, horizontal: "center" as const },
  },
};

const tickStyle = { fontSize: 11 } as const;

const refLineStyle = { stroke: REFERENCE_COLOR, strokeDasharray: "4 4", strokeWidth: 1 } as const;
const refLabelStyle = { fontSize: 11, fill: REFERENCE_COLOR } as const;

function dateTick(value: string, ctx: { location: string }): string {
  return ctx.location === "tick" ? shortDate(value) : longDate(value);
}

/** Dash pattern per line series, keyed by the series' element class. */
function dashSx(series: LineSeries[]): Record<string, { strokeDasharray: string }> {
  const out: Record<string, { strokeDasharray: string }> = {};
  series.forEach((s) => {
    if (s.dash === "dash") out[`& .MuiLineElement-series-${s.key}`] = { strokeDasharray: "6 4" };
    if (s.dash === "dot") out[`& .MuiLineElement-series-${s.key}`] = { strokeDasharray: "2 4" };
  });
  return out;
}

const kgFormatter = (unit: string, decimals: number) => (v: number | null) =>
  v == null ? "" : `${fmtKg(v, decimals)}${unit ? ` ${unit}` : ""}`;

export interface StackedBarsChartProps {
  chart: StackedChart;
  height: number;
  unit?: string;
  /** Lines drawn over the stack on the same axis — the standard and the
   * target for the day's production. */
  lines?: LineSeries[];
}

/** Production by day, stacked (by quality or by shift), with the standard /
 * target as lines on the same kg axis. Built from the composition pieces so
 * bars and lines share one axis and one tooltip. */
export function StackedBarsChart({ chart, height, unit = "kg", lines = [] }: StackedBarsChartProps) {
  const fmt = kgFormatter(unit, 0);
  return (
    <ChartsDataProvider
      height={height}
      margin={{ left: 4, right: 8, top: 8, bottom: 4 }}
      xAxis={[
        {
          id: "x",
          scaleType: "band",
          data: chart.dates,
          valueFormatter: dateTick,
          categoryGapRatio: 0.45,
          tickLabelStyle: tickStyle,
          tickLabelMinGap: 8,
        },
      ]}
      yAxis={[{ id: "y", valueFormatter: (v: number) => fmtAxisKg(v), width: 48, tickLabelStyle: tickStyle }]}
      series={[
        ...chart.series.map((s) => ({
          type: "bar" as const,
          id: s.key,
          label: s.label,
          color: s.color,
          data: s.data,
          stack: "total",
          valueFormatter: (v: number | null) => (v == null || v === 0 ? "" : fmt(v)),
        })),
        ...lines.map((s) => ({
          type: "line" as const,
          id: s.key,
          label: s.label,
          color: s.color,
          data: s.data,
          curve: "linear" as const,
          showMark: false,
          connectNulls: false,
          valueFormatter: fmt,
        })),
      ]}
    >
      <ChartsWrapper
        legendPosition={{ vertical: "bottom", horizontal: "center" }}
        legendDirection="horizontal"
      >
        <ChartsLegend />
        <ChartsSurface sx={{ ...chartSx, ...dashSx(lines) }}>
          <ChartsGrid horizontal />
          <BarPlot borderRadius={4} />
          <LinePlot />
          <MarkPlot />
          <ChartsAxisHighlight x="band" />
          <ChartsXAxis axisId="x" />
          <ChartsYAxis axisId="y" />
        </ChartsSurface>
        <ChartsTooltip trigger="axis" />
      </ChartsWrapper>
    </ChartsDataProvider>
  );
}

export interface TrendLineChartProps {
  dates: string[];
  series: LineSeries[];
  height: number;
  /** Horizontal reference (period average, 100 % line ...). */
  reference?: { value: number; label: string } | null;
  /** Suffix in the tooltip value, e.g. "kg" or "%". */
  unit?: string;
  decimals?: number;
  /** Pin the axis to start at 0; kg-per-frame lines float so the
   * day-to-day movement is readable. */
  fromZero?: boolean;
  /** Draw markers on every point — on by default; off for dense multi-line. */
  marks?: boolean;
}

/** One or more lines over the days with an optional reference line. */
export function TrendLineChart({
  dates,
  series,
  height,
  reference,
  unit = "",
  decimals = 1,
  fromZero = false,
  marks = true,
}: TrendLineChartProps) {
  return (
    <LineChart
      height={height}
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
          width: 48,
          tickLabelStyle: tickStyle,
          valueFormatter: (v: number) => fmtAxisKg(v),
          ...(fromZero ? { min: 0 } : {}),
        },
      ]}
      series={series.map((s) => ({
        id: s.key,
        label: s.label,
        color: s.color,
        data: s.data,
        curve: "linear" as const,
        // Markers only on the actual — the standard / target are context.
        showMark: marks && !s.dash,
        connectNulls: false,
        valueFormatter: kgFormatter(unit, decimals),
      }))}
      grid={{ horizontal: true }}
      margin={{ left: 4, right: 12, top: 8, bottom: 4 }}
      hideLegend={series.length < 2}
      slotProps={legendBottom}
      sx={{ ...chartSx, ...dashSx(series) }}
    >
      {reference ? (
        <ChartsReferenceLine
          y={reference.value}
          label={reference.label}
          labelAlign="end"
          lineStyle={refLineStyle}
          labelStyle={refLabelStyle}
        />
      ) : null}
    </LineChart>
  );
}

export interface RankedBarsChartProps {
  items: { label: string; value: number }[];
  /** Reference drawn as a vertical line (e.g. the fleet average). */
  average?: number | null;
  averageLabel?: string;
  color: string;
  /** Pixels per row (tighter on phones). */
  rowHeight?: number;
  unit?: string;
  decimals?: number;
  /** Width of the label axis. */
  labelWidth?: number;
}

/** Items ranked top-down as horizontal bars, one hue, optional reference
 * line. Height grows with the item count so every label stays legible on a
 * phone. */
export function RankedBarsChart({
  items,
  average,
  averageLabel,
  color,
  rowHeight = 26,
  unit = "kg",
  decimals = 1,
  labelWidth = 64,
}: RankedBarsChartProps) {
  const height = Math.max(140, items.length * rowHeight + 56);
  return (
    <BarChart
      height={height}
      layout="horizontal"
      yAxis={[
        {
          scaleType: "band",
          data: items.map((f) => f.label),
          width: labelWidth,
          categoryGapRatio: 0.3,
          tickLabelStyle: tickStyle,
        },
      ]}
      xAxis={[{ valueFormatter: (v: number) => fmtAxisKg(v), tickLabelStyle: tickStyle, height: 28 }]}
      series={[
        {
          id: "value",
          color,
          data: items.map((f) => f.value),
          valueFormatter: kgFormatter(unit, decimals),
        },
      ]}
      borderRadius={4}
      grid={{ vertical: true }}
      margin={{ left: 4, right: 12, top: 4, bottom: 4 }}
      hideLegend
      sx={chartSx}
    >
      {average != null ? (
        <ChartsReferenceLine
          x={average}
          label={averageLabel ?? `Avg ${fmtKg(average, decimals)}`}
          labelAlign="start"
          lineStyle={refLineStyle}
          labelStyle={refLabelStyle}
        />
      ) : null}
    </BarChart>
  );
}

const BRIDGE_SHORT: Record<BridgeStep["step"], string> = {
  capacity: "Capacity at std",
  idle_frames: "Frames never ran",
  idle_shifts: "Shifts not run",
  run_std: "Std of run",
  efficiency: "Below std",
  actual: "Actual",
};

/** Capacity -> losses -> actual as a horizontal waterfall: totals as full
 * bars, each loss as a floating segment hung from the running level (a
 * transparent base series carries the offset). Totals in slot 1, losses in
 * slot 2 — a legend names both. */
export function BridgeChart({ steps, rowHeight = 30 }: { steps: BridgeStep[]; rowHeight?: number }) {
  let level = 0;
  const base: number[] = [];
  const totals: (number | null)[] = [];
  const losses: (number | null)[] = [];
  steps.forEach((s) => {
    if (s.kind === "total") {
      base.push(0);
      totals.push(s.kg);
      losses.push(null);
      level = s.kg;
    } else {
      const next = Math.max(0, level - s.kg);
      base.push(next);
      totals.push(null);
      losses.push(Math.max(0, s.kg));
      level = next;
    }
  });
  const height = steps.length * rowHeight + 70;
  return (
    <BarChart
      height={height}
      layout="horizontal"
      yAxis={[
        {
          scaleType: "band",
          data: steps.map((s) => BRIDGE_SHORT[s.step] ?? s.label),
          width: 112,
          categoryGapRatio: 0.35,
          tickLabelStyle: tickStyle,
        },
      ]}
      xAxis={[{ valueFormatter: (v: number) => fmtAxisKg(v), tickLabelStyle: tickStyle, height: 28, min: 0 }]}
      series={[
        { id: "base", data: base, stack: "w", color: "transparent" },
        {
          id: "total",
          label: "Standard / actual",
          data: totals,
          stack: "w",
          color: SERIES_COLORS[0],
          valueFormatter: kgFormatter("kg", 0),
        },
        {
          id: "loss",
          label: "Lost",
          data: losses,
          stack: "w",
          color: SERIES_COLORS[1],
          valueFormatter: kgFormatter("kg", 0),
        },
      ]}
      borderRadius={4}
      grid={{ vertical: true }}
      margin={{ left: 4, right: 12, top: 4, bottom: 4 }}
      slotProps={{ ...legendBottom, tooltip: { trigger: "item" } }}
      sx={{ ...chartSx, "& .MuiBarElement-root[fill='transparent']": { stroke: "none" } }}
    />
  );
}

/** Frame-shifts per band of actual-over-standard — the shape of the loss (a
 * tail or a systemic shift). One hue; the band labels carry the meaning. */
export function HistogramChart({
  bands,
  height,
}: {
  bands: { band: string; frame_shifts: number }[];
  height: number;
}) {
  return (
    <BarChart
      height={height}
      xAxis={[
        {
          scaleType: "band",
          data: bands.map((b) => b.band),
          categoryGapRatio: 0.3,
          tickLabelStyle: { fontSize: 10 },
          tickLabelMinGap: 2,
          label: "Actual as % of standard",
          labelStyle: { fontSize: 11 },
        },
      ]}
      yAxis={[{ width: 40, tickLabelStyle: tickStyle }]}
      series={[
        {
          id: "fs",
          color: SERIES_COLORS[0],
          data: bands.map((b) => b.frame_shifts),
          valueFormatter: (v: number | null) => (v == null ? "" : `${v} frame-shifts`),
        },
      ]}
      borderRadius={4}
      grid={{ horizontal: true }}
      margin={{ left: 4, right: 8, top: 8, bottom: 4 }}
      hideLegend
      sx={chartSx}
    />
  );
}


/** Every frame-shift as a point: standard kg across, actual kg up, one
 * colour per shift. The grey dotted diagonal is "actual = standard"; a point
 * below it is a frame-shift that fell short, by the vertical distance. Needs
 * no percentage. */
export function ActualVsStdScatter({ points, height }: { points: FrameShiftPoint[]; height: number }) {
  const max = Math.max(1, ...points.map((p) => Math.max(p.kg, p.std_kg)));
  const top = Math.ceil(max / 50) * 50;
  const present = SHIFT_ORDER.filter((sh) => points.some((p) => p.shift === sh));
  const diagonal = Array.from({ length: 41 }, (_, i) => {
    const v = (top * i) / 40;
    return { x: v, y: v, id: `d${i}` };
  });
  return (
    <ScatterChart
      height={height}
      xAxis={[
        {
          min: 0,
          max: top,
          label: "Standard (kg per frame-shift)",
          labelStyle: { fontSize: 11 },
          tickLabelStyle: tickStyle,
          valueFormatter: (v: number) => fmtAxisKg(v),
          height: 44,
        },
      ]}
      yAxis={[
        {
          min: 0,
          max: top,
          label: "Actual (kg)",
          labelStyle: { fontSize: 11 },
          tickLabelStyle: tickStyle,
          valueFormatter: (v: number) => fmtAxisKg(v),
          width: 56,
        },
      ]}
      series={[
        ...present.map((sh) => ({
          id: `sh-${sh}`,
          label: SHIFT_LABEL[sh] ?? sh,
          color: SERIES_COLORS[SHIFT_ORDER.indexOf(sh)],
          markerSize: 3,
          data: points
            .filter((p) => p.shift === sh)
            .map((p, i) => ({ x: p.std_kg, y: p.kg, id: `${sh}-${i}-${p.date}-${p.frame ?? ""}` })),
        })),
        {
          id: "diag",
          label: "Actual = standard",
          color: STD_COLOR,
          markerSize: 1.5,
          data: diagonal,
        },
      ]}
      grid={{ horizontal: true, vertical: true }}
      margin={{ left: 4, right: 12, top: 8, bottom: 4 }}
      slotProps={legendBottom}
      sx={chartSx}
    />
  );
}
