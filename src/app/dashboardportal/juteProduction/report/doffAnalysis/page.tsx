"use client";

/**
 * Doff Analysis — spinning doffs read two ways from one endpoint:
 *   Doff Details  (mode=details) one production date,
 *   Frame Analysis (mode=frames) a date range, with a per-frame drill-down.
 *
 * The page owns branch + dates + the fetch; each tab body only renders. The
 * two modes keep separate results so switching tabs never shows the other
 * mode's numbers, and each loads once on its first visit — after that only
 * Submit (or picking a frame) refetches.
 */

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Paper,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { useReportBranches } from "@/components/reports/useReportBranches";
import type { ReportExportHeader } from "@/components/reports/exportExcel";
import { useMounted } from "@/components/reports/useMounted";
import { lastDaysRange, yesterdayIso } from "@/components/reports/reportDates";
import type { BranchOption } from "@/components/reports/types";
import { RANGE_CAP_DAYS, rangeError } from "./dateRange";
import DoffDetailsTab from "./_components/DoffDetailsTab";
import FrameAnalysisTab from "./_components/FrameAnalysisTab";
import {
  fetchDoffDetails,
  fetchDoffFrames,
  type DoffDetailsData,
  type FrameAnalysisData,
} from "./doffAnalysisService";

const TABS = ["Doff Details", "Frame Analysis"] as const;
const DEFAULT_RANGE_DAYS = 7;

function errText(e: unknown): string {
  return e instanceof Error ? e.message : "Failed to load the doff analysis";
}

