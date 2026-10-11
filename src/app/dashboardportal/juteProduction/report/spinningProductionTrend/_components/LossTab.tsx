"use client";

/**
 * Loss Analysis tab — where the gap to standard sits. Reads in this order:
 *   1. the bridge: capacity at standard -> frames that never ran -> shifts not
 *      run -> standard of what ran -> below standard while running -> actual;
 *   2. the shape of the efficiency gap (achievement histogram), then its cuts
 *      by shift, weekday, quality, frame (Pareto), spinner and hands type;
 *   3. the actionable lists: short frame-shifts (time-lost proxy) and the
 *      worst frame-shifts, and the frame x day achievement grid.
 * Every figure is a roll-up of the same rows and targets as the other tabs,
 * under the same global filters. Purely presentational.
 */

import React from "react";
import { Alert, Box, Stack, Typography } from "@mui/material";
import type { GridColDef } from "@mui/x-data-grid";
import type { ReportExportHeader } from "@/components/reports/exportExcel";
import type { GridSection } from "@/components/reports/gridSections";
import ExportActions from "../../doffAnalysis/_components/ExportActions";
import { KpiCard, SectionCard } from "../../dailyProductionReport/_components/DprPieces";
import type {
  AttentionRow,
  LossHandsRow,
  LossShiftRow,
  LossSpinnerRow,
  LossWeekdayRow,
  ShortFrameShiftRow,
  SpinningTrendData,
  TrendFrameRow,
  TrendQualityRow,
  WorstFrameShiftRow,
} from "../_service";
import { SERIES_COLORS, SHIFT_LABEL, SHIFT_ORDER } from "../chartPalette";
import { toGridColumns, type Col } from "../tableColumns";
import { actualStdTgtLines, fmtKg, vsStdState, type LineSeries } from "../trendRows";
import AchHeatmap from "./AchHeatmap";
import DataTable from "./DataTable";
import type { RowTone } from "./CompactTable";
import type { FrameContext } from "./FrameDrillDialog";
import { ActualVsStdScatter, BridgeChart, RankedBarsChart, TrendLineChart } from "./TrendCharts";

type WithId<T> = T & { id: number };

function withId<T>(rows: T[]): WithId<T>[] {
  return rows.map((r, i) => ({ ...r, id: i }));
}

const cutCols = <T extends WithId<LossShiftRow | LossWeekdayRow | LossHandsRow | LossSpinnerRow>>(
  first: Col<T>,
): Col<T>[] => [
  first,
  { field: "frame_shifts", header: "Frame-shifts", short: "Fr-shifts", num: true, decimals: 0, width: 110 },
  { field: "kg", header: "Production (kg)", short: "Kg", num: true, decimals: 0, width: 130 },
  { field: "kg_per_frame_shift", header: "Kg / frame-shift", short: "Kg/fr-shift", num: true, decimals: 1, width: 130 },
  { field: "std_kg_per_frame_shift", header: "Std / frame-shift", short: "Std/fr-shift", num: true, decimals: 1, width: 130 },
  { field: "stdc_kg_per_frame_shift", header: "Std at std count / frame-shift", num: true, decimals: 1, width: 190, phone: false },
  { field: "tgt_kg_per_frame_shift", header: "Target / frame-shift", num: true, decimals: 1, width: 150, phone: false },
  { field: "std_kg", header: "Standard (kg)", short: "Std kg", num: true, decimals: 0, width: 130 },
  { field: "stdc_kg", header: "Std at std count (kg)", num: true, decimals: 0, width: 160, phone: false },
  { field: "tgt_kg", header: "Target (kg)", num: true, decimals: 0, width: 120, phone: false },
  { field: "gap_kg", header: "Gap (kg)", num: true, decimals: 0, width: 100 },
  { field: "gap_share_pct", header: "Share of gap %", short: "Gap %", num: true, decimals: 1, width: 120 },
  { field: "std_ach_pct", header: "Actual / std %", num: true, decimals: 1, width: 120, phone: false },
  { field: "days", header: "Days", num: true, decimals: 0, width: 70, phone: false },
  { field: "frames", header: "Frames", num: true, decimals: 0, width: 80, phone: false },
];

