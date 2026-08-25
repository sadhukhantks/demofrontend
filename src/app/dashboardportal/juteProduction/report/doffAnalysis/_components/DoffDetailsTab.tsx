"use client";

/**
 * Doff Details tab — one production date, four views of the same doffs:
 * summary per spell+frame, the spell totals, the fixed 2 kg weight bands
 * (frames counted per band, broken up by spell) and the raw doff list.
 *
 * Every section reacts to the quick filter chips (client-side, no refetch),
 * and each summary row is scored against its quality+spell peers — low
 * performers tint red/amber. On phones the summary grid gives way to
 * worst-first frame cards. Purely presentational: the page owns the fetch.
 */

import React from "react";
import { Alert, Box, Stack, useMediaQuery, useTheme } from "@mui/material";
import type { GridColDef } from "@mui/x-data-grid";
import ReportGrid, { numCol } from "@/components/reports/ReportGrid";
import { SectionCard } from "../../dailyProductionReport/_components/DprPieces";
import {
  withId,
  type DoffDetailsData,
  type DoffRawRow,
  type DoffSpellTotalRow,
  type DoffSummaryRow,
  type DoffWeightBandRow,
} from "../doffAnalysisService";
import {
  deriveBands,
  deriveSpellTotals,
  emptySel,
  matchSel,
  scoreDetails,
  type FilterSel,
  type PerfStatus,
} from "../perf";
import FrameCards, { type FrameCardItem } from "./FrameCards";
import QuickFilters from "./QuickFilters";

type WithId<T> = T & { id: number };
type ScoredSummaryRow = DoffSummaryRow & {
  perf: PerfStatus;
  wt_pct: number | null;
  wt_median: number | null;
  doff_pct: number | null;
  doff_median: number | null;
};

const PERF_CLASS: Record<PerfStatus, string> = {
  low: "report-perf-low",
  watch: "report-perf-watch",
  ok: "",
};

const summaryColumns: GridColDef<WithId<ScoredSummaryRow>>[] = [
  {
    field: "perf",
    headerName: "Status",
    width: 90,
    valueFormatter: (value: PerfStatus) =>
      value === "low" ? "LOW" : value === "watch" ? "WATCH" : "",
  },
  { field: "spell_code", headerName: "Spell", width: 80 },
  { field: "frame", headerName: "Frame", width: 110 },
  { field: "quality_name", headerName: "Quality", flex: 1, minWidth: 160 },
  numCol("net_wt", "Net Wt (kg)", 120),
  { field: "num_doffs", headerName: "Doffs", type: "number", width: 90 },
  numCol("avg_wt", "Avg Wt", 100),
  numCol("max_wt", "Max Wt", 100),
  numCol("min_wt", "Min Wt", 100),
  numCol("last_doff_wt", "Last Doff Wt", 130),
];

const spellTotalColumns: GridColDef<WithId<DoffSpellTotalRow>>[] = [
  { field: "spell_code", headerName: "Spell", width: 100 },
  numCol("net_wt", "Net Wt (kg)", 140),
];

const rawColumns: GridColDef<WithId<DoffRawRow>>[] = [
  { field: "frame", headerName: "Frame", width: 110 },
  { field: "quality_name", headerName: "Quality", flex: 1, minWidth: 160 },
  { field: "spell_code", headerName: "Spell", width: 80 },
  { field: "eb_label", headerName: "Worker / EB", width: 140 },
  numCol("net_wt", "Net Wt (kg)", 120),
];

/** Band columns are data-driven: which spells ran that day decides the columns. */
function bandColumns(
  bands: DoffWeightBandRow[],
): GridColDef<WithId<DoffWeightBandRow>>[] {
  const spells = Array.from(
    new Set(bands.flatMap((b) => Object.keys(b.spell_breakup ?? {}))),
  ).sort();
  return [
    { field: "band", headerName: "Weight Band (kg)", width: 150 },
    { field: "frame_count", headerName: "Frames", type: "number", width: 110 },
    ...spells.map<GridColDef<WithId<DoffWeightBandRow>>>((spell) => ({
      field: `spell_${spell}`,
      headerName: spell,
      type: "number",
      width: 80,
      valueGetter: (_, row) => row.spell_breakup?.[spell] ?? 0,
    })),
  ];
}

const numericAware = new Intl.Collator(undefined, { numeric: true });

function uniqueSorted(values: (string | null)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => v != null && v !== ""))).sort(
    numericAware.compare,
  );
}