function Content() {
  const { branches, coId, companyName, initialBranchId, dateParam } = useReportBranches();
  // Branch and dates come from the localStorage-backed sidebar context, so the
  // server HTML and the first client render disagree — hold the filter bar
  // back until mount (same gate as the other report pages).
  const mounted = useMounted();

  const [tab, setTab] = useState(0);
  const [branchId, setBranchId] = useState<number | null>(initialBranchId);
  const [reportDate, setReportDate] = useState<string>(dateParam || yesterdayIso());
  const defaultRange = lastDaysRange(DEFAULT_RANGE_DAYS);
  const [dateFrom, setDateFrom] = useState<string>(defaultRange.from);
  const [dateTo, setDateTo] = useState<string>(dateParam || defaultRange.to);
  const [frame, setFrame] = useState<string | null>(null);

  const [details, setDetails] = useState<DoffDetailsData | null>(null);
  const [frames, setFrames] = useState<FrameAnalysisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const branchSeeded = useRef(false);
  const lastCoId = useRef<number | null>(null);
  const loadedDetails = useRef(false);
  const loadedFrames = useRef(false);

  const runDetails = useCallback(
    async (bId: number | null, d: string) => {
      if (coId == null || bId == null || !d) return;
      setLoading(true);
      setError(null);
      try {
        setDetails(
          await fetchDoffDetails({ coId, branchId: bId, reportDate: d }),
        );
      } catch (e: unknown) {
        setError(errText(e));
        setDetails(null);
      } finally {
        setLoading(false);
      }
    },
    [coId],
  );

  const runFrames = useCallback(
    async (bId: number | null, from: string, to: string, frm: string | null) => {
      if (coId == null || bId == null) return;
      const bad = rangeError(from, to);
      if (bad) {
        setError(bad);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        setFrames(
          await fetchDoffFrames({
            coId,
            branchId: bId,
            dateFrom: from,
            dateTo: to,
            frame: frm,
          }),
        );
      } catch (e: unknown) {
        setError(errText(e));
        setFrames(null);
      } finally {
        setLoading(false);
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

  // Sidebar company switch: the loaded results and the branch belong to the old
  // company — drop them rather than show them under the new company's name.
  useEffect(() => {
    if (coId == null) return;
    if (lastCoId.current != null && lastCoId.current !== coId) {
      setDetails(null);
      setFrames(null);
      setFrame(null);
      setBranchId(null);
      branchSeeded.current = false;
      loadedDetails.current = false;
      loadedFrames.current = false;
    }
    lastCoId.current = coId;
  }, [coId]);

  // One automatic load per tab, on its first visit with a branch available.
  useEffect(() => {
    const bId = branchId ?? initialBranchId;
    if (coId == null || bId == null) return;
    if (tab === 0 && !loadedDetails.current) {
      loadedDetails.current = true;
      void runDetails(bId, reportDate);
    }
    if (tab === 1 && !loadedFrames.current) {
      loadedFrames.current = true;
      void runFrames(bId, dateFrom, dateTo, null);
    }
  }, [
    tab,
    coId,
    branchId,
    initialBranchId,
    reportDate,
    dateFrom,
    dateTo,
    runDetails,
    runFrames,
  ]);

  const selectFrame = useCallback(
    (f: string | null) => {
      setFrame(f);
      // The drill-down only exists in a response asked for that frame.
      void runFrames(branchId ?? initialBranchId, dateFrom, dateTo, f);
    },
    [branchId, initialBranchId, dateFrom, dateTo, runFrames],
  );

  const submit = useCallback(() => {
    if (tab === 0) {
      void runDetails(branchId, reportDate);
    } else {
      void runFrames(branchId, dateFrom, dateTo, frame);
    }
  }, [tab, branchId, reportDate, dateFrom, dateTo, frame, runDetails, runFrames]);

  const selectedBranch: BranchOption | null =
    branches.find((b) => b.branch_id === branchId) ?? null;

  // Letterhead for the Excel / print export (TKT-000190) — the period is the
  // one the shown data was fetched for, not the (possibly edited) inputs.
  const header: ReportExportHeader = {
    companyName,
    branchName: selectedBranch?.branch_name ?? null,
    reportName: "Doff Analysis",
    reportFor:
      tab === 0
        ? details?.meta?.date_from ?? reportDate
        : `${frames?.meta?.date_from ?? dateFrom} To ${frames?.meta?.date_to ?? dateTo}`,
  };

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 } }}>
      <Typography variant="h5" sx={{ color: "#0C3C60", fontWeight: "bold", mb: 2 }}>
        Doff Analysis
      </Typography>

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
            {/* One branch in scope = no choice to make — don't ask. */}
            {branches.length > 1 ? (
              <Autocomplete
                options={branches}
                getOptionLabel={(o) => o.branch_name}
                isOptionEqualToValue={(o, v) => o.branch_id === v.branch_id}
                value={selectedBranch}
                onChange={(_, v) => setBranchId(v?.branch_id ?? null)}
                renderInput={(p) => <TextField {...p} label="Branch" size="small" required />}
                sx={{ minWidth: 240, width: { xs: "100%", sm: "auto" } }}
              />
            ) : selectedBranch ? (
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {selectedBranch.branch_name}
              </Typography>
            ) : null}

            {tab === 0 ? (
              <TextField
                type="date"
                label="Production Date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                size="small"
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ width: { xs: "100%", sm: 180 } }}
              />
            ) : (
              <>
                <TextField
                  type="date"
                  label="From Date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  size="small"
                  slotProps={{ inputLabel: { shrink: true } }}
                  sx={{ width: { xs: "100%", sm: 170 } }}
                />
                <TextField
                  type="date"
                  label="To Date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  size="small"
                  slotProps={{ inputLabel: { shrink: true } }}
                  sx={{ width: { xs: "100%", sm: 170 } }}
                  helperText={`Max ${RANGE_CAP_DAYS} days`}
                />
              </>
            )}

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
        </Paper>
      )}

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}

      {/* mounted gate: branchId is seeded from localStorage-backed context, so
          the server (always null) and the client's first render disagree. */}
      {mounted && branchId == null ? (
        <Alert severity="info">Select a branch to view the report.</Alert>
      ) : null}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : null}

      {/* Unmounted, not hidden: DataGrid measures its container and a
          display:none mount collapses it. */}
      {!loading && branchId != null && tab === 0 ? (
        <DoffDetailsTab data={details} branchId={branchId} header={header} />
      ) : null}
      {!loading && branchId != null && tab === 1 ? (
        <FrameAnalysisTab
          data={frames}
          branchId={branchId}
          selectedFrame={frame}
          onSelectFrame={selectFrame}
          header={header}
        />
      ) : null}

      {(tab === 0 ? details?.meta?.notes : frames?.meta?.notes)?.map((note) => (
        <Typography key={note} variant="caption" color="text.secondary" component="p">
          {note}
        </Typography>
      ))}
    </Box>
  );
}

export default function DoffAnalysisPage() {
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