const shiftCols = cutCols<WithId<LossShiftRow>>({ field: "shift", header: "Shift", width: 80 });
const weekdayCols = cutCols<WithId<LossWeekdayRow>>({ field: "weekday", header: "Day", width: 80 });
const handsCols = cutCols<WithId<LossHandsRow>>({
  field: "kind",
  header: "Hands",
  width: 100,
  value: (r) => (r.kind === "contract" ? "Contract" : "Regular"),
});
const spinnerCols = cutCols<WithId<LossSpinnerRow>>({ field: "spinner", header: "Spinner", width: 110 });

type QualityGapRow = WithId<TrendQualityRow>;
const qualityCols: Col<QualityGapRow>[] = [
  { field: "quality", header: "Quality", flex: true, minWidth: 150 },
  { field: "frame_shifts", header: "Frame-shifts", short: "Fr-shifts", num: true, decimals: 0, width: 110, phone: false },
  { field: "kg", header: "Production (kg)", short: "Kg", num: true, decimals: 0, width: 130 },
  { field: "std_kg", header: "Standard (kg)", short: "Std kg", num: true, decimals: 0, width: 130 },
  { field: "tgt_kg", header: "Target (kg)", num: true, decimals: 0, width: 120, phone: false },
  { field: "gap_kg", header: "Gap (kg)", num: true, decimals: 0, width: 100 },
  { field: "gap_share_pct", header: "Share of gap %", short: "Gap %", num: true, decimals: 1, width: 120 },
  { field: "kg_per_frame_shift", header: "Kg / frame-shift", short: "Kg/fr-shift", num: true, decimals: 1, width: 130, phone: false },
  { field: "std_kg_per_frame_shift", header: "Std / frame-shift", short: "Std/fr-shift", num: true, decimals: 1, width: 130, phone: false },
  { field: "std_ach_pct", header: "Actual / std %", num: true, decimals: 1, width: 120, phone: false },
];

type ParetoRow = WithId<TrendFrameRow> & { cum_share_pct: number | null };
const paretoCols: Col<ParetoRow>[] = [
  { field: "frame", header: "Frame", width: 90 },
  { field: "gap_kg", header: "Gap (kg)", num: true, decimals: 0, width: 100 },
  { field: "gap_share_pct", header: "Share of gap %", short: "Gap %", num: true, decimals: 1, width: 120 },
  { field: "cum_share_pct", header: "Cumulative %", short: "Cum %", num: true, decimals: 1, width: 110 },
  { field: "kg_per_frame_shift", header: "Kg / frame-shift", short: "Kg/fr-shift", num: true, decimals: 1, width: 130 },
  { field: "std_kg_per_frame_shift", header: "Std / frame-shift", short: "Std/fr-shift", num: true, decimals: 1, width: 130 },
  { field: "std_ach_pct", header: "Actual / std %", num: true, decimals: 1, width: 120, phone: false },
  { field: "mean_ach_pct", header: "Mean per frame-shift %", short: "Mean %", num: true, decimals: 1, width: 150, phone: false },
  { field: "ach_sd", header: "Spread (sd)", short: "Sd", num: true, decimals: 1, width: 100, phone: false },
  { field: "frame_shifts", header: "Frame-shifts", short: "Fr-shifts", num: true, decimals: 0, width: 110 },
  { field: "kg", header: "Production (kg)", short: "Kg", num: true, decimals: 0, width: 130, phone: false },
  { field: "qualities_label", header: "Qualities run", short: "Qualities", flex: true, minWidth: 150, value: (r) => r.qualities.join(", ") },
];

