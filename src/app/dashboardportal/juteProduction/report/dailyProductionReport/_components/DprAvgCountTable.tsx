"use client";

/**
 * "Average Count" block of the Daily Production Report (TKT-000173, TKT-000201).
 *
 * The mill average yarn count on three weightings, side by side so they can be
 * read against each other: frames run, actual production, and the production
 * the std parameters expected from those frames — each for two counts:
 *   - Std count: the quality's count on the yarn master;
 *   - SQC actual count: the day's average count entered in Spinning SQC (the
 *     quality table's Act Count). A quality with no SQC reading for the day
 *     falls back to its std count and is named under the table.
 *
 * A standard that was never entered is a master-data gap, not a zero: the
 * std-weighted row covers only the qualities that have std production and shows
 * "—" when none does, with a line saying why.
 *
 * The same figures ride on the "Avg Count (lb)" KPI card at the top of the page
 * (avgCountKpi): SQC actual as the headline, std count in the caption.
 *
 * A payload without the act_* fields (backend older than TKT-000201) renders
 * the original single std column.
 *
 * Mirrors avg_count_kpi / avg_count_note / avg_count_std_basis in the backend's
 * dpr_pdf.py (the PDF + WhatsApp DPR) — change one, change both.
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

type Basis = "by_frames" | "by_production" | "by_std_production";
const BASES: Basis[] = ["by_frames", "by_production", "by_std_production"];

/** True when the payload carries the TKT-000201 actual-count figures. */
export function hasActColumn(avg: DprSpinningAvgCount): boolean {
  return avg.act_by_production !== undefined;
}

/** ...and at least one quality had an SQC count reading for the day. */
export function hasSqcCount(avg: DprSpinningAvgCount): boolean {
  return hasActColumn(avg) && (avg.act_measured_kg ?? 0) > 0;
}

function actValue(avg: DprSpinningAvgCount, basis: Basis): number | null | undefined {
  return avg[`act_${basis}` as const];
}

/** What the std-weighted row was averaged over — or why it is blank. */
export function stdBasisText(avg: DprSpinningAvgCount): string {
  if (avg.by_std_production === null && (actValue(avg, "by_std_production") ?? null) === null) {
    return "no std production (std TPI / efficiency or SQC count missing)";
  }
  const base = `${fmt(avg.std_production_kg, 0)} kg std expected`;
  return avg.std_qualities < avg.qualities
    ? `${base} · ${avg.std_qualities} of ${avg.qualities} qualities have std production`
    : base;
}

/**
 * Strings for the "Avg Count (lb)" KPI card. Headline = the SQC actual count on
 * the three weightings (frames / production / std production), in table order;
 * the std-count figures ride in the caption. With no SQC count entered for the
 * day the card shows the std figures and says so — it never labels std as
 * actual. Kept short on purpose — the KPI strip is read on a phone.
 */
export function avgCountKpi(avg: DprSpinningAvgCount): { value: string; sub: string } {
  const stdVals = BASES.map((b) => fmt(avg[b], 2)).join(" / ");
  if (!hasSqcCount(avg)) {
    const noStd = avg.by_std_production === null ? " (std not entered)" : "";
    return hasActColumn(avg)
      ? { value: stdVals, sub: `std count · frames / prod / std${noStd} · no SQC count entered` }
      : { value: stdVals, sub: `frames / production / std${noStd}` };
  }
  const fallback = avg.act_fallback ?? [];
  return {
    value: BASES.map((b) => fmt(actValue(avg, b), 2)).join(" / "),
    sub:
      `SQC actual (frames / prod / std) · std count ${stdVals}` +
      (fallback.length > 0 ? ` · ${fallback.length} w/o SQC` : ""),
  };
}

function listNames(names: string[]): string {
  return `${names.slice(0, 6).join(", ")}${names.length > 6 ? " …" : ""}`;
}

/** Caption under the table: where each count comes from, and every gap. */
export function avgCountNote(avg: DprSpinningAvgCount): string {
  let note: string;
  if (hasActColumn(avg)) {
    const basis =
      avg.count_basis === "corrected"
        ? "the day's average moisture-corrected count entered in Spinning SQC"
        : "the day's average count entered in Spinning SQC";
    note =
      `Std count = the quality's count on the yarn master. Actual count = ${basis} ` +
      "(the Act Count column above). Each is weighted by the " +
      "frame-shifts the quality ran, by the kg it actually produced, and by the kg its std " +
      "speed / TPI / efficiency expected from those frames.";
    const measured = avg.act_measured_kg ?? 0;
    if (measured <= 0) {
      note += " No SQC count was entered for the day, so the actual column repeats the std count.";
    } else if (measured < avg.production_kg) {
      note += ` SQC count covers ${fmt(measured, 0)} of ${fmt(avg.production_kg, 0)} kg.`;
    }
    const fallback = avg.act_fallback ?? [];
    if (fallback.length > 0 && measured > 0) {
      note += ` No SQC count for the day, so the std count stands in the actual column: ${listNames(fallback)}.`;
    }
  } else {
    note =
      "Each quality's standard count, weighted by the frame-shifts it ran, by the kg it " +
      "actually produced, and by the kg its std speed / TPI / efficiency expected from those " +
      "frames.";
  }
  if (avg.by_std_production === null || avg.std_qualities < avg.qualities) {
    note +=
      " Qualities with no std production (std TPI / efficiency not entered in Spinning Target " +
      "Map, or no SQC count for the day) are left out of the third row, not counted as zero — " +
      "hence its kg can differ from the others.";
  }
  if (avg.count_missing.length > 0) {
    note += ` No count on the yarn master, so left out of the std column: ${listNames(avg.count_missing)}.`;
  }
  return note;
}

export function DprAvgCountTable({ avg }: DprAvgCountTableProps) {
  const withAct = hasActColumn(avg);
  const rows: { basis: Basis; label: string; over: string; testId: string }[] = [
    {
      basis: "by_frames",
      label: "Frames run",
      over: `${fmt(avg.frame_shifts, 0)} frame-shifts`,
      testId: "dpr-avg-count-frames",
    },
    {
      basis: "by_production",
      label: "Actual production",
      over: `${fmt(avg.production_kg, 0)} kg doffed`,
      testId: "dpr-avg-count-production",
    },
    {
      basis: "by_std_production",
      label: "Std production (std parameters)",
      over: stdBasisText(avg),
      testId: "dpr-avg-count-std",
    },
  ];
  return (
    <>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mt: 1.5, mb: 0.5 }}>
        Average Count
      </Typography>
      <DprTable
        head={
          <Tr>
            <Td>{withAct ? "Weighted By" : "Basis"}</Td>
            <Td align="right">{withAct ? "Std Count (lb)" : "Average Count (lb)"}</Td>
            {withAct ? <Td align="right">SQC Actual Count (lb)</Td> : null}
            <Td>Weighted Over</Td>
          </Tr>
        }
      >
        {rows.map((r) => (
          <Tr key={r.basis} data-testid={r.testId}>
            <Td>{r.label}</Td>
            <NumTd value={avg[r.basis]} />
            {withAct ? <NumTd value={actValue(avg, r.basis) ?? null} /> : null}
            <Td>{r.over}</Td>
          </Tr>
        ))}
      </DprTable>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
        {avgCountNote(avg)}
      </Typography>
    </>
  );
}
