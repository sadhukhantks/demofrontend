"use client";

import * as React from "react";
import { Alert, Box, Chip, Paper, Typography } from "@mui/material";
import type { PlanningSummary, PlanningWarning } from "../types/productionPlanningTypes";
import { round1 } from "../utils/planningCalc";

export type PlanningSummaryBarProps = {
  summary: PlanningSummary | null;
  warnings: readonly PlanningWarning[];
};

/**
 * Sticky "quick review" bar (SPEC 4.5): headline totals as chips + the active
 * calculation warnings. Pure presentational — fed entirely by props.
 */
export default function PlanningSummaryBar({ summary, warnings }: PlanningSummaryBarProps) {
  if (!summary) return null;

  const frameChipLabel = `Frames ${round1(summary.framesRequired)} needed / ${round1(
    summary.framesAllocated
  )} allocated${summary.framesReady != null ? ` / ${summary.framesReady} ready` : ""}`;

  const framesShort =
    summary.framesAllocated + 1e-6 < summary.framesRequired ||
    (summary.framesReady != null && summary.framesRequired > summary.framesReady * 3);

  return (
    <Paper
      elevation={2}
      sx={{
        position: "sticky",
        top: 0,
        zIndex: (t) => t.zIndex.appBar - 1,
        p: 1,
        display: "flex",
        flexDirection: "column",
        gap: 0.75,
        bgcolor: "background.paper",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Chip size="small" color="primary" label={`Cloth ${round1(summary.totalClothKgDay)} kg/day`} />
        <Chip size="small" color="secondary" label={`Yarn ${round1(summary.totalYarnKgDay)} kg/day`} />
        <Chip size="small" color={framesShort ? "warning" : "default"} label={frameChipLabel} />
        <Chip size="small" color="info" label={`Raw jute ${round1(summary.rawJuteKgDay)} kg/day`} />
        {warnings.length > 0 ? (
          <Chip size="small" color="warning" label={`${warnings.length} warning(s)`} />
        ) : null}
      </Box>
      {warnings.length > 0 ? (
        <Alert severity="warning" sx={{ py: 0 }}>
          {warnings.slice(0, 6).map((w, i) => (
            <Typography key={`${w.code}-${w.uid ?? i}`} variant="caption" component="div">
              • {w.message}
            </Typography>
          ))}
          {warnings.length > 6 ? (
            <Typography variant="caption" component="div" color="text.secondary">
              …and {warnings.length - 6} more
            </Typography>
          ) : null}
        </Alert>
      ) : null}
    </Paper>
  );
}
