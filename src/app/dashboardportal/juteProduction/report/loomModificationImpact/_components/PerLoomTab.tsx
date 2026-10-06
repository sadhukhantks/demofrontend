"use client";

/**
 * Section C: per loom — producing / eff days, efficiency % before | after,
 * Δ pts and Δ %, efficiency at baseline standard, standard speed baseline →
 * latest and the S/H/W/D/N flags; the endpoint sends the rows worst first.
 * STUDY TOTAL and CONTROL TOTAL rows are the endpoint's `row_kind` totals.
 * Cards under `sm`.
 */

import React from "react";
import { Box, Chip, Paper, Typography, useMediaQuery, useTheme } from "@mui/material";
import type { GridColDef } from "@mui/x-data-grid";
import { numCol } from "@/components/reports/ReportGrid";
import type { ReportExportHeader } from "@/components/reports/exportExcel";
import { tokens } from "@/styles/tokens";
import type { ImpactPerLoomRow } from "../_service";
import { fmtDate, fmtSigned, fmtSignedPct, fmtVal, flagsText, type WithId, withIds } from "../impactRows";
import TabGrid from "./TabGrid";

type Row = WithId<ImpactPerLoomRow> & { flags_text: string; loom_label: string };

const TOTAL_LABEL: Record<string, string> = {
  study_total: "STUDY TOTAL",
  control_total: "CONTROL TOTAL",
};

function toRows(rows: ImpactPerLoomRow[]): Row[] {
  return withIds(rows).map((r) => ({
    ...r,
    loom_label: r.row_kind === "loom" ? (r.loom ?? "") : (TOTAL_LABEL[r.row_kind] ?? r.row_kind),
    flags_text: flagsText(r.flags, r.in_stage),
  }));
}

const columns: GridColDef<Row>[] = [
  { field: "loom_label", headerName: "Loom", minWidth: 120 },
  {
    field: "line_no",
    headerName: "Line",
    width: 70,
    valueGetter: (_, row) => (row.line_no == null ? "" : String(row.line_no)),
  },
  { field: "speed_band", headerName: "Speed band", width: 100 },
  {
    field: "since_date",
    headerName: "Since",
    width: 100,
    valueGetter: (_, row) => (row.since_date ? fmtDate(row.since_date) : ""),
  },
  numCol("producing_days_before", "Prod days before", 110, 0),
  numCol("producing_days_after", "Prod days after", 110, 0),
  numCol("eff_days_before", "Eff days before", 105, 0),
  numCol("eff_days_after", "Eff days after", 105, 0),
  numCol("eff_before", "Eff % before", 105),
  numCol("eff_after", "Eff % after", 105),
  {
    ...numCol<Row>("delta_pts", "Δ pts", 90),
    valueFormatter: (value: unknown) => (value == null ? "" : fmtSigned(Number(value))),
  },
  {
    ...numCol<Row>("delta_pct", "Δ %", 90, 1),
    valueFormatter: (value: unknown) => (value == null ? "" : fmtSignedPct(Number(value))),
  },
  numCol("eff_baseline_std_before", "Eff @ base std before", 140),
  numCol("eff_baseline_std_after", "Eff @ base std after", 140),
  numCol("std_speed_baseline", "Std speed baseline", 130, 0),
  numCol("std_speed_latest", "Std speed latest", 120, 0),
  { field: "flags_text", headerName: "Flags", width: 110 },
];

function LoomCards({ rows, thresholdPct }: { rows: Row[]; thresholdPct: number }) {
  const theme = useTheme();
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }} data-testid="per-loom-cards">
      {rows.map((r) => {
        const isTotal = r.row_kind !== "loom";
        const bad = r.delta_pct != null && r.delta_pct <= -thresholdPct;
        const good = r.delta_pct != null && r.delta_pct >= thresholdPct;
        const edge = bad
          ? theme.palette.error.main
          : good
            ? theme.palette.success.main
            : tokens.neutral[200];
        return (
          <Paper
            key={r.row_id}
            variant="outlined"
            sx={{ display: "flex", overflow: "hidden", bgcolor: isTotal ? tokens.surface.muted : undefined }}
          >
            <Box sx={{ width: 5, flexShrink: 0, bgcolor: edge }} />
            <Box sx={{ p: 1.25, flexGrow: 1, minWidth: 0 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  {r.loom_label}
                </Typography>
                {r.line_no != null && !isTotal ? (
                  <Typography variant="caption" color="text.secondary">
                    line {String(r.line_no)}
                  </Typography>
                ) : null}
                <Box sx={{ flexGrow: 1 }} />
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 700,
                    color: bad ? "error.main" : good ? "success.main" : "text.primary",
                  }}
                >
                  {fmtSigned(r.delta_pts)} pts ({fmtSignedPct(r.delta_pct)})
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary" component="p">
                eff {fmtVal(r.eff_before)} → {fmtVal(r.eff_after)} %
                {r.eff_baseline_std_before != null || r.eff_baseline_std_after != null
                  ? ` · at baseline std ${fmtVal(r.eff_baseline_std_before)} → ${fmtVal(r.eff_baseline_std_after)} %`
                  : ""}
              </Typography>
              <Typography variant="caption" color="text.secondary" component="p">
                std {fmtVal(r.std_speed_baseline, 0)} → {fmtVal(r.std_speed_latest, 0)} · prod days{" "}
                {fmtVal(r.producing_days_before, 0)} | {fmtVal(r.producing_days_after, 0)} · eff days{" "}
                {fmtVal(r.eff_days_before, 0)} | {fmtVal(r.eff_days_after, 0)}
              </Typography>
              {r.flags_text && r.flags_text !== "—" ? (
                <Box sx={{ display: "flex", gap: 0.5, mt: 0.5, flexWrap: "wrap" }}>
                  {r.flags_text.split(" ").map((f) => (
                    <Chip key={f} size="small" label={f} variant="outlined" color="warning" />
                  ))}
                </Box>
              ) : null}
            </Box>
          </Paper>
        );
      })}
    </Box>
  );
}

export default function PerLoomTab({
  rows,
  thresholdPct,
  branchId,
  loading,
  error,
  header,
}: {
  rows: ImpactPerLoomRow[];
  thresholdPct: number;
  branchId: number | null;
  loading: boolean;
  error: string | null;
  header: ReportExportHeader;
}) {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down("sm"));
  const gridRows = React.useMemo(() => toRows(rows), [rows]);
  if (isPhone) return <LoomCards rows={gridRows} thresholdPct={thresholdPct} />;
  return (
    <TabGrid
      rows={gridRows}
      columns={columns}
      loading={loading}
      error={error}
      branchId={branchId}
      exportName="loom-modification-impact-per-loom"
      header={header}
      getRowClass={(r) =>
        r.row_kind === "loom" && r.delta_pct != null && r.delta_pct <= -thresholdPct
          ? "report-perf-low"
          : r.row_kind === "loom" && !r.in_stage
            ? "lmi-row-excluded"
            : ""
      }
      isTotalRow={(r) => r.row_kind !== "loom"}
    />
  );
}