const shortCols: Col<WithId<ShortFrameShiftRow>>[] = [
  { field: "date", header: "Date", width: 110 },
  { field: "shift", header: "Shift", width: 70 },
  { field: "frame", header: "Frame", width: 90 },
  { field: "doffs", header: "Doffs", num: true, decimals: 0, width: 80 },
  { field: "median_doffs", header: "Frame's usual", short: "Usual", num: true, decimals: 0, width: 120 },
  { field: "kg", header: "Production (kg)", short: "Kg", num: true, decimals: 0, width: 130 },
  { field: "std_kg", header: "Standard (kg)", short: "Std kg", num: true, decimals: 0, width: 130 },
  { field: "tgt_kg", header: "Target (kg)", num: true, decimals: 0, width: 120, phone: false },
  { field: "gap_kg", header: "Gap (kg)", num: true, decimals: 0, width: 100 },
  { field: "ach_pct", header: "Actual / std %", num: true, decimals: 1, width: 120, phone: false },
];

const worstCols: Col<WithId<WorstFrameShiftRow>>[] = [
  { field: "date", header: "Date", width: 110 },
  { field: "shift", header: "Shift", width: 70 },
  { field: "frame", header: "Frame", width: 90 },
  { field: "spinner", header: "Spinner", width: 110 },
  { field: "qualities", header: "Quality", flex: true, minWidth: 140, phone: false },
  { field: "doffs", header: "Doffs", num: true, decimals: 0, width: 80 },
  { field: "kg", header: "Production (kg)", short: "Kg", num: true, decimals: 0, width: 130 },
  { field: "std_kg", header: "Standard (kg)", short: "Std kg", num: true, decimals: 0, width: 130 },
  { field: "tgt_kg", header: "Target (kg)", num: true, decimals: 0, width: 120, phone: false },
  { field: "gap_kg", header: "Gap (kg)", num: true, decimals: 0, width: 100 },
  { field: "ach_pct", header: "Actual / std %", num: true, decimals: 1, width: 120, phone: false },
];

type AttentionGridRow = WithId<AttentionRow> & { status_label: string; reasons_label: string };
const attentionCols: Col<AttentionGridRow>[] = [
  { field: "frame", header: "Frame", width: 90 },
  { field: "status_label", header: "vs peers", width: 90 },
  { field: "gap_kg", header: "Gap (kg)", num: true, decimals: 0, width: 100 },
  { field: "gap_share_pct", header: "Share of gap %", short: "Gap %", num: true, decimals: 1, width: 120, phone: false },
  { field: "kg_per_frame_shift", header: "Kg / frame-shift", short: "Kg/fr-shift", num: true, decimals: 1, width: 130 },
  { field: "std_kg_per_frame_shift", header: "Std / frame-shift", short: "Std/fr-shift", num: true, decimals: 1, width: 130 },
  { field: "std_ach_pct", header: "Actual / std %", num: true, decimals: 1, width: 120, phone: false },
  { field: "mean_ach_pct", header: "Mean per frame-shift %", short: "Mean %", num: true, decimals: 1, width: 150, phone: false },
  { field: "ach_sd", header: "Spread (sd)", short: "Sd", num: true, decimals: 1, width: 100, phone: false },
  { field: "short_count", header: "Short shifts", short: "Short", num: true, decimals: 0, width: 110 },
  { field: "worst_count", header: "In worst list", short: "Worst", num: true, decimals: 0, width: 110 },
  { field: "reasons_label", header: "Why", flex: true, minWidth: 320 },
];
const STATUS_TEXT: Record<string, string> = { low: "LOW", watch: "WATCH", ok: "OK" };
const STATUS_CLASS: Record<string, string> = { low: "report-perf-low", watch: "report-perf-watch" };
function attentionTone(row: AttentionGridRow): RowTone {
  return row.status === "low" || row.status === "watch" ? row.status : undefined;
}

const grid = {
  attention: toGridColumns(attentionCols),
  shift: toGridColumns(shiftCols),
  weekday: toGridColumns(weekdayCols),
  hands: toGridColumns(handsCols),
  spinner: toGridColumns(spinnerCols),
  quality: toGridColumns(qualityCols),
  pareto: toGridColumns(paretoCols),
  short: toGridColumns(shortCols),
  worst: toGridColumns(worstCols),
};

