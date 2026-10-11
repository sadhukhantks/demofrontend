"use client";

/**
 * Quality Wise tab — one small chart per quality with its actual kg per
 * frame-shift against its own standard (and target, where entered) over the
 * days, the quality totals for the period, and the day x quality pivot with
 * a measure toggle. On phones both tables are compact sticky-column tables;
 * the pivot keeps every day and scrolls sideways. Purely presentational.
 */

import React from "react";
import { Alert, Box, Stack, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import type { GridColDef } from "@mui/x-data-grid";
import type { ReportExportHeader } from "@/components/reports/exportExcel";
import type { GridSection } from "@/components/reports/gridSections";
import ExportActions from "../../doffAnalysis/_components/ExportActions";
import { SectionCard } from "../../dailyProductionReport/_components/DprPieces";
import type { SpinningTrendData, TrendQualityRow } from "../_service";
import { toGridColumns, type Col } from "../tableColumns";
import {
  actualStdTgtLines,
  PIVOT_MEASURES,
  pivotDayQuality,
  pivotField,
  qualityLines,
  qualitySlots,
  shortDate,
  type PivotMeasure,
  type PivotRow,
} from "../trendRows";
import DataTable from "./DataTable";
import { TrendLineChart } from "./TrendCharts";

type QualityGridRow = TrendQualityRow & { id: number };

const qualityCols: Col<QualityGridRow>[] = [
  { field: "quality", header: "Quality", flex: true, minWidth: 160 },
  { field: "kg", header: "Production (kg)", short: "Kg", num: true, decimals: 0, width: 130 },
  { field: "std_kg", header: "Standard (kg)", short: "Std kg", num: true, decimals: 0, width: 130 },
  { field: "stdc_kg", header: "Std at std count (kg)", num: true, decimals: 0, width: 160, phone: false },
  { field: "tgt_kg", header: "Target (kg)", short: "Tgt kg", num: true, decimals: 0, width: 120, phone: false },
  { field: "gap_kg", header: "Gap to std (kg)", short: "Gap", num: true, decimals: 0, width: 130 },
  { field: "share_pct", header: "Share %", num: true, decimals: 1, width: 90, phone: false },
  { field: "frame_shifts", header: "Frame-shifts", short: "Fr-shifts", num: true, decimals: 0, width: 110 },
  { field: "kg_per_frame_shift", header: "Kg / frame-shift", short: "Kg/fr-shift", num: true, decimals: 1, width: 130 },
  { field: "std_kg_per_frame_shift", header: "Std / frame-shift", short: "Std/fr-shift", num: true, decimals: 1, width: 130 },
  { field: "stdc_kg_per_frame_shift", header: "Std at std count / frame-shift", num: true, decimals: 1, width: 190, phone: false },
  { field: "tgt_kg_per_frame_shift", header: "Target / frame-shift", num: true, decimals: 1, width: 150, phone: false },
  { field: "days", header: "Days", num: true, decimals: 0, width: 70, phone: false },
  { field: "frames", header: "Frames", num: true, decimals: 0, width: 80, phone: false },
  { field: "avg_doff_kg", header: "Avg doff (kg)", num: true, decimals: 2, width: 120, phone: false },
  { field: "gap_share_pct", header: "Share of gap %", num: true, decimals: 1, width: 120, phone: false },
  { field: "std_ach_pct", header: "Actual / std %", num: true, decimals: 1, width: 120, phone: false },
  { field: "std_coverage_pct", header: "Std cover %", num: true, decimals: 1, width: 110, phone: false },
];
const qualityGridCols = toGridColumns(qualityCols);

function pivotCols(dates: string[], decimals: number): Col<PivotRow>[] {
  return [
    { field: "quality", header: "Quality", width: 160 },
    ...dates.map<Col<PivotRow>>((d) => ({
      field: pivotField(d),
      header: shortDate(d),
      description: d,
      num: true,
      decimals,
      width: 80,
    })),
    { field: "total", header: "Period", num: true, decimals, width: 100 },
  ];
}

export default function QualityTab({
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
  const [measure, setMeasure] = React.useState<PivotMeasure>("kg");
  const smallHeight = isPhone ? 190 : 210;
  const hasTgt = data.summary.tgt_kg != null;
  const hasStdc = data.summary.stdc_kg != null;
  const measures = React.useMemo(
    () => PIVOT_MEASURES.filter((m) => (!m.needsTarget || hasTgt) && (!m.needsStdc || hasStdc)),
    [hasTgt, hasStdc],
  );

  const dates = React.useMemo(() => data.days.map((d) => d.date), [data.days]);
  const slots = React.useMemo(() => qualitySlots(data.qualities), [data.qualities]);
  // One small multiple per quality: actual vs standard (and std at std
  // count) vs target.
  const multiples = React.useMemo(() => {
    const actual = qualityLines(dates, data.day_quality, slots, "actual");
    const std = qualityLines(dates, data.day_quality, slots, "std");
    const tgt = qualityLines(dates, data.day_quality, slots, "tgt");
    const stdc = qualityLines(dates, data.day_quality, slots, "stdc");
    return slots.map((s, i) => ({
      slot: s,
      series: actualStdTgtLines(s.label, s.color, actual[i].data, std[i].data, tgt[i].data, stdc[i].data),
      hasStd: std[i].data.some((v) => v != null),
    }));
  }, [dates, data.day_quality, slots]);

  const qualityRows = React.useMemo<QualityGridRow[]>(
    () => data.qualities.map((q, i) => ({ ...q, id: i })),
    [data.qualities],
  );
  const pivotRows = React.useMemo(
    () => pivotDayQuality(dates, data.day_quality, data.qualities, measure),
    [dates, data.day_quality, data.qualities, measure],
  );
  const measureDef = measures.find((m) => m.value === measure) ?? measures[0];
  const pivotColumns = React.useMemo(
    () => pivotCols(dates, measureDef.decimals),
    [dates, measureDef.decimals],
  );
  const pivotGridCols = React.useMemo(() => toGridColumns(pivotColumns), [pivotColumns]);

  if (data.days.length === 0) {
    return <Alert severity="info">No spinning doffs in this range.</Alert>;
  }

  const sections: GridSection[] = [
    { title: "Quality-wise summary", columns: qualityGridCols as GridColDef[], rows: qualityRows },
    {
      title: `Day x quality — ${measureDef.label}`,
      columns: pivotGridCols as GridColDef[],
      rows: pivotRows,
    },
  ];

  return (
    <Stack spacing={isPhone ? 1.5 : 2}>
      <SectionCard
        title="Kg per frame-shift by quality — actual vs standard"
        subtitle={`each quality against its own standard${hasStdc ? " (dash-dot: at the standard count)" : ""}${hasTgt ? " and target" : ""}, per day; a gap is a day it did not run`}
      >
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
            gap: 1.5,
          }}
        >
          {multiples.map((m) => (
            <Box key={m.slot.key} sx={{ minWidth: 0 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                {m.slot.label}
              </Typography>
              <TrendLineChart
                dates={dates}
                series={m.hasStd ? m.series : m.series.slice(0, 1)}
                height={smallHeight}
                unit="kg"
                marks={dates.length <= 31}
              />
            </Box>
          ))}
        </Box>
      </SectionCard>

      <SectionCard title="Quality-wise summary" subtitle="whole period, largest first">
        <DataTable
          cols={qualityCols}
          gridCols={qualityGridCols}
          rows={qualityRows}
          getRowId={(r) => r.id}
          isPhone={isPhone}
          branchId={branchId}
        />
      </SectionCard>

      <SectionCard
        title="Day x quality"
        subtitle={isPhone ? "swipe sideways through the days" : undefined}
      >
        <Box sx={{ display: "flex", justifyContent: { xs: "flex-start", sm: "flex-end" }, mb: 0.75 }}>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={measure}
            onChange={(_, v: PivotMeasure | null) => {
              if (v) setMeasure(v);
            }}
            sx={{ flexWrap: "wrap" }}
          >
            {measures.map((m) => (
              <ToggleButton key={m.value} value={m.value} sx={{ textTransform: "none", px: 1.25 }}>
                {isPhone ? m.short : m.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
        <DataTable
          cols={pivotColumns}
          gridCols={pivotGridCols}
          rows={pivotRows}
          getRowId={(r) => r.id}
          isPhone={isPhone}
          branchId={branchId}
        />
        <Box sx={{ mt: 1 }}>
          <ExportActions sections={sections} fileNamePrefix="SpinningTrend_Quality" header={header} />
        </Box>
      </SectionCard>
    </Stack>
  );
}
