"use client";

/**
 * Spinning Production Report — five date-wise pivots over a period, picked by
 * Report Type: Quality Wise, Worker Wise, Total Prod Wise, Side Wise (Fine /
 * Coarse) and Machine Wise. Each group shows a Prod (kg) line and an Eff %
 * line, plus Avg Prod/Frame where the report carries it.
 *
 * Figures come from the same rows as the Spinning Low Producer report; the
 * backend decides the lines, the totals and the label columns per type.
 */

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, CircularProgress, Paper, TextField, Typography } from "@mui/material";
import { usePathname } from "next/navigation";
import { GridColDef } from "@mui/x-data-grid";
import ReportGrid, { numCol } from "@/components/reports/ReportGrid";
import { useReportBranches } from "@/components/reports/useReportBranches";
import { useMounted } from "@/components/reports/useMounted";
import { currentMonthRange } from "@/components/reports/reportDates";
import { exportRowsToExcel } from "@/components/reports/exportExcel";
import { exportRowsToPdf } from "@/components/reports/exportPdf";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { resolveReportMenuId } from "@/utils/reportMenuService";
import type { BranchOption } from "@/components/reports/types";
import {
  fetchSpinningDatewise,
  SPINNING_REPORT_TYPES,
  type SpinningDatewiseReport,
  type SpinningReportTypeOption,
} from "./_service";

const TITLE = "Spinning Production Report";

type GridRow = Record<string, string | number | null> & { row_id: number };

const dayField = (iso: string) => `d_${iso}`;

function Content() {
  const { branches, coId, companyName, initialBranchId, dateParam } = useReportBranches();
  const mounted = useMounted();
  const pathname = usePathname();
  const month = currentMonthRange();

  const [branchId, setBranchId] = useState<number | null>(initialBranchId);
  const [dateFrom, setDateFrom] = useState(month.from);
  const [dateTo, setDateTo] = useState(dateParam || month.to);
  const [reportType, setReportType] = useState<SpinningReportTypeOption>(SPINNING_REPORT_TYPES[0]);
  const [report, setReport] = useState<SpinningDatewiseReport | null>(null);
  // The type the loaded rows belong to — the dropdown may have moved on since.
  const [loadedType, setLoadedType] = useState<SpinningReportTypeOption>(SPINNING_REPORT_TYPES[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const branchSeeded = useRef(false);

  useEffect(() => {
    if (!branchSeeded.current && initialBranchId != null) {
      branchSeeded.current = true;
      setBranchId(initialBranchId);
    }
  }, [initialBranchId]);

  // Sidebar company / branch switch: the loaded rows belong to the old scope.
  useEffect(() => {
    setReport(null);
  }, [coId, branchId]);

  const runFetch = useCallback(async () => {
    if (coId == null || branchId == null || !dateFrom || !dateTo) return;
    setLoading(true);
    setError(null);
    try {
      setReport(
        await fetchSpinningDatewise({
          coId,
          branchId,
          dateFrom,
          dateTo,
          reportType: reportType.value,
        }),
      );
      setLoadedType(reportType);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load the report");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [coId, branchId, dateFrom, dateTo, reportType]);

  const columns = useMemo<GridColDef<GridRow>[]>(
    () => [
      ...(report?.labels ?? []).map(
        (headerName, i): GridColDef<GridRow> => ({
          field: `label${i + 1}`,
          headerName,
          minWidth: 150,
          flex: 1,
        }),
      ),
      { field: "line", headerName: "Particulars", width: 140 },
      ...(report?.dates ?? []).map((iso) =>
        numCol<GridRow>(dayField(iso), `${iso.slice(8, 10)}/${iso.slice(5, 7)}`, 90),
      ),
      numCol<GridRow>("total", "Total", 120),
      numCol<GridRow>("average", "Average", 110),
    ],
    [report],
  );

  const rows = useMemo<GridRow[]>(
    () =>
      (report?.rows ?? []).map((r, i) => {
        const row: GridRow = {
          row_id: i,
          label1: r.label1,
          label2: r.label2,
          line: r.line,
          total: r.total,
          average: r.average,
        };
        for (const [iso, v] of Object.entries(r.days)) row[dayField(iso)] = v;
        return row;
      }),
    [report],
  );

  const branch: BranchOption | null = branches.find((b) => b.branch_id === branchId) ?? null;

  const exportHeader = async () => ({
    companyName,
    branchName: branch?.branch_name,
    reportName: `${TITLE} — ${loadedType.label}`,
    reportFor: `${dateFrom} To ${dateTo}`,
    reportNo: await resolveReportMenuId(pathname),
  });
  const exportName = `spinning-production-${loadedType.value}`;

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
              <Box sx={{ minWidth: 240 }}>
                <SearchableSelect<SpinningReportTypeOption>
                  options={SPINNING_REPORT_TYPES}
                  value={reportType}
                  onChange={(v) => setReportType(v ?? SPINNING_REPORT_TYPES[0])}
                  getOptionLabel={(o) => o.label}
                  isOptionEqualToValue={(o, v) => o.value === v.value}
                  label="Report Type"
                />
              </Box>
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
                  void (async () =>
                    exportRowsToExcel(columns, rows, exportName, await exportHeader()))();
                }}
                sx={{ textTransform: "none" }}
              >
                Export to Excel
              </Button>
              <Button
                variant="outlined"
                disabled={rows.length === 0}
                onClick={() => {
                  void (async () =>
                    exportRowsToPdf(columns, rows, exportName, await exportHeader()))();
                }}
                sx={{ textTransform: "none" }}
              >
                Print PDF
              </Button>
            </Box>
          </Paper>

          {report ? (
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
              {loadedType.label}
            </Typography>
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

export default function SpinningProductionReportPage() {
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
