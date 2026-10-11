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
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { ChevronDown, ChevronRight, FileDown, Printer } from "lucide-react";
import { useReportBranches } from "@/components/reports/useReportBranches";
import { yesterdayIso } from "@/components/reports/reportDates";
import type { BranchOption } from "@/components/reports/types";
import {
  fetchWindingWeavingDifference,
  type WindingWeavingDifference,
  type WwdStockRow,
} from "@/utils/juteProductionReportService";
import { downloadTablesPdf } from "@/components/reports/tablesPdf";
import {
  DprTable,
  NumTd,
  SectionCard,
  Td,
  Tr,
  fmt,
  totalRowSx,
} from "../dailyProductionReport/_components/DprPieces";
import { purchaseDetailMatches, purchaseDetailTotalKg, purchaseDetailTotalMt } from "./purchaseDetail";
import {
  BUCKET_LABELS,
  CLOTH_SPLIT_LABELS,
  CLOTH_SPLIT_ORDER,
  MILL_USE_BUCKET,
  OTHER_BUCKET_ORDER,
  RECON_ROWS,
  bucketOf,
  buildWwdPdfSpec,
  pctDisplay,
  wwdComparability,
  wwdWarningTexts,
} from "./wwdSheet";

/** One stock block's counted lines — the printed sheet's eight columns. Shared
 *  by the collapsible mill-use block and the four plain ones so both can never
 *  drift apart. */
