"use client";

import * as React from "react";
import { useTheme } from "@mui/material/styles";
import { LineChart } from "@mui/x-charts/LineChart";
import type { TrendWeek } from "@/utils/lowPerformerFollowupService";
import { fmtNum, trendMetric, weekLabels } from "../_utils";

export interface TrendChartProps {
  weeks: ReadonlyArray<TrendWeek>;
  height?: number;
}

/**
 * Person's weekly average efficiency against the peers on the same date +
 * count. Falls back to kg per hour when no week has an efficiency (counts
 * without a standard).
 */
export default function TrendChart({ weeks, height = 260 }: TrendChartProps) {
  const theme = useTheme();
  const labels = React.useMemo(() => weekLabels(weeks), [weeks]);
  const metric = trendMetric(weeks);
  const unit = metric === "eff" ? "%" : "kg/hr";
  const fmt = (v: number | null) => (v == null ? "" : `${fmtNum(v)} ${unit}`);

  return (
    <LineChart
      height={height}
      xAxis={[{ scaleType: "point", data: labels, tickLabelStyle: { fontSize: 11 } }]}
      yAxis={[{ width: 44, tickLabelStyle: { fontSize: 11 } }]}
      series={[
        {
          id: "person",
          label: metric === "eff" ? "This worker — eff %" : "This worker — kg/hr",
          data: weeks.map((w) => (metric === "eff" ? w.avg_eff : w.kg_per_hr)),
          color: theme.palette.secondary.main,
          connectNulls: false,
          valueFormatter: fmt,
        },
        {
          id: "peers",
          label: metric === "eff" ? "Others (same date + count) — eff %" : "Others (same date + count) — kg/hr",
          data: weeks.map((w) => (metric === "eff" ? w.peer_avg_eff : w.peer_kg_per_hr)),
          color: theme.palette.text.disabled,
          connectNulls: false,
          valueFormatter: fmt,
        },
      ]}
      grid={{ horizontal: true }}
      margin={{ left: 4, right: 12, top: 12, bottom: 4 }}
      slotProps={{
        legend: { direction: "horizontal", position: { vertical: "bottom", horizontal: "center" } },
      }}
    />
  );
}
