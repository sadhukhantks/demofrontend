"use client";

/**
 * Bale Heavy/Light (HY/LT) — the mill's observed-vs-standard-vs-moisture-
 * corrected bale weight report, per quality, with SACKING / HESSIAN / OVERALL
 * total rows. One request for a date range (default today; quick buttons for
 * Today / Yesterday / MTD). The maths (spec §5 F1–F8) is server-side; this
 * page only lays the rows out, tints the deviation cells (positive = heavy,
 * negative = light) and flags where each row's avg MR % came from
 * (`mr_source`: item reading, group fallback, or none → corrected columns
 * blank).
 *
 * Contract: docs/bale-production-spec-sheet.md §6.3 / §8.4 (see ./types.ts).
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
  Box,
  Button,
  ButtonGroup,
  Chip,
  CircularProgress,
  GlobalStyles,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { GridColDef } from "@mui/x-data-grid";
import { Printer } from "lucide-react";
import ReportGrid, { numCol } from "@/components/reports/ReportGrid";
import { useReportBranches } from "@/components/reports/useReportBranches";
import { useMounted } from "@/components/reports/useMounted";
import { todayIso, yesterdayIso } from "@/components/reports/reportDates";
import { exportRowsToExcel } from "@/components/reports/exportExcel";
import type { BranchOption } from "@/components/reports/types";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { tokens } from "@/styles/tokens";
import { apiRoutesPortalMasters } from "@/utils/api";
import { fetchWithCookie } from "@/utils/apiClient2";
import type { BaleHeavyLight, HeavyLightGridRow, MrSource } from "./types";
import {
  buildHeavyLightGridRows,
  classifyDeviation,
  deviationSx,
  fmtSignedPct,
  mtdRange,
} from "./heavyLightUtils";
import HeavyLightPrintSheet from "./_components/HeavyLightPrintSheet";

// --------------------------------------------------------------- fetch ----

interface FetchParams {
  coId: number;
  branchId: number;
  dateFrom: string;
  dateTo: string;
}

async function fetchBaleHeavyLight(p: FetchParams): Promise<BaleHeavyLight> {
  const qs = new URLSearchParams({
    co_id: String(p.coId),
    branch_id: String(p.branchId),
    date_from: p.dateFrom,
    date_to: p.dateTo,
  });
  const res = await fetchWithCookie<{ data: BaleHeavyLight }>(
    `${apiRoutesPortalMasters.BALE_REPORT_HEAVY_LIGHT}?${qs.toString()}`,
  );
  if (res.error || !res.data) {
    throw new Error(res.error ?? "Failed to fetch the Bale Heavy/Light report");
  }
  return res.data.data;
}

// ------------------------------------------------------------- columns ----

const MR_SOURCE_TAG: Record<
  MrSource,
  { label: string; color: "default" | "warning" | "error"; title: string }
> = {
  item: {
    label: "item",
    color: "default",
    title: "Avg MR % from the SQC packing-MR readings of this quality",
  },
  group: {
    label: "group",
    color: "warning",
    title: "No reading for this quality — HESSIAN/SACKING group average used",
  },
  none: {
    label: "none",
    color: "error",
    title: "No MR reading for the quality or its group — corrected columns blank",
  },
};

/** Deviation % cell: signed 2dp text inside a heavy/light-tinted pill. */
function pctCol(field: keyof HeavyLightGridRow, headerName: string): GridColDef<HeavyLightGridRow> {
  return {
    field,
    headerName,
    type: "number",
    width: 100,
    renderCell: (params) => {
      const value = params.value as number | null;
      if (value === null || value === undefined) return "";
      return (
        <Box component="span" sx={deviationSx(classifyDeviation(value))}>
          {fmtSignedPct(value)}
        </Box>
      );
    },
  };
}

/** Whole-number column (bale counts, weft count) — no ".00". */
function intCol(field: keyof HeavyLightGridRow, headerName: string, width = 100): GridColDef<HeavyLightGridRow> {
  return {
    field,
    headerName,
    type: "number",
    width,
    valueFormatter: (value: unknown) =>
      value === null || value === undefined || value === "" ? "" : String(Number(value)),
  };
}

