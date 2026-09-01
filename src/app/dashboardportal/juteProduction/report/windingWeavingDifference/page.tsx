"use client";

/**
 * Winding & Weaving Difference report — reproduces the mill's signed-off
 * printed sheet: counted winding stock (daily physical count) reconciled
 * against book stock (opening + winding + purchase − weaving − sale), day
 * and month-to-date.
 *
 * Chain-break handling: `chain.ok` is false when the day's opening stock had
 * to be taken from an older count than the previous calendar day (a count
 * was skipped). When that happens, `production.day.difference_mt` silently
 * absorbs every unmeasured day in the gap — the number is arithmetically
 * meaningless even though it renders identically to a good one. The TODAY
 * column of the production-reconciliation table is therefore struck through
 * and greyed whenever the chain is broken; the MTD column is unaffected and
 * stays fully readable.
 */

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  GlobalStyles,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Printer } from "lucide-react";
import { useReportBranches } from "@/components/reports/useReportBranches";
import { yesterdayIso } from "@/components/reports/reportDates";
import type { BranchOption } from "@/components/reports/types";
import {
  fetchWindingWeavingDifference,
  type WindingWeavingDifference,
  type WwdReconciliation,
  type WwdStockRow,
} from "@/utils/juteProductionReportService";
import {
  DprTable,
  NumTd,
  SectionCard,
  Td,
  Tr,
  fmt,
  totalRowSx,
} from "../dailyProductionReport/_components/DprPieces";

// Stock blocks in the printed sheet's order. Backend always returns every
// bucket (possibly empty) so the shape is stable, but empty buckets are
// skipped in the render per the brief.
const BUCKET_ORDER = ["MILL_USE", "PURCHASE", "SALE_YARN", "BALL", "WASTE"] as const;

const BUCKET_LABELS: Record<string, string> = {
  MILL_USE: "Yarn for Mill Use",
  PURCHASE: "Outside Purchase Yarn",
  SALE_YARN: "Sale Yarn Stock",
  BALL: "Ball Stock",
  WASTE: "Waste",
};

const CLOTH_SPLIT_ORDER = ["HESSIAN", "SACKING", "OTHER"] as const;
const CLOTH_SPLIT_LABELS: Record<string, string> = {
  HESSIAN: "Hessian",
  SACKING: "Sacking",
  OTHER: "Other",
};

// Production-reconciliation rows, in the printed sheet's order. difference_pct
// is shown in the header strip, not this table; difference_mt gets its own
// (highlighted) row below the loop.
const RECON_ROWS: { key: keyof WwdReconciliation; label: string }[] = [
  { key: "jute_issue_mt", label: "Jute Issue (MT)" },
  { key: "opening_mt", label: "Opening Stock (MT)" },
  { key: "winding_mt", label: "Winding Production (MT)" },
  { key: "twisting_mt", label: "Twisting (Consumed) (MT)" },
  { key: "weaving_mt", label: "Weaving Production (MT)" },
  { key: "purchase_mt", label: "Purchase Yarn (MT)" },
  { key: "sale_mt", label: "Sale Yarn (MT)" },
  { key: "should_be_closing_mt", label: "Should-Be Closing (MT)" },
  { key: "actual_closing_mt", label: "Actual Closing (MT)" },
];

/** null means a percentage of zero winding production — never render 0.00%. */
function pctDisplay(pct: number | null): string {
  return pct === null ? "—" : `${fmt(pct, 2)}%`;
}

/** One bucket's rows, tolerating grand_total_mt (a number) sharing the map. */
function bucketOf(
  stock: WindingWeavingDifference["stock"],
  name: string,
): { rows: WwdStockRow[]; subtotal_mt: number } | null {
  const v = stock[name];
  return v && typeof v === "object" ? v : null;
}

