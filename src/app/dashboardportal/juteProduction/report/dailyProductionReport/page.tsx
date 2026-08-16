"use client";

/**
 * Daily Production Report (DPR) — whole-mill one-pager.
 *
 * Replaces the Excel "DAILY PRODUCTION REPORT (DOFF-10)" sheet: spinning
 * (shift + quality wise), winding, weaving (quality + shift pivot), finishing /
 * bale press, yarn heavy-light SQC, jute stock position, worker hands and an
 * extra-machine-run analysis — one date, with month-to-date context throughout.
 *
 * Design decisions vs the spreadsheet (exception-first, for the morning meeting):
 *  - KPI strip on top answers "how was yesterday?" in one glance.
 *  - Variances are computed and tinted (text tint + sign, never color alone).
 *  - Sections the ERP cannot feed yet are listed as explicit data-capture gaps
 *    instead of empty zero tables.
 *  - Printable via the browser (controls are print-hidden).
 */

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
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
  fetchDailyProductionReport,
  type DailyProductionReport,
} from "@/utils/juteProductionReportService";
import {
  DprTable,
  KpiCard,
  NumTd,
  SectionCard,
  Td,
  Tr,
  VerdictChip,
  fmt,
  totalRowSx,
  type KpiState,
} from "./_components/DprPieces";

// Status thresholds for the KPI strip.
const UTIL_GOOD_PCT = 80;
const UTIL_WARN_PCT = 50;
const JUTE_COVER_GOOD_DAYS = 30;
const JUTE_COVER_WARN_DAYS = 10;

function utilState(pct: number): KpiState {
  return pct >= UTIL_GOOD_PCT ? "good" : pct >= UTIL_WARN_PCT ? "warn" : "bad";
}

function daysStockState(days: number | null): KpiState {
  if (days === null) return undefined;
  return days >= JUTE_COVER_GOOD_DAYS ? "good" : days >= JUTE_COVER_WARN_DAYS ? "warn" : "bad";
}

