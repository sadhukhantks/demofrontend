"use client";

/**
 * The chart forms of the Spinning Production Trend page, on MUI X Charts.
 * Each is one measure on one y-axis (never a dual axis), with a legend
 * whenever there is more than one series, an axis-wide tooltip that lists
 * every series at the hovered day, hairline grid, thin rounded bars and 2px
 * lines. The standard is drawn dashed and the target dotted, both in ink
 * greys, and the standard at the yarn's standard count dash-dot in a muted
 * ochre, so the solid coloured actual is what the eye lands on. Colours come
 * in with the series — the charts never choose.
 *
 * Every chart but the scatter prints its numbers at the data points
 * (TKT-000222) through the `ValueLabels` / `BarEndLabels` overlays below —
 * chart children, so unlike the library's `barLabel` they are not clipped at
 * the drawing area — thinned on dense ranges so labels never pile up. Every
 * line is labelled, the context lines in their own ink; each number sits on
 * the side of its point away from the nearest other line, and a value two
 * lines share is printed once (see `ValueLabels` `peers`). The tooltip still
 * carries every value.
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
import { getValueToPositionMapper, useDrawingArea, useXScale, useYScale } from "@mui/x-charts/hooks";
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
import { estimateLabelWidth, LABEL_FONT_PX, labelledIndices, labelStep, outsideLabelRoom } from "../chartLabels";

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
    if (s.dash === "dashdot") out[`& .MuiLineElement-series-${s.key}`] = { strokeDasharray: "8 3 2 3" };
  });
  return out;
}

const kgFormatter = (unit: string, decimals: number) => (v: number | null) =>
  v == null ? "" : `${fmtKg(v, decimals)}${unit ? ` ${unit}` : ""}`;

/** Gap between a point (or bar top) and its label's baseline — clears the
 * line marks. */
const LABEL_OFFSET_PX = 7;
/** Gap between a horizontal bar's end and its label. */
const LABEL_GAP_PX = 4;

/** Point labels: small ink digits with a surface-white halo so they stay
 * legible where they cross a line or sit on a bar. */
const labelTextStyle: React.CSSProperties = {
  fontSize: LABEL_FONT_PX,
  fontFamily: "inherit",
  fill: REFERENCE_COLOR,
  paintOrder: "stroke",
  stroke: "#ffffff",
  strokeWidth: 3,
  strokeLinejoin: "round",
  pointerEvents: "none",
};

type LabelPlacement = "above" | "below";

interface ValueLabelsProps {
  /** The x-axis categories in order; `values[i]` sits over `xData[i]`. */
  xData: readonly string[];
  values: readonly (number | null)[];
  format: (v: number) => string;
  xAxisId?: string;
  yAxisId?: string;
  /** Which side of the point the number sits on when there is no other
   * series to keep away from (above by default); it flips only when that
   * side has no room. */
  placement?: LabelPlacement;
  /** Ink of the digits — text ink by default, the series colour for a
   * context line so the reader can tell whose number it is. */
  color?: string;
  /** Every series of the chart in render order, this one included, and this
   * series' index in it. With peers, each number goes on the side of its
   * point away from the nearest other series at that x, and a value an
   * earlier series already printed at the same point is not printed twice. */
  peers?: readonly (readonly (number | null)[])[];
  peerIndex?: number;
}

/** The numbers of one series printed at its data points, inside the chart
 * SVG (TKT-000222). Each label sits just off its point or bar top — above
 * for the actual, below for a context line, or on whichever side is clear
 * of the other lines when `peers` are given — and a range too dense for a
 * label per point is thinned to every k-th point, counted back from the
 * latest, which is always labelled. Must render inside a chart provider. */
