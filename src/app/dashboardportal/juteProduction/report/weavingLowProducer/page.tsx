"use client";

/**
 * Weaving Low Producer — which weavers and which stretches of the shed are
 * running below standard over a date range.
 *
 * One endpoint feeds all four tabs (raw loom-spell rows, the per-worker
 * rollup sorted worst-first, the day-to-day sheet and the loom-band sheet):
 * every rollup is derived server-side from the same filtered row set, so
 * splitting the fetch per tab would just make the tabs disagree.
 *
 * This replaces three legacy MIS sheets (S4 Low Producer, Hessian Low Producer,
 * S4 From-Day-To-Day) — the shed prefix each of those hard-coded is now the
 * Quality / Loom filter.
 */

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { usePathname } from "next/navigation";
import { GridColDef, GridValidRowModel } from "@mui/x-data-grid";
import ReportGrid, { fmtNum, numCol } from "@/components/reports/ReportGrid";
import { useReportBranches } from "@/components/reports/useReportBranches";
import { useMounted } from "@/components/reports/useMounted";
import { currentMonthRange } from "@/components/reports/reportDates";
import {
  exportRowsToExcel,
  type ReportExportHeader,
} from "@/components/reports/exportExcel";
import { resolveReportMenuId } from "@/utils/reportMenuService";
import type { BranchOption } from "@/components/reports/types";
import {
  useFollowupMarking,
  withoutFollowupColumn,
} from "@/components/lowPerformerFollowup/useFollowupMarking";
import {
  fetchWeavingLowProducer,
  qualitiesOf,
  type QualityOption,
  type WeavingLowProducerReport,
  type WeavingLowProdBaseRow,
  type WeavingLowProdDayRow,
  type WeavingLowProdLoomGroupRow,
  type WeavingLowProdWorkerRow,
} from "./_service";

const TITLE = "Weaving Low Producer";

/** Efficiency at or above this reads as normal; below it is called out in red.
 * Soft convention carried over from the MIS sheets, not a configured standard. */
const EFF_RED_BELOW = 75;

const SHIFTS = ["A", "B", "C"];

/** Row plus a grid key — the endpoint returns no row id, and a natural key
 * (date+spell+loom) would collide the day a loom is entered twice. */
type WithId<T> = T & { row_id: number };

function withIds<T>(rows: T[] | undefined): WithId<T>[] {
  return (rows ?? []).map((r, i) => ({ ...r, row_id: i }));
}

/** Right-aligned 2dp efficiency column, red below EFF_RED_BELOW. */
function effCol<T extends GridValidRowModel>(
  field: string,
  headerName: string,
  width = 105,
): GridColDef<T> {
  return {
    ...numCol<T>(field, headerName, width),
    renderCell: (params) => {
      const n = Number(params.value);
      if (params.value == null || !Number.isFinite(n)) return "";
      return (
        <Box
          component="span"
          sx={
            n < EFF_RED_BELOW
              ? { color: "error.main", fontWeight: 600 }
              : undefined
          }
        >
          {fmtNum(n)}
        </Box>
      );
    },
  };
}

const baseColumns: GridColDef<WithId<WeavingLowProdBaseRow>>[] = [
  { field: "tran_date", headerName: "Date", width: 105 },
  { field: "shift", headerName: "Shift", width: 70 },
  { field: "spell_code", headerName: "Spell", width: 75 },
  { field: "loom", headerName: "Loom", width: 110 },
  { field: "loom_group", headerName: "Loom Group", width: 110 },
  { field: "worker_name", headerName: "Weaver", flex: 1, minWidth: 160 },
  { field: "eb_no", headerName: "EB No", width: 100 },
  { field: "quality_name", headerName: "Quality", flex: 1, minWidth: 150 },
  numCol("act_prod_kg", "Actual Prod (kg)", 130),
  numCol("prod_100_kg", "100% Prod (kg)", 130),
  effCol("eff_pct", "Efficiency %"),
  numCol("hours", "Hours", 90),
];

const workerColumns: GridColDef<WithId<WeavingLowProdWorkerRow>>[] = [
  { field: "eb_no", headerName: "EB No", width: 100 },
  { field: "worker_name", headerName: "Weaver", flex: 1, minWidth: 180 },
  numCol("days_attended", "Days Attended", 130),
  numCol("avg_looms_run", "Avg Looms Run", 130),
  effCol("eff_a", "Eff % A"),
  effCol("eff_b", "Eff % B"),
  effCol("eff_c", "Eff % C"),
  effCol("avg_eff", "Avg Eff %", 115),
];

