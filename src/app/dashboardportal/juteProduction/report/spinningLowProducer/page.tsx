"use client";

/**
 * Spinning Low Producer — worst-first view of spinner efficiency.
 *
 * One request feeds all three tabs (Base Data / Worker Summary / Day-wise):
 * the summaries are aggregated server-side over the SAME filtered set as the
 * base rows, so filtering client-side would silently disagree with them. Every
 * filter is therefore a query param and a change only takes effect on Submit.
 *
 * "Full-shift regular only" is the legacy WhatsApp view: rows with a full 8-hour
 * approved attendance only, sorted worst efficiency first.
 */

import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  AlertTitle,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import type { GridColDef, GridValidRowModel } from "@mui/x-data-grid";
import { usePathname } from "next/navigation";
import ReportGrid, { fmtNum, numCol } from "@/components/reports/ReportGrid";
import { exportRowsToExcel } from "@/components/reports/exportExcel";
import { useReportBranches } from "@/components/reports/useReportBranches";
import { lastDaysRange } from "@/components/reports/reportDates";
import { resolveReportMenuId } from "@/utils/reportMenuService";
import { apiRoutesPortalMasters } from "@/utils/api";
import { fetchWithCookie } from "@/utils/apiClient2";

/** Efficiency at or below this reads as a low producer. Soft convention — the
 * mill's own cut-off moves, so it lives here and nowhere else. */
const LOW_EFF_PCT = 75;

/** Server caps the range; refuse the obviously-bad one before the round trip. */
const MAX_RANGE_DAYS = 62;

const TABS = ["Base Data", "Worker Summary", "Day-wise"] as const;

// ---------------------------------------------------------------- API types

interface SpinBaseRow {
  doff_date: string;
  shift: string | null;
  spell_code: string | null;
  /** 'R' when the row came from an attendance record, 'Contract' otherwise. */
  attendance_type: string | null;
  eb_id: number | null;
  eb_label: string | null;
  worker_name: string | null;
  machine_id: number | null;
  frame: string | null;
  item_id: number | null;
  quality_name: string | null;
  net_wt: number | null;
  whrs: number | null;
  std_prod: number | null;
  no_of_frame: number | null;
  eff_pct: number | null;
}

interface SpinWorkerRow {
  eb_id: number | null;
  worker_name: string | null;
  days_attended: number | null;
  /** Spinning counts frames where weaving counts looms — accept either name. */
  avg_frames_run?: number | null;
  avg_looms_run?: number | null;
  eff_a: number | null;
  eff_b: number | null;
  eff_c: number | null;
  avg_eff: number | null;
}

/** Shift-wise net weight / efficiency / frames run per date. The exact column
 * set is the backend's to decide, so it is read off the rows (see dayColumns). */
type SpinDayRow = { date: string } & Record<string, unknown>;

interface SpinMeta {
  co_id: number;
  branch_id: number;
  date_from: string;
  date_to: string;
  filtered_avg_eff: number | null;
  overall_avg_eff: number | null;
  notes: string[];
}

interface SpinningLowProducer {
  base_rows: SpinBaseRow[];
  worker_summary: SpinWorkerRow[];
  day_summary: SpinDayRow[];
  meta: SpinMeta;
}

interface FetchParams {
  coId: number;
  branchId: number;
  dateFrom: string;
  dateTo: string;
  shift?: string;
  ebNo?: string;
  frame?: string;
  itemId?: number | null;
  fullShiftRegularOnly?: boolean;
}

async function fetchSpinningLowProducer(
  p: FetchParams,
): Promise<SpinningLowProducer> {
  const qs = new URLSearchParams();
  qs.set("co_id", String(p.coId));
  qs.set("branch_id", String(p.branchId));
  qs.set("date_from", p.dateFrom);
  qs.set("date_to", p.dateTo);
  if (p.shift) qs.set("shift", p.shift);
  if (p.ebNo) qs.set("eb_no", p.ebNo);
  if (p.frame) qs.set("frame", p.frame);
  if (p.itemId != null) qs.set("item_id", String(p.itemId));
  if (p.fullShiftRegularOnly) qs.set("full_shift_regular_only", "true");
  const res = await fetchWithCookie<{ data: SpinningLowProducer }>(
    `${apiRoutesPortalMasters.JP_SPINNING_LOW_PRODUCER}?${qs.toString()}`,
  );
  if (res.error || !res.data) {
    throw new Error(res.error ?? "Failed to load the Spinning Low Producer report");
  }
  return res.data.data;
}

