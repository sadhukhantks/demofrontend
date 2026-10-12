"use client";

/**
 * Spreader Production Report — date-wise pivot over a period.
 *
 *  - Production: one Rolls line and one Kg line per machine × quality, a Total
 *    after each machine and a Grand Total per date.
 *  - Issue: the same per quality (an issue carries no spreader machine).
 *
 * Hours 00-05 are booked to the previous day's C shift, and Average is over the
 * days that have a value — both decided in the backend.
 */

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Box, Button, CircularProgress, Paper, TextField, Typography } from "@mui/material";
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
  fetchSpreaderDatewise,
  fetchSpreaderMachines,
  type SpreaderDatewiseReport,
  type SpreaderMachineOption,
} from "./_service";

const TITLE = "Spreader Production Report";

type GridRow = Record<string, string | number | null> & { row_id: number };

const dayField = (iso: string) => `d_${iso}`;

/** Rolls are whole numbers and Kg mostly are too — show decimals only when present. */
const qtyCol = (field: string, headerName: string, width: number): GridColDef<GridRow> => ({
  ...numCol<GridRow>(field, headerName, width),
  valueFormatter: (value: unknown) => {
    if (value == null || value === "") return "";
    const n = Number(value);
    return Number.isInteger(n) ? String(n) : n.toFixed(2);
  },
});

const machineLabel = (m: SpreaderMachineOption) =>
  m.mech_code ? `${m.mech_code} — ${m.machine_name}` : m.machine_name;

function Content() {
  const { branches, coId, companyName, initialBranchId, dateParam } = useReportBranches();
  const mounted = useMounted();
  const pathname = usePathname();
  const month = currentMonthRange();

  const [branchId, setBranchId] = useState<number | null>(initialBranchId);
  const [dateFrom, setDateFrom] = useState(month.from);
  const [dateTo, setDateTo] = useState(dateParam || month.to);
  const [machines, setMachines] = useState<SpreaderMachineOption[]>([]);
  const [machine, setMachine] = useState<SpreaderMachineOption | null>(null);
  const [report, setReport] = useState<SpreaderDatewiseReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const branchSeeded = useRef(false);

  useEffect(() => {
    if (!branchSeeded.current && initialBranchId != null) {
      branchSeeded.current = true;
      setBranchId(initialBranchId);
    }
  }, [initialBranchId]);

  // Machines belong to the branch — reload them and drop the old pick and rows.
  useEffect(() => {
    setMachine(null);
    setMachines([]);
    setReport(null);
    if (coId == null || branchId == null) return;
    let stale = false;
    fetchSpreaderMachines(coId, branchId)
      .then((m) => {
        if (!stale) setMachines(m);
      })
      .catch((err: unknown) => {
        if (!stale) setError(err instanceof Error ? err.message : "Failed to load machines");
      });
    return () => {
      stale = true;
    };
  }, [coId, branchId]);

  const runFetch = useCallback(async () => {
    if (coId == null || branchId == null || !dateFrom || !dateTo) return;
    setLoading(true);
    setError(null);
    try {
      setReport(
        await fetchSpreaderDatewise({
          coId,
          branchId,
          dateFrom,
          dateTo,
          machineId: machine?.machine_id,
        }),
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load the report");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [coId, branchId, dateFrom, dateTo, machine]);

  const columns = useMemo<GridColDef<GridRow>[]>(
    () => [
      { field: "kind", headerName: "Type", width: 110 },
      { field: "machine_name", headerName: "Mc No", width: 110 },
      { field: "quality_label", headerName: "Quality", minWidth: 180, flex: 1 },
      { field: "unit", headerName: "Unit", width: 80 },
      ...(report?.dates ?? []).map((iso) =>
        qtyCol(dayField(iso), `${iso.slice(8, 10)}/${iso.slice(5, 7)}`, 80),
      ),
      qtyCol("total", "Total", 110),
      qtyCol("average", "Average", 110),
    ],
    [report],
  );

  const rows = useMemo<GridRow[]>(
    () =>
      (report?.rows ?? []).map((r, i) => {
        const row: GridRow = {
          row_id: i,
          kind: r.kind,
          machine_name: r.machine_name,
          quality_label: r.quality_label,
          unit: r.unit,
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
              <Box sx={{ minWidth: 220 }}>
                <SearchableSelect<SpreaderMachineOption>
                  options={machines}
                  value={machine}
                  onChange={(v) => setMachine(v)}
                  getOptionLabel={machineLabel}
                  isOptionEqualToValue={(o, v) => o.machine_id === v.machine_id}
                  label="Mc No (all)"
                />
              </Box>
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
                    exportRowsToExcel(columns, rows, "spreader-production", await exportHeader()))();
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
                    exportRowsToPdf(columns, rows, "spreader-production", await exportHeader()))();
                }}
                sx={{ textTransform: "none" }}
              >
                Print PDF
              </Button>
            </Box>
          </Paper>

          {machine ? (
            <Alert severity="info" sx={{ mb: 2 }}>
              Mc No filters the Production rows only — an issue is made from a bin, not from a
              spreader, so the Issue rows always cover every machine.
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

export default function SpreaderProductionReportPage() {
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
