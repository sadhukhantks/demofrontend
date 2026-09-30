"use client";

/**
 * Selection vs Jute Issue — compares the jute issued to production (D3 rule:
 * MR-sourced `jute_issue` rows, quality = `jute_mr_li.actual_item_id`) with
 * the selection trolley weights recorded for the same quality, per branch,
 * over a date range. Spec §4.2 of
 * docs/claude/modules/jute-production/selection-trolley-weight-spec.md.
 *
 * Filters: branch (sidebar scope norm), From / To (default current month),
 * Submit. Loads once automatically when a branch resolves, then only on
 * Submit. Sections: KPI strip, "By quality" grid (with Grand Total),
 * "Day-wise" grid and a "By gate entry" grid shown only when it has rows.
 * Excel export writes ONE flattened sheet (a Section column stacks the three
 * grids). Responsive (D8): KPI tiles 2-per-row on phones, 4 on desktop; each
 * grid sits inside a horizontally scrollable box; no fixed input widths.
 *
 * Contract: spec §3.3 (see ./types.ts); pure helpers in ./selectionVsIssueUtils.ts.
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
  CircularProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { GridColDef, GridRenderCellParams } from "@mui/x-data-grid";
import { usePathname } from "next/navigation";
import ReportGrid, { fmtNum, numCol } from "@/components/reports/ReportGrid";
import { exportRowsToExcel } from "@/components/reports/exportExcel";
import { useReportBranches } from "@/components/reports/useReportBranches";
import { useMounted } from "@/components/reports/useMounted";
import { currentMonthRange } from "@/components/reports/reportDates";
import type { BranchOption } from "@/components/reports/types";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { tokens } from "@/styles/tokens";
import { apiRoutesPortalMasters } from "@/utils/api";
import { fetchWithCookie } from "@/utils/apiClient2";
import { resolveReportMenuId } from "@/utils/reportMenuService";
import type {
  DayGridRow,
  GateGridRow,
  QualityGridRow,
  ReportTotals,
  SelectionVsIssueReport,
} from "./types";
import {
  EXPORT_COLUMNS,
  buildDayGridRows,
  buildGateGridRows,
  buildQualityGridRows,
  flattenForExcel,
  fmtKg,
  fmtSignedPct,
  isGrandTotalRow,
  resolveTotals,
  validateRange,
} from "./selectionVsIssueUtils";

// --------------------------------------------------------------- fetch ----

interface FetchParams {
  coId: number;
  branchId: number;
  dateFrom: string;
  dateTo: string;
}

async function fetchSelectionVsIssue(p: FetchParams): Promise<SelectionVsIssueReport> {
  const qs = new URLSearchParams({
    co_id: String(p.coId),
    branch_id: String(p.branchId),
    date_from: p.dateFrom,
    date_to: p.dateTo,
  });
  const res = await fetchWithCookie<{ data: SelectionVsIssueReport }>(
    `${apiRoutesPortalMasters.SELECTION_VS_ISSUE_REPORT}?${qs.toString()}`,
  );
  if (res.error || !res.data?.data) {
    throw new Error(res.error ?? "Failed to fetch the Selection vs Jute Issue report");
  }
  const d = res.data.data;
  return {
    ...d,
    by_quality: d.by_quality ?? [],
    by_day: d.by_day ?? [],
    by_gate_entry: d.by_gate_entry ?? [],
  };
}

// ------------------------------------------------------------- columns ----

/** Palette key for a signed difference: shortfall in error, surplus in success. */
const diffColor = (v: number | null | undefined): string | undefined => {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return undefined;
  return n < 0 ? "error.main" : "success.main";
};

/** Right-aligned 3dp difference column; sign-coloured on data rows only (the
 * Grand Total row keeps the kit's white-on-blue styling). */
function diffCol<T extends { id: string; diff_kg: number }>(
  headerName: string,
): GridColDef<T> {
  return {
    ...numCol<T>("diff_kg", headerName, 130, 3),
    renderCell: (params: GridRenderCellParams<T, number>) => {
      const total = isGrandTotalRow(params.row);
      return (
        <Box
          component="span"
          sx={{ color: total ? "inherit" : diffColor(params.value), fontWeight: total ? 700 : 500 }}
        >
          {fmtNum(params.value, 3)}
        </Box>
      );
    },
  };
}

const QUALITY_COLUMNS: GridColDef<QualityGridRow>[] = [
  { field: "item_code", headerName: "Item Code", width: 110 },
  { field: "item_name", headerName: "Quality", flex: 1, minWidth: 160 },
  numCol("issue_kg", "Issued (kg)", 120, 3),
  numCol("selection_kg", "Selected (kg)", 120, 3),
  numCol("trolleys", "Trolleys", 90, 0),
  diffCol<QualityGridRow>("Difference (kg)"),
  numCol("diff_pct", "Difference %", 110, 2),
];

