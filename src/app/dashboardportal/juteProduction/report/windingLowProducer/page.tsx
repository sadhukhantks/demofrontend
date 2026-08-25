"use client";

/**
 * Winding Low Producer — port of the legacy MIS low-producer sheet for winding.
 *
 * One request returns all three views (base rows, per-worker summary, per-day
 * summary) plus meta, so the tabs switch without refetching.
 *
 * Attendance caveat: winding efficiency divides production by the hours the
 * winder was actually present. When no approved attendance row matches the
 * winder+date+spell the backend falls back to a flat 8 hours and marks the row
 * `att_source = 'default8'` — those rows carry a badge and are counted in the
 * strip above the grid, because their efficiency is an estimate, not a
 * measurement.
 *
 * Worker/day summary columns are derived from the payload keys rather than
 * hard-coded: the backend owns those shapes and they differ per report family
 * (looms / frames / winders). Base rows are the fixed contract and are spelled
 * out so the att_source badge and the eff highlight can be attached.
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
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import type { GridColDef, GridValidRowModel } from "@mui/x-data-grid";
import ReportGrid, { numCol } from "@/components/reports/ReportGrid";
import { useReportBranches } from "@/components/reports/useReportBranches";
import { useMounted } from "@/components/reports/useMounted";
import { lastDaysRange } from "@/components/reports/reportDates";
import { exportRowsToExcel } from "@/components/reports/exportExcel";
import { apiRoutesPortalMasters } from "@/utils/api";
import { fetchWithCookie } from "@/utils/apiClient2";

/** Efficiency at or below this reads as a low producer. Soft convention — the
 * report does not filter on it, it only colours the cell. */
const LOW_EFF_PCT = 75;

/** The attendance fallback marker the backend stamps on rows with no matching
 * approved attendance row (hours defaulted to 8). */
const ATT_DEFAULT = "default8";

// ---------------------------------------------------------------- types ----

export interface WindingLowProducerRow {
  tran_date: string;
  shift: string | null;
  spell_code: string | null;
  eb_id: number | null;
  worker_name: string | null;
  item_id: number | null;
  quality_name: string | null;
  prod_kg: number;
  att_hrs: number;
  att_source: string | null;
  target_kg_8h: number;
  std_prod: number;
  eff_pct: number;
  no_of_winders: number;
}

/** Summary grids are backend-shaped — see the file header. */
type SummaryRow = Record<string, string | number | null>;

export interface WindingLowProducerMeta {
  co_id: number;
  branch_id: number;
  date_from: string;
  date_to: string;
  filtered_avg_eff: number | null;
  overall_avg_eff: number | null;
  notes: string[];
}

export interface WindingLowProducer {
  base_rows: WindingLowProducerRow[];
  worker_summary: SummaryRow[];
  day_summary: SummaryRow[];
  meta: WindingLowProducerMeta;
}

interface FetchParams {
  coId: number;
  branchId: number;
  dateFrom: string;
  dateTo: string;
  shift?: string;
  ebNo?: string;
  itemId?: string;
}

async function fetchWindingLowProducer(
  p: FetchParams,
): Promise<WindingLowProducer> {
  const qs = new URLSearchParams();
  qs.set("co_id", String(p.coId));
  qs.set("branch_id", String(p.branchId));
  qs.set("date_from", p.dateFrom);
  qs.set("date_to", p.dateTo);
  if (p.shift) qs.set("shift", p.shift);
  if (p.ebNo) qs.set("eb_no", p.ebNo);
  if (p.itemId) qs.set("item_id", p.itemId);
  const res = await fetchWithCookie<{ data: WindingLowProducer }>(
    `${apiRoutesPortalMasters.JP_WINDING_LOW_PRODUCER}?${qs.toString()}`,
  );
  if (res.error || !res.data) {
    throw new Error(res.error ?? "Failed to fetch the Winding Low Producer report");
  }
  return res.data.data;
}

// -------------------------------------------------------------- columns ----

const ID_RE = /(^|_)id$/;
const EFF_RE = /eff/i;
/** Tokens that read wrong in Title Case. */
const UPPER_TOKENS = new Set(["a", "b", "c", "g", "kg", "id", "eb", "mt", "no"]);

