"use client";

/**
 * S4 Incentive Report — per S4 weaver or S4 helper: efficiency of each day in
 * the range, average efficiency, days worked, incentive days and the
 * efficiency-slab incentive earned. Port of the legacy code3i
 * "S4 Incentive Report" (admin/reports/S4_incentive_report).
 */

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Box, Button, CircularProgress, Paper, TextField, Typography } from "@mui/material";
import { usePathname } from "next/navigation";
import { GridColDef } from "@mui/x-data-grid";
import ReportGrid, { numCol } from "@/components/reports/ReportGrid";
import { useReportBranches } from "@/components/reports/useReportBranches";
import { useMounted } from "@/components/reports/useMounted";
import { currentMonthRange } from "@/components/reports/reportDates";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { resolveReportMenuId } from "@/utils/reportMenuService";
import type { BranchOption } from "@/components/reports/types";
import { fetchS4Incentive, type S4IncentiveReport, type S4WorkerType } from "./_service";
import {
  BAD_EFF,
  dayField,
  exportS4Excel,
  exportS4Pdf,
  GOOD_EFF,
  type S4GridRow as GridRow,
} from "./_export";

const TITLE = "S4 Incentive Report";

interface WorkerTypeOption {
  value: S4WorkerType;
  label: string;
  /** Export heading, as the legacy sheet titled it. */
  heading: string;
}
const WORKER_TYPES: readonly WorkerTypeOption[] = Object.freeze([
  { value: "weaver", label: "Weaver", heading: "S4 Weavers Incentive" },
  { value: "helper", label: "Helper", heading: "S4 Helpers Incentive" },
]);

/** Whole-number column — efficiencies and day counts are integers, so the
 * shared 2-decimal numCol format would only add ".00" noise. */
const intCol = (field: string, headerName: string, width: number): GridColDef<GridRow> => ({
  ...numCol<GridRow>(field, headerName, width),
  valueFormatter: (value: unknown) => (value == null || value === "" ? "" : String(value)),
});

