"use client";

/**
 * Frame Wise tab — every frame's kg per frame-shift for the period, ranked,
 * against the fleet average and against the expected figure for the frame's
 * own quality mix (LOW / WATCH / OK as text, with a row tint). The frames
 * the attention rules flagged sit on top as chips; a chip, a tap on a phone
 * row or a double-click on a grid row opens the frame's drill-down (Doff
 * Analysis / Low Producer links). Rows are worst-first. Purely presentational.
 */

import React from "react";
import { Alert, Box, Chip, Stack, Typography } from "@mui/material";
import type { GridColDef } from "@mui/x-data-grid";
import type { ReportExportHeader } from "@/components/reports/exportExcel";
import type { GridSection } from "@/components/reports/gridSections";
import ExportActions from "../../doffAnalysis/_components/ExportActions";
import { SectionCard } from "../../dailyProductionReport/_components/DprPieces";
import type { FrameStatus, SpinningTrendData, TrendFrameRow } from "../_service";
import { SERIES_COLORS } from "../chartPalette";
import { toGridColumns, type Col } from "../tableColumns";
import { fmtKg } from "../trendRows";
import DataTable from "./DataTable";
import type { RowTone } from "./CompactTable";
import type { FrameContext } from "./FrameDrillDialog";
import { RankedBarsChart } from "./TrendCharts";

type FrameGridRow = TrendFrameRow & { id: number; status_label: string; qualities_label: string };

const STATUS_LABEL: Record<FrameStatus, string> = { low: "LOW", watch: "WATCH", ok: "OK" };
const STATUS_CLASS: Record<FrameStatus, string> = {
  low: "report-perf-low",
  watch: "report-perf-watch",
  ok: "",
};
const CHIP_COLOR: Record<FrameStatus, "error" | "warning" | "default"> = {
  low: "error",
  watch: "warning",
  ok: "default",
};

const frameCols: Col<FrameGridRow>[] = [
  { field: "frame", header: "Frame", width: 90 },
  { field: "status_label", header: "Status", width: 80 },
  { field: "kg_per_frame_shift", header: "Kg / frame-shift", short: "Kg/fr-shift", num: true, decimals: 1, width: 130 },
  { field: "expected_kg_per_frame_shift", header: "Expected (quality mix)", short: "Expected", num: true, decimals: 1, width: 160 },
  { field: "vs_peers_pct", header: "vs peers %", num: true, decimals: 1, width: 100 },
  { field: "frame_shifts", header: "Frame-shifts", short: "Fr-shifts", num: true, decimals: 0, width: 110 },
  { field: "kg", header: "Production (kg)", short: "Kg", num: true, decimals: 0, width: 130 },
  { field: "qualities_label", header: "Qualities run", short: "Qualities", flex: true, minWidth: 160 },
  { field: "days", header: "Days", num: true, decimals: 0, width: 70, phone: false },
  { field: "doffs", header: "Doffs", num: true, decimals: 0, width: 80, phone: false },
  { field: "std_kg_per_frame_shift", header: "Std / frame-shift", short: "Std/fr-shift", num: true, decimals: 1, width: 130 },
  { field: "tgt_kg_per_frame_shift", header: "Target / frame-shift", num: true, decimals: 1, width: 150, phone: false },
  { field: "std_kg", header: "Standard (kg)", num: true, decimals: 0, width: 130, phone: false },
  { field: "tgt_kg", header: "Target (kg)", num: true, decimals: 0, width: 120, phone: false },
  { field: "std_ach_pct", header: "Actual / std %", num: true, decimals: 1, width: 120, phone: false },
  { field: "gap_kg", header: "Gap to std (kg)", short: "Gap kg", num: true, decimals: 0, width: 130 },
  { field: "gap_share_pct", header: "Share of gap %", num: true, decimals: 1, width: 120, phone: false },
  { field: "mean_ach_pct", header: "Mean per frame-shift %", num: true, decimals: 1, width: 150, phone: false },
  { field: "ach_sd", header: "Spread (sd)", num: true, decimals: 1, width: 100, phone: false },
];
const frameGridCols = toGridColumns(frameCols);