const dayColumns: GridColDef<WithId<WeavingLowProdDayRow>>[] = [
  { field: "date", headerName: "Date", width: 105 },
  numCol("act_prod_a", "Prod A (kg)", 115),
  numCol("act_prod_b", "Prod B (kg)", 115),
  numCol("act_prod_c", "Prod C (kg)", 115),
  numCol("act_prod_total", "Prod Total (kg)", 135),
  effCol("avg_eff_a", "Eff % A"),
  effCol("avg_eff_b", "Eff % B"),
  effCol("avg_eff_c", "Eff % C"),
  effCol("avg_eff_total", "Eff % Total", 115),
  numCol("looms_run_a", "Looms A", 100),
  numCol("looms_run_b", "Looms B", 100),
  numCol("looms_run_c", "Looms C", 100),
  numCol("looms_run_total", "Looms Total", 115),
  numCol("kg_per_loom_a", "kg/Loom A", 110),
  numCol("kg_per_loom_b", "kg/Loom B", 110),
  numCol("kg_per_loom_c", "kg/Loom C", 110),
  numCol("kg_per_loom_total", "kg/Loom Total", 130),
];

const loomGroupColumns: GridColDef<WithId<WeavingLowProdLoomGroupRow>>[] = [
  { field: "loom_group", headerName: "Loom Group", width: 130 },
  effCol("avg_eff_a", "Eff % A"),
  effCol("avg_eff_b", "Eff % B"),
  effCol("avg_eff_c", "Eff % C"),
  effCol("avg_eff", "Avg Eff %", 115),
  effCol("max_eff", "Max Eff %", 115),
  effCol("min_eff", "Min Eff %", 115),
];

interface TabGridProps<T extends GridValidRowModel & { row_id: number }> {
  rows: T[];
  columns: GridColDef<T>[];
  loading: boolean;
  error: string | null;
  branchId: number | null;
  sortField?: string;
  sortDir?: "asc" | "desc";
  exportName: string;
  header: ReportExportHeader;
}

/**
 * One tab: the grid plus an Export button that writes exactly the sheet on
 * screen. The button sits per-tab rather than in the filter bar so it can never
 * export a different tab's columns than the ones being looked at.
 */
function TabGrid<T extends GridValidRowModel & { row_id: number }>({
  rows,
  columns,
  loading,
  error,
  branchId,
  sortField,
  sortDir,
  exportName,
  header,
}: TabGridProps<T>) {
  const pathname = usePathname();
  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
        <Button
          variant="outlined"
          size="small"
          disabled={branchId == null || rows.length === 0}
          onClick={() => {
            void (async () => {
              await exportRowsToExcel(withoutFollowupColumn(columns), rows, exportName, {
                ...header,
                reportNo: await resolveReportMenuId(pathname),
              });
            })();
          }}
          sx={{ textTransform: "none" }}
        >
          Export to Excel
        </Button>
      </Box>
      <ReportGrid
        rows={rows}
        columns={columns}
        getRowId={(r) => r.row_id}
        loading={loading}
        error={error}
        branchId={branchId}
        sortField={sortField}
        sortDir={sortDir}
      />
    </Box>
  );
}

