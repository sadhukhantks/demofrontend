"use client";

/**
 * Frame Analysis tab — a date range of doffs seen frame-first:
 *   1. average doff weight per quality x shift,
 *   2. the frame x date pivot (each cell is the day's weight normalised by the
 *      number of shifts that ran), with avg / max / min down the side,
 *   3. the drill-down for one frame: its day+shift weights and the doff events
 *      behind them.
 *
 * Pivot rows are scored against same-quality peers on the range average —
 * low performers tint red/amber. Quick filter chips (quality / frame / low
 * only) cut every section client-side. On phones the pivot grid gives way to
 * worst-first frame cards; tapping a card (or double-clicking a grid row)
 * loads the drill-down. Purely presentational: the page owns the fetch.
 */

import React from "react";
import {
  Alert,
  Box,
  Chip,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import type { GridColDef, GridValidRowModel } from "@mui/x-data-grid";
import ReportGrid, { fmtNum, numCol } from "@/components/reports/ReportGrid";
import type { ReportExportHeader } from "@/components/reports/exportExcel";
import type { GridSection } from "@/components/reports/gridSections";
import { SectionCard } from "../../dailyProductionReport/_components/DprPieces";
import {
  withId,
  type FrameAnalysisData,
  type FrameDateShiftRow,
  type FrameDoffEventRow,
  type FramePivotRow,
  type QualityShiftAvgRow,
} from "../doffAnalysisService";
import {
  emptySel,
  matchSel,
  scorePivot,
  type FilterSel,
  type PerfStatus,
} from "../perf";
import ExportActions from "./ExportActions";
import FrameCards, { type FrameCardItem } from "./FrameCards";
import QuickFilters from "./QuickFilters";
import { targetColumns } from "./targetColumns";

type WithId<T> = T & { id: number };
type ScoredPivotRow = FramePivotRow & {
  perf: PerfStatus;
  wt_pct: number | null;
  wt_median: number | null;
};

const PERF_CLASS: Record<PerfStatus, string> = {
  low: "report-perf-low",
  watch: "report-perf-watch",
  ok: "",
};

/** Row of a grid whose columns are built from the data (shift or date keys). */
interface DynamicRow extends GridValidRowModel {
  id: number;
  label: string;
}

const dateShiftColumns: GridColDef<WithId<FrameDateShiftRow>>[] = [
  { field: "date", headerName: "Date", width: 120 },
  { field: "shift", headerName: "Shift", width: 90 },
  numCol("net_wt", "Net Wt (kg)", 130),
  ...targetColumns<WithId<FrameDateShiftRow>>(),
];

const doffEventColumns: GridColDef<WithId<FrameDoffEventRow>>[] = [
  { field: "date", headerName: "Date", width: 120 },
  { field: "shift", headerName: "Shift", width: 80 },
  { field: "eb_label", headerName: "Worker / EB", width: 140 },
  { field: "num_doffs", headerName: "Doffs", type: "number", width: 90 },
  numCol("production", "Production (kg)", 140),
  numCol("avg_doff_wt", "Avg Doff Wt", 130),
  numCol("max_doff", "Max Doff", 110),
  numCol("min_doff", "Min Doff", 110),
];

/** quality x shift average — the server sends it long, the sheet reads it wide. */
function pivotQualityShift(rows: QualityShiftAvgRow[]): {
  rows: DynamicRow[];
  columns: GridColDef<DynamicRow>[];
} {
  const shifts = Array.from(new Set(rows.map((r) => r.shift ?? "—"))).sort();
  const byQuality = new Map<string, DynamicRow>();
  rows.forEach((r) => {
    const label = r.quality_name ?? "—";
    const acc = byQuality.get(label) ?? { id: byQuality.size, label };
    acc[`shift_${r.shift ?? "—"}`] = r.avg_net_wt;
    byQuality.set(label, acc);
  });
  return {
    rows: Array.from(byQuality.values()),
    columns: [
      { field: "label", headerName: "Quality", flex: 1, minWidth: 200 },
      ...shifts.map<GridColDef<DynamicRow>>((s) =>
        numCol(`shift_${s}`, `Shift ${s}`, 120),
      ),
    ],
  };
}

/** Frame pivot columns: status, one per date present in the range, avg/max/min. */
function pivotColumns(
  rows: ScoredPivotRow[],
): GridColDef<WithId<ScoredPivotRow>>[] {
  const dates = Array.from(
    new Set(rows.flatMap((r) => Object.keys(r.per_date ?? {}))),
  ).sort();
  return [
    {
      field: "perf",
      headerName: "Status",
      width: 90,
      valueFormatter: (value: PerfStatus) =>
        value === "low" ? "LOW" : value === "watch" ? "WATCH" : "",
    },
    { field: "frame", headerName: "Frame", width: 110 },
    { field: "quality_name", headerName: "Quality", flex: 1, minWidth: 160 },
    ...dates.map<GridColDef<WithId<ScoredPivotRow>>>((d) => ({
      // Header trimmed to MM-DD so a month of columns still fits; the full date
      // stays in the header tooltip.
      field: `date_${d}`,
      headerName: d.slice(5),
      description: d,
      type: "number",
      width: 85,
      valueGetter: (_, row) => row.per_date?.[d] ?? null,
      valueFormatter: (value: unknown) => fmtNum(value),
    })),
    numCol("avg", "Avg", 100),
    numCol("max", "Max", 100),
    numCol("min", "Min", 100),
  ];
}

const numericAware = new Intl.Collator(undefined, { numeric: true });

function uniqueSorted(values: (string | null)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => v != null && v !== ""))).sort(
    numericAware.compare,
  );
}