function ValueLabels({
  xData,
  values,
  format,
  xAxisId,
  yAxisId,
  placement = "above",
  color,
  peers,
  peerIndex = 0,
}: ValueLabelsProps) {
  const xScale = useXScale(xAxisId);
  const yScale = useYScale<"linear">(yAxisId);
  const area = useDrawingArea();
  const toX = getValueToPositionMapper(xScale);
  const labels = values.map((v) => (v == null ? "" : format(v)));
  const widest = labels.reduce((w, l) => Math.max(w, estimateLabelWidth(l)), 0);
  // One category's share of the width (band); for a point scale this is a
  // touch under the real spacing, i.e. it thins a little early — the safe side.
  const slot = xData.length > 0 ? area.width / xData.length : area.width;
  const picked = labelledIndices(values, labelStep(slot, widest));
  const right = area.left + area.width;
  const bottom = area.top + area.height;
  const style = color ? { ...labelTextStyle, fill: color } : labelTextStyle;
  // The side of point i for its label: the preferred side unless another
  // series sits too close on it and the other side is clearer (a series on
  // the same value is ignored here and handled by `printedBefore`).
  const need = 2 * (LABEL_OFFSET_PX + LABEL_FONT_PX);
  const sideAt = (i: number, v: number, y: number): LabelPlacement => {
    if (!peers) return placement;
    let up = Infinity;
    let down = Infinity;
    peers.forEach((p, j) => {
      const o = p[i];
      if (j === peerIndex || o == null || o === v) return;
      const oy = yScale(o);
      if (oy == null || !Number.isFinite(oy)) return;
      if (oy < y) up = Math.min(up, y - oy);
      else down = Math.min(down, oy - y);
    });
    const prefGap = placement === "above" ? up : down;
    const otherGap = placement === "above" ? down : up;
    if (prefGap >= need || prefGap >= otherGap) return placement;
    return placement === "above" ? "below" : "above";
  };
  const printedBefore = (i: number): boolean =>
    !!peers &&
    peers.some((p, j) => {
      const o = p[i];
      return j < peerIndex && o != null && format(o) === labels[i];
    });
  return (
    <g>
      {picked.map((i) => {
        const v = values[i];
        if (v == null || printedBefore(i)) return null;
        const x = toX(xData[i]);
        const y = yScale(v);
        if (!Number.isFinite(x) || y == null || !Number.isFinite(y)) return null;
        const half = estimateLabelWidth(labels[i]) / 2;
        // At either edge the label anchors inward, nudged off the axis line.
        const anchor = x - half < area.left ? "start" : x + half > right ? "end" : "middle";
        const tx = anchor === "start" ? x + 3 : anchor === "end" ? x - 3 : x;
        const above = y - LABEL_OFFSET_PX;
        const below = y + LABEL_OFFSET_PX + LABEL_FONT_PX;
        const fitsAbove = above - LABEL_FONT_PX >= 0;
        const fitsBelow = below <= bottom;
        const side = sideAt(i, v, y);
        const ty = side === "below" ? (fitsBelow || !fitsAbove ? below : above) : fitsAbove || !fitsBelow ? above : below;
        return (
          <text key={i} x={tx} y={ty} textAnchor={anchor} style={style}>
            {labels[i]}
          </text>
        );
      })}
    </g>
  );
}

/** Where a line's labels go when nothing is in the way, and in what ink:
 * the solid actual above its points in text ink; a context line (standard,
 * std at std count, target) below its points in its own colour. */
function labelPlacement(s: LineSeries): { placement: LabelPlacement; color?: string } {
  if (!s.dash) return { placement: "above" };
  return { placement: "below", color: s.color };
}

interface BarEndLabelsProps {
  /** The y-axis band categories in order; `ends[i]` belongs to `yData[i]`. */
  yData: readonly string[];
  /** Where each bar ends on the value axis (base + value for a stacked
   * segment); null where the category has no bar in this series. */
  ends: readonly (number | null)[];
  labels: readonly string[];
}

/** The number just past the end of each horizontal bar (TKT-000222). A
 * chart child, i.e. outside the plot's clip path, so the label can run into
 * the right margin `outsideLabelRoom` reserved — the library's own
 * `barLabel` is clipped at the drawing area and loses the longest bar's
 * number. A bar left of zero is labelled to its left. */
