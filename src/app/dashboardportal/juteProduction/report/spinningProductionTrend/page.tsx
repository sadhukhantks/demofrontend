"use client";

/**
 * Spinning Production Trend — day-wise and quality-wise spinning production
 * over a date range, with "average kg per frame" expressed as kg per
 * frame-shift so a one-shift Sunday compares with a three-shift weekday, and
 * a loss analysis that says where the gap to standard sits.
 *
 * Four tabs read ONE response: Daily Trend, Loss Analysis, Quality Wise and
 * Frame Wise. The page owns branch, dates, the global filters (quality,
 * shift, frame) and the fetch; the tabs only render. Filters are applied on
 * the server, so every chart, table and the previous-period comparison are
 * cut from the same slice; changing one refetches at once (the previous
 * render stays up at reduced opacity meanwhile). Dates apply on Submit.
 */

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Tab,
  Tabs,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import BranchScopePicker from "@/components/reports/BranchScopePicker";
import { useReportBranches } from "@/components/reports/useReportBranches";
import type { ReportExportHeader } from "@/components/reports/exportExcel";
import { useMounted } from "@/components/reports/useMounted";
import { yesterdayIso } from "@/components/reports/reportDates";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import DailyTrendTab from "./_components/DailyTrendTab";
import FrameDrillDialog, { type FrameContext } from "./_components/FrameDrillDialog";
import FrameTab from "./_components/FrameTab";
import LossTab from "./_components/LossTab";
import QualityTab from "./_components/QualityTab";
import { fetchSpinningTrend, type SpinningTrendData } from "./_service";
import { SHIFT_LABEL } from "./chartPalette";
import {
  DEFAULT_RANGE_DAYS,
  matchingPreset,
  PRESET_DAYS,
  RANGE_CAP_DAYS,
  rangeError,
  windowEndingOn,
} from "./range";

const TABS = ["Daily Trend", "Loss Analysis", "Quality Wise", "Frame Wise"] as const;

interface Option {
  value: string;
  label: string;
}

/** The global filters — null = everything. */
interface Filters {
  itemId: number | null;
  shift: string | null;
  frame: string | null;
}

const NO_FILTERS: Filters = Object.freeze({ itemId: null, shift: null, frame: null });

function errText(e: unknown): string {
  return e instanceof Error ? e.message : "Failed to load the spinning production trend";
}