export default function FrameAnalysisTab({
  data,
  branchId,
  selectedFrame,
  onSelectFrame,
  header,
}: {
  data: FrameAnalysisData | null;
  branchId: number | null;
  selectedFrame: string | null;
  onSelectFrame: (frame: string | null) => void;
  header: ReportExportHeader;
}) {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down("sm"));
  const [sel, setSel] = React.useState<FilterSel>(emptySel());

  const pivot = React.useMemo(() => data?.frame_pivot ?? [], [data?.frame_pivot]);

  const scored = React.useMemo<ScoredPivotRow[]>(() => {
    const scores = scorePivot(pivot);
    return pivot.map((row, i) => ({
      ...row,
      perf: scores[i].status,
      wt_pct: scores[i].wtPct,
      wt_median: scores[i].wtMedian,
    }));
  }, [pivot]);

  const filteredPivot = React.useMemo(
    () =>
      scored.filter(
        (r) => matchSel(sel, r) && (!sel.lowOnly || r.perf !== "ok"),
      ),
    [scored, sel],
  );

  const filteredQualityShift = React.useMemo(
    () =>
      (data?.quality_shift_avg ?? []).filter(
        (r) =>
          !sel.qualities.length ||
          (r.quality_name != null && sel.qualities.includes(r.quality_name)),
      ),
    [data?.quality_shift_avg, sel.qualities],
  );

  const qualityPivot = React.useMemo(
    () => pivotQualityShift(filteredQualityShift),
    [filteredQualityShift],
  );
  const framePivotCols = React.useMemo(
    () => pivotColumns(filteredPivot),
    [filteredPivot],
  );

  const cards = React.useMemo<FrameCardItem[]>(
    () =>
      filteredPivot.map((r, i) => ({
        key: `${i}`,
        frame: String(r.frame ?? "—"),
        quality: r.quality_name ?? "—",
        status: r.perf,
        wtPct: r.wt_pct,
        avgWt: r.avg,
        wtMedian: r.wt_median,
      })),
    [filteredPivot],
  );

  // Export / print the grids as filtered, plus the open frame's drill-down
  // when one is selected (TKT-000190).
  const sections = React.useMemo<GridSection[]>(() => {
    const out: GridSection[] = [
      { title: "Quality x Shift Average", columns: qualityPivot.columns, rows: qualityPivot.rows },
      { title: "Frame x Date", columns: framePivotCols, rows: withId(filteredPivot) },
    ] as GridSection[];
    const detail = data?.frame_detail;
    if (selectedFrame && detail) {
      out.push(
        {
          title: `Frame ${selectedFrame} - Day and Shift`,
          columns: dateShiftColumns,
          rows: withId(detail.date_shift),
        } as GridSection,
        {
          title: `Frame ${selectedFrame} - Doff Events`,
          columns: doffEventColumns,
          rows: withId(detail.doff_events),
        } as GridSection,
      );
    }
    return out;
  }, [qualityPivot, framePivotCols, filteredPivot, selectedFrame, data?.frame_detail]);

  if (!data) return null;

  if (data.quality_shift_avg.length === 0 && data.frame_pivot.length === 0) {
    return <Alert severity="info">No doffs recorded in this date range.</Alert>;
  }

  const detail = data.frame_detail;

  return (
    <Stack spacing={2}>
      <QuickFilters
        qualities={uniqueSorted(pivot.map((r) => r.quality_name))}
        frames={uniqueSorted(pivot.map((r) => r.frame))}
        sel={sel}
        onChange={setSel}
      />

      <ExportActions
        sections={sections}
        fileNamePrefix="doff-analysis-frames"
        header={{ ...header, reportName: "Doff Analysis — Frame Analysis" }}
        disabled={branchId == null}
      />

      <SectionCard
        title="Quality × Shift Average"
        subtitle="Average doff weight (kg) per quality, by shift"
      >
        <ReportGrid
          rows={qualityPivot.rows}
          columns={qualityPivot.columns}
          getRowId={(r) => r.id}
          loading={false}
          error={null}
          branchId={branchId}
          height={360}
        />
      </SectionCard>

      <SectionCard
        title="Frame × Date"
        subtitle="Each cell is that day's weight divided by the shifts that ran; red/amber rows are below their quality peers"
      >
        {isPhone ? (
          <>
            <Typography
              variant="caption"
              color="text.secondary"
              component="p"
              sx={{ mb: 1 }}
            >
              Worst frames first — tap one for its day-by-day detail.
            </Typography>
            {filteredPivot.length ? (
              <FrameCards items={cards} onTap={(f) => onSelectFrame(f)} />
            ) : (
              <Alert severity="info">No frames match the filters.</Alert>
            )}
          </>
        ) : (
          <>
            <Typography
              variant="caption"
              color="text.secondary"
              component="p"
              sx={{ mb: 1 }}
            >
              Double-click a frame to load its day-by-day detail.
            </Typography>
            <ReportGrid
              rows={withId(filteredPivot)}
              columns={framePivotCols}
              getRowId={(r) => r.id}
              loading={false}
              error={null}
              branchId={branchId}
              height={520}
              sortField="frame"
              getRowClass={(r) => PERF_CLASS[r.perf]}
              onRowDoubleClick={(row) => onSelectFrame(row.frame ?? null)}
            />
          </>
        )}
      </SectionCard>

      {selectedFrame ? (
        <SectionCard
          title={`Frame ${selectedFrame}`}
          subtitle="Day and shift weights, and the doff events behind them"
        >
          <Chip
            label={`Frame ${selectedFrame}`}
            onDelete={() => onSelectFrame(null)}
            size="small"
            sx={{ mb: 1 }}
          />
          {detail ? (
            <Box
              sx={{
                display: "grid",
                gap: 2,
                gridTemplateColumns: {
                  xs: "1fr",
                  md: "minmax(0, 1fr) minmax(0, 2fr)",
                },
              }}
            >
              <ReportGrid
                rows={withId(detail.date_shift)}
                columns={dateShiftColumns}
                getRowId={(r) => r.id}
                loading={false}
                error={null}
                branchId={branchId}
                height={400}
                sortField="date"
              />
              <ReportGrid
                rows={withId(detail.doff_events)}
                columns={doffEventColumns}
                getRowId={(r) => r.id}
                loading={false}
                error={null}
                branchId={branchId}
                height={400}
                sortField="date"
              />
            </Box>
          ) : (
            <Alert severity="info">No doffs for this frame in the range.</Alert>
          )}
        </SectionCard>
      ) : null}
    </Stack>
  );
}
