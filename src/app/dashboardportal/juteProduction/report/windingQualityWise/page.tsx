"use client";

/**
 * Winding Quality Wise report — port of the legacy PHP sheet: two tables on
 * one page for one branch + one date.
 *
 *  1. Winding Quality List — per winding quality: winders, production, target
 *     and production/winder across the A/B/C shifts, plus month-to-date.
 *  2. Winding Quality Group List — per item group, winding production next to
 *     the spinning department's figures for the same yarn. The two are
 *     independent measurements, so a group where they disagree is tinted.
 *
 * The two endpoints are independent and fetched in parallel: if one fails the
 * other still renders and the failure is disclosed in the error Alert, rather
 * than blanking the page or leaving a stale table behind.
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
import { alpha, type Theme } from "@mui/material/styles";
import { Printer } from "lucide-react";
import { useReportBranches } from "@/components/reports/useReportBranches";
import { yesterdayIso } from "@/components/reports/reportDates";
import type { BranchOption } from "@/components/reports/types";
import {
  fetchWindingQualityGroupWise,
  fetchWindingQualityWise,
  type WindingQualityGroupWise,
  type WindingQualityWise,
} from "@/utils/juteProductionReportService";
import { variesFromSpinning } from "./varianceTint";
import {
  DprTable,
  NumTd,
  SectionCard,
  Td,
  Tr,
  totalRowSx,
} from "../dailyProductionReport/_components/DprPieces";

/** Light error wash — legible in both light and dark, unlike a raw red fill. */
const varianceRowSx = {
  bgcolor: (t: Theme) => alpha(t.palette.error.light, 0.18),
};

