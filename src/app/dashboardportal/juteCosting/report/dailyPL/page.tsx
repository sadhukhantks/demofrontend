"use client";

/**
 * Daily P&L and Cost per Tonne (ITM-019, extended by ITM-027) — one row per
 * calendar day of a date range: the physical inputs the DPR already knows
 * (cloth by product, yarn, hands, spindle-hours, jute issued, stores, dust,
 * power) priced with the cost parameters in force on that day into
 * realisation, jute cost, jute waste, wages, power, stores and dust credit →
 * contribution, − overheads → operating profit, − capital cost → net, then
 * the same money per tonne of cloth, per tonne of yarn and per 100
 * spindle-hours. The six-head P&L statement (owner's format) sits under the
 * KPI strip; each head's breakdown and the jute-issue data check open in
 * dialogs that fetch lazily.
 *
 * The page owns branch, dates and the fetch; the pieces only render. The
 * std is the 30-day median ending on the To date, drawn dashed on the chart
 * and quoted on every KPI tile in words (above / below std) — no
 * achievement %. A figure that is not available (power with no reading,
 * a per-tonne ratio on a day without cloth) prints "—", never 0, and the
 * "Not keyed" panel says why. Dates apply on Submit; a branch change
 * refetches at once (the previous render stays up at reduced opacity).
 */

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  GlobalStyles,
  Paper,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { FileSpreadsheet as ExportIcon, Printer as PrintIcon } from "lucide-react";
import BranchScopePicker from "@/components/reports/BranchScopePicker";
import { useReportBranches } from "@/components/reports/useReportBranches";
import { exportRowsToExcel, type ReportExportHeader } from "@/components/reports/exportExcel";
import { materializeGridRows } from "@/components/reports/gridExportRows";
import { useMounted } from "@/components/reports/useMounted";
import { yesterdayIso } from "@/components/reports/reportDates";
import { SectionCard } from "../../../juteProduction/report/dailyProductionReport/_components/DprPieces";
import ContributionChart from "./_components/ContributionChart";
import DataTable from "./_components/DataTable";
import KpiStrip from "./_components/KpiStrip";
import NotKeyedPanel from "./_components/NotKeyedPanel";
import ParamsPanel from "./_components/ParamsPanel";
import PlStatement from "./_components/PlStatement";
import { fetchDailyPl, type DailyPlData } from "./_service";
import { visibleDayCols } from "./dayColumns";
import {
  DEFAULT_RANGE_DAYS,
  matchingPreset,
  PRESET_DAYS,
  RANGE_CAP_DAYS,
  rangeError,
  windowEndingOn,
} from "./range";
import { toGridColumns } from "./tableColumns";

const REPORT_NAME = "Daily P&L and Cost per Tonne";

/**
 * Print: @page margin 0 is what makes the browser omit its own header and
 * footer (owner rule 2026-10-12); the real margins sit on the printed block.
 * Only `.pl-print-root` (the report body) is visible on paper — the filter
 * bar and buttons are hidden.
 */
const PRINT_STYLES = {
  "@media print": {
    "@page": { size: "A4", margin: 0 },
    body: { padding: "12mm" },
    "body *": { visibility: "hidden" },
    ".pl-print-root, .pl-print-root *": { visibility: "visible" },
    ".pl-print-root": {
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      padding: "12mm",
      boxSizing: "border-box",
      opacity: 1,
    },
  },
} as const;

function errText(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "Failed to load the daily P&L";
}

