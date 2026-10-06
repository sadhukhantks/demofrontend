"use client";

/**
 * S4 Incentive Report — per weaver on the S4 looms: efficiency of each day in
 * the range, days worked, average efficiency and the efficiency-slab incentive
 * earned. Port of the legacy Data-Portal "S4 Loom Incentive" report (submenu 677).
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
import { fetchS4Incentive, type S4IncentiveReport } from "./_service";
import {
  dayField,
  exportS4Excel,
  exportS4Pdf,
  incField,
  type S4GridRow as GridRow,
} from "./_export";

const TITLE = "S4 Incentive Report";


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
      setReport(await fetchS4Incentive({ coId, branchId, dateFrom, dateTo, ebNo }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load the report");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [coId, branchId, dateFrom, dateTo, ebNo]);

  const columns = useMemo<GridColDef<GridRow>[]>(
    () => [
      { field: "eb_no", headerName: "EB No", width: 110 },
      { field: "worker_name", headerName: "Name", minWidth: 180, flex: 1 },
      // Header "dd/mm", as the legacy sheet labelled its day columns.
      ...(report?.dates ?? []).map(
        (iso): GridColDef<GridRow> => ({
          ...intCol(dayField(iso), `${iso.slice(8, 10)}/${iso.slice(5, 7)}`, 70),
          // Light green = that day's efficiency earned an incentive.
          cellClassName: (p) => (p.row[incField(iso)] ? "report-cell-good" : ""),
        }),
      ),
      intCol("total_days", "Total Days", 100),
      intCol("avg_eff", "Avg Eff %", 100),
      numCol<GridRow>("total_inc_amt", "Total Incentive", 130),
      intCol("inc_days", "Incentive Days", 120),
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
      for (const iso of r.inc_dates ?? []) row[incField(iso)] = 1;
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
    reportName: TITLE,
    reportFor: `${dateFrom} To ${dateTo}`,
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