function errText(e: unknown): string {
  return e instanceof Error ? e.message : "Failed to load the report";
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
  const [quality, setQuality] = useState<WindingQualityWise | null>(null);
  const [group, setGroup] = useState<WindingQualityGroupWise | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedOnce = useRef(false);
  const branchSeeded = useRef(false);
  const lastCoId = useRef<number | null>(null);

  const runFetch = useCallback(
    async (bId: number | null, d: string) => {
      // branch_id is mandatory for both endpoints (winding is branch-keyed) —
      // there is no company-wide fallback.
      if (coId == null || bId == null || !d) return;
      setLoading(true);
      setError(null);
      // allSettled, not all: one endpoint failing must not blank the other.
      const [q, g] = await Promise.allSettled([
        fetchWindingQualityWise({ branchId: bId, reportDate: d }),
        fetchWindingQualityGroupWise({ branchId: bId, reportDate: d }),
      ]);
      setQuality(q.status === "fulfilled" ? q.value : null);
      setGroup(g.status === "fulfilled" ? g.value : null);
      const msgs = [q, g].flatMap((r) => (r.status === "rejected" ? [errText(r.reason)] : []));
      setError(msgs.length ? Array.from(new Set(msgs)).join(" · ") : null);
      setLoading(false);
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
      setQuality(null);
      setGroup(null);
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
  const hasData = quality != null || group != null;
  const qTotal = quality?.grand_total;
  const gTotal = group?.grand_total;

  return (
    <Box sx={{ p: 2 }}>
      {/* On print, show ONLY the report content: the portal shell (sidebar,
          hub back-button) and this page's controls all sit outside
          .wqw-print-root and get visibility-hidden. */}
      <GlobalStyles
        styles={{
          "@media print": {
            "body *": { visibility: "hidden" },
            ".wqw-print-root, .wqw-print-root *": { visibility: "visible" },
            ".wqw-print-root": {
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
            Winding Quality Wise
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
            disabled={!hasData}
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

      {!loading && hasData ? (
        <Box className="wqw-print-root">
          {/* Print letterhead */}
          <Box sx={{ display: "none", displayPrint: "block", mb: 1, textAlign: "center" }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {companyName ?? ""} — Winding Quality Wise
            </Typography>
            <Typography variant="caption">
              {selectedBranch?.branch_name ?? ""} ·{" "}
              {quality?.report_date ?? group?.report_date ?? reportDate}
            </Typography>
          </Box>
          <Stack spacing={2}>
            {/* Header strip */}
            <Stack direction="row" spacing={3} useFlexGap flexWrap="wrap">
              <Typography variant="body2">
                <strong>Report Date:</strong>{" "}
                {quality?.report_date ?? group?.report_date ?? reportDate}
              </Typography>
              {quality ? (
                <Typography variant="body2">
                  <strong>Month to Date From:</strong> {quality.mtd_from}
                </Typography>
              ) : null}
            </Stack>

            {/* ------------------- Table 1: quality wise ------------------- */}
            {quality ? (
              <SectionCard
                title="Winding Quality List"
                subtitle="Winders, production and target per winding quality, by shift"
              >
                {/* 22 columns: 2 + 4 + 4 + 4 + 1 + 4 + 3. Shift labels are
                    hard-coded because the row keys (_A/_B/_C) are too. */}
                <DprTable
                  head={
                    <>
                      <Tr>
                        <Td colSpan={2} align="center">
                          Quality
                        </Td>
                        <Td colSpan={4} align="center">
                          No of Winder
                        </Td>
                        <Td colSpan={4} align="center">
                          Production (kg)
                        </Td>
                        <Td colSpan={4} align="center">
                          Target (kg)
                        </Td>
                        <Td align="center">Difference</Td>
                        <Td colSpan={4} align="center">
                          Production / Winder
                        </Td>
                        <Td colSpan={3} align="center">
                          Month to Date
                        </Td>
                      </Tr>
                      <Tr>
                        <Td>Code</Td>
                        <Td>Quality</Td>
                        <Td align="right">A</Td>
                        <Td align="right">B</Td>
                        <Td align="right">C</Td>
                        <Td align="right">Total</Td>
                        <Td align="right">A</Td>
                        <Td align="right">B</Td>
                        <Td align="right">C</Td>
                        <Td align="right">Total</Td>
                        <Td align="right">A</Td>
                        <Td align="right">B</Td>
                        <Td align="right">C</Td>
                        <Td align="right">Total</Td>
                        <Td align="right">Diff</Td>
                        <Td align="right">A</Td>
                        <Td align="right">B</Td>
                        <Td align="right">C</Td>
                        <Td align="right">Avg</Td>
                        <Td align="right">Production</Td>
                        <Td align="right">Winders</Td>
                        <Td align="right">Avg/Winder</Td>
                      </Tr>
                    </>
                  }
                >
                  {quality.rows.map((r, i) => (
                    <Tr key={r.item_id ?? `q-${i}`}>
                      <Td>{r.item_code ?? "—"}</Td>
                      <Td>{r.item_name ?? "—"}</Td>
                      <NumTd value={r.winders_A} digits={0} />
                      <NumTd value={r.winders_B} digits={0} />
                      <NumTd value={r.winders_C} digits={0} />
                      <NumTd value={r.winders_total} digits={0} />
                      <NumTd value={r.prod_A} digits={0} />
                      <NumTd value={r.prod_B} digits={0} />
                      <NumTd value={r.prod_C} digits={0} />
                      <NumTd value={r.prod_total} digits={0} />
                      <NumTd value={r.target_A} digits={0} />
                      <NumTd value={r.target_B} digits={0} />
                      <NumTd value={r.target_C} digits={0} />
                      <NumTd value={r.target_total} digits={0} />
                      <NumTd value={r.difference} digits={0} />
                      <NumTd value={r.prod_per_winder_A} digits={1} />
                      <NumTd value={r.prod_per_winder_B} digits={1} />
                      <NumTd value={r.prod_per_winder_C} digits={1} />
                      <NumTd value={r.prod_per_winder_avg} digits={1} />
                      <NumTd value={r.mtd_prod} digits={0} />
                      <NumTd value={r.mtd_winders} digits={0} />
                      <NumTd value={r.mtd_prod_per_winder} digits={1} />
                    </Tr>
                  ))}
                  {qTotal ? (
                    <Tr sx={totalRowSx()}>
                      <Td colSpan={2}>{qTotal.item_name ?? "Grand Total"}</Td>
                      <NumTd value={qTotal.winders_A} digits={0} bold />
                      <NumTd value={qTotal.winders_B} digits={0} bold />
                      <NumTd value={qTotal.winders_C} digits={0} bold />
                      <NumTd value={qTotal.winders_total} digits={0} bold />
                      <NumTd value={qTotal.prod_A} digits={0} bold />
                      <NumTd value={qTotal.prod_B} digits={0} bold />
                      <NumTd value={qTotal.prod_C} digits={0} bold />
                      <NumTd value={qTotal.prod_total} digits={0} bold />
                      <NumTd value={qTotal.target_A} digits={0} bold />
                      <NumTd value={qTotal.target_B} digits={0} bold />
                      <NumTd value={qTotal.target_C} digits={0} bold />
                      <NumTd value={qTotal.target_total} digits={0} bold />
                      <NumTd value={qTotal.difference} digits={0} bold />
                      <NumTd value={qTotal.prod_per_winder_A} digits={1} bold />
                      <NumTd value={qTotal.prod_per_winder_B} digits={1} bold />
                      <NumTd value={qTotal.prod_per_winder_C} digits={1} bold />
                      <NumTd value={qTotal.prod_per_winder_avg} digits={1} bold />
                      <NumTd value={qTotal.mtd_prod} digits={0} bold />
                      <NumTd value={qTotal.mtd_winders} digits={0} bold />
                      <NumTd value={qTotal.mtd_prod_per_winder} digits={1} bold />
                    </Tr>
                  ) : null}
                </DprTable>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  component="p"
                  sx={{ mt: 0.5 }}
                >
                  {quality.note}
                </Typography>
              </SectionCard>
            ) : null}

            {/* ---------------- Table 2: quality group wise ---------------- */}
            {group ? (
              <SectionCard
                title="Winding Quality Group List"
                subtitle="Winding production against the spinning figures for the same yarn"
              >
                {/* 14 columns: 1 + 4 + 4 + 1 + 4. Variance is not a column —
                    it drives the row tint only, as on the printed sheet. */}
                <DprTable
                  head={
                    <>
                      <Tr>
                        <Td colSpan={9} align="center">
                          Winding
                        </Td>
                        <Td colSpan={5} align="center">
                          Spinning
                        </Td>
                      </Tr>
                      <Tr>
                        <Td align="center">Quality</Td>
                        <Td colSpan={4} align="center">
                          Winders
                        </Td>
                        <Td colSpan={4} align="center">
                          Production (kg)
                        </Td>
                        <Td align="center">Winding Qty</Td>
                        <Td colSpan={4} align="center">
                          Production (kg)
                        </Td>
                      </Tr>
                      <Tr>
                        <Td>Group</Td>
                        <Td align="right">A</Td>
                        <Td align="right">B</Td>
                        <Td align="right">C</Td>
                        <Td align="right">Total</Td>
                        <Td align="right">A</Td>
                        <Td align="right">B</Td>
                        <Td align="right">C</Td>
                        <Td align="right">Total</Td>
                        <Td align="right">Wnd Qty</Td>
                        <Td align="right">A</Td>
                        <Td align="right">B</Td>
                        <Td align="right">C</Td>
                        <Td align="right">Total</Td>
                      </Tr>
                    </>
                  }
                >
                  {group.rows.map((r, i) => (
                    <Tr
                      key={r.item_grp_id ?? `g-${i}`}
                      sx={variesFromSpinning(r) ? varianceRowSx : undefined}
                    >
                      <Td>{r.item_grp_name}</Td>
                      <NumTd value={r.wnd_winders_A} digits={0} />
                      <NumTd value={r.wnd_winders_B} digits={0} />
                      <NumTd value={r.wnd_winders_C} digits={0} />
                      <NumTd value={r.wnd_winders_total} digits={0} />
                      <NumTd value={r.wnd_prod_A} />
                      <NumTd value={r.wnd_prod_B} />
                      <NumTd value={r.wnd_prod_C} />
                      <NumTd value={r.wnd_prod_total} />
                      <NumTd value={r.spg_winding_qty} />
                      <NumTd value={r.spg_prod_A} />
                      <NumTd value={r.spg_prod_B} />
                      <NumTd value={r.spg_prod_C} />
                      <NumTd value={r.spg_prod_total} />
                    </Tr>
                  ))}
                  {gTotal ? (
                    <Tr sx={totalRowSx()}>
                      <Td>{gTotal.item_grp_name || "Grand Total"}</Td>
                      <NumTd value={gTotal.wnd_winders_A} digits={0} bold />
                      <NumTd value={gTotal.wnd_winders_B} digits={0} bold />
                      <NumTd value={gTotal.wnd_winders_C} digits={0} bold />
                      <NumTd value={gTotal.wnd_winders_total} digits={0} bold />
                      <NumTd value={gTotal.wnd_prod_A} bold />
                      <NumTd value={gTotal.wnd_prod_B} bold />
                      <NumTd value={gTotal.wnd_prod_C} bold />
                      <NumTd value={gTotal.wnd_prod_total} bold />
                      <NumTd value={gTotal.spg_winding_qty} bold />
                      <NumTd value={gTotal.spg_prod_A} bold />
                      <NumTd value={gTotal.spg_prod_B} bold />
                      <NumTd value={gTotal.spg_prod_C} bold />
                      <NumTd value={gTotal.spg_prod_total} bold />
                    </Tr>
                  ) : null}
                </DprTable>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  component="p"
                  sx={{ mt: 0.5 }}
                >
                  A tinted row means winding and spinning disagree for that group in at least
                  one shift (or in total). The two departments measure the same yarn
                  independently, so compare each Winding Production column against the
                  Spinning Production column beside it to see where they part.
                </Typography>
                <Typography variant="caption" color="text.secondary" component="p">
                  {group.note}
                </Typography>
              </SectionCard>
            ) : null}
          </Stack>
        </Box>
      ) : null}

      {!loading && !hasData && !error ? (
        <Alert severity="info">
          Select a branch and date, then press Submit to build the report.
        </Alert>
      ) : null}
    </Box>
  );
}

export default function WindingQualityWisePage() {
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
