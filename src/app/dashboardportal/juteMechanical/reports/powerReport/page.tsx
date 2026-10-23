"use client";

/**
 * Power & DG Report (ITM-004) — day-wise kWh by meter, DG hours / litres and
 * max demand over a date range, each day divided by the DPR's spinning (yarn)
 * and weaving (cloth) tonnes into kWh per tonne, with the 30-day median as
 * the "std" line (no achievement %). Range / MTD / std totals, a day-wise
 * table (compact sticky-column table on phones), Excel export and a landscape
 * print-out with no browser header / footer.
 *
 * The page owns the branch, the dates and the fetch; the components under
 * `_components/` only render. Dates apply on Submit; the previous render stays
 * up at reduced opacity while a refetch is in flight.
 */

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import BranchScopePicker from "@/components/reports/BranchScopePicker";
import { useReportBranches } from "@/components/reports/useReportBranches";
import { exportRowsToExcel, type ReportExportHeader } from "@/components/reports/exportExcel";
import { gridPrintSection, printReportSections, type PrintSection } from "@/components/reports/printReport";
import { useMounted } from "@/components/reports/useMounted";
import { yesterdayIso } from "@/components/reports/reportDates";
import { tokens } from "@/styles/tokens";
import { fetchPowerReport, type MechPowerReport } from "@/utils/juteMechanicalService";
import { SectionCard } from "@/app/dashboardportal/juteProduction/report/dailyProductionReport/_components/DprPieces";
import DataTable from "./_components/DataTable";
import PowerKpiStrip from "./_components/PowerKpiStrip";
import PowerTotalsTable from "./_components/PowerTotalsTable";
import PowerTrendChart from "./_components/PowerTrendChart";
import {
  buildDayCols,
  rowToneOf,
  toGridRows,
  totalsRows,
  type PowerMeasure,
} from "./powerReportColumns";
import { DEFAULT_RANGE_DAYS, matchingPreset, PRESET_DAYS, RANGE_CAP_DAYS, rangeError, windowEndingOn } from "./range";
import { toGridColumns } from "./tableColumns";

const REPORT_NAME = "Power & DG Report";

function errText(e: unknown): string {
  return e instanceof Error ? e.message : "Failed to load the power report";
}

/** fmt for the print-out's totals rows: fixed decimals, em dash for null. */
function printNum(value: number | null, decimals: number): string {
  return value == null ? "—" : value.toFixed(decimals);
}