function Content() {
  const { branches, coId, companyName, initialBranchId, dateParam } = useReportBranches();
  const mounted = useMounted();
  const pathname = usePathname();
  const month = currentMonthRange();

  const [branchId, setBranchId] = useState<number | null>(initialBranchId);
  const [dateFrom, setDateFrom] = useState(month.from);
  const [dateTo, setDateTo] = useState(dateParam || month.to);
  const [workerType, setWorkerType] = useState<WorkerTypeOption>(WORKER_TYPES[0]);
  const [ebNo, setEbNo] = useState("");
  const [report, setReport] = useState<S4IncentiveReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const branchSeeded = useRef(false);

  useEffect(() => {
    if (!branchSeeded.current && initialBranchId != null) {
      branchSeeded.current = true;
      setBranchId(initialBranchId);
    }
  }, [initialBranchId]);

  // Sidebar company switch: the branch and loaded rows belong to the old company.
  useEffect(() => {
    setReport(null);
  }, [coId]);

  const runFetch = useCallback(async () => {
    if (coId == null || branchId == null || !dateFrom || !dateTo) return;
    setLoading(true);
    setError(null);
    try {
      setReport(
        await fetchS4Incentive({ coId, branchId, dateFrom, dateTo, workerType: workerType.value, ebNo }),
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load the report");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [coId, branchId, dateFrom, dateTo, workerType, ebNo]);

  const columns = useMemo<GridColDef<GridRow>[]>(
    () => [
      { field: "eb_no", headerName: "EB No", width: 110 },
      { field: "worker_name", headerName: "Name", minWidth: 180, flex: 1 },
      // Header "dd/mm", as the legacy sheet labelled its day columns.
      ...(report?.dates ?? []).map(
        (iso): GridColDef<GridRow> => ({
          ...intCol(dayField(iso), `${iso.slice(8, 10)}/${iso.slice(5, 7)}`, 70),
          // Legacy cell rules: "X" = not worked / nothing produced.
          valueFormatter: (value: unknown, row: GridRow) =>
            row.total_days == null ? "" : Number(value ?? 0) > 0 ? String(value) : "X",
          // Green = at or above the incentive floor, red = very low.
          cellClassName: (p) => {
            const eff = Number(p.value ?? 0);
            if (eff >= GOOD_EFF) return "report-cell-good";
            return eff > 0 && eff < BAD_EFF ? "report-cell-bad" : "";
          },
        }),
      ),
      intCol("avg_eff", "Avg Eff(%)", 100),
      intCol("total_days", "No of Days", 100),
      intCol("inc_days", "Inc Days", 100),
      numCol<GridRow>("total_inc_amt", "Inc Amount", 130),
    ],
    [report],
  );

  const rows = useMemo<GridRow[]>(() => {
    if (!report) return [];
    const out: GridRow[] = report.rows.map((r, i) => {
      const row: GridRow = {
        row_id: i,
        eb_no: r.eb_no ?? String(r.eb_id),
        worker_name: r.worker_name,
        total_days: r.total_days,
        avg_eff: r.avg_eff,
        total_inc_amt: r.total_inc_amt,
        inc_days: r.inc_days,
      };
      for (const [iso, eff] of Object.entries(r.days)) row[dayField(iso)] = eff;
      return row;
    });
    if (out.length) {
      out.push({
        row_id: out.length,
        eb_no: "Grand Total",
        worker_name: null,
        total_inc_amt: report.total_inc_amt,
      });
    }
    return out;
  }, [report]);

  const branch: BranchOption | null = branches.find((b) => b.branch_id === branchId) ?? null;

  const exportHeader = async () => ({
    companyName,
    branchName: branch?.branch_name,
    reportName: workerType.heading,
    reportFor: `For the Period From ${dateFrom} To ${dateTo}`,
    reportNo: await resolveReportMenuId(pathname),
  });

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" color="primary" sx={{ fontWeight: "bold", mb: 2 }}>
        {TITLE}
      </Typography>

      {mounted && (
        <>
          <Paper elevation={1} sx={{ mb: 2, p: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
              {branches.length > 1 ? (
                <Box sx={{ minWidth: 220 }}>
                  <SearchableSelect<BranchOption>
                    options={branches}
                    value={branch}
                    onChange={(v) => setBranchId(v?.branch_id ?? null)}
                    getOptionLabel={(o) => o.branch_name}
                    isOptionEqualToValue={(o, v) => o.branch_id === v.branch_id}
                    label="Branch"
                  />
                </Box>
              ) : (
                <Typography variant="body2">
                  <strong>Branch:</strong> {branch?.branch_name ?? "—"}
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
              <Box sx={{ minWidth: 160 }}>
                <SearchableSelect<WorkerTypeOption>
                  options={WORKER_TYPES}
                  value={workerType}
                  onChange={(v) => {
                    if (!v) return;
                    setWorkerType(v);
                    // The loaded rows belong to the other worker type.
                    setReport(null);
                  }}
                  getOptionLabel={(o) => o.label}
                  isOptionEqualToValue={(o, v) => o.value === v.value}
                  label="Loom Type"
                />
              </Box>
              <TextField
                label="EB No"
                value={ebNo}
                onChange={(e) => setEbNo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void runFetch();
                }}
                size="small"
                sx={{ width: 140 }}
              />
              <Box sx={{ flexGrow: 1 }} />
              <Button
                variant="contained"
                disabled={branchId == null || coId == null || loading}
                onClick={() => void runFetch()}
                sx={{ textTransform: "none" }}
              >
                Submit
              </Button>
              <Button
                variant="outlined"
                disabled={rows.length === 0}
                onClick={() => {
                  void (async () => exportS4Excel(columns, rows, await exportHeader()))();
                }}
                sx={{ textTransform: "none" }}
              >
                Export to Excel
              </Button>
              <Button
                variant="outlined"
                disabled={rows.length === 0}
                onClick={() => {
                  void (async () => exportS4Pdf(columns, rows, await exportHeader()))();
                }}
                sx={{ textTransform: "none" }}
              >
                Print PDF
              </Button>
            </Box>
          </Paper>

          {report?.notes.length ? (
            <Alert severity="info" sx={{ mb: 2 }}>
              {report.notes.join(" · ")}
            </Alert>
          ) : null}

          <ReportGrid
            rows={rows}
            columns={columns}
            getRowId={(r) => r.row_id}
            loading={loading}
            error={error}
            branchId={branchId}
          />
        </>
      )}
    </Box>
  );
}

export default function S4IncentivePage() {
  // useReportBranches() reads useSearchParams() — `next build` needs Suspense above it.
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