const DAY_COLUMNS: GridColDef<DayGridRow>[] = [
  { field: "tran_date", headerName: "Date", width: 110 },
  { field: "item_name", headerName: "Quality", flex: 1, minWidth: 160 },
  numCol("issue_kg", "Issued (kg)", 120, 3),
  numCol("selection_kg", "Selected (kg)", 120, 3),
  numCol("trolleys", "Trolleys", 90, 0),
  diffCol<DayGridRow>("Difference (kg)"),
];

const GATE_COLUMNS: GridColDef<GateGridRow>[] = [
  { field: "gate_entry_no", headerName: "Gate Entry No", width: 120 },
  { field: "gate_entry_date", headerName: "Gate Entry Date", width: 130 },
  { field: "item_name", headerName: "Quality", flex: 1, minWidth: 160 },
  numCol("issue_kg", "Issued (kg)", 120, 3),
  numCol("selection_kg", "Selected (kg)", 120, 3),
  numCol("trolleys", "Trolleys", 90, 0),
  diffCol<GateGridRow>("Difference (kg)"),
];

/** Grid tall enough for its rows (header + rows + footer), capped like the kit default. */
const gridHeight = (rowCount: number): number =>
  Math.min(600, Math.max(220, 60 + 53 + rowCount * 44));

// ---------------------------------------------------------------- KPIs ----

function KpiTile({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
        {label}
      </Typography>
      <Typography
        variant="h6"
        sx={{ fontWeight: 700, color: color ?? "text.primary", lineHeight: 1.3, wordBreak: "break-word" }}
      >
        {value}
      </Typography>
      {sub ? (
        <Typography variant="caption" sx={{ color: color ?? "text.secondary" }}>
          {sub}
        </Typography>
      ) : null}
    </Paper>
  );
}

function KpiStrip({ totals }: { totals: ReportTotals }) {
  const diffTone = diffColor(totals.diff_kg);
  return (
    <Box
      sx={{
        display: "grid",
        gap: 1.5,
        mb: 2,
        gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" },
      }}
    >
      <KpiTile label="Issued (kg)" value={fmtKg(totals.issue_kg)} />
      <KpiTile label="Selected (kg)" value={fmtKg(totals.selection_kg)} />
      <KpiTile label="Trolleys" value={String(totals.trolleys)} />
      <KpiTile
        label="Difference (kg)"
        value={fmtKg(totals.diff_kg)}
        sub={fmtSignedPct(totals.diff_pct)}
        color={diffTone}
      />
    </Box>
  );
}

// ---------------------------------------------------------------- page ----

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: tokens.report.header, mb: 1 }}>
      {children}
    </Typography>
  );
}