/** Grid columns exactly as the sheet's HY/LT tab (spec §8.4). */
const COLUMNS: GridColDef<HeavyLightGridRow>[] = [
  { field: "quality", headerName: "Quality", flex: 1, minWidth: 240 },
  { field: "type", headerName: "Type", width: 90 },
  intCol("bales", "No of Bales", 100),
  intCol("weft_count", "Weft (lbs)", 95),
  numCol<HeavyLightGridRow>("avg_mr", "Avg MR %", 100),
  {
    field: "mr_source",
    headerName: "MR source",
    width: 105,
    renderCell: (params) => {
      const src = params.value as MrSource | "";
      if (!src) return "";
      const tag = MR_SOURCE_TAG[src];
      return (
        <Chip
          size="small"
          variant="outlined"
          color={tag.color}
          label={tag.label}
          title={tag.title}
        />
      );
    },
  },
  numCol<HeavyLightGridRow>("std_bale_wt", "Std Wt (kg)", 105),
  numCol<HeavyLightGridRow>("obs_per_bale", "Obs kg/bale", 110),
  numCol<HeavyLightGridRow>("corr_per_bale", "Corr kg/bale", 110),
  pctCol("obs_pct", "Obs %"),
  pctCol("corr_pct", "Corr %"),
  numCol<HeavyLightGridRow>("total_std", "Total Std", 110),
  numCol<HeavyLightGridRow>("total_obs", "Total Obs", 110),
  numCol<HeavyLightGridRow>("total_corr", "Total Corr", 110),
];

// ---------------------------------------------------------------- page ----

