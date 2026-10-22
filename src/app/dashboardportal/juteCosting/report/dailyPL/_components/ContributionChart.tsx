"use client";

/**
 * Contribution per tonne of cloth by day: the solid actual line against the
 * 30-day median drawn dashed in ink grey (omitted when there is no std).
 * One measure on one y-axis, hairline grid, legend at the bottom, axis-wide
 * tooltip; marks only when the range is a month or less. A day without
 * cloth has no point (null, not 0) and the line breaks there. The table
 * below the chart is its twin, so colour never carries a figure alone.
 */

import React from "react";
import { useTheme } from "@mui/material/styles";
import { LineChart } from "@mui/x-charts/LineChart";
import type { LineSeriesType } from "@mui/x-charts/models";
import type { DailyPlDay, DailyPlStd } from "../_service";
import { ACTUAL_COLOR } from "../chartPalette";
import { fmtRupee, fmtRupeeShort, shortDate } from "../dayColumns";

const fmtTooltip = (v: number | null): string => (v == null ? "—" : `${fmtRupee(v)} /t`);

const legendBottom = {
  legend: {
    direction: "horizontal" as const,
    position: { vertical: "bottom" as const, horizontal: "center" as const },
  },
};

export default function ContributionChart({
  days,
  std,
  isPhone,
}: {
  days: DailyPlDay[];
  std: DailyPlStd;
  isPhone: boolean;
}) {
  // Context colours come from the theme: the std line in the secondary text
  // ink, the hairline grid in the divider tone (so dark mode follows).
  const theme = useTheme();
  const stdColor = theme.palette.text.secondary;
  const gridColor = theme.palette.divider;
  const chartSx = React.useMemo(
    () =>
      ({
        "& .MuiLineElement-series-std": { strokeDasharray: "6 4" },
        "& .MuiLineElement-root": { strokeWidth: 2 },
        "& .MuiChartsGrid-line": { stroke: gridColor, strokeDasharray: "none" },
        "& .MuiChartsAxis-line": { stroke: gridColor },
        "& .MuiChartsAxis-tick": { stroke: gridColor },
      }) as const,
    [gridColor],
  );
  const labels = React.useMemo(() => days.map((d) => shortDate(d.date)), [days]);
  const actual = React.useMemo(() => days.map((d) => d.per_t_cloth.contribution), [days]);
  const stdValue = std.contribution_per_t;
  const stdLine = React.useMemo(
    () => (stdValue == null ? null : days.map(() => stdValue)),
    [days, stdValue],
  );
  // Thin the date ticks so a two-month range stays legible.
  const step = Math.max(1, Math.ceil(days.length / (isPhone ? 7 : 16)));

  const series = React.useMemo<LineSeriesType[]>(() => {
    const out: LineSeriesType[] = [
      {
        type: "line",
        id: "actual",
        label: "Contribution ₹/t",
        data: actual,
        color: ACTUAL_COLOR,
        connectNulls: false,
        showMark: days.length <= 31,
        valueFormatter: fmtTooltip,
      },
    ];
    if (stdLine) {
      out.push({
        type: "line",
        id: "std",
        label: "Std (30-day median)",
        data: stdLine,
        color: stdColor,
        showMark: false,
        valueFormatter: fmtTooltip,
      });
    }
    return out;
  }, [actual, days.length, stdColor, stdLine]);

  return (
    <LineChart
      height={isPhone ? 230 : 300}
      xAxis={[
        {
          scaleType: "point",
          data: labels,
          tickLabelStyle: { fontSize: 11 },
          tickInterval: (_value: unknown, index: number) => index % step === 0,
        },
      ]}
      yAxis={[{ width: 56, valueFormatter: (v: number) => fmtRupeeShort(v) }]}
      series={series}
      grid={{ horizontal: true }}
      slotProps={legendBottom}
      margin={{ left: 4, right: 12, top: 12, bottom: 4 }}
      sx={chartSx}
    />
  );
}