function Content() {
  const { branches, coId, companyName, initialBranchId, dateParam } = useReportBranches();
  // Branch and dates come from the localStorage-backed sidebar context, so the
  // server HTML and the first client render disagree — hold the filter bar
  // back until mount (same gate as the other report pages).
  const mounted = useMounted();
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down("sm"), { noSsr: true });

  const [branchId, setBranchId] = useState<number | null>(initialBranchId);
  const initialRange = windowEndingOn(dateParam || yesterdayIso(), DEFAULT_RANGE_DAYS);
  const [dateFrom, setDateFrom] = useState<string>(initialRange.from);
  const [dateTo, setDateTo] = useState<string>(initialRange.to);
  const [measure, setMeasure] = useState<PowerMeasure>("kwh_per_t_cloth");

  const [data, setData] = useState<MechPowerReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const branchSeeded = useRef(false);
  const lastCoId = useRef<number | null>(null);
  const loaded = useRef(false);
  const requestNo = useRef(0);

  const run = useCallback(
    async (bId: number | null, from: string, to: string) => {
      if (coId == null || bId == null) return;
      const bad = rangeError(from, to);
      if (bad) {
        setError(bad);
        return;
      }
      const mine = ++requestNo.current;
      setLoading(true);
      setError(null);
      try {
        const res = await fetchPowerReport({ coId, branchId: bId, dateFrom: from, dateTo: to });
        // A slower earlier request must not overwrite a newer answer.
        if (mine !== requestNo.current) return;
        setData(res);
      } catch (e: unknown) {
        if (mine !== requestNo.current) return;
        setError(errText(e));
        setData(null);
      } finally {
        if (mine === requestNo.current) setLoading(false);
      }
    },
    [coId],
  );

  // Seed the branch ONCE when the sidebar context resolves; the user owns it after that.
  useEffect(() => {
    if (!branchSeeded.current && initialBranchId != null) {
      branchSeeded.current = true;
      setBranchId(initialBranchId);
    }
  }, [initialBranchId]);

  // Sidebar company switch: the loaded result and the branch belong to the old
  // company — drop them rather than show them under the new company's name.
  useEffect(() => {
    if (coId == null) return;
    if (lastCoId.current != null && lastCoId.current !== coId) {
      setData(null);
      setBranchId(null);
      branchSeeded.current = false;
      loaded.current = false;
    }
    lastCoId.current = coId;
  }, [coId]);

  // One automatic load, on the first render with a branch available.
  useEffect(() => {
    const bId = branchId ?? initialBranchId;
    if (coId == null || bId == null || loaded.current) return;
    loaded.current = true;
    void run(bId, dateFrom, dateTo);
  }, [coId, branchId, initialBranchId, dateFrom, dateTo, run]);

  const submit = useCallback(() => {
    void run(branchId, dateFrom, dateTo);
  }, [run, branchId, dateFrom, dateTo]);

  const changeBranch = useCallback(
    (bId: number | null) => {
      setBranchId(bId);
      if (bId != null) void run(bId, dateFrom, dateTo);
    },
    [run, dateFrom, dateTo],
  );

  const applyPreset = useCallback(
    (days: number) => {
      const w = windowEndingOn(dateTo || yesterdayIso(), days);
      setDateFrom(w.from);
      setDateTo(w.to);
    },
    [dateTo],
  );

  // ------------------------------------------------------------- derived
  const selectedBranch = branches.find((b) => b.branch_id === branchId) ?? null;
  const branchName = selectedBranch?.branch_name ?? null;
  const activePreset = matchingPreset(dateFrom, dateTo);
  const shownFrom = data?.meta.date_from ?? dateFrom;
  const shownTo = data?.meta.date_to ?? dateTo;

  const cols = useMemo(() => buildDayCols(data?.meters ?? []), [data?.meters]);
  const gridCols = useMemo(() => toGridColumns(cols), [cols]);
  const gridRows = useMemo(() => toGridRows(data?.days ?? []), [data?.days]);

  // Letterhead for the exports — the period the shown data was fetched for,
  // not the (possibly edited) inputs.
  const header = useMemo<ReportExportHeader>(
    () => ({
      companyName,
      branchName,
      reportName: REPORT_NAME,
      reportFor: `${shownFrom} To ${shownTo}`,
    }),
    [companyName, branchName, shownFrom, shownTo],
  );

  const [exporting, setExporting] = useState(false);
  const exportExcel = useCallback(() => {
    void (async () => {
      setExporting(true);
      try {
        await exportRowsToExcel(gridCols, gridRows, "power-dg-report", header);
      } finally {
        setExporting(false);
      }
    })();
  }, [gridCols, gridRows, header]);

  const print = useCallback(() => {
    if (!data) return;
    const totalsSection: PrintSection = {
      title: "Totals",
      subtitle: `Range ${data.totals.days_keyed} of ${data.totals.days} days keyed · MTD ${data.mtd.days_keyed} of ${data.mtd.days} · std over ${data.std.days_used} keyed days`,
      columns: [
        { header: "" },
        { header: "Range", align: "right" },
        { header: "MTD", align: "right" },
        { header: "Std (30-day median)", align: "right" },
      ],
      rows: totalsRows(data).map((r) => [
        r.label,
        printNum(r.range, r.decimals),
        printNum(r.mtd, r.decimals),
        printNum(r.std, r.decimals),
      ]),
    };
    const ok = printReportSections(
      {
        title: REPORT_NAME,
        headerLines: [
          header.companyName ?? "",
          header.branchName ? `${header.branchName} (Branch)` : "",
          `Period: ${header.reportFor}`,
        ].filter(Boolean),
        landscape: true,
        footnote: data.meta.notes.join(" · "),
      },
      [gridPrintSection("Day-wise power", gridCols, gridRows), totalsSection],
    );
    if (!ok) window.alert("Please allow popups to print this report.");
  }, [data, gridCols, gridRows, header]);

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 } }}>
      <Typography
        variant="h5"
        sx={{ color: tokens.report.header, fontWeight: "bold", mb: { xs: 1, sm: 2 }, fontSize: { xs: "1.25rem", sm: "1.5rem" } }}
      >
        {REPORT_NAME}
      </Typography>

      {mounted && (
        <Paper elevation={1} sx={{ mb: 2, p: 2 }}>
          <Box
            sx={{
              display: "flex",
              alignItems: { xs: "stretch", sm: "center" },
              gap: { xs: 1.5, sm: 2 },
              flexWrap: "wrap",
              flexDirection: { xs: "column", sm: "row" },
            }}
          >
            {/* One branch in scope = no choice to make — the picker shows the name. */}
            <BranchScopePicker branches={branches} value={branchId} onChange={changeBranch} />

            {/* From / To share one row on phones so the bar stays short. */}
            <Box sx={{ display: "flex", gap: { xs: 1, sm: 2 }, width: { xs: "100%", sm: "auto" } }}>
              <TextField
                type="date"
                label="From Date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                size="small"
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ flex: { xs: 1, sm: "0 0 170px" } }}
              />
              <TextField
                type="date"
                label="To Date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                size="small"
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ flex: { xs: 1, sm: "0 0 170px" } }}
                helperText={`Max ${RANGE_CAP_DAYS} days`}
              />
            </Box>

            {/* Presets: the last N days ending on the To date. */}
            <Box sx={{ display: "flex", gap: 0.75, alignItems: "center", flexWrap: "wrap" }}>
              {PRESET_DAYS.map((days) => (
                <Chip
                  key={days}
                  label={`${days} days`}
                  size="small"
                  color={activePreset === days ? "primary" : "default"}
                  variant={activePreset === days ? "filled" : "outlined"}
                  onClick={() => applyPreset(days)}
                />
              ))}
            </Box>

            <Button
              variant="contained"
              disabled={branchId == null || loading}
              onClick={submit}
              sx={{
                backgroundColor: tokens.report.header,
                "&:hover": { backgroundColor: tokens.report.headerHover },
                textTransform: "none",
                width: { xs: "100%", sm: "auto" },
              }}
            >
              Submit
            </Button>

            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", ml: { sm: "auto" } }}>
              <Button
                variant="outlined"
                size="small"
                disabled={!data || gridRows.length === 0 || exporting}
                onClick={exportExcel}
                sx={{ textTransform: "none", flex: { xs: 1, sm: "0 0 auto" } }}
              >
                Export Excel
              </Button>
              <Button
                variant="outlined"
                size="small"
                disabled={!data || gridRows.length === 0}
                onClick={print}
                sx={{ textTransform: "none", flex: { xs: 1, sm: "0 0 auto" } }}
              >
                Print
              </Button>
            </Box>
          </Box>
        </Paper>
      )}

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}

      {mounted && branchId == null ? <Alert severity="info">Select a branch to view the report.</Alert> : null}

      {/* Refetch keeps the frame: the previous render stays up at reduced
          opacity instead of a spinner-and-blank. */}
      {loading && !data ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : null}

      {data && branchId != null ? (
        <Box sx={{ opacity: loading ? 0.5 : 1, transition: "opacity 150ms" }}>
          <Stack spacing={isPhone ? 1.5 : 2}>
            <Typography variant="body2" color="text.secondary">
              {companyName ? `${companyName} · ` : ""}
              {branchName ? `${branchName} · ` : ""}
              {shownFrom} To {shownTo}
            </Typography>

            {data.meta.days_keyed === 0 ? (
              <Alert severity="warning">
                No power readings keyed in this range — key them under Jute Mechanical &amp; Maintenance
                → Power Readings.
              </Alert>
            ) : null}

            <PowerKpiStrip data={data} />

            <SectionCard
              title="Trend — actual vs 30-day median"
              subtitle="solid: the day's figure (gap = not keyed); dashed: the 30-day median ending on the To date, as the standard"
            >
              <PowerTrendChart
                days={data.days}
                std={data.std}
                measure={measure}
                onMeasure={setMeasure}
                isPhone={isPhone}
              />
            </SectionCard>

            <SectionCard
              title="Day-wise"
              subtitle={
                isPhone
                  ? "swipe sideways for more columns; the exports carry every column (one per meter)"
                  : "one column per meter; an unkeyed day shows — and is tinted"
              }
            >
              <DataTable
                cols={cols}
                gridCols={gridCols}
                rows={gridRows}
                getRowId={(r) => r.id}
                isPhone={isPhone}
                branchId={branchId}
                rowTone={rowToneOf}
                rowClass={(r) => (r.keyed ? "" : "report-perf-watch")}
                maxRows={16}
              />
            </SectionCard>

            <PowerTotalsTable data={data} />

            {data.meta.notes.map((note) => (
              <Typography key={note} variant="caption" color="text.secondary" component="p">
                {note}
              </Typography>
            ))}
          </Stack>
        </Box>
      ) : null}
    </Box>
  );
}

export default function PowerReportPage() {
  return (
    // Mandatory: useReportBranches() reads useSearchParams().
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