function Content() {
  const { branches, coId, companyName, initialBranchId, dateParam } = useReportBranches();
  // Branch/date seed from the localStorage-backed sidebar context, so the
  // server HTML and the first client render disagree unless the filters are
  // held back until mount.
  const mounted = useMounted();
  const month = currentMonthRange();

  const [branchId, setBranchId] = useState<number | null>(initialBranchId);
  const [dateFrom, setDateFrom] = useState(month.from);
  const [dateTo, setDateTo] = useState(dateParam || month.to);
  const [qualityId, setQualityId] = useState("");
  const [shift, setShift] = useState("");
  const [ebNo, setEbNo] = useState("");
  const [loom, setLoom] = useState("");
  const [minDays, setMinDays] = useState("");
  const [maxDays, setMaxDays] = useState("");
  const [minEff, setMinEff] = useState("");
  const [maxEff, setMaxEff] = useState("");

  const [tab, setTab] = useState(0);
  const [report, setReport] = useState<WeavingLowProducerReport | null>(null);
  const [qualityOptions, setQualityOptions] = useState<QualityOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const didInit = useRef(false);
  const branchSeeded = useRef(false);
  const lastCoId = useRef<number | null>(null);

  const runFetch = useCallback(async () => {
    if (coId == null || branchId == null || !dateFrom || !dateTo) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWeavingLowProducer({
        coId,
        branchId,
        dateFrom,
        dateTo,
        qualityId,
        shift,
        ebNo,
        loom,
        minDays,
        maxDays,
        minEff,
        maxEff,
      });
      setReport(res);
      // An unfiltered pull is the only response that carries every quality in
      // the range — refreshing the options from a filtered one would strand the
      // user on the quality they just picked.
      if (!qualityId) setQualityOptions(qualitiesOf(res.base_rows));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load the report");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [
    coId,
    branchId,
    dateFrom,
    dateTo,
    qualityId,
    shift,
    ebNo,
    loom,
    minDays,
    maxDays,
    minEff,
    maxEff,
  ]);

  // Seed the branch ONCE when the sidebar context resolves; the user owns it after that.
  useEffect(() => {
    if (!branchSeeded.current && initialBranchId != null) {
      branchSeeded.current = true;
      setBranchId(initialBranchId);
    }
  }, [initialBranchId]);

  // Sidebar company switch: the loaded report, the branch and the quality list
  // all belong to the old company — drop them rather than show them mislabeled.
  useEffect(() => {
    if (coId == null) return;
    if (lastCoId.current != null && lastCoId.current !== coId) {
      setReport(null);
      setQualityOptions([]);
      setQualityId("");
      setBranchId(null);
      branchSeeded.current = false;
      didInit.current = false;
    }
    lastCoId.current = coId;
  }, [coId]);

  // One automatic load once company + branch are known; afterwards only Submit.
  useEffect(() => {
    if (!didInit.current && coId != null && branchId != null) {
      didInit.current = true;
      void runFetch();
    }
  }, [coId, branchId, runFetch]);

  const branch: BranchOption | null =
    branches.find((b) => b.branch_id === branchId) ?? null;

  const baseRows = useMemo(() => withIds(report?.base_rows), [report]);
  const workerRows = useMemo(() => withIds(report?.worker_summary), [report]);
  const dayRows = useMemo(() => withIds(report?.day_summary), [report]);
  const loomGroupRows = useMemo(() => withIds(report?.loom_group_summary), [report]);

  const { followupColumn, dialog: followupDialog } = useFollowupMarking({
    coId,
    branchId: report?.meta?.branch_id ?? null,
    deptCode: "WEAVING",
  });
  const workerGridColumns = useMemo(
    () => [
      ...workerColumns,
      followupColumn<WithId<WeavingLowProdWorkerRow>>({
        getEbId: (r) => r.eb_id,
        getEbNo: (r) => r.eb_no,
      }),
    ],
    [followupColumn],
  );

  const header: ReportExportHeader = {
    companyName,
    branchName: branch?.branch_name,
    reportName: TITLE,
    reportFor: [dateFrom, dateTo].filter(Boolean).join(" To "),
  };

  const meta = report?.meta;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" sx={{ color: "#0C3C60", fontWeight: "bold", mb: 2 }}>
        {TITLE}
      </Typography>

      {mounted && (
        <>
          <Paper elevation={1} sx={{ mb: 2, p: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
              <Autocomplete
                options={branches}
                getOptionLabel={(o) => o.branch_name}
                isOptionEqualToValue={(o, v) => o.branch_id === v.branch_id}
                value={branch}
                onChange={(_, v) => setBranchId(v?.branch_id ?? null)}
                renderInput={(p) => <TextField {...p} label="Branch" size="small" />}
                sx={{ minWidth: 220 }}
              />
              <TextField
                type="date"
                label="From Date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                size="small"
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ width: 170 }}
              />
              <TextField
                type="date"
                label="To Date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                size="small"
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ width: 170 }}
              />
              <Autocomplete
                options={qualityOptions}
                getOptionLabel={(o) => o.quality_name}
                isOptionEqualToValue={(o, v) => o.quality_id === v.quality_id}
                value={
                  qualityOptions.find((o) => String(o.quality_id) === qualityId) ?? null
                }
                onChange={(_, v) => setQualityId(v ? String(v.quality_id) : "")}
                renderInput={(p) => <TextField {...p} label="Quality" size="small" />}
                sx={{ minWidth: 220 }}
              />
              <TextField
                select
                label="Shift"
                value={shift}
                onChange={(e) => setShift(e.target.value)}
                size="small"
                sx={{ width: 110 }}
              >
                <MenuItem value="">All</MenuItem>
                {SHIFTS.map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Worker (EB No)"
                value={ebNo}
                onChange={(e) => setEbNo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void runFetch();
                }}
                size="small"
                sx={{ width: 150 }}
              />
              <TextField
                label="Loom"
                value={loom}
                onChange={(e) => setLoom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void runFetch();
                }}
                size="small"
                helperText="Name or mech code"
                sx={{ width: 150 }}
              />
            </Box>

            {/* Worker-summary thresholds — applied after aggregation, so they
                narrow the Worker Summary tab, not the raw rows. */}
            <Box
              sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", mt: 2 }}
            >
              <Typography variant="body2" color="text.secondary">
                Worker summary limits:
              </Typography>
              <TextField
                type="number"
                label="Min Days"
                value={minDays}
                onChange={(e) => setMinDays(e.target.value)}
                size="small"
                sx={{ width: 120 }}
              />
              <TextField
                type="number"
                label="Max Days"
                value={maxDays}
                onChange={(e) => setMaxDays(e.target.value)}
                size="small"
                sx={{ width: 120 }}
              />
              <TextField
                type="number"
                label="Min Eff %"
                value={minEff}
                onChange={(e) => setMinEff(e.target.value)}
                size="small"
                sx={{ width: 120 }}
              />
              <TextField
                type="number"
                label="Max Eff %"
                value={maxEff}
                onChange={(e) => setMaxEff(e.target.value)}
                size="small"
                sx={{ width: 120 }}
              />
              <Box sx={{ flexGrow: 1 }} />
              <Button
                variant="contained"
                disabled={branchId == null || coId == null || loading}
                onClick={() => void runFetch()}
                sx={{
                  backgroundColor: "#0C3C60",
                  "&:hover": { backgroundColor: "#092d47" },
                  textTransform: "none",
                }}
              >
                Submit
              </Button>
            </Box>
          </Paper>

          {meta ? (
            <Stack
              direction="row"
              spacing={3}
              useFlexGap
              flexWrap="wrap"
              sx={{ mb: 1.5, px: 0.5 }}
            >
              <Typography variant="body2">
                <strong>Shed average efficiency:</strong> {fmtNum(meta.filtered_avg_eff) || "—"}%
              </Typography>
              <Typography variant="body2" color="text.secondary">
                <strong>Whole-range average:</strong> {fmtNum(meta.overall_avg_eff) || "—"}%
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Efficiency under {EFF_RED_BELOW}% is shown in red.
              </Typography>
            </Stack>
          ) : null}

          {meta?.notes?.length ? (
            <Alert severity="info" sx={{ mb: 2 }}>
              {meta.notes.join(" · ")}
            </Alert>
          ) : null}

          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            sx={{ borderBottom: 1, borderColor: "divider", mb: 2 }}
          >
            <Tab label="Base Data" sx={{ minHeight: 44 }} />
            <Tab label="Worker Summary" sx={{ minHeight: 44 }} />
            <Tab label="Day to Day" sx={{ minHeight: 44 }} />
            <Tab label="Loom Groups" sx={{ minHeight: 44 }} />
          </Tabs>

          {/* Unmounted, not hidden — DataGrid measures its container and a
              display:none mount collapses it to zero height. */}
          {tab === 0 && (
            <TabGrid
              rows={baseRows}
              columns={baseColumns}
              loading={loading}
              error={error}
              branchId={branchId}
              sortField="tran_date"
              exportName="weaving-low-producer-base"
              header={{ ...header, reportName: `${TITLE} — Base Data` }}
            />
          )}
          {tab === 1 && (
            <TabGrid
              rows={workerRows}
              columns={workerGridColumns}
              loading={loading}
              error={error}
              branchId={branchId}
              exportName="weaving-low-producer-workers"
              header={{ ...header, reportName: `${TITLE} — Worker Summary` }}
            />
          )}
          {tab === 2 && (
            <TabGrid
              rows={dayRows}
              columns={dayColumns}
              loading={loading}
              error={error}
              branchId={branchId}
              sortField="date"
              exportName="weaving-low-producer-daywise"
              header={{ ...header, reportName: `${TITLE} — Day to Day` }}
            />
          )}
          {tab === 3 && (
            <TabGrid
              rows={loomGroupRows}
              columns={loomGroupColumns}
              loading={loading}
              error={error}
              branchId={branchId}
              exportName="weaving-low-producer-loom-groups"
              header={{ ...header, reportName: `${TITLE} — Loom Groups` }}
            />
          )}
        </>
      )}
      {followupDialog}
    </Box>
  );
}

export default function WeavingLowProducerPage() {
  // useReportBranches() reads useSearchParams() — `next build` fails without
  // a Suspense boundary above it.
  return (
    <Suspense
      fallback={
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      }
    >
      <Content />
    </Suspense>
  );
}
