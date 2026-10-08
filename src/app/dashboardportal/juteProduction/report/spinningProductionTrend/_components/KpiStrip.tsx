"use client";

/**
 * The period at a glance: stat tiles with a delta against the previous
 * period of the same length, and the actual set beside its standard (and
 * target, where entered) in plain kg. Values stay in text ink; only the
 * caption is toned, and it always carries the words (never colour alone).
 * Tiles are sized so a phone shows two per row.
 */

import React from "react";
import { Box } from "@mui/material";
import { KpiCard } from "../../dailyProductionReport/_components/DprPieces";
import type { TrendSummary } from "../_service";
import { deltaState, fmtDelta, fmtKg, longDate, vsStdState } from "../trendRows";

export default function KpiStrip({ summary }: { summary: TrendSummary }) {
  const delta = summary.delta;
  const vsPrev = summary.previous ? `vs prior ${summary.calendar_days}d` : "no prior period";
  const hasStd = summary.std_kg != null;
  const hasTgt = summary.tgt_kg != null;

  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
      <KpiCard
        label="Production"
        value={`${fmtKg(summary.production_kg)} kg`}
        sub={`${fmtDelta(delta?.production_kg)} ${vsPrev}`}
        state={deltaState(delta?.production_kg)}
      />
      <KpiCard
        label="Standard for the frame-shifts run"
        value={hasStd ? `${fmtKg(summary.std_kg)} kg` : "—"}
        sub={
          hasStd
            ? `actual ${fmtKg(summary.production_kg)} · gap ${fmtKg(summary.gap_kg)} kg`
            : "no Spinning Standards in range"
        }
        state={vsStdState(summary.production_kg, summary.std_kg)}
      />
      {hasTgt ? (
        <KpiCard
          label="Target for the frame-shifts run"
          value={`${fmtKg(summary.tgt_kg)} kg`}
          sub={`actual ${fmtKg(summary.production_kg)} kg · target eff entered for ${summary.tgt_frame_shifts ?? 0} frame-shifts`}
          state={vsStdState(summary.production_kg, summary.tgt_kg)}
        />
      ) : null}
      <KpiCard
        label="Kg per frame-shift"
        value={fmtKg(summary.kg_per_frame_shift, 1)}
        sub={`${fmtDelta(delta?.kg_per_frame_shift)} ${vsPrev} · ${fmtKg(summary.frame_shifts)} fr-shifts`}
        state={deltaState(delta?.kg_per_frame_shift)}
      />
      <KpiCard
        label="Standard per frame-shift"
        value={hasStd ? `${fmtKg(summary.std_kg_per_frame_shift, 1)} kg` : "—"}
        sub={
          hasStd
            ? `actual ${fmtKg(summary.kg_per_frame_shift, 1)}${hasTgt ? ` · target ${fmtKg(summary.tgt_kg_per_frame_shift, 1)}` : ""}`
            : "no Spinning Standards in range"
        }
        state={vsStdState(summary.kg_per_frame_shift, summary.std_kg_per_frame_shift)}
      />
      <KpiCard
        label="Avg per producing day"
        value={`${fmtKg(summary.avg_kg_per_day)} kg`}
        sub={`${summary.producing_days} of ${summary.calendar_days} days ran · ${fmtDelta(delta?.avg_kg_per_day)}`}
        state={deltaState(delta?.avg_kg_per_day)}
      />
      <KpiCard
        label="Frames run per day"
        value={fmtKg(summary.frames_avg_per_day, 1)}
        sub={`${fmtDelta(delta?.frames_avg_per_day)} ${vsPrev}`}
        state={deltaState(delta?.frames_avg_per_day)}
      />
      <KpiCard
        label="Avg doff weight"
        value={`${fmtKg(summary.avg_doff_kg, 2)} kg`}
        sub={`${fmtKg(summary.doffs)} doffs`}
      />
      <KpiCard
        label="Best day"
        value={summary.best_day ? `${fmtKg(summary.best_day.kg)} kg` : "—"}
        sub={summary.best_day ? longDate(summary.best_day.date) : undefined}
      />
      <KpiCard
        label="Lowest day"
        value={summary.worst_day ? `${fmtKg(summary.worst_day.kg)} kg` : "—"}
        sub={summary.worst_day ? longDate(summary.worst_day.date) : undefined}
      />
    </Box>
  );
}
