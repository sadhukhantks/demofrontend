"use client";

/**
 * Daily Trend tab — the period KPIs, production by day (stacked by quality
 * or by shift) with the standard and target drawn as lines on the same kg
 * axis, kg per frame-shift by day as actual vs standard vs target lines, and
 * the day-wise table behind all of it. On phones the DataGrid gives way to
 * a compact sticky-column table with the essential columns. Purely
 * presentational: the page owns the fetch.
 */

import React from "react";
import { Alert, Box, Stack, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import type { GridColDef } from "@mui/x-data-grid";
import type { ReportExportHeader } from "@/components/reports/exportExcel";
import type { GridSection } from "@/components/reports/gridSections";
import ExportActions from "../../doffAnalysis/_components/ExportActions";
import { SectionCard } from "../../dailyProductionReport/_components/DprPieces";
import type { SpinningTrendData, TrendDayRow } from "../_service";
import { SERIES_COLORS, STD_COLOR, STDC_COLOR, TGT_COLOR } from "../chartPalette";
import { toGridColumns, type Col } from "../tableColumns";
import {
  actualStdTgtLines,
  fmtKg,
  qualitySlots,
  stackByQuality,
  stackByShift,
  STDC_LABEL,
  type LineSeries,
} from "../trendRows";
import DataTable from "./DataTable";
import KpiStrip from "./KpiStrip";
import { StackedBarsChart, TrendLineChart } from "./TrendCharts";

type StackMode = "quality" | "shift";

interface DayGridRow extends TrendDayRow {
  id: number;
  shifts_label: string;
}

const dayCols: Col<DayGridRow>[] = [
  { field: "date", header: "Date", width: 110 },
  { field: "weekday", header: "Day", width: 60 },
  { field: "shifts_label", header: "Shifts", width: 80 },
  { field: "frames", header: "Frames", num: true, decimals: 0, width: 80 },
  { field: "frame_shifts", header: "Frame-shifts", short: "Fr-shifts", num: true, decimals: 0, width: 110 },
  { field: "doffs", header: "Doffs", num: true, decimals: 0, width: 80, phone: false },
  { field: "kg", header: "Production (kg)", short: "Kg", num: true, decimals: 0, width: 130 },
  { field: "std_kg", header: "Standard (kg)", short: "Std kg", num: true, decimals: 0, width: 130 },
  { field: "stdc_kg", header: "Std at std count (kg)", num: true, decimals: 0, width: 160, phone: false },
  { field: "tgt_kg", header: "Target (kg)", short: "Tgt kg", num: true, decimals: 0, width: 120, phone: false },
  { field: "gap_kg", header: "Gap to std (kg)", short: "Gap", num: true, decimals: 0, width: 130 },
  { field: "kg_per_frame_shift", header: "Kg / frame-shift", short: "Kg/fr-shift", num: true, decimals: 1, width: 130 },
  { field: "std_kg_per_frame_shift", header: "Std / frame-shift", short: "Std/fr-shift", num: true, decimals: 1, width: 130 },
  { field: "stdc_kg_per_frame_shift", header: "Std at std count / frame-shift", num: true, decimals: 1, width: 190, phone: false },
  { field: "tgt_kg_per_frame_shift", header: "Target / frame-shift", num: true, decimals: 1, width: 150, phone: false },
  { field: "kg_per_frame", header: "Kg / frame (day)", num: true, decimals: 1, width: 130, phone: false },
  { field: "avg_doff_kg", header: "Avg doff (kg)", num: true, decimals: 2, width: 120, phone: false },
  { field: "std_ach_pct", header: "Actual / std %", num: true, decimals: 1, width: 120, phone: false },
  { field: "std_coverage_pct", header: "Std cover %", num: true, decimals: 1, width: 110, phone: false },
];
const dayGridCols = toGridColumns(dayCols);

export default function DailyTrendTab({
  data,
  branchId,
  header,
  isPhone,
}: {
  data: SpinningTrendData;
  branchId: number;
  header: ReportExportHeader;
  isPhone: boolean;
}) {
  const [stackMode, setStackMode] = React.useState<StackMode>("quality");
  const barHeight = isPhone ? 260 : 330;
  const lineHeight = isPhone ? 230 : 300;

  const dates = React.useMemo(() => data.days.map((d) => d.date), [data.days]);
  const slots = React.useMemo(() => qualitySlots(data.qualities), [data.qualities]);
  const stacked = React.useMemo(
    () =>
      stackMode === "quality"
        ? stackByQuality(dates, data.day_quality, slots)
        : stackByShift(dates, data.day_shift),
    [stackMode, dates, data.day_quality, data.day_shift, slots],
  );

  const hasStd = data.summary.std_kg != null;
  const hasTgt = data.summary.tgt_kg != null;
  const hasStdc = data.summary.stdc_kg != null;

  // Standard / std at std count / target production per day, over the
  // stacked actual.
  const dayLines = React.useMemo<LineSeries[]>(() => {
    const out: LineSeries[] = [];
    if (hasStd) {
      out.push({ key: "std", label: "Standard", color: STD_COLOR, data: data.days.map((d) => d.std_kg), dash: "dash" });
    }
    if (hasStdc) {
      out.push({
        key: "stdc",
        label: STDC_LABEL,
        color: STDC_COLOR,
        data: data.days.map((d) => d.stdc_kg ?? null),
        dash: "dashdot",
      });
    }
    if (hasTgt) {
      out.push({ key: "tgt", label: "Target", color: TGT_COLOR, data: data.days.map((d) => d.tgt_kg ?? null), dash: "dot" });
    }
    return out;
  }, [data.days, hasStd, hasStdc, hasTgt]);

  const kpfsLines = React.useMemo(
    () =>
      actualStdTgtLines(
        "Kg per frame-shift",
        SERIES_COLORS[0],
        data.days.map((d) => d.kg_per_frame_shift),
        data.days.map((d) => d.std_kg_per_frame_shift ?? null),
        data.days.map((d) => d.tgt_kg_per_frame_shift ?? null),
        data.days.map((d) => d.stdc_kg_per_frame_shift ?? null),
      ),
    [data.days],
  );

  const rows = React.useMemo<DayGridRow[]>(
    () =>
      data.days.map((d, i) => ({
        ...d,
        id: i,
        shifts_label: d.shifts.join(" "),
      })),
    [data.days],
  );

  const sections: GridSection[] = [
    { title: "Day-wise summary", columns: dayGridCols as GridColDef[], rows },
  ];

  if (data.days.length === 0) {
    return <Alert severity="info">No spinning doffs in this range.</Alert>;
  }

  return (
    <Stack spacing={isPhone ? 1.5 : 2}>
      <KpiStrip summary={data.summary} />

      <SectionCard
        title="Production by day — actual vs standard"
        subtitle={`${stackMode === "quality" ? "kg per day stacked by yarn quality (largest first)" : "kg per day stacked by shift"}${hasStd ? "; standard dashed" : ""}${hasStdc ? ", std at std count dash-dot" : ""}${hasTgt ? ", target dotted" : ""}`}
      >
        <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 0.5 }}>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={stackMode}
            onChange={(_, v: StackMode | null) => {
              if (v) setStackMode(v);
            }}
          >
            <ToggleButton value="quality" sx={{ textTransform: "none", px: 1.5 }}>
              By quality
            </ToggleButton>
            <ToggleButton value="shift" sx={{ textTransform: "none", px: 1.5 }}>
              By shift
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
        <StackedBarsChart chart={stacked} height={barHeight} lines={dayLines} />
      </SectionCard>

      <SectionCard
        title="Kg per frame-shift by day — actual vs standard"
        subtitle={`production ÷ frame-shifts run; period actual ${fmtKg(data.summary.kg_per_frame_shift, 1)} kg${hasStd ? ` vs standard ${fmtKg(data.summary.std_kg_per_frame_shift, 1)} kg` : ""}${hasStdc ? ` (${fmtKg(data.summary.stdc_kg_per_frame_shift, 1)} kg at std count)` : ""}${hasTgt ? ` vs target ${fmtKg(data.summary.tgt_kg_per_frame_shift, 1)} kg` : ""}`}
      >
        <TrendLineChart dates={dates} series={hasStd ? kpfsLines : kpfsLines.slice(0, 1)} height={lineHeight} unit="kg" />
      </SectionCard>

      <SectionCard
        title="Day-wise summary"
        subtitle={isPhone ? "swipe sideways for more columns; the exports carry every column" : undefined}
      >
        <DataTable
          cols={dayCols}
          gridCols={dayGridCols}
          rows={rows}
          getRowId={(r) => r.id}
          isPhone={isPhone}
          branchId={branchId}
          maxRows={14}
        />
        <Box sx={{ mt: 1 }}>
          <ExportActions sections={sections} fileNamePrefix="SpinningTrend_Daily" header={header} />
        </Box>
      </SectionCard>

      <Typography variant="caption" color="text.secondary">
        Kg per frame-shift = production ÷ (frames × shifts they ran). Standard = the Spinning
        Production grid&apos;s Std Prod of the frame-shifts that have Spinning Standards and an
        SQC count; target = the same at the yarn&apos;s target efficiency, shown only where that
        has been entered. Std at std count = the standard recomputed with the yarn&apos;s standard
        count (Yarn master) in place of the day&apos;s SQC count — the standard line itself follows
        the count actually spun.
      </Typography>
    </Stack>
  );
}