export default function LossTab({
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
  /** Drill into a frame (optionally one frame-shift of it). */
  onFrame: (ctx: FrameContext) => void;
}) {
  const loss = data.loss;
  const s = data.summary;
  const chartHeight = isPhone ? 220 : 280;

  const dates = React.useMemo(() => data.days.map((d) => d.date), [data.days]);
  // One small multiple per shift: actual vs standard vs target kg per frame-shift.
  const shiftMultiples = React.useMemo<{ shift: string; label: string; series: LineSeries[]; hasStd: boolean }[]>(() => {
    const present = SHIFT_ORDER.filter((sh) => data.day_shift.some((r) => r.shift === sh));
    const idx = new Map(dates.map((d, i) => [d, i]));
    return present.map((sh) => {
      const actual: (number | null)[] = dates.map(() => null);
      const std: (number | null)[] = dates.map(() => null);
      const tgt: (number | null)[] = dates.map(() => null);
      const stdc: (number | null)[] = dates.map(() => null);
      data.day_shift
        .filter((r) => r.shift === sh)
        .forEach((r) => {
          const i = idx.get(r.date);
          if (i == null) return;
          actual[i] = r.kg_per_frame_shift;
          std[i] = r.std_kg_per_frame_shift ?? null;
          tgt[i] = r.tgt_kg_per_frame_shift ?? null;
          stdc[i] = r.stdc_kg_per_frame_shift ?? null;
        });
      const label = SHIFT_LABEL[sh] ?? sh;
      return {
        shift: sh,
        label,
        series: actualStdTgtLines(label, SERIES_COLORS[SHIFT_ORDER.indexOf(sh)], actual, std, tgt, stdc),
        hasStd: std.some((v) => v != null),
      };
    });
  }, [data.day_shift, dates]);

  const shiftRows = React.useMemo(() => withId(loss.by_shift), [loss.by_shift]);
  const weekdayRows = React.useMemo(() => withId(loss.by_weekday), [loss.by_weekday]);
  const handsRows = React.useMemo(() => withId(loss.hands), [loss.hands]);
  const spinnerRows = React.useMemo(() => withId(loss.spinners), [loss.spinners]);
  const qualityRows = React.useMemo<QualityGapRow[]>(
    () =>
      withId(
        [...data.qualities]
          .filter((q) => q.gap_kg != null)
          .sort((a, b) => (b.gap_kg ?? 0) - (a.gap_kg ?? 0)),
      ),
    [data.qualities],
  );
  const paretoRows = React.useMemo<ParetoRow[]>(() => {
    const sorted = [...data.frames]
      .filter((f) => f.gap_kg != null)
      .sort((a, b) => (b.gap_kg ?? 0) - (a.gap_kg ?? 0));
    let cum = 0;
    return sorted.map((f, i) => {
      cum += f.gap_share_pct ?? 0;
      return { ...f, id: i, cum_share_pct: Math.round(cum * 10) / 10 };
    });
  }, [data.frames]);
  const attentionRows = React.useMemo<AttentionGridRow[]>(
    () =>
      loss.attention.map((a, i) => ({
        ...a,
        id: i,
        status_label: a.status ? STATUS_TEXT[a.status] : "",
        reasons_label: a.reasons.join("; "),
      })),
    [loss.attention],
  );
  const shortRows = React.useMemo(() => withId(loss.short_frame_shifts.rows), [loss.short_frame_shifts.rows]);
  const worstRows = React.useMemo(() => withId(loss.worst_frame_shifts), [loss.worst_frame_shifts]);

  if (data.days.length === 0) {
    return <Alert severity="info">No spinning doffs in this range.</Alert>;
  }
  if (loss.gap_kg == null) {
    return (
      <Alert severity="info">
        No Spinning Standards cover this range, so there is no standard to measure the loss
        against. Enter standards (speed, spindles, TPI, efficiency) and the day&apos;s SQC count
        to enable this tab.
      </Alert>
    );
  }

  const bridge = loss.bridge;
  const step = (key: string) => bridge?.steps.find((x) => x.step === key)?.kg ?? null;
  const top5 = paretoRows.slice(0, 5);
  const top5Share = top5.reduce((acc, r) => acc + (r.gap_share_pct ?? 0), 0);
  const below50 = loss.ach_histogram
    .filter((b) => ["<30", "30-40", "40-50"].includes(b.band))
    .reduce((acc, b) => acc + b.frame_shifts, 0);
  const contract = loss.hands.find((h) => h.kind === "contract");
  const regular = loss.hands.find((h) => h.kind === "regular");

  const sections: GridSection[] = [
    { title: "Frames needing attention", columns: grid.attention as GridColDef[], rows: attentionRows },
    { title: "Gap by shift", columns: grid.shift as GridColDef[], rows: shiftRows },
    { title: "Gap by weekday", columns: grid.weekday as GridColDef[], rows: weekdayRows },
    { title: "Gap by quality", columns: grid.quality as GridColDef[], rows: qualityRows },
    { title: "Gap by frame", columns: grid.pareto as GridColDef[], rows: paretoRows },
    { title: "Regular vs contract hands", columns: grid.hands as GridColDef[], rows: handsRows },
    { title: "Spinners by gap", columns: grid.spinner as GridColDef[], rows: spinnerRows },
    { title: "Short frame-shifts", columns: grid.short as GridColDef[], rows: shortRows },
    { title: "Worst frame-shifts", columns: grid.worst as GridColDef[], rows: worstRows },
  ];

  return (
    <Stack spacing={isPhone ? 1.5 : 2}>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
        <KpiCard
          label="Gap to standard"
          value={`${fmtKg(loss.gap_kg)} kg`}
          sub={`standard ${fmtKg(s.std_kg)} · actual ${fmtKg(s.production_kg)} kg`}
          state={vsStdState(s.production_kg, s.std_kg)}
        />
        <KpiCard
          label="Per frame-shift"
          value={`${fmtKg(s.kg_per_frame_shift, 1)} vs ${fmtKg(s.std_kg_per_frame_shift, 1)} kg`}
          sub={`actual vs standard${s.tgt_kg_per_frame_shift != null ? ` · target ${fmtKg(s.tgt_kg_per_frame_shift, 1)}` : ""}`}
          state={vsStdState(s.kg_per_frame_shift, s.std_kg_per_frame_shift)}
        />
        {bridge ? (
          <>
            <KpiCard
              label="Capacity used"
              value={`${fmtKg(bridge.utilization_pct, 1)}%`}
              sub={`${bridge.frames_ran} of ${bridge.installed_frames} frames · ${fmtKg(bridge.run_frame_shifts)} of ${fmtKg(bridge.capacity_frame_shifts)} frame-shifts`}
              state={bridge.utilization_pct != null && bridge.utilization_pct < 70 ? "bad" : undefined}
            />
            <KpiCard
              label="Lost: frames never ran"
              value={`${fmtKg(step("idle_frames"))} kg`}
              sub={`${bridge.installed_frames - bridge.frames_ran} frames idle all period (est.)`}
            />
            <KpiCard
              label="Lost: shifts not run"
              value={`${fmtKg(step("idle_shifts"))} kg`}
              sub={`${fmtKg(bridge.idle_shift_frame_shifts)} frame-shifts (est.)`}
            />
            <KpiCard
              label="Lost: below standard"
              value={`${fmtKg(step("efficiency"))} kg`}
              sub="while frames were running"
              state="bad"
            />
          </>
        ) : null}
        <KpiCard
          label="Frame-shifts far below standard"
          value={`${below50}`}
          sub={`under half their standard · median frame-shift at ${fmtKg(loss.median_ach_pct, 0)}% of standard`}
          state={below50 > 0 ? "warn" : undefined}
        />
        <KpiCard
          label="Short frame-shifts"
          value={`${loss.short_frame_shifts.count}`}
          sub={`${fmtKg(loss.short_frame_shifts.share_pct, 1)}% of frame-shifts · ${fmtKg(loss.short_frame_shifts.gap_kg)} kg gap`}
          state={loss.short_frame_shifts.share_pct != null && loss.short_frame_shifts.share_pct > 10 ? "warn" : undefined}
        />
        {contract && regular ? (
          <KpiCard
            label="Contract vs regular hands"
            value={`${fmtKg(contract.kg_per_frame_shift, 0)} vs ${fmtKg(regular.kg_per_frame_shift, 0)} kg`}
            sub={`per frame-shift · contract worked ${contract.frame_shifts} frame-shifts`}
            state={
              contract.kg_per_frame_shift != null &&
              regular.kg_per_frame_shift != null &&
              contract.kg_per_frame_shift < 0.9 * regular.kg_per_frame_shift
                ? "warn"
                : undefined
            }
          />
        ) : null}
      </Box>

      <SectionCard
        title="Frames needing attention"
        subtitle={
          attentionRows.length
            ? `${attentionRows.length} of ${data.frames.length} frames trip a rule — biggest gap first. ${isPhone ? "Tap" : "Double-click"} a row to drill into Doff Analysis / Low Producer.`
            : "no frame trips the attention rules in this range"
        }
      >
        {attentionRows.length ? (
          <DataTable
            cols={attentionCols}
            gridCols={grid.attention}
            rows={attentionRows}
            getRowId={(r) => r.id}
            isPhone={isPhone}
            branchId={branchId}
            rowTone={attentionTone}
            rowClass={(r) => (r.status ? STATUS_CLASS[r.status] ?? "" : "")}
            maxRows={10}
            onRowClick={(r) => r.frame && onFrame({ frame: r.frame })}
          />
        ) : null}
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }}>
          Rules: LOW / WATCH vs same-quality peers; mean achievement 10+ points under the fleet
          median; achievement swinging 15+ points between frame-shifts; 2+ short frame-shifts;
          2+ appearances in the worst list.
        </Typography>
      </SectionCard>

      {bridge ? (
        <SectionCard
          title="Where the period's capacity went"
          subtitle={`${bridge.installed_frames} installed frames × ${bridge.producing_days} producing days × ${bridge.shifts_per_day} shifts at ${fmtKg(bridge.std_per_frame_shift, 0)} kg standard per frame-shift`}
        >
          <BridgeChart steps={bridge.steps} rowHeight={isPhone ? 28 : 32} />
          <Typography variant="caption" color="text.secondary">
            Idle frame-shifts are costed at the period&apos;s average standard; idle time includes
            planned stops (Sundays, frames not commissioned) — the report cannot tell those from
            breakdowns. Add a quality filter and this bridge is hidden, since frames are not
            dedicated to a quality.
          </Typography>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Every frame-shift: actual vs standard"
        subtitle={`${loss.frame_shift_points.length} frame-shifts with a standard; one dot each, coloured by shift. On the dotted diagonal a frame-shift met its standard; the drop below it is the kg short. A cloud sitting below the line as a whole is a systemic gap (standards, speed, hands); a few stragglers are specific frame-shifts.`}
      >
        <ActualVsStdScatter points={loss.frame_shift_points} height={isPhone ? 300 : 380} />
      </SectionCard>

      <SectionCard title="By shift — actual vs standard" subtitle="kg per frame-shift per shift, by day; standard dashed, target dotted where entered">
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" }, gap: 1.5 }}>
          {shiftMultiples.map((m) => (
            <Box key={m.shift} sx={{ minWidth: 0 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                {m.label}
              </Typography>
              <TrendLineChart dates={dates} series={m.hasStd ? m.series : m.series.slice(0, 1)} height={isPhone ? 190 : 210} unit="kg" marks={dates.length <= 31} />
            </Box>
          ))}
        </Box>
        <Box sx={{ mt: 1 }}>
          <DataTable cols={shiftCols} gridCols={grid.shift} rows={shiftRows} getRowId={(r) => r.id} isPhone={isPhone} branchId={branchId} />
        </Box>
      </SectionCard>

      <SectionCard title="By weekday" subtitle="the same days of the week across the period">
        <DataTable cols={weekdayCols} gridCols={grid.weekday} rows={weekdayRows} getRowId={(r) => r.id} isPhone={isPhone} branchId={branchId} />
      </SectionCard>

      <SectionCard title="By quality" subtitle="gap to standard in kg, largest first — a low % on one quality points at its standards or its frames">
        <RankedBarsChart
          items={qualityRows.map((q) => ({ label: q.quality, value: q.gap_kg ?? 0 }))}
          color={SERIES_COLORS[1]}
          rowHeight={isPhone ? 24 : 28}
          decimals={0}
          labelWidth={isPhone ? 96 : 130}
        />
        <Box sx={{ mt: 1 }}>
          <DataTable cols={qualityCols} gridCols={grid.quality} rows={qualityRows} getRowId={(r) => r.id} isPhone={isPhone} branchId={branchId} />
        </Box>
      </SectionCard>

      <SectionCard
        title="By frame (Pareto)"
        subtitle={`the ${top5.length} worst frames carry ${fmtKg(top5Share, 0)}% of the gap — a share near ${fmtKg((top5.length / Math.max(1, paretoRows.length)) * 100, 0)}% would mean the loss is spread evenly`}
      >
        <RankedBarsChart
          items={paretoRows.map((f) => ({ label: f.frame ?? "?", value: f.gap_kg ?? 0 }))}
          color={SERIES_COLORS[1]}
          rowHeight={isPhone ? 20 : 24}
          decimals={0}
        />
        <Box sx={{ mt: 1 }}>
          <DataTable
            cols={paretoCols}
            gridCols={grid.pareto}
            rows={paretoRows}
            getRowId={(r) => r.id}
            isPhone={isPhone}
            branchId={branchId}
            maxRows={15}
            onRowClick={(r) => r.frame && onFrame({ frame: r.frame })}
          />
        </Box>
      </SectionCard>

      <SectionCard title="Hands" subtitle={`regular vs contract, and the ${loss.spinners.length} of ${loss.spinner_count} spinners with the largest gap`}>
        <DataTable cols={handsCols} gridCols={grid.hands} rows={handsRows} getRowId={(r) => r.id} isPhone={isPhone} branchId={branchId} />
        <Box sx={{ mt: 1 }}>
          <DataTable cols={spinnerCols} gridCols={grid.spinner} rows={spinnerRows} getRowId={(r) => r.id} isPhone={isPhone} branchId={branchId} />
        </Box>
      </SectionCard>

      <SectionCard
        title="Short frame-shifts (time lost while allotted)"
        subtitle={`${loss.short_frame_shifts.count} frame-shifts with ${loss.short_frame_shifts.rule} — spinning has no stoppage entries, so this is the proxy for a frame that stood for part of its shift`}
      >
        {shortRows.length ? (
          <DataTable
            cols={shortCols}
            gridCols={grid.short}
            rows={shortRows}
            getRowId={(r) => r.id}
            isPhone={isPhone}
            branchId={branchId}
            onRowClick={(r) => r.frame && onFrame({ frame: r.frame, date: r.date, shift: r.shift })}
          />
        ) : (
          <Typography variant="body2" color="text.secondary">
            None in this range.
          </Typography>
        )}
      </SectionCard>

      <SectionCard title="Worst frame-shifts" subtitle={`the frame-shifts furthest below standard — ${isPhone ? "tap" : "double-click"} one to open that day's doffs or the spinner's record`}>
        <DataTable
          cols={worstCols}
          gridCols={grid.worst}
          rows={worstRows}
          getRowId={(r) => r.id}
          isPhone={isPhone}
          branchId={branchId}
          maxRows={15}
          onRowClick={(r) => r.frame && onFrame({ frame: r.frame, date: r.date, shift: r.shift })}
        />
        <Box sx={{ mt: 1 }}>
          <ExportActions sections={sections} fileNamePrefix="SpinningTrend_Loss" header={header} />
        </Box>
      </SectionCard>

      <SectionCard
        title="Frame × day: actual minus standard (kg)"
        subtitle="largest shortfall first · each cell is the day's kg against the frame's standard, coloured by how far it is relative to that standard · a red row is a persistent frame problem, a red column a bad day"
      >
        <AchHeatmap dates={loss.heat.dates} frames={loss.heat.frames} onFrame={(f) => onFrame({ frame: f })} />
      </SectionCard>
    </Stack>
  );
}