function tone(row: FrameGridRow): RowTone {
  return row.status === "low" || row.status === "watch" ? row.status : undefined;
}

export default function FrameTab({
  data,
  branchId,
  header,
  isPhone,
  onFrame,
}: {
  data: SpinningTrendData;
  branchId: number;
  header: ReportExportHeader;
  isPhone: boolean;
  onFrame: (ctx: FrameContext) => void;
}) {
  const ranked = React.useMemo(
    () =>
      data.frames
        .filter((f) => f.kg_per_frame_shift != null)
        .map((f) => ({ label: f.frame ?? "?", value: f.kg_per_frame_shift as number }))
        .sort((a, b) => b.value - a.value),
    [data.frames],
  );

  // Worst-first: the frames that pull the average down come to the top.
  const rows = React.useMemo<FrameGridRow[]>(
    () =>
      data.frames
        .map((f, i) => ({
          ...f,
          id: i,
          status_label: f.status ? STATUS_LABEL[f.status] : "",
          qualities_label: f.qualities.join(", "),
        }))
        .sort((a, b) => (a.vs_peers_pct ?? 999) - (b.vs_peers_pct ?? 999)),
    [data.frames],
  );

  const low = rows.filter((r) => r.status === "low").length;
  const watch = rows.filter((r) => r.status === "watch").length;
  const attention = data.loss.attention;

  if (data.frames.length === 0) {
    return <Alert severity="info">No spinning doffs in this range.</Alert>;
  }

  const sections: GridSection[] = [
    { title: "Frame-wise summary", columns: frameGridCols as GridColDef[], rows },
  ];

  return (
    <Stack spacing={isPhone ? 1.5 : 2}>
      <SectionCard
        title="Frames needing attention"
        subtitle={
          attention.length
            ? "biggest gap first — tap a frame for its drill-down into Doff Analysis and Low Producer"
            : "no frame trips the attention rules in this range"
        }
      >
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
          {attention.map((a) => (
            <Chip
              key={a.frame ?? "?"}
              label={`${a.frame}${a.gap_kg != null ? ` · gap ${fmtKg(a.gap_kg)} kg` : a.vs_peers_pct != null ? ` · ${Math.round(a.vs_peers_pct)}% of peers` : ""}`}
              color={a.status ? CHIP_COLOR[a.status] : "default"}
              variant={a.status === "low" ? "filled" : "outlined"}
              size={isPhone ? "small" : "medium"}
              onClick={() => a.frame && onFrame({ frame: a.frame })}
            />
          ))}
        </Box>
      </SectionCard>

      <SectionCard
        title="Frames ranked by kg per frame-shift"
        subtitle={`whole period; fleet average ${fmtKg(data.summary.kg_per_frame_shift, 1)} kg`}
      >
        <RankedBarsChart
          items={ranked}
          average={data.summary.kg_per_frame_shift}
          color={SERIES_COLORS[0]}
          rowHeight={isPhone ? 22 : 26}
        />
      </SectionCard>

      <SectionCard
        title="Frame-wise summary"
        subtitle={`${low} LOW · ${watch} WATCH of ${rows.length} frames, worst first — judged against the expected figure for each frame's own quality mix (LOW below 90 %, WATCH below 97 %). ${isPhone ? "Tap" : "Double-click"} a row to drill down.`}
      >
        <DataTable
          cols={frameCols}
          gridCols={frameGridCols}
          rows={rows}
          getRowId={(r) => r.id}
          isPhone={isPhone}
          branchId={branchId}
          rowTone={tone}
          rowClass={(r) => (r.status ? STATUS_CLASS[r.status] : "")}
          maxRows={15}
          onRowClick={(r) => r.frame && onFrame({ frame: r.frame })}
        />
        <Box sx={{ mt: 1 }}>
          <ExportActions sections={sections} fileNamePrefix="SpinningTrend_Frames" header={header} />
        </Box>
      </SectionCard>

      <Typography variant="caption" color="text.secondary">
        Expected = each quality&apos;s period average kg per frame-shift, weighted by the
        frame-shifts this frame ran on it — so a frame on a coarse count is judged against
        the coarse count, not against the fleet.
      </Typography>
    </Stack>
  );
}
