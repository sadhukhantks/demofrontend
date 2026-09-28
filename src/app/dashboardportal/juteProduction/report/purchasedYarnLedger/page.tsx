"use client";

/**
 * Purchased Yarn Ledger — per branch and month, per purchased yarn item, the
 * godown movement (opening + purchases − issues + returns = book closing,
 * checked against the counted closing) and the floor movement per department
 * (floor opening + issues − returns − floor closing = consumption).
 *
 * The backend derives every figure and raises the exceptions; this page only
 * formats, orders the exceptions by severity, and colours the godown
 * difference red on the items the backend flagged GODOWN_DIFF (the tolerance
 * lives there). Layout mirrors the Winding & Weaving Difference sheet:
 * sidebar-scoped branch picker, one control row, print of the report body
 * only, department detail always mounted (hidden on screen, forced in print).
 */

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  GlobalStyles,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Printer } from "lucide-react";
import { useReportBranches } from "@/components/reports/useReportBranches";
import { useMounted } from "@/components/reports/useMounted";
import type { BranchOption } from "@/components/reports/types";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { tokens } from "@/styles/tokens";
import { SectionCard } from "../dailyProductionReport/_components/DprPieces";
import { ExceptionsStrip } from "./_components/ExceptionsStrip";
import { LedgerMetaLine } from "./_components/LedgerMetaLine";
import { LedgerTable } from "./_components/LedgerTable";
import { fetchPurchasedYarnLedger, type PurchasedYarnLedger } from "./_service";
import {
  currentMonthParam,
  daysInclusive,
  flaggedItemIds,
  monthFromDateParam,
  monthLabel,
  sumTotals,
} from "./ledgerRows";

const TITLE = "Purchased Yarn Ledger";

const MONTH_PARAM_RE = /^\d{4}-\d{2}$/;

/** A loaded ledger together with the branch it was fetched for, so the
 *  printed letterhead names the branch of the FIGURES, not the picker's
 *  current value. */
interface LoadedLedger {
  data: PurchasedYarnLedger;
  branchId: number;
  branchName: string | null;
}