function BarEndLabels({ yData, ends, labels }: BarEndLabelsProps) {
  const xScale = useXScale<"linear">();
  const yScale = useYScale<"band">();
  const toY = getValueToPositionMapper(yScale);
  return (
    <g>
      {yData.map((cat, i) => {
        const end = ends[i];
        const label = labels[i];
        if (end == null || !label) return null;
        const x = xScale(end);
        const y = toY(cat);
        if (x == null || !Number.isFinite(x) || !Number.isFinite(y)) return null;
        const left = end < 0;
        return (
          <text
            key={i}
            x={left ? x - LABEL_GAP_PX : x + LABEL_GAP_PX}
            y={y}
            textAnchor={left ? "end" : "start"}
            dominantBaseline="central"
            style={labelTextStyle}
          >
            {label}
          </text>
        );
      })}
    </g>
  );
}

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
  // The day's total, printed over the stack; the segments keep to the tooltip.
  const totals = React.useMemo(
    () => chart.dates.map((_, i) => chart.series.reduce((sum, s) => sum + (s.data[i] ?? 0), 0)),
    [chart],
  );
  // The totals and every line keep their numbers out of each other's way.
  const peers = React.useMemo(() => [totals, ...lines.map((s) => s.data)], [totals, lines]);
  return (
    <ChartsDataProvider
      height={height}
      margin={{ left: 4, right: 8, top: 20, bottom: 4 }}
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
          <ValueLabels
            xData={chart.dates}
            values={totals}
            format={(v) => fmtKg(v, 0)}
            xAxisId="x"
            yAxisId="y"
            peers={peers}
            peerIndex={0}
          />
          {lines.map((s, j) => (
            <ValueLabels
              key={s.key}
              xData={chart.dates}
              values={s.data}
              format={(v) => fmtKg(v, 0)}
              xAxisId="x"
              yAxisId="y"
              peers={peers}
              peerIndex={j + 1}
              {...labelPlacement(s)}
            />
          ))}
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
  const peerData = React.useMemo(() => series.map((s) => s.data), [series]);
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
      margin={{ left: 4, right: 12, top: 20, bottom: 4 }}
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
      {series.map((s, j) => (
        <ValueLabels
          key={s.key}
          xData={dates}
          values={s.data}
          format={(v) => fmtKg(v, decimals)}
          peers={peerData}
          peerIndex={j}
          {...labelPlacement(s)}
        />
      ))}
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
  const labelOf = (v: number | null) => (v == null ? null : fmtKg(v, decimals));
  const labelRoom = outsideLabelRoom(items.map((f) => labelOf(f.value) ?? ""));
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
      margin={{ left: 4, right: labelRoom, top: 4, bottom: 4 }}
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
      <BarEndLabels
        yData={items.map((f) => f.label)}
        ends={items.map((f) => f.value)}
        labels={items.map((f) => labelOf(f.value) ?? "")}
      />
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
  const cats = steps.map((s) => BRIDGE_SHORT[s.step] ?? s.label);
  const kgLabel = (v: number | null) => (v == null ? null : fmtKg(v, 0));
  const labelRoom = outsideLabelRoom([...totals, ...losses].map((v) => kgLabel(v) ?? ""));
  return (
    <BarChart
      height={height}
      layout="horizontal"
      yAxis={[
        {
          scaleType: "band",
          data: cats,
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
      margin={{ left: 4, right: labelRoom, top: 4, bottom: 4 }}
      slotProps={{ ...legendBottom, tooltip: { trigger: "item" } }}
      sx={{ ...chartSx, "& .MuiBarElement-root[fill='transparent']": { stroke: "none" } }}
    >
      <BarEndLabels yData={cats} ends={totals} labels={totals.map((v) => kgLabel(v) ?? "")} />
      <BarEndLabels
        yData={cats}
        ends={losses.map((v, i) => (v == null ? null : base[i] + v))}
        labels={losses.map((v) => kgLabel(v) ?? "")}
      />
    </BarChart>
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
      margin={{ left: 4, right: 8, top: 20, bottom: 4 }}
      hideLegend
      sx={chartSx}
    >
      <ValueLabels
        xData={bands.map((b) => b.band)}
        values={bands.map((b) => b.frame_shifts)}
        format={(v) => String(v)}
      />
    </BarChart>
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
