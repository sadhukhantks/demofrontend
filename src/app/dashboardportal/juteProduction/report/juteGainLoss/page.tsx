"use client";

/**
 * Jute Gain/Loss report — renders the monthly manually-entered gain/loss
 * sheet as the mill's three signed-off statements: FNG (packed production),
 * WVG (weaving production) and WDG (winding → weaving difference).
 *
 * One sheet exists per (company, branch, month); a 404 from the report
 * endpoint therefore means "no sheet entered yet", not a failure, and is
 * shown as a friendly empty-state pointing at the entry page. The three
 * statements sit behind tabs, and printing emits ONLY the active tab —
 * each statement is a one-page mill document in its own right.
 */

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  GlobalStyles,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { Printer } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useReportBranches } from "@/components/reports/useReportBranches";
import PrintFrame from "@/components/reports/PrintFrame";
import type { BranchOption } from "@/components/reports/types";
import {
  fetchGainLossReport,
  type GlReport,
  type GlStatementCode,
} from "@/utils/juteGainLossService";
import { GlStatementView } from "./_components/GlStatementView";

const STATEMENT_ORDER: readonly GlStatementCode[] = ["FNG", "WVG", "WDG"] as const;

const TAB_LABELS: Record<GlStatementCode, string> = {
  FNG: "Packed Production",
  WVG: "Weaving Production",
  WDG: "Winding → Weaving",
};

const MONTH_SHORT = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
] as const;

const MONTH_LONG = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
] as const;

/** Parse "YYYY-MM" / "YYYY-MM-DD" without Date() so timezones can't shift it. */
function parseYm(s: string): { y: number; m: number } | null {
  const m = /^(\d{4})-(\d{2})/.exec(s);
  if (!m) return null;
  const mm = Number(m[2]);
  if (mm < 1 || mm > 12) return null;
  return { y: Number(m[1]), m: mm };
}

/** "2025-12-01" → "DEC '25" — the printed sheet's column-band style. */
function monthShortLabel(s: string): string {
  const p = parseYm(s);
  return p ? `${MONTH_SHORT[p.m - 1]} '${String(p.y % 100).padStart(2, "0")}` : s;
}

/** "2026-01-01" → "JANUARY 2026" — the printed sheet's heading style. */
function monthLongLabel(s: string): string {
  const p = parseYm(s);
  return p ? `${MONTH_LONG[p.m - 1]} ${p.y}` : s;
}