function Content() {
  const { branches, coId, companyName, initialBranchId, dateParam } = useReportBranches();
  const mounted = useMounted();
  const pathname = usePathname();
  const month = useMemo(() => currentMonthRange(), []);

  const [branchId, setBranchId] = useState<number | null>(initialBranchId);
  const [dateFrom, setDateFrom] = useState<string>(month.from);
  const [dateTo, setDateTo] = useState<string>(dateParam ?? month.to);

  const [data, setData] = useState<SelectionVsIssueReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchedOnce = useRef(false);
  const branchSeeded = useRef(false);
  const lastCoId = useRef<number | null>(null);

  const runFetch = useCallback(
    async (bId: number | null) => {
      if (coId == null || bId == null) return;
      const rangeError = validateRange(dateFrom, dateTo);
      if (rangeError) {
        setError(rangeError);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        setData(await fetchSelectionVsIssue({ coId, branchId: bId, dateFrom, dateTo }));
      } catch (e) {
        setData(null);
        setError(e instanceof Error ? e.message : "Failed to load the report");
      } finally {
        setLoading(false);
      }
    },
    [coId, dateFrom, dateTo],
  );

  // Seed the branch ONCE when the sidebar context resolves.
  useEffect(() => {
    if (!branchSeeded.current && initialBranchId != null) {
      branchSeeded.current = true;
      setBranchId(initialBranchId);
    }
  }, [initialBranchId]);

  // Sidebar company switch: the loaded report and the branch belong to the
  // old company — drop them so nothing renders mislabeled.
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
      void runFetch(b);
    }
  }, [coId, branchId, initialBranchId, runFetch]);

  const selectedBranch: BranchOption | null =
    branches.find((b) => b.branch_id === branchId) ?? null;

  const totals = useMemo(() => (data ? resolveTotals(data) : null), [data]);
  const qualityRows = useMemo(() => buildQualityGridRows(data?.by_quality ?? []), [data]);
  const dayRows = useMemo(() => buildDayGridRows(data?.by_day ?? []), [data]);
  const gateRows = useMemo(() => buildGateGridRows(data?.by_gate_entry ?? []), [data]);

  const isEmpty = data != null && qualityRows.length === 0 && dayRows.length === 0;
  const hasData = data != null && !isEmpty;

  const handleExport = useCallback(async () => {
    if (!data) return;
    await exportRowsToExcel(EXPORT_COLUMNS, flattenForExcel(data), "selection-vs-issue", {
      companyName,
      branchName: selectedBranch?.branch_name ?? data.branch_name,
      reportName: "Selection vs Jute Issue",
      reportNo: await resolveReportMenuId(pathname),
      reportFor: `${data.date_from} To ${data.date_to}`,
    });
  }, [data, companyName, selectedBranch?.branch_name, pathname]);

  const inputSx = { flex: { xs: "1 1 100%", sm: "0 1 180px" } } as const;
  const buttonSx = { flex: { xs: "1 1 100%", sm: "0 0 auto" }, textTransform: "none" } as const;

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Typography variant="h5" sx={{ color: tokens.report.header, fontWeight: "bold", mb: 2 }}>
        Selection vs Jute Issue
      </Typography>

      {mounted && (
        <>
          <Paper elevation={1} sx={{ mb: 2, p: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
              {branches.length > 1 ? (
                <Box sx={{ flex: { xs: "1 1 100%", sm: "0 1 240px" } }}>
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
                    fullWidth
                  />
                </Box>
              ) : (
                <Typography variant="body2" sx={{ flex: { xs: "1 1 100%", sm: "0 1 auto" } }}>
                  <strong>Branch:</strong> {selectedBranch?.branch_name ?? "—"}
                </Typography>
              )}
              <TextField
                type="date"
                label="From"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                size="small"
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: dateTo || undefined } }}
                sx={inputSx}
              />
              <TextField
                type="date"
                label="To"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                size="small"
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: dateFrom || undefined } }}
                sx={inputSx}
              />
              <Button
                variant="contained"
                disabled={branchId == null || loading}
                onClick={() => void runFetch(branchId)}
                sx={{
                  ...buttonSx,
                  backgroundColor: tokens.report.header,
                  "&:hover": { backgroundColor: tokens.report.headerHover },
                }}
              >
                Submit
              </Button>
              <Button
                variant="outlined"
                disabled={!hasData}
                onClick={() => void handleExport()}
                sx={buttonSx}
              >
                Export to Excel
              </Button>
            </Box>
          </Paper>

          {error ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          ) : null}
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
              <CircularProgress />
            </Box>
          ) : null}

          {!loading && branchId == null ? (
            <Alert severity="info">Select a branch to view the report.</Alert>
          ) : null}

          {!loading && isEmpty && data ? (
            <Alert severity="info">
              No jute issue or selection entries between {data.date_from} and {data.date_to} for
              this branch.
            </Alert>
          ) : null}

          {!loading && hasData && data && totals ? (
            <Stack spacing={3}>
              <KpiStrip totals={totals} />

              <Box>
                <SectionTitle>By quality</SectionTitle>
                <Box sx={{ overflowX: "auto", width: "100%" }}>
                  <ReportGrid
                    rows={qualityRows}
                    columns={QUALITY_COLUMNS}
                    getRowId={(r) => r.id}
                    loading={false}
                    error={null}
                    height={gridHeight(qualityRows.length)}
                    isTotalRow={isGrandTotalRow}
                  />
                </Box>
              </Box>

              <Box>
                <SectionTitle>Day-wise</SectionTitle>
                {dayRows.length ? (
                  <Box sx={{ overflowX: "auto", width: "100%" }}>
                    <ReportGrid
                      rows={dayRows}
                      columns={DAY_COLUMNS}
                      getRowId={(r) => r.id}
                      loading={false}
                      error={null}
                      height={gridHeight(dayRows.length)}
                      isTotalRow={() => false}
                    />
                  </Box>
                ) : (
                  <Alert severity="info">No day-wise rows in this period.</Alert>
                )}
              </Box>

              {gateRows.length ? (
                <Box>
                  <SectionTitle>By gate entry</SectionTitle>
                  <Box sx={{ overflowX: "auto", width: "100%" }}>
                    <ReportGrid
                      rows={gateRows}
                      columns={GATE_COLUMNS}
                      getRowId={(r) => r.id}
                      loading={false}
                      error={null}
                      height={gridHeight(gateRows.length)}
                      isTotalRow={() => false}
                    />
                  </Box>
                </Box>
              ) : null}
            </Stack>
          ) : null}
        </>
      )}
    </Box>
  );
}

export default function SelectionVsIssuePage() {
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