function Content() {
  const { branches, coId, companyName, initialBranchId, dateParam } = useReportBranches();
  // Branch/date come from the localStorage-backed sidebar context, so the
  // server HTML has an empty branch and the client the saved one — hold the
  // controls until mount to avoid a hydration mismatch (same gate as DPR).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const [branchId, setBranchId] = useState<number | null>(initialBranchId);
  const [reportDate, setReportDate] = useState<string>(dateParam || yesterdayIso());
  const [data, setData] = useState<WindingWeavingDifference | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedOnce = useRef(false);
  const branchSeeded = useRef(false);
  const lastCoId = useRef<number | null>(null);

  const runFetch = useCallback(
    async (bId: number | null, d: string) => {
      // branch_id is mandatory for this endpoint (winding is branch-keyed) —
      // unlike the DPR, there is no company-wide fallback.
      if (coId == null || bId == null || !d) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetchWindingWeavingDifference({ coId, branchId: bId, reportDate: d });
        setData(res);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load the report");
        setData(null);
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
      setBranchId(null);
      branchSeeded.current = false;
      fetchedOnce.current = false;
    }
    lastCoId.current = coId;
  }, [coId]);

  useEffect(() => {
    if (!fetchedOnce.current && coId != null && (branchId ?? initialBranchId) != null) {
      fetchedOnce.current = true;
      void runFetch(branchId ?? initialBranchId, reportDate);
    }
  }, [coId, branchId, initialBranchId, reportDate, runFetch]);

  const selectedBranch: BranchOption | null =
    branches.find((b) => b.branch_id === branchId) ?? null;

  const chainBroken = data != null && !data.chain.ok;
  // No count exists before the 1st of the month — mtd_opening came back 0.0
  // (never disclosed as such), so should_be_closing_mt silently omits the
  // whole opening balance. Same chain-break treatment as the day column,
  // keyed off month_opening_date instead of chain.ok.
  const mtdOpeningUnknown = data != null && data.chain.month_opening_date == null;
  const day = data?.production.day;
  const mtd = data?.production.mtd;

  return (
    <Box sx={{ p: 2 }}>
      {/* On print, show ONLY the report content: the portal shell (sidebar,
          hub back-button) and this page's controls all sit outside
          .wwd-print-root and get visibility-hidden. */}
      <GlobalStyles
        styles={{
          "@media print": {
            "body *": { visibility: "hidden" },
            ".wwd-print-root, .wwd-print-root *": { visibility: "visible" },
            ".wwd-print-root": {
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
          <Typography variant="h6" sx={{ fontWeight: 700, flexGrow: 1 }}>
            Winding & Weaving Difference
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
            type="date"
            label="Report Date"
            value={reportDate}
            onChange={(e) => setReportDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <Button
            variant="contained"
            disabled={loading || coId == null || branchId == null}
            onClick={() => void runFetch(branchId, reportDate)}
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

      {!loading && data && day && mtd ? (
        <Box className="wwd-print-root">
          {/* Print letterhead */}
          <Box sx={{ display: "none", displayPrint: "block", mb: 1, textAlign: "center" }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {companyName ?? ""} — Winding & Weaving Difference
            </Typography>
            <Typography variant="caption">
              {selectedBranch?.branch_name ?? ""} · {data.report_date} (MTD from {data.date_from})
            </Typography>
          </Box>
          <Stack spacing={2}>
            {/* Header strip */}
            <Stack direction="row" spacing={3} useFlexGap flexWrap="wrap">
              <Typography variant="body2">
                <strong>Report Date:</strong> {data.report_date}
              </Typography>
              <Typography variant="body2" sx={mtdOpeningUnknown ? { color: "text.disabled" } : undefined}>
                <strong>Month Opening:</strong>{" "}
                {mtdOpeningUnknown ? "no count before month start" : data.chain.month_opening_date}
              </Typography>
              <Typography variant="body2" sx={chainBroken ? { color: "text.disabled" } : undefined}>
                <strong>Today Difference %:</strong>{" "}
                {chainBroken ? "not comparable" : pctDisplay(day.difference_pct)}
              </Typography>
              <Typography variant="body2" sx={mtdOpeningUnknown ? { color: "text.disabled" } : undefined}>
                <strong>To-Date Difference %:</strong>{" "}
                {mtdOpeningUnknown ? "not comparable" : pctDisplay(mtd.difference_pct)}
              </Typography>
            </Stack>

            {/* Chain warning */}
            {chainBroken ? (
              <Alert severity="warning">
                {data.chain.prev_entry_date
                  ? `Opening stock is taken from ${data.chain.prev_entry_date}, not the previous day. Counts are missing in between.`
                  : "No earlier stock count exists — opening stock could not be verified."}
              </Alert>
            ) : null}

            {/* Month-to-date opening warning */}
            {mtdOpeningUnknown ? (
              <Alert severity="warning">
                No stock count exists before the start of the month, so the month-to-date
                opening balance is unknown and the To-Date figures below are not comparable.
              </Alert>
            ) : null}

            {/* Unknown-UOM warning */}
            {data.warnings.purchase_unknown_uoms.length > 0 ? (
              <Alert severity="warning">
                {`Purchased yarn booked in ${data.warnings.purchase_unknown_uoms.join(", ")} was not converted — MTR is metres, not tonnes, so that quantity is missing from the totals.`}
              </Alert>
            ) : null}

            {/* Weaving rows with no resolvable quality warning */}
            {data.warnings.weaving_unresolved_day > 0 || data.warnings.weaving_unresolved_mtd > 0 ? (
              <Alert severity="warning">
                {`${data.warnings.weaving_unresolved_day} weaving row(s) today and ${data.warnings.weaving_unresolved_mtd} this month have no resolvable weaving quality — that production is excluded from Weaving Production (MT), so the difference below is overstated.`}
              </Alert>
            ) : null}

            {/* Production details */}
            <SectionCard
              title="Production Reconciliation"
              subtitle="Book stock (opening + winding + purchase − weaving − sale) vs counted closing stock"
            >
              <DprTable
                head={
                  <Tr>
                    <Td>Metric</Td>
                    <Td align="right">Today{chainBroken ? " (not comparable)" : ""}</Td>
                    <Td align="right">To-Date (MTD){mtdOpeningUnknown ? " (not comparable)" : ""}</Td>
                  </Tr>
                }
              >
                {RECON_ROWS.map((r) => (
                  <Tr key={r.key}>
                    <Td>{r.label}</Td>
                    {chainBroken ? (
                      <Td
                        align="right"
                        sx={{ color: "text.disabled", textDecoration: "line-through" }}
                      >
                        {fmt(day[r.key], 3)}
                      </Td>
                    ) : (
                      <NumTd value={day[r.key]} digits={3} />
                    )}
                    {mtdOpeningUnknown ? (
                      <Td
                        align="right"
                        sx={{ color: "text.disabled", textDecoration: "line-through" }}
                      >
                        {fmt(mtd[r.key], 3)}
                      </Td>
                    ) : (
                      <NumTd value={mtd[r.key]} digits={3} />
                    )}
                  </Tr>
                ))}
                <Tr sx={totalRowSx()}>
                  <Td>Difference (MT)</Td>
                  {chainBroken ? (
                    <Td
                      align="right"
                      sx={{ color: "text.disabled", fontStyle: "italic", fontWeight: 700 }}
                    >
                      — not comparable
                    </Td>
                  ) : (
                    <NumTd value={day.difference_mt} digits={3} tone="nonzero-bad" bold />
                  )}
                  {mtdOpeningUnknown ? (
                    <Td
                      align="right"
                      sx={{ color: "text.disabled", fontStyle: "italic", fontWeight: 700 }}
                    >
                      — not comparable
                    </Td>
                  ) : (
                    <NumTd value={mtd.difference_mt} digits={3} tone="nonzero-bad" bold />
                  )}
                </Tr>
              </DprTable>
              {chainBroken ? (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                  Today&apos;s opening stock was carried from an older count (see warning above),
                  so the Today column is struck through — it is not a real day-over-day variance.
                </Typography>
              ) : null}
              {mtdOpeningUnknown ? (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                  No count exists before the start of the month (see warning above), so the
                  month-to-date opening balance is unknown and the To-Date column is struck
                  through — it is not a real month-to-date variance.
                </Typography>
              ) : null}
            </SectionCard>

            {/* Cloth split */}
            <SectionCard title="Weaving Cloth Split (MT)" subtitle="Weaving production split by cloth quality type">
              <DprTable
                head={
                  <Tr>
                    <Td>Cloth Type</Td>
                    <Td align="right">Today</Td>
                    <Td align="right">To-Date (MTD)</Td>
                  </Tr>
                }
              >
                {CLOTH_SPLIT_ORDER.map((k) => (
                  <Tr key={k}>
                    <Td>{CLOTH_SPLIT_LABELS[k]}</Td>
                    <NumTd value={data.cloth_split.day[k]} digits={3} />
                    <NumTd value={data.cloth_split.mtd[k]} digits={3} />
                  </Tr>
                ))}
              </DprTable>
            </SectionCard>

            {/* Five stock blocks — skip a bucket entirely when it has no rows */}
            {BUCKET_ORDER.map((bucket) => {
              const block = bucketOf(data.stock, bucket);
              if (!block || block.rows.length === 0) return null;
              return (
                <SectionCard key={bucket} title={BUCKET_LABELS[bucket]}>
                  <DprTable
                    head={
                      <Tr>
                        <Td align="right">Count</Td>
                        <Td>Quality</Td>
                        <Td>Package</Td>
                        <Td align="right">No. of Samples</Td>
                        <Td align="right">Weight/Sample (kg)</Td>
                        <Td align="right">Prvs Stock (MT)</Td>
                        <Td align="right">Stock Position (MT)</Td>
                        <Td>Place</Td>
                      </Tr>
                    }
                  >
                    {block.rows.map((r, i) => (
                      <Tr key={`${bucket}-${i}`}>
                        <NumTd value={r.yarn_count} />
                        <Td>{r.item_name ?? r.item_code ?? r.quality_name ?? "—"}</Td>
                        <Td>{r.package_label || "—"}</Td>
                        <NumTd value={r.no_of_samples} digits={0} />
                        <NumTd value={r.wt_per_sample} />
                        <NumTd value={r.prvs_stock_mt} digits={3} />
                        <NumTd value={r.stock_mt} digits={3} />
                        <Td>{r.area_name ?? "—"}</Td>
                      </Tr>
                    ))}
                    <Tr sx={totalRowSx()}>
                      <Td colSpan={6}>Subtotal</Td>
                      <NumTd value={block.subtotal_mt} digits={3} bold />
                      <Td />
                    </Tr>
                  </DprTable>
                </SectionCard>
              );
            })}

            {/* Stock grand total */}
            <Box sx={{ textAlign: "right", pr: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Grand Total Stock: {fmt(data.stock.grand_total_mt, 3)} MT
              </Typography>
            </Box>

            {/* Note */}
            <Typography variant="caption" color="text.secondary" component="p">
              {data.note}
            </Typography>
          </Stack>
        </Box>
      ) : null}

      {!loading && !data && !error ? (
        <Alert severity="info">
          Select a branch and date, then press Submit to build the report.
        </Alert>
      ) : null}
    </Box>
  );
}

export default function WindingWeavingDifferencePage() {
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