/** Previous calendar month as "YYYY-MM" — the sheet a mill enters is always last month's. */
function prevMonthYm(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * The service throws a plain Error, so the 404 "sheet not saved" case is
 * recognisable only by the backend's detail message ("No sheet is saved for
 * this month"). Matched loosely so wording tweaks don't break the empty-state.
 */
function isSheetNotFound(e: unknown): boolean {
  return e instanceof Error && /no sheet/i.test(e.message);
}

function Content() {
  const { branches, coId, initialBranchId } = useReportBranches();
  // Branch comes from the localStorage-backed sidebar context, so the server
  // HTML has an empty branch and the client the saved one — hold the controls
  // until mount to avoid a hydration mismatch (same gate as the other reports).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const [branchId, setBranchId] = useState<number | null>(initialBranchId);
  // ?month=YYYY-MM lets the entry sheet link straight to its own statement
  // (TKT-000157); anything else falls back to last month, the usual sheet.
  const searchParams = useSearchParams();
  const [month, setMonth] = useState<string>(() => {
    const m = searchParams.get("month");
    return m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : prevMonthYm();
  });
  const [tab, setTab] = useState<GlStatementCode>("FNG");
  const [data, setData] = useState<GlReport | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedOnce = useRef(false);
  const branchSeeded = useRef(false);
  const lastCoId = useRef<number | null>(null);

  const runFetch = useCallback(
    async (bId: number | null, m: string) => {
      // branch_id is mandatory — one sheet exists per (co, branch, month).
      if (coId == null || bId == null || !m) return;
      setLoading(true);
      setError(null);
      setNotFound(false);
      try {
        const res = await fetchGainLossReport({ coId, branchId: bId, month: m });
        setData(res);
      } catch (e) {
        setData(null);
        if (isSheetNotFound(e)) {
          setNotFound(true);
        } else {
          setError(e instanceof Error ? e.message : "Failed to load the report");
        }
      } finally {
        setLoading(false);
      }
    },
    [coId],
  );

  // Seed the branch ONCE when the sidebar context resolves — after that the
  // user may change it freely.
  useEffect(() => {
    if (!branchSeeded.current && initialBranchId != null) {
      branchSeeded.current = true;
      setBranchId(initialBranchId);
    }
  }, [initialBranchId]);

  // Sidebar company switch: the loaded report and the selected branch belong
  // to the old company — drop both so nothing renders (or prints) mislabeled.
  useEffect(() => {
    if (coId == null) return;
    if (lastCoId.current != null && lastCoId.current !== coId) {
      setData(null);
      setNotFound(false);
      setBranchId(null);
      branchSeeded.current = false;
      fetchedOnce.current = false;
    }
    lastCoId.current = coId;
  }, [coId]);

  useEffect(() => {
    if (!fetchedOnce.current && coId != null && (branchId ?? initialBranchId) != null) {
      fetchedOnce.current = true;
      void runFetch(branchId ?? initialBranchId, month);
    }
  }, [coId, branchId, initialBranchId, month, runFetch]);

  const selectedBranch: BranchOption | null =
    branches.find((b) => b.branch_id === branchId) ?? null;

  const statement = data?.statements[tab] ?? null;
  const monthShort = data ? monthShortLabel(data.month) : "";
  const prevShort = data ? monthShortLabel(data.prev_month) : "";

  return (
    <Box sx={{ p: 2 }}>
      {/* On print, show ONLY the report content: the portal shell (sidebar,
          hub back-button) and this page's controls all sit outside
          .jgl-print-root and get visibility-hidden. The tabs strip and the
          missing-months alert are inside but displayPrint-none, so exactly
          the active statement prints — one mill document per sheet. */}
      <GlobalStyles
        styles={{
          "@media print": {
            // @page margin 0 suppresses the browser's own header/footer (date,
            // title, URL, page number). The paper margin (10mm ~ the old
            // browser-default margin) is the print root's side padding plus the
            // <PrintFrame> top/bottom spacers, which repeat on every page.
            // No `size`, so paper size / orientation stay the user's choice.
            "@page": { margin: 0 },
            "body *": { visibility: "hidden" },
            ".jgl-print-root, .jgl-print-root *": { visibility: "visible" },
            ".jgl-print-root": {
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              boxSizing: "border-box",
              padding: "0 10mm",
            },
          },
        }}
      />
      {mounted && (
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={1.5}
          alignItems={{ md: "center" }}
          sx={{ mb: 2, displayPrint: "none" }}
        >
          <Typography variant="h6" sx={{ fontWeight: 700, flexGrow: 1 }}>
            Jute Gain/Loss
          </Typography>
          <Autocomplete
            size="small"
            sx={{ minWidth: 220 }}
            options={branches}
            value={selectedBranch}
            getOptionLabel={(o) => o.branch_name}
            isOptionEqualToValue={(o, v) => o.branch_id === v.branch_id}
            onChange={(_, v) => setBranchId(v?.branch_id ?? null)}
            renderInput={(p) => <TextField {...p} label="Branch" />}
          />
          <TextField
            size="small"
            type="month"
            label="Month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <Button
            variant="contained"
            disabled={loading || coId == null || branchId == null}
            onClick={() => void runFetch(branchId, month)}
          >
            Submit
          </Button>
          <Button
            variant="outlined"
            startIcon={<Printer size={16} />}
            disabled={!data}
            onClick={() => window.print()}
          >
            Print
          </Button>
        </Stack>
      )}

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

      {!loading && notFound ? (
        <Alert severity="info">
          No sheet saved for this month yet — enter it under Jute Production → Jute
          Gain/Loss Sheet.
        </Alert>
      ) : null}

      {!loading && data && statement ? (
        <Box className="jgl-print-root">
          <PrintFrame marginMm={10}>
            <Tabs
              value={tab}
              onChange={(_, v: GlStatementCode) => setTab(v)}
              sx={{ mb: 2, displayPrint: "none" }}
            >
              {STATEMENT_ORDER.map((code) => (
                <Tab key={code} value={code} label={TAB_LABELS[code]} />
              ))}
            </Tabs>

            {data.missing_months.length > 0 ? (
              <Alert severity="warning" sx={{ mb: 2, displayPrint: "none" }}>
                To-Date excludes unsaved months:{" "}
                {data.missing_months.map(monthShortLabel).join(", ")}
              </Alert>
            ) : null}

            <GlStatementView
              statement={statement}
              monthLong={monthLongLabel(data.month)}
              monthShort={monthShort}
              prevShort={prevShort}
            />

            {/* Remarks — part of the printed sheet */}
            {data.remarks || data.prev_remarks ? (
              <Paper variant="outlined" sx={{ p: 1.5, mt: 2, breakInside: "avoid" }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.25 }}>
                  Remarks
                </Typography>
                {data.remarks ? (
                  <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                    {data.remarks}
                  </Typography>
                ) : null}
                {data.prev_remarks ? (
                  <Box sx={{ mt: data.remarks ? 1 : 0 }}>
                    <Typography variant="caption" color="text.secondary">
                      {prevShort}
                    </Typography>
                    <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                      {data.prev_remarks}
                    </Typography>
                  </Box>
                ) : null}
              </Paper>
            ) : null}
          </PrintFrame>
        </Box>
      ) : null}

      {!loading && !data && !notFound && !error ? (
        <Alert severity="info">
          Select a branch and month, then press Submit to build the report.
        </Alert>
      ) : null}
    </Box>
  );
}

export default function JuteGainLossReportPage() {
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