function StockBlockTable({
  bucket,
  block,
}: {
  bucket: string;
  block: { rows: WwdStockRow[]; subtotal_mt: number };
}) {
  return (
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
  );
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
  // Mill-use details start minimized (owner's call on TKT-000182): the
  // consolidated table above it is what should be read first.
  const [millUseOpen, setMillUseOpen] = useState(false);
  // Purchase documents start minimized too: the reconciliation table above
  // carries the figure, the documents are the audit trail behind it.
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
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

  // Same sheet as Print, saved as an A4 PDF file: every block included
  // (collapsed ones too), letterhead with company / branch / date.
  const handleDownloadPdf = async () => {
    if (!data) return;
    setPdfBusy(true);
    setError(null);
    try {
      await downloadTablesPdf(
        buildWwdPdfSpec(data, { companyName, branchName: selectedBranch?.branch_name }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to build the PDF");
    } finally {
      setPdfBusy(false);
    }
  };

  // chainBroken: opening stock came from an older count than yesterday.
  // mtdOpeningUnknown: no count exists before the 1st of the month — mtd_opening
  // came back 0.0 (never disclosed as such), so should_be_closing_mt silently
  // omits the whole opening balance. Same treatment as the day column.
  const { chainBroken, mtdOpeningUnknown } = data
    ? wwdComparability(data)
    : { chainBroken: false, mtdOpeningUnknown: false };
  const day = data?.production.day;
  const mtd = data?.production.mtd;
  const millUseBlock = data ? bucketOf(data.stock, MILL_USE_BUCKET) : null;
  // Absent (not empty) on a backend that predates the Yarn Purchase document.
  const purchaseRows = data?.purchase_detail;
  const purchaseTotalMt = purchaseRows ? purchaseDetailTotalMt(purchaseRows) : 0;
  const purchaseMatches =
    purchaseRows && mtd ? purchaseDetailMatches(purchaseRows, mtd.purchase_mt) : true;

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
          <Button
            variant="outlined"
            startIcon={<FileDown size={16} />}
            disabled={!data || loading || pdfBusy}
            onClick={() => void handleDownloadPdf()}
          >
            {pdfBusy ? "Preparing..." : "Download PDF"}
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

            {/* Warnings (chain break, unknown month opening, unconverted UOM,
                unresolved weaving quality, legacy Stores receipts) — texts
                shared with the PDF via wwdWarningTexts. */}
            {wwdWarningTexts(data).map((text) => (
              <Alert key={text} severity="warning">
                {text}
              </Alert>
            ))}

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

            {/* Purchase yarn documents — the approved Yarn Purchase lines
                behind Purchase Yarn (MTD). Minimized on screen like the
                mill-use detail, never unmounted, forced visible in print so the
                signed sheet keeps its audit trail. */}
            {purchaseRows ? (
              <Paper variant="outlined" sx={{ p: 1.5, breakInside: "avoid" }}>
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  role="button"
                  tabIndex={0}
                  aria-expanded={purchaseOpen}
                  onClick={() => setPurchaseOpen((o) => !o)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setPurchaseOpen((o) => !o);
                    }
                  }}
                  sx={{ cursor: "pointer", userSelect: "none" }}
                >
                  <Box sx={{ display: "flex", displayPrint: "none" }}>
                    {purchaseOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </Box>
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      Purchase yarn (documents)
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block", displayPrint: "none" }}
                    >
                      {purchaseRows.length} document line(s) since {data.date_from} · Total{" "}
                      {fmt(purchaseTotalMt, 3)} MT —{" "}
                      {purchaseOpen ? "tap to minimize" : "tap to show the documents"}
                      {/* The full note below is hidden while minimized, so the
                          header must carry the mismatch too. */}
                      {!purchaseMatches ? (
                        <Box component="span" sx={{ color: "error.main", fontWeight: 700 }}>
                          {" — does not match Purchase Yarn (MTD)"}
                        </Box>
                      ) : null}
                    </Typography>
                  </Box>
                </Stack>
                <Box
                  sx={{
                    mt: 0.75,
                    display: purchaseOpen ? "block" : "none",
                    displayPrint: "block",
                  }}
                >
                  {purchaseRows.length > 0 ? (
                    <DprTable
                      head={
                        <Tr>
                          <Td>Purchase No</Td>
                          <Td>Date</Td>
                          <Td>Yarn Item</Td>
                          <Td align="right">Count</Td>
                          <Td align="right">Kg</Td>
                        </Tr>
                      }
                    >
                      {purchaseRows.map((r) => (
                        <Tr key={`yp-${r.yarn_purchase_id}-${r.item_id}`}>
                          <Td>{r.purchase_no}</Td>
                          <Td>{r.tran_date ?? "—"}</Td>
                          <Td>{r.item_name ?? "—"}</Td>
                          <NumTd value={r.yarn_count} />
                          <NumTd value={r.kg} digits={3} />
                        </Tr>
                      ))}
                      <Tr sx={totalRowSx()}>
                        <Td colSpan={4}>Total ({fmt(purchaseTotalMt, 3)} MT)</Td>
                        <NumTd value={purchaseDetailTotalKg(purchaseRows)} digits={3} bold />
                      </Tr>
                    </DprTable>
                  ) : (
                    <Typography variant="caption" color="text.secondary">
                      No approved Yarn Purchase document since {data.date_from}.
                    </Typography>
                  )}
                  {/* The documents ARE the figure: if they do not add up to
                      Purchase Yarn (MTD), say so rather than print two totals
                      that disagree. */}
                  {!purchaseMatches ? (
                    <Typography variant="caption" color="error.main" sx={{ mt: 0.5, display: "block" }}>
                      Documents total {fmt(purchaseTotalMt, 3)} MT but Purchase Yarn (MTD) above reads{" "}
                      {fmt(mtd.purchase_mt, 3)} MT — the two were not built from the same
                      documents.
                    </Typography>
                  ) : null}
                </Box>
              </Paper>
            ) : null}

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

            {/* ---- MILL USE (TKT-000182) -------------------------------
                 The consolidated position comes FIRST, then the detail table,
                 which renders MINIMIZED and expands when its header is pressed.
                 The detail table is hidden with CSS and never unmounted, and is
                 forced visible in print: the printed sheet must keep every
                 counted line whatever the screen state. Only this block is
                 collapsible and only this block has a consolidated table — the
                 other four sections below are untouched. */}
            {data.stock_summary && data.stock_summary.rows.length > 0
              ? (() => {
                  const summary = data.stock_summary;
                  const lineCount = summary.rows.reduce((a, r) => a + r.line_count, 0);
                  return (
                    <SectionCard
                      title={`${BUCKET_LABELS[MILL_USE_BUCKET]} — Consolidated Position (Yarn Quality wise)`}
                      subtitle={`${summary.rows.length} quality/qualities consolidated from ${lineCount} counted mill-use line(s); a quality counted yesterday but not today shows 0.000`}
                    >
                      <DprTable
                        head={
                          <Tr>
                            <Td align="right">Count</Td>
                            <Td>Quality</Td>
                            <Td>Group</Td>
                            <Td align="right">Prvs Stock (MT)</Td>
                            <Td align="right">Stock Position (MT)</Td>
                          </Tr>
                        }
                      >
                        {summary.rows.map((r, i) => (
                          <Tr key={`mus-${r.item_id ?? i}`}>
                            <NumTd value={r.yarn_count} />
                            <Td>{r.item_name ?? r.item_code ?? r.quality_name ?? "—"}</Td>
                            <Td>{r.quality_name ?? "—"}</Td>
                            <NumTd value={r.prvs_stock_mt} digits={3} />
                            <NumTd value={r.total_mt} digits={3} bold />
                          </Tr>
                        ))}
                        <Tr sx={totalRowSx()}>
                          <Td colSpan={3}>Total (Mill Use)</Td>
                          <NumTd value={summary.prvs_total_mt} digits={3} bold />
                          <NumTd value={summary.total_mt} digits={3} bold />
                        </Tr>
                      </DprTable>
                    </SectionCard>
                  );
                })()
              : null}

            {/* Mill-use detail table — minimized by default */}
            {millUseBlock && millUseBlock.rows.length > 0 ? (
              <Paper variant="outlined" sx={{ p: 1.5, breakInside: "avoid" }}>
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  role="button"
                  tabIndex={0}
                  aria-expanded={millUseOpen}
                  onClick={() => setMillUseOpen((o) => !o)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setMillUseOpen((o) => !o);
                    }
                  }}
                  sx={{ cursor: "pointer", userSelect: "none" }}
                >
                  <Box sx={{ display: "flex", displayPrint: "none" }}>
                    {millUseOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </Box>
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      {BUCKET_LABELS[MILL_USE_BUCKET]} — Details
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block", displayPrint: "none" }}
                    >
                      {millUseBlock.rows.length} counted line(s) · Subtotal{" "}
                      {fmt(millUseBlock.subtotal_mt, 3)} MT —{" "}
                      {millUseOpen ? "tap to minimize" : "tap to show the full table"}
                    </Typography>
                  </Box>
                </Stack>
                <Box
                  sx={{
                    mt: 0.75,
                    display: millUseOpen ? "block" : "none",
                    displayPrint: "block",
                  }}
                >
                  <StockBlockTable bucket={MILL_USE_BUCKET} block={millUseBlock} />
                </Box>
              </Paper>
            ) : null}

            {/* The other four stock blocks, unchanged — skip one entirely when
                it has no rows */}
            {OTHER_BUCKET_ORDER.map((bucket) => {
              const block = bucketOf(data.stock, bucket);
              if (!block || block.rows.length === 0) return null;
              return (
                <SectionCard key={bucket} title={BUCKET_LABELS[bucket]}>
                  <StockBlockTable bucket={bucket} block={block} />
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