function Content() {
  const { branches, coId, companyName, initialBranchId, dateParam } = useReportBranches();
  // Branch/date come from the localStorage-backed sidebar context, so the
  // server HTML has an empty branch and the client the saved one — hold the
  // controls until mount to avoid a hydration mismatch (same gate as ReportPanel).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const [branchId, setBranchId] = useState<number | null>(initialBranchId);
  const [reportDate, setReportDate] = useState<string>(dateParam || yesterdayIso());
  const [data, setData] = useState<DailyProductionReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedOnce = useRef(false);
  const branchSeeded = useRef(false);
  const lastCoId = useRef<number | null>(null);

  const runFetch = useCallback(
    async (bId: number | null, d: string) => {
      if (coId == null || !d) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetchDailyProductionReport({
          coId,
          branchId: bId,
          reportDate: d,
        });
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
  // user may clear the field to run the company-wide (branch-less) report.
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

  const spinning = data?.spinning;
  const weaving = data?.weaving;

  return (
    <Box sx={{ p: 2 }}>
      {/* On print, show ONLY the report content: the portal shell (sidebar,
          hub back-button) and this page's controls all sit outside
          .dpr-print-root and get visibility-hidden. */}
      <GlobalStyles
        styles={{
          "@media print": {
            "body *": { visibility: "hidden" },
            ".dpr-print-root, .dpr-print-root *": { visibility: "visible" },
            ".dpr-print-root": {
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
            },
          },
        }}
      />
      {/* Controls — hidden on print (displayPrint beats Tailwind print:hidden
          on MUI components, whose emotion display:flex can win the cascade) */}
      {mounted && (
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={1.5}
        alignItems={{ md: "center" }}
        sx={{ mb: 2, displayPrint: "none" }}
      >
        <Typography variant="h6" sx={{ fontWeight: 700, flexGrow: 1 }}>
          Daily Production Report
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
          disabled={loading || coId == null}
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

      {!loading && data ? (
        <Box className="dpr-print-root">
          {/* Print letterhead */}
          <Box sx={{ display: "none", displayPrint: "block", mb: 1, textAlign: "center" }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {companyName ?? ""} — Daily Production Report
            </Typography>
            <Typography variant="caption">
              {selectedBranch?.branch_name ?? ""} · {data.report_date} (MTD from {data.date_from})
            </Typography>
          </Box>
          <Stack spacing={2}>
          {/* KPI strip */}
          <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap">
            <KpiCard
              label="Spinning (MT)"
              value={fmt(data.kpi.spinning_mt, 3)}
              sub={`MTD ${fmt(data.kpi.spinning_mtd_mt, 1)} MT`}
            />
            <KpiCard
              label="Frame Utilization"
              value={`${fmt(data.kpi.frame_utilization_pct, 1)}%`}
              sub={`Doff eff ${fmt(data.kpi.spinning_eff_pct, 1)}%`}
              state={utilState(data.kpi.frame_utilization_pct)}
            />
            <KpiCard
              label="Weaving (MT)"
              value={fmt(data.kpi.weaving_mt, 3)}
              sub={`MTD ${fmt(data.kpi.weaving_mtd_mt, 1)} MT`}
            />
            <KpiCard
              label="Loom Utilization"
              value={`${fmt(data.kpi.loom_utilization_pct, 1)}%`}
              sub={`Weaving eff ${fmt(data.kpi.weaving_eff_pct, 1)}%`}
              state={utilState(data.kpi.loom_utilization_pct)}
            />
            <KpiCard
              label="Winding (kg)"
              value={fmt(data.kpi.winding_kg, 0)}
              sub={data.kpi.winding_kg === null ? "select a branch" : undefined}
            />
            <KpiCard
              label="Hands / MT"
              value={fmt(data.kpi.hands_per_mt, 1)}
              sub={`${fmt(data.kpi.total_hands, 0)} hands`}
            />
            <KpiCard
              label="Jute Closing Stock"
              value={fmt(data.kpi.jute_closing_weight, 0)}
              sub={
                data.kpi.jute_days_stock !== null
                  ? `${fmt(data.kpi.jute_days_stock, 1)} days cover`
                  : data.jute
                    ? "no MTD issue"
                    : "select a branch"
              }
              state={daysStockState(data.kpi.jute_days_stock)}
            />
          </Stack>

          {/* Spinning shift-wise */}
          {spinning ? (
            <SectionCard
              title="Spinning Production — Shift Wise"
              subtitle={`${spinning.total_frames} installed frames · MTD ${fmt(spinning.mtd.production_mt, 1)} MT`}
            >
              <DprTable
                head={
                  <Tr>
                    <Td>Shift</Td>
                    <Td align="right">Production (MT)</Td>
                    <Td align="right">Frames Run</Td>
                    <Td align="right">Kg/Frame</Td>
                    <Td align="right">Utilization %</Td>
                    <Td align="right">Eff % (vs Std)</Td>
                  </Tr>
                }
              >
                {spinning.shifts.map((s) => (
                  <Tr key={s.shift}>
                    <Td>{s.shift}</Td>
                    <NumTd value={s.production_mt} digits={3} />
                    <NumTd value={s.frame_runs} digits={0} />
                    <NumTd value={s.kg_per_frame} digits={1} />
                    <NumTd value={s.utilization_pct} digits={1} />
                    <NumTd value={s.eff_pct} digits={1} />
                  </Tr>
                ))}
                <Tr sx={totalRowSx()}>
                  <Td>O/A</Td>
                  <NumTd value={spinning.total.production_mt} digits={3} bold />
                  <NumTd value={spinning.total.frame_runs} digits={0} bold />
                  <NumTd value={spinning.total.kg_per_frame} digits={1} bold />
                  <NumTd value={spinning.total.utilization_pct} digits={1} bold />
                  <NumTd value={spinning.total.eff_pct} digits={1} bold />
                </Tr>
                <Tr>
                  <Td>MTD</Td>
                  <NumTd value={spinning.mtd.production_mt} digits={3} />
                  <NumTd value={spinning.mtd.frame_runs} digits={0} />
                  <NumTd value={spinning.mtd.kg_per_frame} digits={1} />
                  <Td align="right">—</Td>
                  <Td align="right">—</Td>
                </Tr>
              </DprTable>
            </SectionCard>
          ) : null}

          {/* Spinning quality-wise (SPG + winder view) */}
          {spinning && spinning.quality.length > 0 ? (
            <SectionCard
              title="Spinning / Winder — Quality Wise"
              subtitle="Act count is production-weighted; winding kg is the reconciled winder output allocated to the quality"
            >
              <DprTable
                head={
                  <Tr>
                    <Td>Quality</Td>
                    <Td align="right">Act Count (lb)</Td>
                    <Td align="right">Std Count (lb)</Td>
                    <Td align="right">Spg Prod (kg)</Td>
                    <Td align="right">Kg/Frame-Shift</Td>
                    <Td align="right">Target/Frame-Shift</Td>
                    <Td align="right">Winding (kg)</Td>
                    <Td align="right">Eff %</Td>
                  </Tr>
                }
              >
                {spinning.quality.map((q) => (
                  <Tr key={q.item_id}>
                    <Td>{q.item_name ?? q.item_code ?? q.item_id}</Td>
                    <NumTd value={q.act_count} />
                    <NumTd value={q.std_count} />
                    <NumTd value={q.production_kg} digits={0} />
                    <NumTd value={q.kg_per_frame_shift} digits={1} />
                    <NumTd value={q.target_per_frame_shift} digits={1} />
                    <NumTd value={q.winding_kg} digits={0} />
                    <NumTd value={q.eff_pct} digits={1} />
                  </Tr>
                ))}
              </DprTable>
            </SectionCard>
          ) : null}

          {/* Winding */}
          {data.winding ? (
            <SectionCard
              title="Winder Production — Quality Wise"
              subtitle="Reconciled kg (doff − opening jugar + closing jugar) per winder"
            >
              <DprTable
                head={
                  <Tr>
                    <Td>Quality</Td>
                    <Td align="right">Production (kg)</Td>
                    <Td align="right">Winders</Td>
                    <Td align="right">Kg/Winder</Td>
                    <Td align="right">MTD (kg)</Td>
                    <Td align="right">MTD Kg/Winder-Shift</Td>
                  </Tr>
                }
              >
                {data.winding.qualities.map((q) => (
                  <Tr key={q.item_id ?? "na"}>
                    <Td>{q.item_name ?? q.item_code ?? "Unmapped"}</Td>
                    <NumTd value={q.production_kg} digits={0} />
                    <NumTd value={q.winders} digits={0} />
                    <NumTd value={q.kg_per_winder} digits={1} />
                    <NumTd value={q.mtd_production_kg} digits={0} />
                    <NumTd value={q.mtd_kg_per_winder_shift} digits={1} />
                  </Tr>
                ))}
                <Tr sx={totalRowSx()}>
                  <Td>Total</Td>
                  <NumTd value={data.winding.total.production_kg} digits={0} bold />
                  <NumTd value={data.winding.total.winders} digits={0} bold />
                  <NumTd value={data.winding.total.kg_per_winder} digits={1} bold />
                  <NumTd value={data.winding.total.mtd_production_kg} digits={0} bold />
                  <Td align="right">—</Td>
                </Tr>
              </DprTable>
            </SectionCard>
          ) : null}

          {/* Weaving */}
          {weaving ? (
            <SectionCard
              title="Weaving Production — Quality & Shift Wise"
              subtitle={`${weaving.total_looms} installed looms · utilization ${fmt(weaving.total.utilization_pct, 1)}% · MTD ${fmt(weaving.total.mtd_production_mt, 1)} MT`}
            >
              <DprTable
                head={
                  <Tr>
                    <Td>Quality</Td>
                    <Td align="right">A (MT)</Td>
                    <Td align="right">B (MT)</Td>
                    <Td align="right">C (MT)</Td>
                    <Td align="right">Total (MT)</Td>
                    <Td align="right">Looms Run</Td>
                    <Td align="right">Kg/Loom</Td>
                    <Td align="right">Eff %</Td>
                    <Td align="right">MTD (MT)</Td>
                  </Tr>
                }
              >
                {weaving.qualities.map((q) => (
                  <Tr key={q.weaving_quality_id}>
                    <Td>{q.quality_name ?? q.quality_code}</Td>
                    <NumTd value={q.shift_A_mt} digits={3} />
                    <NumTd value={q.shift_B_mt} digits={3} />
                    <NumTd value={q.shift_C_mt} digits={3} />
                    <NumTd value={q.production_mt} digits={3} />
                    <NumTd value={q.looms_run} digits={0} />
                    <NumTd value={q.kg_per_loom} digits={1} />
                    <NumTd value={q.eff_pct} digits={1} />
                    <NumTd value={q.mtd_production_mt} digits={1} />
                  </Tr>
                ))}
                <Tr sx={totalRowSx()}>
                  <Td>Total</Td>
                  <NumTd value={weaving.shift_totals["A"]} digits={3} bold />
                  <NumTd value={weaving.shift_totals["B"]} digits={3} bold />
                  <NumTd value={weaving.shift_totals["C"]} digits={3} bold />
                  <NumTd value={weaving.total.production_mt} digits={3} bold />
                  <NumTd value={weaving.total.loom_runs} digits={0} bold />
                  <NumTd value={weaving.total.kg_per_loom} digits={1} bold />
                  <NumTd value={weaving.total.eff_pct} digits={1} bold />
                  <NumTd value={weaving.total.mtd_production_mt} digits={1} bold />
                </Tr>
              </DprTable>
            </SectionCard>
          ) : null}

          {/* Finishing */}
          {data.finishing.processes.length > 0 ? (
            <SectionCard
              title="Finishing"
              subtitle="Bale press row = press production; other processes shown for context"
            >
              <DprTable
                head={
                  <Tr>
                    <Td>Process</Td>
                    <Td>UoM</Td>
                    <Td align="right">Today Qty</Td>
                    <Td align="right">Today Wt (kg)</Td>
                    <Td align="right">MTD Qty</Td>
                    <Td align="right">MTD Wt (kg)</Td>
                  </Tr>
                }
              >
                {data.finishing.processes.map((p) => (
                  <Tr
                    key={`${p.process}-${p.uom}`}
                    sx={p.process === "balepress" ? totalRowSx() : undefined}
                  >
                    <Td sx={{ textTransform: "capitalize" }}>{p.process}</Td>
                    <Td>{p.uom}</Td>
                    <NumTd value={p.day_qty} digits={0} />
                    <NumTd value={p.day_wt_kg} digits={0} />
                    <NumTd value={p.mtd_qty} digits={0} />
                    <NumTd value={p.mtd_wt_kg} digits={0} />
                  </Tr>
                ))}
              </DprTable>
            </SectionCard>
          ) : null}

          {/* Yarn heavy-light */}
          {data.yarn_heavy_light.length > 0 ? (
            <SectionCard
              title="Yarn Heavy / Light (SQC)"
              subtitle="Corrected count vs standard; +% = heavy, −% = light"
            >
              <DprTable
                head={
                  <Tr>
                    <Td>Quality</Td>
                    <Td align="right">Std (lb)</Td>
                    <Td align="right">Observed (lb)</Td>
                    <Td align="right">Corrected (lb)</Td>
                    <Td align="right">HY/LT %</Td>
                    <Td>Remark</Td>
                    <Td align="right">Tests</Td>
                    <Td align="right">MTD Corrected</Td>
                  </Tr>
                }
              >
                {data.yarn_heavy_light.map((r) => (
                  <Tr key={r.item_id}>
                    <Td>{r.item_name ?? r.item_code}</Td>
                    <NumTd value={r.std_count} />
                    <NumTd value={r.obs_count} />
                    <NumTd value={r.corr_count} />
                    <NumTd value={r.hy_lt_pct} tone="nonzero-bad" />
                    <VerdictChip remark={r.remark} />
                    <NumTd value={r.day_tests} digits={0} />
                    <NumTd value={r.mtd_corr_count} />
                  </Tr>
                ))}
              </DprTable>
            </SectionCard>
          ) : null}

          {/* Jute stock */}
          {data.jute ? (
            <SectionCard
              title="Jute Stock Position (kg)"
              subtitle={`Days of cover at MTD issue rate: ${fmt(data.jute.days_stock, 1)}`}
            >
              <DprTable
                head={
                  <Tr>
                    <Td>Group</Td>
                    <Td align="right">Opening</Td>
                    <Td align="right">Receipt</Td>
                    <Td align="right">Issue</Td>
                    <Td align="right">Closing</Td>
                    <Td align="right">MTD Receipt</Td>
                    <Td align="right">MTD Issue</Td>
                  </Tr>
                }
              >
                {data.jute.groups.map((g) => (
                  <Tr key={g.item_group_name}>
                    <Td>{g.item_group_name}</Td>
                    <NumTd value={g.opening_weight} digits={0} />
                    <NumTd value={g.receipt_weight} digits={0} />
                    <NumTd value={g.issue_weight} digits={0} />
                    <NumTd value={g.closing_weight} digits={0} />
                    <NumTd value={g.mtd_receipt_weight} digits={0} />
                    <NumTd value={g.mtd_issue_weight} digits={0} />
                  </Tr>
                ))}
                <Tr sx={totalRowSx()}>
                  <Td>Total</Td>
                  <NumTd value={data.jute.totals.opening_weight} digits={0} bold />
                  <NumTd value={data.jute.totals.receipt_weight} digits={0} bold />
                  <NumTd value={data.jute.totals.issue_weight} digits={0} bold />
                  <NumTd value={data.jute.totals.closing_weight} digits={0} bold />
                  <NumTd value={data.jute.totals.mtd_receipt_weight} digits={0} bold />
                  <NumTd value={data.jute.totals.mtd_issue_weight} digits={0} bold />
                </Tr>
              </DprTable>
            </SectionCard>
          ) : null}

          {/* Hands */}
          <SectionCard
            title="Workers / Hands"
            subtitle="Hands = worked hours ÷ 8 (A/B) or 7.5 (C); approved attendance only"
          >
            <DprTable
              head={
                <Tr>
                  <Td>Shift</Td>
                  <Td align="right">Hours</Td>
                  <Td align="right">Hands</Td>
                  <Td align="right">MTD Hours</Td>
                  <Td align="right">MTD Hands</Td>
                </Tr>
              }
            >
              {data.hands.shifts.map((s) => (
                <Tr key={s.shift}>
                  <Td>{s.shift}</Td>
                  <NumTd value={s.day_hours} digits={0} />
                  <NumTd value={s.day_hands} />
                  <NumTd value={s.mtd_hours} digits={0} />
                  <NumTd value={s.mtd_hands} digits={0} />
                </Tr>
              ))}
              <Tr sx={totalRowSx()}>
                <Td>Total</Td>
                <NumTd value={data.hands.total.day_hours} digits={0} bold />
                <NumTd value={data.hands.total.day_hands} bold />
                <NumTd value={data.hands.total.mtd_hours} digits={0} bold />
                <NumTd value={data.hands.total.mtd_hands} digits={0} bold />
              </Tr>
            </DprTable>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
              Overall labour productivity: {fmt(data.hands.hands_per_mt, 1)} hands per MT
              (spinning + weaving output).
            </Typography>
          </SectionCard>

          {/* Extra machine run */}
          {data.machine_run.length > 0 ? (
            <SectionCard
              title="Extra Machine Run Analysis"
              subtitle="Machines the output justified vs machines actually run; positive excess = extra machines running below par"
            >
              <DprTable
                head={
                  <Tr>
                    <Td>Section</Td>
                    <Td>Basis</Td>
                    <Td align="right">Avg Norm/Machine (kg)</Td>
                    <Td align="right">Avg Act/Machine (kg)</Td>
                    <Td align="right">Total Prod (kg)</Td>
                    <Td align="right">Should Run</Td>
                    <Td align="right">Act Run</Td>
                    <Td align="right">Excess</Td>
                  </Tr>
                }
              >
                {data.machine_run.map((m) => (
                  <Tr key={`${m.section}-${m.basis}`}>
                    <Td>{m.section}</Td>
                    <Td sx={{ textTransform: "uppercase" }}>{m.basis}</Td>
                    <NumTd value={m.avg_per_machine} digits={1} />
                    <NumTd value={m.avg_act_per_machine} digits={1} />
                    <NumTd value={m.total_prod_kg} digits={0} />
                    <NumTd value={m.should_run} />
                    <NumTd value={m.act_run} digits={0} />
                    <NumTd value={m.excess_machines} tone="pos-bad" />
                  </Tr>
                ))}
              </DprTable>
            </SectionCard>
          ) : null}

          {/* Data-capture gaps */}
          {data.unavailable.length > 0 ? (
            <SectionCard
              title="Not Yet Captured in ERP"
              subtitle="These DPR sections need new entry screens before they can appear here"
            >
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                {data.unavailable.map((u) => (
                  <Chip
                    key={u.section}
                    label={`${u.section} — ${u.reason}`}
                    variant="outlined"
                    size="small"
                  />
                ))}
              </Stack>
            </SectionCard>
          ) : null}
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

export default function DailyProductionReportPage() {
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