function Content() {
  const { branches, coId, companyName, initialBranchId, dateParam } = useReportBranches();
  // Branch/month seed from the localStorage-backed sidebar context and the
  // hub's query string, so the controls are held until mount (see useMounted).
  const mounted = useMounted();

  const [branchId, setBranchId] = useState<number | null>(initialBranchId);
  const [month, setMonth] = useState<string>(
    () => monthFromDateParam(dateParam) ?? currentMonthParam(),
  );
  const [loaded, setLoaded] = useState<LoadedLedger | null>(null);
  const data = loaded?.data ?? null;
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(() => new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchedOnce = useRef(false);
  const branchSeeded = useRef(false);
  const lastCoId = useRef<number | null>(null);

  const runFetch = useCallback(
    async (bId: number | null, m: string) => {
      // branch_id is mandatory: godown and floor counts are branch-keyed.
      if (coId == null || bId == null) return;
      if (!MONTH_PARAM_RE.test(m)) {
        setError("Month must be YYYY-MM");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await fetchPurchasedYarnLedger({ coId, branchId: bId, month: m });
        setLoaded({
          data: res,
          branchId: bId,
          branchName: branches.find((b) => b.branch_id === bId)?.branch_name ?? null,
        });
        setExpanded(new Set());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load the report");
        setLoaded(null);
      } finally {
        setLoading(false);
      }
    },
    [coId, branches],
  );

  // Seed the branch ONCE when the sidebar context resolves; the user owns it after that.
  useEffect(() => {
    if (!branchSeeded.current && initialBranchId != null) {
      branchSeeded.current = true;
      setBranchId(initialBranchId);
    }
  }, [initialBranchId]);

  // Sidebar company switch: the loaded report and the branch belong to the
  // old company — drop both rather than show them mislabeled.
  useEffect(() => {
    if (coId == null) return;
    if (lastCoId.current != null && lastCoId.current !== coId) {
      setLoaded(null);
      setBranchId(null);
      branchSeeded.current = false;
      fetchedOnce.current = false;
    }
    lastCoId.current = coId;
  }, [coId]);

  // One automatic load once company + branch are known; afterwards only Submit.
  // The branch must be one of the current company's: after a sidebar company
  // switch the hub URL's branch_id still names the OLD company's branch, and
  // the backend rejects that pairing.
  useEffect(() => {
    if (fetchedOnce.current || coId == null) return;
    const bId = branchId ?? initialBranchId;
    if (bId == null || !branches.some((b) => b.branch_id === bId)) return;
    fetchedOnce.current = true;
    void runFetch(bId, month);
  }, [coId, branchId, initialBranchId, branches, month, runFetch]);

  const selectedBranch: BranchOption | null =
    branches.find((b) => b.branch_id === branchId) ?? null;

  // A new branch means the loaded figures no longer belong to the picker's
  // value: drop them (and with them the Print button) until Submit.
  const changeBranch = useCallback(
    (next: number | null) => {
      if (next !== branchId) setLoaded(null);
      setBranchId(next);
    },
    [branchId],
  );

  // The endpoint's totals are authoritative; the client sum is only the
  // fallback for a response that omits them.
  const totals = useMemo(() => {
    if (!data) return null;
    return data.totals ?? sumTotals(data.rows, daysInclusive(data.from_date, data.to_date) ?? undefined);
  }, [data]);
  const flaggedDiff = useMemo(
    () => flaggedItemIds(data?.exceptions ?? [], "GODOWN_DIFF"),
    [data],
  );

  const toggle = useCallback((itemId: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, []);
  const expandAll = useCallback(() => {
    setExpanded(new Set((data?.rows ?? []).map((r) => r.item_id)));
  }, [data]);
  const collapseAll = useCallback(() => setExpanded(new Set()), []);

  return (
    <Box sx={{ p: 2 }}>
      {/* On print, show ONLY the report content: the portal shell and this
          page's controls sit outside .pyl-print-root and get visibility-hidden. */}
      <GlobalStyles
        styles={{
          "@media print": {
            "body *": { visibility: "hidden" },
            ".pyl-print-root, .pyl-print-root *": { visibility: "visible" },
            ".pyl-print-root": {
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
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
          <Typography variant="h6" sx={{ fontWeight: 700, flexGrow: 1, color: tokens.report.header }}>
            {TITLE}
          </Typography>
          {/* Norm: the picker only when more than one branch is in scope. */}
          {branches.length > 1 ? (
            <Box sx={{ minWidth: 220 }}>
              <SearchableSelect<BranchOption>
                variant="outlined"
                size="small"
                label="Branch"
                options={branches}
                value={selectedBranch}
                onChange={(opt) => changeBranch(opt?.branch_id ?? null)}
                getOptionLabel={(o) => o.branch_name}
                getOptionKey={(o) => o.branch_id}
                isOptionEqualToValue={(o, v) => o.branch_id === v.branch_id}
                clearable={false}
              />
            </Box>
          ) : (
            <Typography variant="body2" sx={{ minWidth: 160 }}>
              <strong>Branch:</strong> {selectedBranch?.branch_name ?? "—"}
            </Typography>
          )}
          <TextField
            size="small"
            type="month"
            label="Month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ width: 170 }}
          />
          <Button
            variant="contained"
            // selectedBranch (not branchId): a hub branch_id from another
            // company is never offered here and must not reach the backend.
            disabled={loading || coId == null || selectedBranch == null || !month}
            onClick={() => void runFetch(selectedBranch?.branch_id ?? null, month)}
            sx={{
              backgroundColor: tokens.report.header,
              "&:hover": { backgroundColor: tokens.report.headerHover },
            }}
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

      {!loading && loaded && data && totals ? (
        <Box className="pyl-print-root">
          {/* Print letterhead — the branch the figures were fetched for. */}
          <Box sx={{ display: "none", displayPrint: "block", mb: 1, textAlign: "center" }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {companyName ?? ""} — {TITLE}
            </Typography>
            <Typography variant="caption">
              {loaded.branchName ?? ""} · {monthLabel(data.month)} ({data.from_date} to{" "}
              {data.to_date})
            </Typography>
          </Box>
          <Stack spacing={2}>
            <ExceptionsStrip exceptions={data.exceptions ?? []} />

            <LedgerMetaLine
              meta={data.meta}
              rows={data.rows}
              fromDate={data.from_date}
              toDate={data.to_date}
            />

            <SectionCard
              title={`Purchased yarn — ${monthLabel(data.month)} (kg)`}
              subtitle="Godown: opening + purchases − issues + returns = book closing, against the counted closing. Floor: opening + issues − returns − closing = consumption. Days of stock = floor closing ÷ average daily consumption."
            >
              <LedgerTable
                rows={data.rows}
                totals={totals}
                flaggedDiffItems={flaggedDiff}
                expanded={expanded}
                onToggle={toggle}
                onExpandAll={expandAll}
                onCollapseAll={collapseAll}
              />
            </SectionCard>
          </Stack>
        </Box>
      ) : null}

      {!loading && !data && !error ? (
        <Alert severity="info">Select a branch and month, then press Submit to build the ledger.</Alert>
      ) : null}
    </Box>
  );
}

export default function PurchasedYarnLedgerPage() {
  // useReportBranches() reads useSearchParams() — `next build` fails without
  // a Suspense boundary above it.
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