function humanize(field: string): string {
  return field
    .split("_")
    .map((t) =>
      t === "pct"
        ? "%"
        : UPPER_TOKENS.has(t)
          ? t.toUpperCase()
          : t.charAt(0).toUpperCase() + t.slice(1),
    )
    .join(" ");
}

/** Red when a real efficiency sits under the threshold; 0 / null is "no data",
 * not "bad", so it stays plain. */
function renderEff(value: unknown): React.ReactNode {
  const n = Number(value);
  if (value == null || !Number.isFinite(n)) return "";
  const low = n > 0 && n < LOW_EFF_PCT;
  return (
    <Box
      component="span"
      sx={low ? { color: "error.main", fontWeight: 700 } : undefined}
    >
      {n.toFixed(2)}
    </Box>
  );
}

function effCol<T extends GridValidRowModel>(
  field: string,
  headerName: string,
  width = 110,
): GridColDef<T> {
  return {
    field,
    headerName,
    width,
    align: "right",
    headerAlign: "right",
    renderCell: (params) => renderEff(params.value),
  };
}

/** Columns for a backend-shaped summary grid: ids and text left, whole numbers
 * at 0dp, everything else at 2dp, efficiency columns highlighted. `__`-prefixed
 * keys are ours (the synthetic row id) and never become columns. */
function autoColumns<T extends GridValidRowModel>(rows: T[]): GridColDef<T>[] {
  const first = rows[0];
  if (!first) return [];
  return Object.keys(first)
    .filter((f) => !f.startsWith("__"))
    .map((field): GridColDef<T> => {
      const numbers = rows
        .map((r) => (r as Record<string, unknown>)[field])
        .filter((v): v is number => typeof v === "number");
      if (numbers.length === 0 || ID_RE.test(field)) {
        return { field, headerName: humanize(field), minWidth: 110 };
      }
      if (EFF_RE.test(field)) return effCol<T>(field, humanize(field));
      if (numbers.every((n) => Number.isInteger(n))) {
        return { field, headerName: humanize(field), type: "number", width: 110 };
      }
      return numCol<T>(field, humanize(field), 110);
    });
}

const baseColumns: GridColDef<WindingLowProducerRow>[] = [
  { field: "tran_date", headerName: "Date", width: 105 },
  { field: "shift", headerName: "Shift", width: 70 },
  { field: "spell_code", headerName: "Spell", width: 80 },
  { field: "eb_id", headerName: "EB Id", width: 90 },
  { field: "worker_name", headerName: "Worker", flex: 1, minWidth: 160 },
  { field: "item_id", headerName: "Item Id", width: 90 },
  { field: "quality_name", headerName: "Quality", flex: 1, minWidth: 150 },
  numCol("prod_kg", "Prod KG", 110),
  numCol("att_hrs", "Att Hrs", 100),
  {
    field: "att_source",
    headerName: "Att Source",
    width: 130,
    renderCell: (params) =>
      params.value === ATT_DEFAULT ? (
        <Chip
          size="small"
          color="warning"
          variant="outlined"
          label="default 8h"
          title="No approved attendance row matched — hours defaulted to 8"
        />
      ) : (
        <span>{(params.value as string) ?? ""}</span>
      ),
  },
  numCol("target_kg_8h", "Target KG / 8h", 140),
  numCol("std_prod", "Std Prod KG", 130),
  effCol<WindingLowProducerRow>("eff_pct", "Eff %"),
  numCol("no_of_winders", "Winders", 100),
];

// ----------------------------------------------------------------- page ----

const TABS = ["Base Data", "Worker Summary", "Day-wise"] as const;
const SHIFTS = ["A", "B", "C"];

function fmtAvg(v: number | null | undefined): string {
  return v == null || !Number.isFinite(Number(v)) ? "—" : Number(v).toFixed(2);
}

