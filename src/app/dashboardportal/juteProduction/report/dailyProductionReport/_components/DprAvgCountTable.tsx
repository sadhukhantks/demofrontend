"use client";

/**
 * "Average Count" block of the Daily Production Report (TKT-000173).
 *
 * The mill average yarn count on three weightings, side by side so they can be
 * read against each other: frames run, actual production, and the production
 * the std parameters expected from those frames. The count averaged is always
 * the quality's standard count, so only the weighting differs.
 *
 * A standard that was never entered is a master-data gap, not a zero: the
 * std-weighted figure covers only the qualities that have one and shows "—"
 * when none does, with a line saying where to enter them.
 *
 * The same three figures ride on the "Avg Count (lb)" KPI card at the top of
 * the page (avgCountKpi) — owner asked for both.
 *
 * Presentational only; same DOM on screen and on print.
 */

import React from "react";
import { Typography } from "@mui/material";
import type { DprSpinningAvgCount } from "@/utils/juteProductionReportService";
import { DprTable, NumTd, Td, Tr, fmt } from "./DprPieces";

export interface DprAvgCountTableProps {
  avg: DprSpinningAvgCount;
}

/** What the std-weighted figure was averaged over — or why it is blank. */
export function stdBasisText(avg: DprSpinningAvgCount): string {
  if (avg.by_std_production === null) return "no std TPI / efficiency entered";
  const base = `${fmt(avg.std_production_kg, 0)} kg std expected`;
  return avg.std_qualities < avg.qualities
    ? `${base} · ${avg.std_qualities} of ${avg.qualities} qualities have a standard`
    : base;
}

/**
 * Strings for the "Avg Count (lb)" KPI card: the three figures in one compact
 * line (frames / production / std), in the same order as the table below. A
 * blank std figure shows "—" and the caption says why, so the card never reads
 * as a zero. Kept short on purpose — the KPI strip is read on a phone.
 */
export function avgCountKpi(avg: DprSpinningAvgCount): { value: string; sub: string } {
  return {
    value: [avg.by_frames, avg.by_production, avg.by_std_production]
      .map((v) => fmt(v, 2))
      .join(" / "),
    sub:
      avg.by_std_production === null
        ? "frames / production / std (std not entered)"
        : "frames / production / std",
  };
}

export function DprAvgCountTable({ avg }: DprAvgCountTableProps) {
  return (
    <>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mt: 1.5, mb: 0.5 }}>
        Average Count
      </Typography>
      <DprTable
        head={
          <Tr>
            <Td>Basis</Td>
            <Td align="right">Average Count (lb)</Td>
            <Td>Weighted Over</Td>
          </Tr>
        }
      >
        <Tr data-testid="dpr-avg-count-frames">
          <Td>Frames run</Td>
          <NumTd value={avg.by_frames} />
          <Td>{fmt(avg.frame_shifts, 0)} frame-shifts</Td>
        </Tr>
        <Tr data-testid="dpr-avg-count-production">
          <Td>Actual production</Td>
          <NumTd value={avg.by_production} />
          <Td>{fmt(avg.production_kg, 0)} kg doffed</Td>
        </Tr>
        <Tr data-testid="dpr-avg-count-std">
          <Td>Std production (std parameters)</Td>
          <NumTd value={avg.by_std_production} />
          <Td>{stdBasisText(avg)}</Td>
        </Tr>
      </DprTable>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
        Each quality&apos;s standard count, weighted by the frame-shifts it ran, by the kg it
        actually produced, and by the kg its std speed / TPI / efficiency expected from those
        frames.
        {avg.by_std_production === null || avg.std_qualities < avg.qualities
          ? " Qualities with no standard entered are left out of the third figure, not counted as zero — enter std TPI and efficiency per quality in Spinning Target Map."
          : ""}
        {avg.count_missing.length > 0
          ? ` No count on the yarn master, so left out of all three: ${avg.count_missing.slice(0, 6).join(", ")}${avg.count_missing.length > 6 ? " …" : ""}.`
          : ""}
      </Typography>
    </>
  );
}