// -------------------------------------------------------------- column bits

/** Row key for grids whose rows carry no id of their own. */
type WithRid<T> = T & { _rid: number };

const withRid = <T,>(rows: T[]): WithRid<T>[] =>
  rows.map((r, i) => ({ ...r, _rid: i }));

/** Whole-number column (day counts, frame counts) — 2dp would be noise. */
function intCol<T extends GridValidRowModel>(
  field: string,
  headerName: string,
  width = 110,
): GridColDef<T> {
  return { field, headerName, type: "number", width };
}

/** Efficiency column: 2dp, red below LOW_EFF_PCT. */
function effCol<T extends GridValidRowModel>(
  field: string,
  headerName: string,
  width = 110,
): GridColDef<T> {
  return {
    field,
    headerName,
    type: "number",
    width,
    valueFormatter: (value: unknown) => fmtNum(value),
    renderCell: (params) => {
      const n = Number(params.value);
      if (params.value == null || !Number.isFinite(n)) return "";
      const low = n < LOW_EFF_PCT;
      return (
        <Box
          component="span"
          sx={{ color: low ? "error.main" : "inherit", fontWeight: low ? 700 : 400 }}
        >
          {n.toFixed(2)}
        </Box>
      );
    },
  };
}

const baseColumns: GridColDef<WithRid<SpinBaseRow>>[] = [
  { field: "doff_date", headerName: "Date", width: 105 },
  { field: "shift", headerName: "Shift", width: 70 },
  { field: "spell_code", headerName: "Spell", width: 75 },
  { field: "attendance_type", headerName: "Type", width: 90 },
  { field: "eb_label", headerName: "EB No", width: 110 },
  { field: "worker_name", headerName: "Worker", flex: 1, minWidth: 160 },
  { field: "frame", headerName: "Frame", width: 110 },
  { field: "quality_name", headerName: "Quality", flex: 1, minWidth: 150 },
  numCol("net_wt", "Net Wt (kg)", 120),
  numCol("whrs", "Work Hrs", 100),
  numCol("std_prod", "Std Prod (kg)", 130),
  numCol("no_of_frame", "Frames", 100),
  effCol("eff_pct", "Eff %", 100),
];

const workerColumns: GridColDef<WithRid<SpinWorkerRow>>[] = [
  { field: "eb_id", headerName: "EB Id", width: 90 },
  { field: "worker_name", headerName: "Worker", flex: 1, minWidth: 180 },
  intCol("days_attended", "Days", 90),
  {
    field: "avg_frames_run",
    headerName: "Avg Frames",
    type: "number",
    width: 120,
    valueGetter: (_, row) => row.avg_frames_run ?? row.avg_looms_run ?? null,
    valueFormatter: (value: unknown) => fmtNum(value),
  },
  effCol("eff_a", "Eff A", 95),
  effCol("eff_b", "Eff B", 95),
  effCol("eff_c", "Eff C", 95),
  effCol("avg_eff", "Avg Eff %", 120),
];

/** Preferred day-summary column order; anything else the backend sends is
 * appended alphabetically rather than dropped. */
const DAY_COLUMN_ORDER = [
  "net_wt_a",
  "net_wt_b",
  "net_wt_c",
  "net_wt_total",
  "avg_eff_a",
  "avg_eff_b",
  "avg_eff_c",
  "avg_eff_total",
  "frames_run_a",
  "frames_run_b",
  "frames_run_c",
  "frames_run_total",
];

const DAY_HEADERS: Record<string, string> = {
  net_wt_a: "Net Wt A",
  net_wt_b: "Net Wt B",
  net_wt_c: "Net Wt C",
  net_wt_total: "Net Wt Total",
  avg_eff_a: "Avg Eff A",
  avg_eff_b: "Avg Eff B",
  avg_eff_c: "Avg Eff C",
  avg_eff_total: "Avg Eff Total",
  frames_run_a: "Frames A",
  frames_run_b: "Frames B",
  frames_run_c: "Frames C",
  frames_run_total: "Frames Total",
};