function Content() {
  const { branches, coId, companyName, initialBranchId, dateParam } =
    useReportBranches();
  const mounted = useMounted();

  const seedFrom = dateParam ?? todayIso();
  const seedTo = dateParam ?? todayIso();
  const [branchId, setBranchId] = useState<number | null>(initialBranchId);
  const [dateFrom, setDateFrom] = useState(seedFrom);
  const [dateTo, setDateTo] = useState(seedTo);

  const [data, setData] = useState<BaleHeavyLight | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchedOnce = useRef(false);
  const branchSeeded = useRef(false);
  const lastCoId = useRef<number | null>(null);

  // Dates are passed in rather than read from state so the quick buttons can
  // set them and fetch in the same tick without a stale closure.
  const runFetch = useCallback(
    async (bId: number | null, from: string, to: string) => {
      if (coId == null || bId == null || !from || !to) return;
      setLoading(true);
      setError(null);
      try {
        setData(
          await fetchBaleHeavyLight({ coId, branchId: bId, dateFrom: from, dateTo: to }),
        );
      } catch (e) {
        setData(null);
        setError(e instanceof Error ? e.message : "Failed to load the report");
      } finally {
        setLoading(false);
      }
    },
    [coId],
  );

  // Seed the branch ONCE when the sidebar context resolves.
  useEffect(() => {
    if (!branchSeeded.current && initialBranchId != null) {
      branchSeeded.current = true;
      setBranchId(initialBranchId);
    }
  }, [initialBranchId]);

  // Sidebar company switch: the loaded report and the branch belong to the old
  // company — drop both so nothing renders (or prints) mislabeled.
  useEffect(() => {
    if (coId == null) return;
    if (lastCoId.current != null && lastCoId.current !== coId) {
      setData(null);
      setBranchId(null);
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
      void runFetch(b, dateFrom, dateTo);
    }
  }, [coId, branchId, initialBranchId, dateFrom, dateTo, runFetch]);

  const selectedBranch: BranchOption | null =
    branches.find((b) => b.branch_id === branchId) ?? null;

  const rows = useMemo(
    () => (data ? buildHeavyLightGridRows(data) : []),
    [data],
  );
  const hasData = data != null && data.rows.length > 0;
  const isEmpty = data != null && data.rows.length === 0;

  const applyRange = (from: string, to: string) => {
    setDateFrom(from);
    setDateTo(to);
    void runFetch(branchId, from, to);
  };

  const handleExport = useCallback(async () => {
    await exportRowsToExcel(COLUMNS, rows, "bale-heavy-light", {
      companyName,
      branchName: selectedBranch?.branch_name,
      reportName: "Bale Heavy / Light",
      reportFor: dateFrom === dateTo ? dateFrom : `${dateFrom} To ${dateTo}`,
    });
  }, [rows, companyName, selectedBranch?.branch_name, dateFrom, dateTo]);

  return (
    <Box sx={{ p: 3 }}>
      {/* Print: only the plain print sheet is visible; the portal shell, the
          filter bar and the virtualized grid all sit outside .bhl-print-root. */}
      <GlobalStyles
        styles={{
          "@media print": {
            "@page": { size: "landscape" },
            "body *": { visibility: "hidden" },
            ".bhl-print-root, .bhl-print-root *": { visibility: "visible" },
            ".bhl-print-root": {
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
            },
          },
        }}
      />
      <Typography
        variant="h5"
        sx={{ color: tokens.report.header, fontWeight: "bold", mb: 2 }}
      >
        Bale Heavy / Light
      </Typography>

      {mounted && (
        <>
          <Paper elevation={1} sx={{ mb: 2, p: 2 }}>
            <Box
              sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}
            >
              {/* Branch picker only when more than one branch is in scope;
                  a single branch is auto-selected and shown as text. */}
              {branches.length > 1 ? (
                <Box sx={{ minWidth: 240 }}>
                  <SearchableSelect<BranchOption>
                    variant="outlined"
                    size="small"
                    label="Branch"
                    options={branches}
                    value={selectedBranch}
                    onChange={(opt) => setBranchId(opt?.branch_id ?? null)}
                    getOptionLabel={(o) => o.branch_name}
                    getOptionKey={(o) => o.branch_id}
                    isOptionEqualToValue={(o, v) => o.branch_id === v.branch_id}
                    clearable={false}
                  />
                </Box>
              ) : (
                <Typography variant="body2" sx={{ minWidth: 160 }}>
                  <strong>Branch:</strong> {selectedBranch?.branch_name ?? "—"}
                </Typography>
              )}
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
              <ButtonGroup size="small" variant="outlined" disabled={branchId == null || loading}>
                <Button
                  sx={{ textTransform: "none" }}
                  onClick={() => applyRange(todayIso(), todayIso())}
                >
                  Today
                </Button>
                <Button
                  sx={{ textTransform: "none" }}
                  onClick={() => applyRange(yesterdayIso(), yesterdayIso())}
                >
                  Yesterday
                </Button>
                <Button
                  sx={{ textTransform: "none" }}
                  title="Month to date: 1st of this month → today"
                  onClick={() => {
                    const r = mtdRange();
                    applyRange(r.from, r.to);
                  }}
                >
                  MTD
                </Button>
              </ButtonGroup>
              <Button
                variant="contained"
                disabled={branchId == null || loading}
                onClick={() => void runFetch(branchId, dateFrom, dateTo)}
                sx={{
                  backgroundColor: tokens.report.header,
                  "&:hover": { backgroundColor: tokens.report.headerHover },
                  textTransform: "none",
                }}
              >
                Submit
              </Button>
              <Button
                variant="outlined"
                disabled={branchId == null || !hasData}
                onClick={() => void handleExport()}
                sx={{ textTransform: "none" }}
              >
                Export to Excel
              </Button>
              <Button
                variant="outlined"
                startIcon={<Printer size={16} />}
                disabled={branchId == null || !hasData}
                onClick={() => window.print()}
                sx={{ textTransform: "none" }}
              >
                Print
              </Button>
            </Box>
          </Paper>

          {data?.notes?.length ? (
            <Alert severity="info" sx={{ mb: 2 }}>
              <Stack component="ul" sx={{ m: 0, pl: 2 }}>
                {data.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </Stack>
            </Alert>
          ) : null}

          {!loading && isEmpty && !error ? (
            <Alert severity="info" sx={{ mb: 2 }}>
              No production bales were weighed between {data?.date_from} and{" "}
              {data?.date_to} for this branch.
            </Alert>
          ) : null}

          <ReportGrid
            rows={rows}
            columns={COLUMNS}
            getRowId={(r) => r.__id}
            loading={loading}
            error={error}
            branchId={branchId}
          />

          <Typography
            variant="caption"
            color="text.secondary"
            component="p"
            sx={{ mt: 1 }}
          >
            Positive % = heavy (over standard), negative % = light. Obs kg/bale = Σ net ÷
            bales (PROD only); Corr = Obs × (100 + std MR) ÷ (100 + avg MR). Repack rows are
            excluded.
          </Typography>

          {hasData && data ? (
            <HeavyLightPrintSheet
              rows={rows}
              companyName={companyName}
              branchName={selectedBranch?.branch_name ?? null}
              dateFrom={data.date_from}
              dateTo={data.date_to}
              notes={data.notes ?? []}
            />
          ) : null}
        </>
      )}
    </Box>
  );
}

export default function BaleHeavyLightPage() {
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
