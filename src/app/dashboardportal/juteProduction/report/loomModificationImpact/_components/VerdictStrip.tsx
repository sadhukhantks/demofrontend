"use client";

/**
 * Section B of the impact report: the verdict chip, the stage sub-line and
 * the KpiCard tiles — Efficiency % Before | After | Change (points and %) |
 * Net vs control, plus an "at baseline standard" pair only when the server
 * sent one (a study loom carries the S flag). Reads on a phone: tiles wrap,
 * the chip and sub-lines sit above them.
 */

import React from "react";
import { Alert, Box, Chip, Stack, Typography } from "@mui/material";
import { KpiCard } from "../../dailyProductionReport/_components/DprPieces";
import type { ImpactChain, ImpactVerdict } from "../_service";
import {
  deltaState,
  fmtDeltaPts,
  fmtSignedPct,
  fmtVal,
  loomsImprovedLine,
  stageSubline,
  verdictChipColor,
  verdictLabel,
} from "../impactRows";

export interface VerdictStripProps {
  verdict: ImpactVerdict | null;
  chain: ImpactChain | null;
  /** Relative-% verdict threshold (meta.thresholds). */
  thresholdPct: number;
}

function pct(v: number | null | undefined): string {
  return v == null ? "—" : `${fmtVal(v)} %`;
}

export default function VerdictStrip({ verdict, chain, thresholdPct }: VerdictStripProps) {
  if (!verdict) return null;
  const e = verdict.efficiency;
  const b = verdict.efficiency_at_baseline_std;
  const subline = stageSubline(verdict, chain);
  const loomsLine = loomsImprovedLine(verdict);
  const afterTail = verdict.stage_label ? ` (${verdict.stage_label})` : "";

  return (
    <Box data-testid="verdict-strip" sx={{ mb: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 0.5 }}>
        <Chip
          label={verdictLabel(verdict.verdict)}
          color={verdictChipColor(verdict.verdict)}
          variant={verdict.verdict === "NOT_ENOUGH_DATA" ? "outlined" : "filled"}
          sx={{ fontWeight: 700 }}
          data-testid="verdict-chip"
        />
        {e?.within_noise ? (
          <Chip label="within day-to-day variation" size="small" variant="outlined" color="warning" />
        ) : null}
        {subline ? (
          <Typography variant="body2" color="text.secondary">
            {subline}
          </Typography>
        ) : null}
      </Stack>

      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1 }} data-testid="efficiency-tiles">
        <KpiCard label="Efficiency — Before" value={pct(e?.before)} />
        <KpiCard label={`Efficiency — After${afterTail}`} value={pct(e?.after)} />
        <KpiCard
          label="Change"
          value={e ? fmtDeltaPts(e.delta_pts, e.delta_pct) : "—"}
          sub={e?.se != null ? `SE ${fmtVal(e.se)}` : undefined}
          state={deltaState(e?.delta_pct, thresholdPct)}
        />
        <KpiCard
          label="Net vs control"
          value={e ? fmtSignedPct(e.net_delta_pct) : "—"}
          sub={e?.net_delta_pct == null ? "no control" : undefined}
          state={deltaState(e?.net_delta_pct, thresholdPct)}
        />
      </Box>

      {b ? (
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1 }} data-testid="baseline-std-tiles">
          <KpiCard label="Eff at baseline std — Before" value={pct(b.before)} sub="standard changed on a loom" />
          <KpiCard
            label="Eff at baseline std — After"
            value={pct(b.after)}
            sub={fmtDeltaPts(b.delta_pts, b.delta_pct)}
            state={deltaState(b.delta_pct, thresholdPct)}
          />
        </Box>
      ) : null}

      {loomsLine ? (
        <Typography variant="body2" color="text.secondary">
          {loomsLine}
        </Typography>
      ) : null}
      {verdict.reason ? (
        <Typography variant="body2" color="text.secondary">
          {verdict.reason}
        </Typography>
      ) : null}
      {verdict.other_stage_note ? (
        <Alert severity="info" sx={{ mt: 1 }}>
          {verdict.other_stage_note}
        </Alert>
      ) : null}
    </Box>
  );
}
