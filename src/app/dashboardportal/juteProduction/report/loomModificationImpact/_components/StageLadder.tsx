"use client";

/**
 * The stage ladder (§7.2 B): one row per segment — Before, After-1, After-2 …
 * and their shaded control twins — with dates, n of N looms, loom-days,
 * producing / eff days, hours run, coverage, efficiency (and at baseline
 * standard), Δ vs baseline, Δ vs previous, net vs control, SE and verdict.
 *
 * Under `sm` it is a stack of compact cards (the phone answer to "did it
 * work, by how much, since which change"); on desktop a ReportGrid with
 * control rows shaded and `report-perf-low` / `report-perf-watch` tints.
 */

import React from "react";
import { Box, Chip, Paper, Typography, useMediaQuery, useTheme } from "@mui/material";
import type { GridColDef } from "@mui/x-data-grid";
import { numCol } from "@/components/reports/ReportGrid";
import type { ReportExportHeader } from "@/components/reports/exportExcel";
import { tokens } from "@/styles/tokens";
import type { ImpactSegment } from "../_service";
import { fmtVal, ladderRowClass, ladderRows, verdictChipColor, type LadderRow } from "../impactRows";
import TabGrid from "./TabGrid";

export interface StageLadderProps {
  segments: ImpactSegment[];
  thresholdPct: number;
  branchId: number | null;
  loading: boolean;
  header: ReportExportHeader;
}

const columns: GridColDef<LadderRow>[] = [
  { field: "segment", headerName: "Segment", minWidth: 150 },
  { field: "dates", headerName: "Dates", minWidth: 190 },
  { field: "looms", headerName: "Looms", width: 90 },
  numCol("loom_days", "Loom-days", 100, 0),
  numCol("producing_days", "Producing days", 110, 0),
  numCol("eff_days", "Eff days", 90, 0),
  numCol("hours_run", "Hours run", 100),
  numCol("std_coverage_pct", "Std cov %", 95, 0),
  numCol("hours_coverage_pct", "Hours cov %", 100, 0),
  numCol("efficiency_pct", "Eff %", 90),
  numCol("efficiency_at_baseline_std_pct", "Eff @ baseline std %", 140),
  { field: "delta_vs_baseline_text", headerName: "Δ vs baseline", minWidth: 150 },
  { field: "delta_vs_previous_text", headerName: "Δ vs previous", minWidth: 150 },
  { field: "net_vs_control_text", headerName: "Net vs control", width: 115 },
  numCol("se", "SE", 80),
  { field: "verdict_text", headerName: "Verdict", width: 140 },
];

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ minWidth: 88 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {value}
      </Typography>
    </Box>
  );
}

/** Phone cards: one per segment, edge coloured by the row tint. */
function SegmentCards({ rows, thresholdPct }: { rows: LadderRow[]; thresholdPct: number }) {
  const theme = useTheme();
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }} data-testid="ladder-cards">
      {rows.map((r) => {
        const cls = ladderRowClass(r, thresholdPct);
        const edge =
          cls === "report-perf-low"
            ? theme.palette.error.main
            : cls === "report-perf-watch"
              ? theme.palette.warning.main
              : r.is_control
                ? tokens.neutral[500]
                : theme.palette.success.main;
        return (
          <Paper
            key={r.row_id}
            variant="outlined"
            sx={{
              display: "flex",
              overflow: "hidden",
              bgcolor: r.is_control ? tokens.surface.muted : undefined,
            }}
          >
            <Box sx={{ width: 5, flexShrink: 0, bgcolor: edge }} />
            <Box sx={{ p: 1.25, flexGrow: 1, minWidth: 0 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.25 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                  {r.segment}
                </Typography>
                <Box sx={{ flexGrow: 1 }} />
                {r.verdict ? (
                  <Chip size="small" label={r.verdict_text} color={verdictChipColor(r.verdict)} variant="outlined" />
                ) : null}
              </Box>
              <Typography variant="caption" color="text.secondary" component="p">
                {r.dates} · {r.looms} looms · {fmtVal(r.loom_days, 0)} loom-days ·{" "}
                {fmtVal(r.producing_days, 0)} producing · {fmtVal(r.eff_days, 0)} eff days
              </Typography>
              <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mt: 0.5 }}>
                <Metric label="Eff %" value={fmtVal(r.efficiency_pct)} />
                <Metric label="Δ vs baseline" value={r.delta_vs_baseline_text} />
                <Metric label="Δ vs previous" value={r.delta_vs_previous_text} />
                <Metric label="Net vs control" value={r.net_vs_control_text} />
                {r.efficiency_at_baseline_std_pct != null ? (
                  <Metric label="Eff @ baseline std" value={fmtVal(r.efficiency_at_baseline_std_pct)} />
                ) : null}
                <Metric
                  label="Coverage"
                  value={`std ${fmtVal(r.std_coverage_pct, 0)} % · h ${fmtVal(r.hours_coverage_pct, 0)} %`}
                />
                <Metric label="SE" value={fmtVal(r.se)} />
              </Box>
            </Box>
          </Paper>
        );
      })}
    </Box>
  );
}

export default function StageLadder({ segments, thresholdPct, branchId, loading, header }: StageLadderProps) {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down("sm"));
  const rows = React.useMemo(() => ladderRows(segments), [segments]);

  return (
    <Box data-testid="stage-ladder" sx={{ mb: 2 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
        Stage ladder
      </Typography>
      {isPhone ? (
        <SegmentCards rows={rows} thresholdPct={thresholdPct} />
      ) : (
        <TabGrid
          rows={rows}
          columns={columns}
          loading={loading}
          error={null}
          branchId={branchId}
          exportName="loom-modification-impact-ladder"
          header={header}
          height={Math.min(600, 120 + rows.length * 52)}
          getRowClass={(r) => ladderRowClass(r, thresholdPct)}
          isTotalRow={() => false}
        />
      )}
    </Box>
  );
}