/** "net_wt_total" -> "Net Wt Total"; used for keys not in DAY_HEADERS. */
function prettifyKey(key: string): string {
  return key
    .split("_")
    .map((w) => (w === "pct" ? "%" : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

// ------------------------------------------------------------------- page

function Content() {
  const { branches, coId, companyName, initialBranchId, dateParam } =
    useReportBranches();
  const pathname = usePathname();

  // Branch and dates come from the localStorage-backed sidebar context and the
  // hub's query string — both empty during SSR. Hold the toolbar back until
  // mount so the first client render matches the server HTML.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const seed = lastDaysRange(7);
  const [branchId, setBranchId] = useState<number | null>(initialBranchId);
  // A date handed over by the reports hub is a single report date, not a range.
  const [dateFrom, setDateFrom] = useState<string>(dateParam || seed.from);
  const [dateTo, setDateTo] = useState<string>(dateParam || seed.to);
  const [shift, setShift] = useState<string>("");
  const [ebNo, setEbNo] = useState<string>("");
  const [frame, setFrame] = useState<string>("");
  const [itemId, setItemId] = useState<number | null>(null);
  const [fullShiftOnly, setFullShiftOnly] = useState(false);

  const [tab, setTab] = useState(0);
  const [data, setData] = useState<SpinningLowProducer | null>(null);
  // Quality picker options are harvested from the rows already seen, so the
  // list keeps growing instead of collapsing to the one quality being filtered.
  const [qualityOptions, setQualityOptions] = useState<
    { id: number; label: string }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchedOnce = useRef(false);
  const branchSeeded = useRef(false);
  const lastCoId = useRef<number | null>(null);

  // Cheap client-side guard — the backend rejects these too, but there is no
  // point spending a round trip to be told so.
  const rangeError = useMemo(() => {
    if (!dateFrom || !dateTo) return "Both dates are required";
    if (dateFrom > dateTo) return "From Date must not be after To Date";
    const days =
      (Date.parse(dateTo) - Date.parse(dateFrom)) / 86_400_000 + 1;
    if (days > MAX_RANGE_DAYS) return `Range is capped at ${MAX_RANGE_DAYS} days`;
    return null;
  }, [dateFrom, dateTo]);

  const runFetch = useCallback(async () => {
    if (coId == null || branchId == null || rangeError) return;
    setLoading(true);
    setError(null);
    try {
      setData(
        await fetchSpinningLowProducer({
          coId,
          branchId,
          dateFrom,
          dateTo,
          shift,
          ebNo,
          frame,
          itemId,
          fullShiftRegularOnly: fullShiftOnly,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the report");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [
    coId,
    branchId,
    dateFrom,
    dateTo,
    shift,
    ebNo,
    frame,
    itemId,
    fullShiftOnly,
    rangeError,
  ]);

  // Seed the branch ONCE from the sidebar/URL; the user owns it afterwards.
  useEffect(() => {
    if (!branchSeeded.current && initialBranchId != null) {
      branchSeeded.current = true;
      setBranchId(initialBranchId);
    }
  }, [initialBranchId]);

  // Sidebar company switch: the loaded report, the branch and the quality
  // options all belong to the old company — drop them rather than mislabel.
  useEffect(() => {
    if (coId == null) return;
    if (lastCoId.current != null && lastCoId.current !== coId) {
      setData(null);
      setBranchId(null);
      setItemId(null);
      setQualityOptions([]);
      branchSeeded.current = false;
      fetchedOnce.current = false;
    }
    lastCoId.current = coId;
  }, [coId]);

  // One automatic load once a branch is available; afterwards only on Submit.
  useEffect(() => {
    if (!fetchedOnce.current && coId != null && branchId != null) {
      fetchedOnce.current = true;
      void runFetch();
    }
  }, [coId, branchId, runFetch]);

  // The WhatsApp toggle is a view switch, not a filter draft — reload at once
  // rather than leave a flipped switch showing the other view's rows. Deps are
  // deliberately just the toggle: runFetch changes on every keystroke in the
  // text filters, and those must still wait for Submit.
  const toggleSettled = useRef(false);
  useEffect(() => {
    if (!toggleSettled.current) {
      toggleSettled.current = true;
      return;
    }
    void runFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullShiftOnly]);

  useEffect(() => {
    if (!data) return;
    setQualityOptions((prev) => {
      const seen = new Map(prev.map((o) => [o.id, o.label]));
      for (const r of data.base_rows) {
        if (r.item_id != null) {
          seen.set(r.item_id, r.quality_name ?? `Item ${r.item_id}`);
        }
      }
      return Array.from(seen, ([id, label]) => ({ id, label })).sort((a, b) =>
        a.label.localeCompare(b.label),
      );
    });
  }, [data]);

  const baseRows = useMemo(() => withRid(data?.base_rows ?? []), [data]);
  const workerRows = useMemo(() => withRid(data?.worker_summary ?? []), [data]);
  const dayRows = useMemo(() => data?.day_summary ?? [], [data]);

  const dayColumns = useMemo<GridColDef<SpinDayRow>[]>(() => {
    const numericKeys = new Set<string>();
    const textKeys = new Set<string>();
    for (const row of dayRows) {
      for (const [k, v] of Object.entries(row)) {
        if (k === "date") continue;
        if (typeof v === "number") numericKeys.add(k);
        else if (v != null && !numericKeys.has(k)) textKeys.add(k);
      }
    }
    for (const k of numericKeys) textKeys.delete(k);
    const known = DAY_COLUMN_ORDER.filter((k) => numericKeys.has(k));
    const extra = [...numericKeys]
      .filter((k) => !DAY_COLUMN_ORDER.includes(k))
      .sort();
    const label = (k: string) => DAY_HEADERS[k] ?? prettifyKey(k);
    return [
      { field: "date", headerName: "Date", width: 110 },
      ...[...known, ...extra].map((k) =>
        k.includes("eff")
          ? effCol<SpinDayRow>(k, label(k), 120)
          : numCol<SpinDayRow>(k, label(k), 120),
      ),
      ...[...textKeys].sort().map((k) => ({
        field: k,
        headerName: label(k),
        width: 130,
      })),
    ];
  }, [dayRows]);

  const branch = branches.find((b) => b.branch_id === branchId) ?? null;
  const meta = data?.meta;

  const activeRowCount =
    tab === 1 ? workerRows.length : tab === 2 ? dayRows.length : baseRows.length;

  const handleExport = useCallback(async () => {
    const header = {
      companyName,
      branchName: branch?.branch_name,
      reportName: `Spinning Low Producer — ${TABS[tab]}`,
      reportNo: await resolveReportMenuId(pathname),
      reportFor: [dateFrom, dateTo].filter(Boolean).join(" To "),
    };
    if (tab === 1) {
      await exportRowsToExcel(
        workerColumns,
        workerRows,
        "spinning-low-producer-workers",
        header,
      );
    } else if (tab === 2) {
      await exportRowsToExcel(
        dayColumns,
        dayRows,
        "spinning-low-producer-daywise",
        header,
      );
    } else {
      await exportRowsToExcel(
        baseColumns,
        baseRows,
        "spinning-low-producer",
        header,
      );
    }
  }, [
    companyName,
    branch?.branch_name,
    tab,
    pathname,
    dateFrom,
    dateTo,
    baseRows,
    workerRows,
    dayRows,
    dayColumns,
  ]);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" sx={{ color: "#0C3C60", fontWeight: "bold", mb: 2 }}>
        Spinning Low Producer
      </Typography>

      {mounted && (
        <Paper elevation={1} sx={{ mb: 2, p: 2 }}>
          <Box
            sx={{ display: "flex", alignItems: "flex-start", gap: 2, flexWrap: "wrap" }}
          >
            <Autocomplete
              options={branches}
              getOptionLabel={(o) => o.branch_name}
              isOptionEqualToValue={(o, v) => o.branch_id === v.branch_id}
              value={branch}
              onChange={(_, v) => setBranchId(v?.branch_id ?? null)}
              renderInput={(params) => (
                <TextField {...params} label="Branch" size="small" />
              )}
              sx={{ minWidth: 220 }}
            />
            <TextField
              type="date"
              label="From Date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              size="small"
              error={rangeError != null}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ width: 170 }}
            />
            <TextField
              type="date"
              label="To Date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              size="small"
              error={rangeError != null}
              helperText={rangeError ?? undefined}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ width: 170 }}
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
              <MenuItem value="A">A</MenuItem>
              <MenuItem value="B">B</MenuItem>
              <MenuItem value="C">C</MenuItem>
            </TextField>
            <TextField
              label="EB No"
              value={ebNo}
              onChange={(e) => setEbNo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void runFetch();
              }}
              size="small"
              sx={{ width: 130 }}
            />
            <TextField
              label="Frame"
              value={frame}
              onChange={(e) => setFrame(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void runFetch();
              }}
              size="small"
              sx={{ width: 130 }}
            />
            <Autocomplete
              options={qualityOptions}
              getOptionLabel={(o) => o.label}
              isOptionEqualToValue={(o, v) => o.id === v.id}
              value={qualityOptions.find((o) => o.id === itemId) ?? null}
              onChange={(_, v) => setItemId(v?.id ?? null)}
              renderInput={(params) => (
                <TextField {...params} label="Quality" size="small" />
              )}
              sx={{ minWidth: 200 }}
            />
            <Tooltip title="Keep only rows with a full 8-hour approved attendance and sort worst efficiency first — the legacy WhatsApp list.">
              <FormControlLabel
                control={
                  <Switch
                    checked={fullShiftOnly}
                    onChange={(e) => setFullShiftOnly(e.target.checked)}
                    size="small"
                  />
                }
                label="Full-shift regular only (WhatsApp view)"
                sx={{ mr: 0 }}
              />
            </Tooltip>
            <Button
              variant="contained"
              disabled={coId == null || branchId == null || loading || rangeError != null}
              onClick={() => {
                void runFetch();
              }}
              sx={{
                backgroundColor: "#0C3C60",
                "&:hover": { backgroundColor: "#092d47" },
                textTransform: "none",
              }}
            >
              Submit
            </Button>
            <Button
              variant="outlined"
              disabled={branchId == null || activeRowCount === 0}
              onClick={() => {
                void handleExport();
              }}
              sx={{ textTransform: "none" }}
            >
              Export to Excel
            </Button>
          </Box>
        </Paper>
      )}

      {meta ? (
        <Stack
          direction="row"
          spacing={3}
          useFlexGap
          flexWrap="wrap"
          sx={{ mb: 1.5 }}
        >
          <Typography variant="body2">
            <strong>Period:</strong> {meta.date_from} to {meta.date_to}
          </Typography>
          <Typography variant="body2">
            <strong>Avg Eff (excl. zeros):</strong> {fmtNum(meta.filtered_avg_eff) || "—"}
          </Typography>
          <Typography variant="body2">
            <strong>Avg Eff (all rows):</strong> {fmtNum(meta.overall_avg_eff) || "—"}
          </Typography>
          <Typography variant="body2">
            <strong>Rows:</strong> {baseRows.length}
          </Typography>
          {fullShiftOnly ? (
            <Typography variant="body2" color="warning.main">
              <strong>WhatsApp view:</strong> full-shift regular rows only
            </Typography>
          ) : null}
        </Stack>
      ) : null}

      {meta && meta.notes.length > 0 ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          <AlertTitle>Notes</AlertTitle>
          {meta.notes.map((n, i) => (
            <Typography key={i} variant="body2">
              {n}
            </Typography>
          ))}
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
        {TABS.map((label) => (
          <Tab key={label} label={label} sx={{ minHeight: 44 }} />
        ))}
      </Tabs>

      {/* One grid per tab, only the active one mounted: a hidden DataGrid cannot
          measure its own container. */}
      {tab === 0 ? (
        <ReportGrid
          rows={baseRows}
          columns={baseColumns}
          getRowId={(r) => r._rid}
          loading={loading}
          error={error}
          branchId={branchId}
          sortField="eff_pct"
          sortDir="asc"
        />
      ) : null}
      {tab === 1 ? (
        <ReportGrid
          rows={workerRows}
          columns={workerColumns}
          getRowId={(r) => r._rid}
          loading={loading}
          error={error}
          branchId={branchId}
          sortField="avg_eff"
          sortDir="asc"
        />
      ) : null}
      {tab === 2 ? (
        <ReportGrid
          rows={dayRows}
          columns={dayColumns}
          getRowId={(r) => r.date}
          loading={loading}
          error={error}
          branchId={branchId}
          sortField="date"
          sortDir="asc"
        />
      ) : null}
    </Box>
  );
}

export default function SpinningLowProducerPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      }
    >
      <Content />
    </Suspense>
  );
}