function Content() {
  const { branches, coId, companyName, initialBranchId, dateParam } = useReportBranches();
  // Branch and dates come from the localStorage-backed sidebar context, so the
  // server HTML and the first client render disagree — hold the filter bar
  // back until mount (same gate as the other report pages).
  const mounted = useMounted();
  const theme = useTheme();
  // noSsr: the body only mounts after a client-side fetch, so there is no
  // hydration to protect and the first client render can use the real width.
  const isPhone = useMediaQuery(theme.breakpoints.down("sm"), { noSsr: true });

  const [branchId, setBranchId] = useState<number | null>(initialBranchId);
  const initialRange = windowEndingOn(dateParam || yesterdayIso(), DEFAULT_RANGE_DAYS);
  const [dateFrom, setDateFrom] = useState<string>(initialRange.from);
  const [dateTo, setDateTo] = useState<string>(initialRange.to);

  const [data, setData] = useState<DailyPlData | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
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
        const res = await fetchDailyPl({ coId, branchId: bId, dateFrom: from, dateTo: to });
        // A branch change fires at once, so a slower earlier request must not
        // overwrite a newer answer.
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

  // The jute-waste column is hidden while the range books none (sls today).
  const cols = useMemo(() => visibleDayCols(data?.days ?? []), [data]);
  const gridCols = useMemo(() => toGridColumns(cols), [cols]);
  const selectedBranch = branches.find((b) => b.branch_id === branchId) ?? null;
  const branchName = selectedBranch?.branch_name ?? null;
  const activePreset = matchingPreset(dateFrom, dateTo);

  // Letterhead for the export — the period the shown data was fetched for,
  // not the (possibly edited) inputs.
  const periodFrom = data?.meta.date_from ?? dateFrom;
  const periodTo = data?.meta.date_to ?? dateTo;
  const header = useMemo<ReportExportHeader>(
    () => ({
      companyName,
      branchName,
      reportName: REPORT_NAME,
      reportFor: `${periodFrom} To ${periodTo}`,
    }),
    [companyName, branchName, periodFrom, periodTo],
  );

  const exportExcel = useCallback(async () => {
    if (!data) return;
    setExporting(true);
    try {
      // buildReportSheet reads row[field] and ignores valueGetter — resolve the
      // nested money / per-tonne getters first or those columns export blank.
      const { columns, rows } = materializeGridRows(gridCols, data.days);
      await exportRowsToExcel(columns, rows, "daily-pl", header);
    } catch (e: unknown) {
      setError(e instanceof Error && e.message ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }, [data, gridCols, header]);

  const buttonSx = { textTransform: "none", minHeight: 44 } as const;

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 } }}>
      <GlobalStyles styles={PRINT_STYLES} />
      <Typography
        variant="h5"
        sx={{
          color: "primary.dark",
          fontWeight: "bold",
          mb: { xs: 1, sm: 2 },
          fontSize: { xs: "1.25rem", sm: "1.5rem" },
          displayPrint: "none",
        }}
      >
        {REPORT_NAME}
      </Typography>

      {mounted && (
        <Paper elevation={1} sx={{ mb: 2, p: 2, displayPrint: "none" }}>
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
              sx={{ ...buttonSx, width: { xs: "100%", sm: "auto" } }}
            >
              Submit
            </Button>

            <Box sx={{ display: "flex", gap: 1, width: { xs: "100%", sm: "auto" } }}>
              <Button
                variant="outlined"
                startIcon={<PrintIcon size={16} />}
                onClick={() => window.print()}
                disabled={!data}
                sx={{ ...buttonSx, flex: { xs: 1, sm: "none" } }}
              >
                Print
              </Button>
              <Button
                variant="outlined"
                startIcon={<ExportIcon size={16} />}
                onClick={() => void exportExcel()}
                disabled={!data || exporting}
                sx={{ ...buttonSx, flex: { xs: 1, sm: "none" } }}
              >
                {exporting ? "Exporting…" : "Excel"}
              </Button>
            </Box>
          </Box>
        </Paper>
      )}

      {error ? (
        <Alert severity="error" sx={{ mb: 2, displayPrint: "none" }}>
          {error}
        </Alert>
      ) : null}

      {mounted && branchId == null ? (
        <Alert severity="info">Select a branch to view the report.</Alert>
      ) : null}

      {/* Refetch keeps the frame: the previous render stays up at reduced
          opacity instead of a spinner-and-blank. */}
      {loading && !data ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : null}

      {data && branchId != null ? (
        <Box className="pl-print-root" sx={{ opacity: loading ? 0.5 : 1, transition: "opacity 150ms" }}>
          {/* Print-only letterhead. */}
          <Box sx={{ display: "none", displayPrint: "block", mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {companyName ?? ""}
            </Typography>
            {branchName ? <Typography variant="body2">{branchName}</Typography> : null}
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {REPORT_NAME}
            </Typography>
            <Typography variant="body2">
              {data.meta.date_from} To {data.meta.date_to}
            </Typography>
          </Box>

          <Stack spacing={isPhone ? 1.5 : 2}>
            <Box>
              <KpiStrip mtd={data.mtd} std={data.std} statement={data.statement} />
              {data.mtd.flags.power_excluded ? (
                <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }}>
                  power: not keyed — every contribution figure on this page excludes power.
                </Typography>
              ) : null}
              {data.mtd.flags.contribution_partial ? (
                <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }}>
                  {data.mtd.unpriced_days} of {data.mtd.calendar_days} day
                  {data.mtd.calendar_days === 1 ? "" : "s"} could not be priced (see Not keyed) — the{" "}
                  {data.mtd.label} money, per-tonne figures and contribution per day cover the priced
                  days only.
                </Typography>
              ) : null}
              {(data.mtd.notes ?? []).map((note) => (
                <Typography key={note} variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }}>
                  {note}
                </Typography>
              ))}
            </Box>

            {/* The six-head P&L (ITM-027); its breakdown and check dialogs fetch for the shown period. */}
            {data.statement ? (
              <PlStatement
                statement={data.statement}
                capital={data.capital}
                notKeyed={data.not_keyed}
                periodLabel={data.mtd.label}
                coId={coId ?? data.meta.co_id}
                branchId={data.meta.branch_id ?? branchId}
                dateFrom={data.meta.date_from}
                dateTo={data.meta.date_to}
                loading={loading}
              />
            ) : null}

            <SectionCard
              title="Contribution per tonne by day"
              subtitle={`solid = actual · dashed = 30-day median (std, ${data.std.days_used} producing day${
                data.std.days_used === 1 ? "" : "s"
              } ${data.std.window_from} to ${data.std.window_to})`}
            >
              {data.days.length > 0 ? (
                <ContributionChart days={data.days} std={data.std} isPhone={isPhone} />
              ) : (
                <Alert severity="info">No days in this range.</Alert>
              )}
            </SectionCard>

            <SectionCard
              title="Day by day"
              subtitle={
                isPhone
                  ? "swipe sideways for more columns; the Excel export carries every column"
                  : "— = not available (never 0): power with no reading keyed, a per-tonne figure on a day without cloth"
              }
            >
              <DataTable
                cols={cols}
                gridCols={gridCols}
                rows={data.days}
                getRowId={(r) => r.date}
                isPhone={isPhone}
                branchId={branchId}
                maxRows={16}
              />
            </SectionCard>

            <NotKeyedPanel items={data.not_keyed} />

            <ParamsPanel params={data.params_used} isPhone={isPhone} />

            <Box>
              {data.meta.notes.map((note) => (
                <Typography key={note} variant="caption" color="text.secondary" component="p">
                  {note}
                </Typography>
              ))}
            </Box>
          </Stack>
        </Box>
      ) : null}
    </Box>
  );
}

export default function DailyPlPage() {
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