function Content() {
  const { branches, coId, companyName, initialBranchId, dateParam } =
    useReportBranches();
  const mounted = useMounted();

  const seedRange = dateParam
    ? { from: dateParam, to: dateParam }
    : lastDaysRange(7);
  const [branchId, setBranchId] = useState<number | null>(initialBranchId);
  const [dateFrom, setDateFrom] = useState(seedRange.from);
  const [dateTo, setDateTo] = useState(seedRange.to);
  const [shift, setShift] = useState("");
  const [ebNo, setEbNo] = useState("");
  const [itemId, setItemId] = useState("");

  const [data, setData] = useState<WindingLowProducer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(0);
  // Quality options are harvested from whatever rows have been loaded — the
  // report has no separate setup endpoint. Merged across loads so filtering by
  // one quality doesn't collapse the picker to that single option.
  const [itemOptions, setItemOptions] = useState<
    { value: string; label: string }[]
  >([]);

  const fetchedOnce = useRef(false);
  const branchSeeded = useRef(false);
  const lastCoId = useRef<number | null>(null);

  const runFetch = useCallback(
    async (bId: number | null) => {
      if (coId == null || bId == null || !dateFrom || !dateTo) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetchWindingLowProducer({
          coId,
          branchId: bId,
          dateFrom,
          dateTo,
          shift,
          ebNo,
          itemId,
        });
        setData(res);
        setItemOptions((prev) => {
          const m = new Map(prev.map((o) => [o.value, o.label]));
          for (const r of res.base_rows) {
            if (r.item_id != null) {
              m.set(String(r.item_id), r.quality_name ?? `Item ${r.item_id}`);
            }
          }
          return [...m].map(([value, label]) => ({ value, label }));
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load the report");
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [coId, dateFrom, dateTo, shift, ebNo, itemId],
  );

  // Seed the branch ONCE when the sidebar context resolves.
  useEffect(() => {
    if (!branchSeeded.current && initialBranchId != null) {
      branchSeeded.current = true;
      setBranchId(initialBranchId);
    }
  }, [initialBranchId]);

  // Sidebar company switch: the loaded report and the branch belong to the old
  // company — drop both so nothing renders mislabeled.
  useEffect(() => {
    if (coId == null) return;
    if (lastCoId.current != null && lastCoId.current !== coId) {
      setData(null);
      setBranchId(null);
      setItemOptions([]);
      setItemId("");
      branchSeeded.current = false;
      fetchedOnce.current = false;
    }
    lastCoId.current = coId;
  }, [coId]);

  // One automatic load once a branch is available; afterwards only on Submit.
  useEffect(() => {
    const b = branchId ?? initialBranchId;
    if (!fetchedOnce.current && coId != null && b != null) {
      fetchedOnce.current = true;
      void runFetch(b);
    }
  }, [coId, branchId, initialBranchId, runFetch]);

  const selectedBranch = branches.find((b) => b.branch_id === branchId) ?? null;
  const baseRows = data?.base_rows ?? [];
  // Summary rows have no guaranteed key of their own (the backend owns those
  // shapes), so stamp a positional id — never a random one, which would give
  // the grid a new row identity on every render.
  const workerRows = useMemo(
    () => (data?.worker_summary ?? []).map((r, i) => ({ ...r, __rid: i })),
    [data],
  );
  const dayRows = useMemo(
    () => (data?.day_summary ?? []).map((r, i) => ({ ...r, __rid: i })),
    [data],
  );
  const workerColumns = useMemo(() => autoColumns(workerRows), [workerRows]);
  const dayColumns = useMemo(() => autoColumns(dayRows), [dayRows]);
  const defaultAttCount = baseRows.filter(
    (r) => r.att_source === ATT_DEFAULT,
  ).length;

  const handleExport = useCallback(async () => {
    const header = {
      companyName,
      branchName: selectedBranch?.branch_name,
      reportName: `Winding Low Producer — ${TABS[tab]}`,
      reportFor: `${dateFrom} To ${dateTo}`,
    };
    if (tab === 1) {
      await exportRowsToExcel(
        workerColumns,
        workerRows,
        "winding-low-producer-workers",
        header,
      );
    } else if (tab === 2) {
      await exportRowsToExcel(
        dayColumns,
        dayRows,
        "winding-low-producer-daywise",
        header,
      );
    } else {
      await exportRowsToExcel(
        baseColumns,
        baseRows,
        "winding-low-producer",
        header,
      );
    }
  }, [
    companyName,
    selectedBranch?.branch_name,
    tab,
    dateFrom,
    dateTo,
    baseRows,
    workerRows,
    dayRows,
    workerColumns,
    dayColumns,
  ]);

  return (
    <Box sx={{ p: 3 }}>
      <Typography
        variant="h5"
        sx={{ color: "#0C3C60", fontWeight: "bold", mb: 2 }}
      >
        Winding Low Producer
      </Typography>

      {mounted && (
        <>
          <Paper elevation={1} sx={{ mb: 2, p: 2 }}>
            <Box
              sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}
            >
              <Autocomplete
                options={branches}
                getOptionLabel={(o) => o.branch_name}
                isOptionEqualToValue={(o, v) => o.branch_id === v.branch_id}
                value={selectedBranch}
                onChange={(_, v) => setBranchId(v?.branch_id ?? null)}
                renderInput={(p) => (
                  <TextField {...p} label="Branch" size="small" />
                )}
                sx={{ minWidth: 240 }}
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
              <TextField
                select
                label="Shift"
                value={shift}
                onChange={(e) => setShift(e.target.value)}
                size="small"
                sx={{ width: 120 }}
              >
                <MenuItem value="">All</MenuItem>
                {SHIFTS.map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="EB No"
                value={ebNo}
                onChange={(e) => setEbNo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void runFetch(branchId);
                }}
                size="small"
                sx={{ width: 140 }}
              />
              <Autocomplete
                options={itemOptions}
                getOptionLabel={(o) => o.label}
                isOptionEqualToValue={(o, v) => o.value === v.value}
                value={itemOptions.find((o) => o.value === itemId) ?? null}
                onChange={(_, v) => setItemId(v?.value ?? "")}
                renderInput={(p) => (
                  <TextField
                    {...p}
                    label="Quality"
                    size="small"
                    helperText={
                      itemOptions.length === 0 ? "Populated from loaded rows" : undefined
                    }
                  />
                )}
                sx={{ minWidth: 220 }}
              />
              <Button
                variant="contained"
                disabled={branchId == null || loading}
                onClick={() => void runFetch(branchId)}
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
                disabled={branchId == null || data == null}
                onClick={() => void handleExport()}
                sx={{ textTransform: "none" }}
              >
                Export to Excel
              </Button>
            </Box>
          </Paper>

          {data ? (
            <Stack
              direction="row"
              spacing={2}
              useFlexGap
              flexWrap="wrap"
              alignItems="center"
              sx={{ mb: 1.5 }}
            >
              <Typography variant="body2">
                <strong>Avg Eff (excl. zero):</strong>{" "}
                {fmtAvg(data.meta?.filtered_avg_eff)}%
              </Typography>
              <Typography variant="body2">
                <strong>Avg Eff (whole range):</strong>{" "}
                {fmtAvg(data.meta?.overall_avg_eff)}%
              </Typography>
              {defaultAttCount > 0 ? (
                <Chip
                  size="small"
                  color="warning"
                  variant="outlined"
                  label={`${defaultAttCount} row(s) on default 8h attendance`}
                />
              ) : null}
            </Stack>
          ) : null}

          {data?.meta?.notes?.length ? (
            <Alert severity="info" sx={{ mb: 2 }}>
              <Stack component="ul" sx={{ m: 0, pl: 2 }}>
                {data.meta.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </Stack>
            </Alert>
          ) : null}

          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            sx={{ borderBottom: 1, borderColor: "divider", mb: 1.5 }}
          >
            {TABS.map((label) => (
              <Tab key={label} label={label} sx={{ minHeight: 44 }} />
            ))}
          </Tabs>

          {/* Unmount rather than hide — DataGrid measures its container and a
              display:none mount collapses its columns. */}
          {tab === 0 ? (
            <ReportGrid
              rows={baseRows}
              columns={baseColumns}
              getRowId={(r) =>
                `${r.tran_date}|${r.spell_code ?? r.shift ?? ""}|${r.eb_id ?? ""}|${r.item_id ?? ""}`
              }
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
              getRowId={(r) => r.__rid}
              loading={loading}
              error={error}
              branchId={branchId}
            />
          ) : null}
          {tab === 2 ? (
            <ReportGrid
              rows={dayRows}
              columns={dayColumns}
              getRowId={(r) => r.__rid}
              loading={loading}
              error={error}
              branchId={branchId}
            />
          ) : null}
        </>
      )}
    </Box>
  );
}

export default function WindingLowProducerPage() {
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