export default function DoffDetailsTab({
  data,
  branchId,
}: {
  data: DoffDetailsData | null;
  branchId: number | null;
}) {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down("sm"));
  const [sel, setSel] = React.useState<FilterSel>(emptySel());

  const summary = React.useMemo(() => data?.doff_summary ?? [], [data?.doff_summary]);

  const scored = React.useMemo<ScoredSummaryRow[]>(() => {
    const scores = scoreDetails(summary);
    return summary.map((row, i) => ({
      ...row,
      perf: scores[i].status,
      wt_pct: scores[i].wtPct,
      wt_median: scores[i].wtMedian,
      doff_pct: scores[i].doffPct,
      doff_median: scores[i].doffMedian,
    }));
  }, [summary]);

  const filteredSummary = React.useMemo(
    () =>
      scored.filter(
        (r) => matchSel(sel, r) && (!sel.lowOnly || r.perf !== "ok"),
      ),
    [scored, sel],
  );

  // Totals and bands are pure cuts of the summary rows — re-derived from the
  // FILTERED rows so every section agrees with the chips.
  const spellTotals = React.useMemo(
    () => deriveSpellTotals(filteredSummary),
    [filteredSummary],
  );
  const bands = React.useMemo(() => deriveBands(filteredSummary), [filteredSummary]);
  const bandCols = React.useMemo(() => bandColumns(bands), [bands]);

  // Raw doffs inherit their summary row's status for the "Low only" chip.
  const filteredRaw = React.useMemo(() => {
    const statusByKey = new Map<string, PerfStatus>(
      scored.map((r) => [`${r.spell_code}|${r.frame}|${r.quality_name}`, r.perf]),
    );
    return (data?.raw_rows ?? []).filter((r) => {
      if (!matchSel(sel, r)) return false;
      if (!sel.lowOnly) return true;
      const st = statusByKey.get(`${r.spell_code}|${r.frame}|${r.quality_name}`) ?? "ok";
      return st !== "ok";
    });
  }, [data?.raw_rows, scored, sel]);

  const cards = React.useMemo<FrameCardItem[]>(
    () =>
      filteredSummary.map((r, i) => ({
        key: `${i}`,
        frame: String(r.frame ?? "—"),
        quality: r.quality_name ?? "—",
        spell: r.spell_code,
        status: r.perf,
        wtPct: r.wt_pct,
        doffPct: r.doff_pct,
        avgWt: r.avg_wt,
        wtMedian: r.wt_median,
        doffs: r.num_doffs,
        doffMedian: r.doff_median,
        netWt: r.net_wt,
      })),
    [filteredSummary],
  );

  if (!data) return null;

  const empty =
    data.doff_summary.length === 0 &&
    data.raw_rows.length === 0 &&
    data.spell_totals.length === 0;

  if (empty) {
    return <Alert severity="info">No doffs recorded for this date.</Alert>;
  }

  return (
    <Stack spacing={2}>
      <QuickFilters
        spells={uniqueSorted(summary.map((r) => r.spell_code))}
        qualities={uniqueSorted(summary.map((r) => r.quality_name))}
        frames={uniqueSorted(summary.map((r) => r.frame))}
        sel={sel}
        onChange={setSel}
      />

      <SectionCard
        title="Doff Summary"
        subtitle="Per spell and frame — red/amber rows are below their quality peers on weight or doff count"
      >
        {isPhone ? (
          filteredSummary.length ? (
            <FrameCards items={cards} />
          ) : (
            <Alert severity="info">No frames match the filters.</Alert>
          )
        ) : (
          <ReportGrid
            rows={withId(filteredSummary)}
            columns={summaryColumns}
            getRowId={(r) => r.id}
            loading={false}
            error={null}
            branchId={branchId}
            height={480}
            getRowClass={(r) => PERF_CLASS[r.perf]}
          />
        )}
      </SectionCard>

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) minmax(0, 2fr)" },
        }}
      >
        <SectionCard title="Spell Totals" subtitle="Net weight per spell (filtered)">
          <ReportGrid
            rows={withId(spellTotals)}
            columns={spellTotalColumns}
            getRowId={(r) => r.id}
            loading={false}
            error={null}
            branchId={branchId}
            height={300}
          />
        </SectionCard>

        <SectionCard
          title="Weight Bands"
          subtitle="Frames per 2 kg doff-weight band, broken up by spell (filtered)"
        >
          <ReportGrid
            rows={withId(bands)}
            columns={bandCols}
            getRowId={(r) => r.id}
            loading={false}
            error={null}
            branchId={branchId}
            height={300}
          />
        </SectionCard>
      </Box>

      <SectionCard title="Doffs" subtitle="Every doff behind the figures above">
        <ReportGrid
          rows={withId(filteredRaw)}
          columns={rawColumns}
          getRowId={(r) => r.id}
          loading={false}
          error={null}
          branchId={branchId}
          height={480}
        />
      </SectionCard>
    </Stack>
  );
}