function Content() {
  const { branches, coId, companyName, initialBranchId, dateParam } = useReportBranches();
  // Branch and dates come from the localStorage-backed sidebar context, so the
  // server HTML and the first client render disagree — hold the filter bar
  // back until mount (same gate as the other report pages).
  const mounted = useMounted();
  const theme = useTheme();
  // noSsr: the tabs only mount after a client-side fetch, so there is no
  // hydration to protect and the first client render can use the real width.
  const isPhone = useMediaQuery(theme.breakpoints.down("sm"), { noSsr: true });

  const [tab, setTab] = useState(0);
  const [branchId, setBranchId] = useState<number | null>(initialBranchId);
  const initialRange = windowEndingOn(dateParam || yesterdayIso(), DEFAULT_RANGE_DAYS);
  const [dateFrom, setDateFrom] = useState<string>(initialRange.from);
  const [dateTo, setDateTo] = useState<string>(initialRange.to);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  // Options come from the UNFILTERED load, so picking a value never shrinks
  // the list to itself.
  const [qualityOptions, setQualityOptions] = useState<Option[]>([]);
  const [shiftOptions, setShiftOptions] = useState<Option[]>([]);
  const [frameOptions, setFrameOptions] = useState<Option[]>([]);

  const [data, setData] = useState<SpinningTrendData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The frame (or frame-shift) whose drill-down dialog is open.
  const [drill, setDrill] = useState<FrameContext | null>(null);

  const branchSeeded = useRef(false);
  const lastCoId = useRef<number | null>(null);
  const loaded = useRef(false);
  const requestNo = useRef(0);

  const run = useCallback(
    async (bId: number | null, from: string, to: string, f: Filters) => {
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
        const res = await fetchSpinningTrend({
          coId,
          branchId: bId,
          dateFrom: from,
          dateTo: to,
          itemId: f.itemId,
          shift: f.shift,
          frame: f.frame,
        });
        // A filter change fires at once, so a slower earlier request must not
        // overwrite a newer answer.
        if (mine !== requestNo.current) return;
        setData(res);
        if (f.itemId == null && f.shift == null && f.frame == null) {
          setQualityOptions(
            res.qualities
              .filter((q): q is typeof q & { item_id: number } => q.item_id != null)
              .map((q) => ({ value: String(q.item_id), label: q.quality })),
          );
          setShiftOptions(res.options.shifts.map((sh) => ({ value: sh, label: SHIFT_LABEL[sh] ?? sh })));
          setFrameOptions(res.options.frames.map((fr) => ({ value: fr, label: `Frame ${fr}` })));
        }
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
      setQualityOptions([]);
      setShiftOptions([]);
      setFrameOptions([]);
      setFilters(NO_FILTERS);
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
    void run(bId, dateFrom, dateTo, filters);
  }, [coId, branchId, initialBranchId, dateFrom, dateTo, filters, run]);

  const submit = useCallback(() => {
    void run(branchId, dateFrom, dateTo, filters);
  }, [run, branchId, dateFrom, dateTo, filters]);

  // Global filters apply everywhere at once — no Submit needed for them.
  const changeFilters = useCallback(
    (patch: Partial<Filters>) => {
      const next = { ...filters, ...patch };
      setFilters(next);
      void run(branchId, dateFrom, dateTo, next);
    },
    [filters, run, branchId, dateFrom, dateTo],
  );

  // A new branch means new frames and qualities: drop the filters with it.
  const changeBranch = useCallback(
    (bId: number | null) => {
      setBranchId(bId);
      setFilters(NO_FILTERS);
      setQualityOptions([]);
      setShiftOptions([]);
      setFrameOptions([]);
      if (bId != null) void run(bId, dateFrom, dateTo, NO_FILTERS);
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

  const openFrame = useCallback((ctx: FrameContext) => setDrill(ctx), []);
  const closeFrame = useCallback(() => setDrill(null), []);
  const focusFrame = useCallback(
    (frame: string) => {
      changeFilters({ frame });
      setTab(0);
    },
    [changeFilters],
  );
  const drillFrame = useMemo(
    () => (drill && data ? data.frames.find((f) => f.frame === drill.frame) ?? null : null),
    [drill, data],
  );
  const drillAttention = useMemo(
    () => (drill && data ? data.loss.attention.find((a) => a.frame === drill.frame) ?? null : null),
    [drill, data],
  );

  const selectedBranch = branches.find((b) => b.branch_id === branchId) ?? null;
  const activePreset = matchingPreset(dateFrom, dateTo);
  const selectedQuality = useMemo(
    () => qualityOptions.find((q) => q.value === String(filters.itemId)) ?? null,
    [qualityOptions, filters.itemId],
  );
  const selectedShift = useMemo(
    () => shiftOptions.find((o) => o.value === filters.shift) ?? null,
    [shiftOptions, filters.shift],
  );
  const selectedFrame = useMemo(
    () => frameOptions.find((o) => o.value === filters.frame) ?? null,
    [frameOptions, filters.frame],
  );
  const filterSummary = [selectedQuality?.label, selectedShift?.label, selectedFrame?.label]
    .filter(Boolean)
    .join(" · ");

  // Letterhead for the exports — the period the shown data was fetched for,
  // not the (possibly edited) inputs.
  const header: ReportExportHeader = {
    companyName,
    branchName: selectedBranch?.branch_name ?? null,
    reportName: "Spinning Production Trend",
    reportFor: `${data?.meta?.date_from ?? dateFrom} To ${data?.meta?.date_to ?? dateTo}${
      filterSummary ? ` (${filterSummary})` : ""
    }`,
  };

  const selectSx = { minWidth: { xs: "100%", sm: 200 }, flex: { xs: "1 1 100%", sm: "0 0 auto" } };

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 } }}>
      <Typography
        variant="h5"
        sx={{ color: "#0C3C60", fontWeight: "bold", mb: { xs: 1, sm: 2 }, fontSize: { xs: "1.25rem", sm: "1.5rem" } }}
      >
        Spinning Production Trend
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
                backgroundColor: "#0C3C60",
                "&:hover": { backgroundColor: "#092d47" },
                textTransform: "none",
                width: { xs: "100%", sm: "auto" },
              }}
            >
              Submit
            </Button>
          </Box>

          {/* Global filters: one row, scoping every chart and table below. */}
          <Box
            sx={{
              display: "flex",
              gap: { xs: 1, sm: 2 },
              flexWrap: "wrap",
              mt: 1.5,
              alignItems: "center",
            }}
          >
            <Typography variant="caption" color="text.secondary" sx={{ flex: { xs: "1 1 100%", sm: "0 0 auto" } }}>
              Filter everything by
            </Typography>
            <Box sx={selectSx}>
              <SearchableSelect<Option>
                variant="outlined"
                label="Quality / count (all)"
                options={qualityOptions}
                value={selectedQuality}
                onChange={(opt) => changeFilters({ itemId: opt ? Number(opt.value) : null })}
                getOptionLabel={(o) => o.label}
                getOptionKey={(o) => o.value}
                isOptionEqualToValue={(o, v) => o.value === v.value}
                disabled={qualityOptions.length === 0}
              />
            </Box>
            <Box sx={selectSx}>
              <SearchableSelect<Option>
                variant="outlined"
                label="Shift (all)"
                options={shiftOptions}
                value={selectedShift}
                onChange={(opt) => changeFilters({ shift: opt?.value ?? null })}
                getOptionLabel={(o) => o.label}
                getOptionKey={(o) => o.value}
                isOptionEqualToValue={(o, v) => o.value === v.value}
                disabled={shiftOptions.length === 0}
              />
            </Box>
            <Box sx={selectSx}>
              <SearchableSelect<Option>
                variant="outlined"
                label="Frame (all)"
                options={frameOptions}
                value={selectedFrame}
                onChange={(opt) => changeFilters({ frame: opt?.value ?? null })}
                getOptionLabel={(o) => o.label}
                getOptionKey={(o) => o.value}
                isOptionEqualToValue={(o, v) => o.value === v.value}
                disabled={frameOptions.length === 0}
              />
            </Box>
            {filterSummary ? (
              <Chip
                label={`Clear: ${filterSummary}`}
                size="small"
                onDelete={() => changeFilters(NO_FILTERS)}
                onClick={() => changeFilters(NO_FILTERS)}
              />
            ) : null}
          </Box>
        </Paper>
      )}

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

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}

      {mounted && branchId == null ? (
        <Alert severity="info">Select a branch to view the report.</Alert>
      ) : null}

      {/* Refetch keeps the frame: the previous charts stay up at reduced
          opacity instead of a spinner-and-blank. */}
      {loading && !data ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : null}

      {data && branchId != null ? (
        <Box sx={{ opacity: loading ? 0.5 : 1, transition: "opacity 150ms" }}>
          {filterSummary ? (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Showing: {filterSummary}
            </Typography>
          ) : null}
          {tab === 0 ? (
            <DailyTrendTab data={data} branchId={branchId} header={header} isPhone={isPhone} />
          ) : null}
          {tab === 1 ? (
            <LossTab data={data} branchId={branchId} header={header} isPhone={isPhone} onFrame={openFrame} />
          ) : null}
          {tab === 2 ? (
            <QualityTab data={data} branchId={branchId} header={header} isPhone={isPhone} />
          ) : null}
          {tab === 3 ? (
            <FrameTab data={data} branchId={branchId} header={header} isPhone={isPhone} onFrame={openFrame} />
          ) : null}
        </Box>
      ) : null}

      {branchId != null ? (
        <FrameDrillDialog
          context={drill}
          frame={drillFrame}
          attention={drillAttention}
          scope={{
            branchId,
            dateFrom: data?.meta?.date_from ?? dateFrom,
            dateTo: data?.meta?.date_to ?? dateTo,
            shift: filters.shift,
            itemId: filters.itemId,
          }}
          onClose={closeFrame}
          onFocusFrame={focusFrame}
        />
      ) : null}

      {data?.meta?.notes?.map((note) => (
        <Typography key={note} variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
          {note}
        </Typography>
      ))}
    </Box>
  );
}

export default function SpinningProductionTrendPage() {
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
