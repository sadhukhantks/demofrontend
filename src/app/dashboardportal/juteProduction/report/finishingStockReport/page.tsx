"use client";

/**
 * Finishing Stock Report — the mill's "Finishing Stock" Excel sheet for one date.
 *
 * Left column: one card per owner company (Hessian + Sacking bale tables with
 * per-section totals and a block GRAND TOTAL) and the despatch made on the date.
 * Right column: the loose (un-pressed) stock by quality, with a collapsible
 * stage-wise breakdown behind it. Footer: Bales MT · Loose MT · Stock MT.
 *
 * Everything is computed by the backend (`/api/finishingStock/report`); this
 * page only lays it out, prints it, and flattens it for Excel.
 */

import React, {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Collapse,
  GlobalStyles,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { ChevronDown, ChevronUp, FileSpreadsheet, Printer } from "lucide-react";
import { useReportBranches } from "@/components/reports/useReportBranches";
import PrintFrame from "@/components/reports/PrintFrame";
import { useMounted } from "@/components/reports/useMounted";
import { todayIso } from "@/components/reports/reportDates";
import { exportRowsToExcel } from "@/components/reports/exportExcel";
import type { BranchOption } from "@/components/reports/types";
import {
  fetchFinishingStockReport,
  type FinishingStockBaleBlock,
  type FinishingStockBaleLine,
  type FinishingStockBaleTotal,
  type FinishingStockLooseLine,
  type FinishingStockReport,
} from "@/utils/finishingStockService";
// Presentational shells shared with the Daily Production Report — same compact
// print-friendly tables, so the two production reports print alike.
import {
  DprTable,
  NumTd,
  SectionCard,
  Td,
  Tr,
  fmt,
  totalRowSx,
} from "../dailyProductionReport/_components/DprPieces";
import {
  EXPORT_COLUMNS,
  flattenReport,
  isReportEmpty,
} from "./utils/reportShape";

const REPORT_TITLE = "Finishing Stock";

/** Section label row inside a stacked table (HESSIAN / SACKING). */
function SectionRow({ label, span }: { label: string; span: number }) {
  return (
    <Tr>
      <Td colSpan={span} sx={{ fontWeight: 700, bgcolor: "action.hover" }}>
        {label}
      </Td>
    </Tr>
  );
}

function BaleLines({
  label,
  lines,
  total,
}: {
  label: string;
  lines: FinishingStockBaleLine[];
  total: FinishingStockBaleTotal;
}) {
  if (!lines.length) return null;
  return (
    <>
      <SectionRow label={label} span={4} />
      {lines.map((l) => (
        <Tr key={l.finishing_quality_id}>
          <Td>{l.item_name ?? "—"}</Td>
          <NumTd value={l.bales} digits={0} />
          <NumTd value={l.per_wt_kg} digits={3} />
          <NumTd value={l.wt_mt} digits={3} />
        </Tr>
      ))}
      <Tr sx={totalRowSx()}>
        <Td>Total</Td>
        <NumTd value={total.bales} digits={0} bold />
        <Td />
        <NumTd value={total.wt_mt} digits={3} bold />
      </Tr>
    </>
  );
}

/** One owner company's pressed-bale stock. */
function BaleBlockCard({
  block,
  tranDate,
}: {
  block: FinishingStockBaleBlock;
  tranDate: string;
}) {
  return (
    <SectionCard
      title={block.owner_co_name}
      subtitle={`Bales as on ${tranDate}${block.is_own ? "" : " (held for another company)"}`}
    >
      <DprTable
        head={
          <Tr>
            <Td>Quality</Td>
            <Td align="right">Bales</Td>
            <Td align="right">Per-bale Kg</Td>
            <Td align="right">MT</Td>
          </Tr>
        }
      >
        <BaleLines
          label="Hessian"
          lines={block.hessian}
          total={block.hessian_total}
        />
        <BaleLines
          label="Sacking"
          lines={block.sacking}
          total={block.sacking_total}
        />
        {/* Same guard as flattenReport: a block with no line on either side
            has nothing to total. */}
        {block.hessian.length || block.sacking.length ? (
          <Tr sx={totalRowSx()}>
            <Td>GRAND TOTAL</Td>
            <NumTd value={block.total.bales} digits={0} bold />
            <Td />
            <NumTd value={block.total.wt_mt} digits={3} bold />
          </Tr>
        ) : null}
      </DprTable>
    </SectionCard>
  );
}

function LooseLines({
  label,
  lines,
  totalMt,
}: {
  label: string;
  lines: FinishingStockLooseLine[];
  totalMt: number;
}) {
  if (!lines.length) return null;
  return (
    <>
      <SectionRow label={label} span={2} />
      {lines.map((l) => (
        <Tr key={l.finishing_quality_id}>
          <Td>{l.item_name ?? "—"}</Td>
          <NumTd value={l.wt_mt} digits={3} />
        </Tr>
      ))}
      <Tr sx={totalRowSx()}>
        <Td>Total</Td>
        <NumTd value={totalMt} digits={3} bold />
      </Tr>
    </>
  );
}

const WORK_BY_LABEL = ["Dept", "Contract"] as const;

function Content() {
  const { branches, coId, companyName, initialBranchId, dateParam } =
    useReportBranches();
  // Branch and date come from the localStorage-backed sidebar context — empty
  // in the server HTML, filled on the client. Hold the controls until mount so
  // the first client render matches the server one (same gate as ReportPanel).
  const mounted = useMounted();
  const [branchId, setBranchId] = useState<number | null>(initialBranchId);
  const [tranDate, setTranDate] = useState<string>(dateParam || todayIso());
  const [data, setData] = useState<FinishingStockReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showStages, setShowStages] = useState(false);
  const fetchedOnce = useRef(false);
  const branchSeeded = useRef(false);
  const lastCoId = useRef<number | null>(null);

  const runFetch = useCallback(
    async (bId: number | null, d: string) => {
      if (coId == null || bId == null || !d) return;
      setLoading(true);
      setError(null);
      try {
        setData(
          await fetchFinishingStockReport({ coId, branchId: bId, tranDate: d }),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load the report");
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [coId],
  );

  // Seed the branch once, when the sidebar context resolves.
  useEffect(() => {
    if (!branchSeeded.current && initialBranchId != null) {
      branchSeeded.current = true;
      setBranchId(initialBranchId);
    }
  }, [initialBranchId]);

  // Sidebar company switch: the loaded report and the branch belong to the old
  // company — drop both so nothing renders (or prints) mislabeled.
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
    const b = branchId ?? initialBranchId;
    if (!fetchedOnce.current && coId != null && b != null) {
      fetchedOnce.current = true;
      void runFetch(b, tranDate);
    }
  }, [coId, branchId, initialBranchId, tranDate, runFetch]);

  const selectedBranch: BranchOption | null =
    branches.find((b) => b.branch_id === branchId) ?? null;

  const handleExport = useCallback(() => {
    if (!data) return;
    exportRowsToExcel(
      EXPORT_COLUMNS,
      flattenReport(data),
      `finishing-stock-${data.tran_date}`,
      {
        companyName: data.co_name,
        branchName: data.branch_name,
        reportName: REPORT_TITLE,
        reportFor: data.tran_date,
      },
    ).catch((e: unknown) =>
      setError(e instanceof Error ? e.message : "Failed to export the report"),
    );
  }, [data]);

  const empty = data ? isReportEmpty(data) : false;

  return (
    <Box sx={{ p: 2 }}>
      {/* On print, show ONLY the report: the portal shell (sidebar, back
          button) and this page's controls sit outside .fin-print-root and get
          visibility-hidden. */}
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
            ".fin-print-root, .fin-print-root *": { visibility: "visible" },
            ".fin-print-root": {
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
        <Paper elevation={1} sx={{ mb: 2, p: 2, displayPrint: "none" }}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={1.5}
            alignItems={{ md: "center" }}
            useFlexGap
            flexWrap="wrap"
          >
            <Typography variant="h6" sx={{ fontWeight: 700, flexGrow: 1 }}>
              {REPORT_TITLE}
            </Typography>
            {/* Norm: the picker appears only when the sidebar scope leaves a
                choice to make. */}
            {branches.length > 1 && (
              <Autocomplete
                size="small"
                sx={{ minWidth: 240 }}
                options={branches}
                value={selectedBranch}
                getOptionLabel={(o) => o.branch_name}
                isOptionEqualToValue={(o, v) => o.branch_id === v.branch_id}
                onChange={(_, v) => setBranchId(v?.branch_id ?? null)}
                renderInput={(p) => <TextField {...p} label="Branch" />}
              />
            )}
            <TextField
              size="small"
              type="date"
              label="Date"
              value={tranDate}
              onChange={(e) => setTranDate(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ width: 180 }}
            />
            <Button
              variant="contained"
              disabled={loading || coId == null || branchId == null}
              onClick={() => void runFetch(branchId, tranDate)}
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
              startIcon={<FileSpreadsheet size={16} />}
              disabled={!data}
              onClick={handleExport}
            >
              Excel
            </Button>
          </Stack>
        </Paper>
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

      {!loading && data ? (
        <Box className="fin-print-root">
          <PrintFrame marginMm={10}>
            {/* Print letterhead */}
            <Box
              sx={{
                display: "none",
                displayPrint: "block",
                mb: 1,
                textAlign: "center",
              }}
            >
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {data.co_name || companyName || ""} — {REPORT_TITLE}
              </Typography>
              <Typography variant="caption">
                {data.branch_name || selectedBranch?.branch_name || ""} ·{" "}
                {data.tran_date}
              </Typography>
            </Box>

            {empty ? (
              <Alert severity="info">No entries for this date</Alert>
            ) : (
              <>
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: { xs: "column", md: "row" },
                    alignItems: "flex-start",
                    gap: 2,
                    // Print has one column: the cards stack full width. `gap`
                    // does nothing on a block box, so the stacked columns get
                    // their breathing room from a margin instead.
                    displayPrint: "block",
                    "@media print": { "& > * + *": { mt: 2 } },
                  }}
                >
                  {/* Left: bales per owner + despatch */}
                  <Stack spacing={2} sx={{ flex: 2, minWidth: 0, width: "100%" }}>
                    {data.bales.map((b) => (
                      <BaleBlockCard
                        key={b.owner_co_id ?? "own"}
                        block={b}
                        tranDate={data.tran_date}
                      />
                    ))}

                    <SectionCard title={`Despatch on ${data.tran_date}`}>
                      {data.despatch.length ? (
                        <DprTable
                          head={
                            <Tr>
                              <Td>Item</Td>
                              <Td align="right">Bales</Td>
                              <Td align="right">Qty</Td>
                              <Td>UoM</Td>
                            </Tr>
                          }
                        >
                          {data.despatch.map((d) => (
                            <Tr key={d.item_id}>
                              <Td>{d.item_name ?? "—"}</Td>
                              <NumTd value={d.bales} digits={0} />
                              <NumTd value={d.qty} digits={3} />
                              <Td>{d.uom_name ?? "—"}</Td>
                            </Tr>
                          ))}
                        </DprTable>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          No despatch invoiced on this date.
                        </Typography>
                      )}
                    </SectionCard>
                  </Stack>

                  {/* Right: loose stock + stage-wise detail */}
                  <Stack spacing={2} sx={{ flex: 1, minWidth: 0, width: "100%" }}>
                    <SectionCard
                      title="Loose Stock"
                      subtitle={`As on ${data.tran_date}`}
                    >
                      <DprTable
                        head={
                          <Tr>
                            <Td>Quality</Td>
                            <Td align="right">MT</Td>
                          </Tr>
                        }
                      >
                        <LooseLines
                          label="Hessian"
                          lines={data.loose.hessian}
                          totalMt={data.loose.hessian_total_mt}
                        />
                        <LooseLines
                          label="Sacking"
                          lines={data.loose.sacking}
                          totalMt={data.loose.sacking_total_mt}
                        />
                        {/* Guarded like flattenReport: nothing to total when
                            neither section has a line. */}
                        {data.loose.hessian.length ||
                        data.loose.sacking.length ? (
                          <Tr sx={totalRowSx()}>
                            <Td>GRAND TOTAL</Td>
                            <NumTd value={data.loose.total_mt} digits={3} bold />
                          </Tr>
                        ) : null}
                      </DprTable>
                    </SectionCard>

                    {data.loose_lines.length ? (
                      <SectionCard title="Loose by stage">
                        <Button
                          size="small"
                          sx={{ mb: 1, displayPrint: "none" }}
                          endIcon={
                            showStages ? (
                              <ChevronUp size={16} />
                            ) : (
                              <ChevronDown size={16} />
                            )
                          }
                          onClick={() => setShowStages((v) => !v)}
                        >
                          {showStages ? "Hide" : "Show"} {data.loose_lines.length}{" "}
                          lines
                        </Button>
                        {/* Collapsed on screen to keep the card short. A
                            collapsed MUI Collapse is height 0 + visibility
                            hidden, so print has to undo all three or the sheet
                            would silently lose the stage detail. */}
                        <Collapse
                          in={showStages}
                          sx={{
                            "@media print": {
                              height: "auto !important",
                              visibility: "visible",
                              overflow: "visible",
                            },
                          }}
                        >
                          <DprTable
                            head={
                              <Tr>
                                <Td>Stage</Td>
                                <Td>Work by</Td>
                                <Td>Quality</Td>
                                <Td align="right">Qty</Td>
                                <Td>UoM</Td>
                                <Td align="right">MT</Td>
                              </Tr>
                            }
                          >
                            {data.loose_lines.map((l, i) => (
                              <Tr
                                key={`${l.stage ?? "none"}-${l.item_name ?? ""}-${i}`}
                              >
                                <Td>{l.stage_label ?? l.stage ?? "—"}</Td>
                                <Td>{WORK_BY_LABEL[l.work_by]}</Td>
                                <Td>
                                  {l.quality_type === 1 ? "Hessian" : "Sacking"} ·{" "}
                                  {l.item_name ?? "—"}
                                </Td>
                                <NumTd value={l.qty} digits={0} />
                                <Td>{l.qty_uom}</Td>
                                <NumTd value={l.wt_mt} digits={3} />
                              </Tr>
                            ))}
                          </DprTable>
                        </Collapse>
                      </SectionCard>
                    ) : null}
                  </Stack>
                </Box>

                {/* KPI footer line */}
                <Paper
                  variant="outlined"
                  sx={{
                    mt: 2,
                    p: 1.5,
                    display: "flex",
                    gap: 3,
                    flexWrap: "wrap",
                    justifyContent: "flex-end",
                  }}
                >
                  {(
                    [
                      ["Bales MT", data.totals.bales_mt],
                      ["Loose MT", data.totals.loose_mt],
                      ["Stock MT", data.totals.stock_mt],
                    ] as const
                  ).map(([label, value]) => (
                    <Typography key={label} variant="body2">
                      {label}: <strong>{fmt(value, 3)}</strong>
                    </Typography>
                  ))}
                </Paper>
              </>
            )}
          </PrintFrame>
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

export default function FinishingStockReportPage() {
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
