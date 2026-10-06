"use client";

/**
 * Loom Modification Impact — did a modification on a loom group work, by how
 * much, and since which change (spec 2026-09-26-loom-modification-impact-design §7).
 * An EFFICIENCY comparison only (owner, 2026-09-29): before vs after each
 * stage, vs control, plus a breakdown / mechanical-stoppage context tab.
 *
 * One endpoint feeds every section (chain header, verdict strip, comparison
 * block, stage ladder, per loom, day-wise, mechanical, notes): every figure is derived
 * server-side from the same loom-day set, so the page only formats, tints
 * and lays out. Filters: branch (sidebar norm), modification chain, window
 * days with 30 / 60 one-tap presets (D4), settling days, control mode (speed
 * band default, D5). `?modification_id=` preselects a chain and runs it —
 * the register's "View impact" link.
 *
 * Mobile-first: the verdict strip and the stage ladder read on a phone; the
 * wide grids become cards under `sm`.
 */

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  ButtonGroup,
  CircularProgress,
  Paper,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import { useSearchParams } from "next/navigation";
import { useReportBranches } from "@/components/reports/useReportBranches";
import { useMounted } from "@/components/reports/useMounted";
import type { ReportExportHeader } from "@/components/reports/exportExcel";
import type { BranchOption } from "@/components/reports/types";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import { tokens } from "@/styles/tokens";
import {
  fetchLoomModificationImpact,
  fetchLoomModificationImpactOptions,
  type ImpactControlMode,
  type LoomModificationImpactOptions,
  type LoomModificationImpactReport,
} from "./_service";
import {
  CONTROL_OPTIONS,
  DEFAULT_WINDOW_DAYS,
  QUICK_WINDOW_PRESETS,
  SETTLE_OPTIONS,
  WINDOW_PRESETS,
  coverageLine,
  fmtDate,
  thresholdPctFor,
  windowLine,
} from "./impactRows";
import ChainHeader from "./_components/ChainHeader";
import VerdictStrip from "./_components/VerdictStrip";
import ComparisonBlock from "./_components/ComparisonBlock";
import StageLadder from "./_components/StageLadder";
import PerLoomTab from "./_components/PerLoomTab";
import DaywiseTab from "./_components/DaywiseTab";
import MechanicalTab from "./_components/MechanicalTab";
import NotesTab, { NotesAlert } from "./_components/NotesTab";

const TITLE = "Loom Modification Impact";

const TABS = ["Per loom", "Day-wise", "Breakdown & mechanical", "Notes"] as const;

function parseId(raw: string | null): number | "" {
  if (!raw) return "";
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : "";
}

function Content() {
  const { branches, coId, companyName, initialBranchId } = useReportBranches();
  const searchParams = useSearchParams();
  const urlModificationId = parseId(searchParams?.get("modification_id") ?? null);
  // Branch seed comes from the localStorage-backed sidebar context, so the
  // filters are held back until mount (see useMounted).
  const mounted = useMounted();

  const [branchId, setBranchId] = useState<number | null>(initialBranchId);
  const [modificationId, setModificationId] = useState<number | "">(urlModificationId);
  const [windowDays, setWindowDays] = useState<number>(DEFAULT_WINDOW_DAYS);
  const [settleDays, setSettleDays] = useState<number | "">("");
  const [control, setControl] = useState<string>("speed_band");
  const [controlGroupId, setControlGroupId] = useState<number | "">("");

  const [options, setOptions] = useState<LoomModificationImpactOptions | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [report, setReport] = useState<LoomModificationImpactReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(0);

  const branchSeeded = useRef(false);
  const lastCoId = useRef<number | null>(null);
  const autoRan = useRef(false);

  const selectedBranch: BranchOption | null =
    branches.find((b) => b.branch_id === branchId) ?? null;

  const runFetch = useCallback(async () => {
    if (coId == null || branchId == null) return;
    if (modificationId === "") {
      setError("Select a modification to run the report");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetchLoomModificationImpact({
        coId,
        branchId,
        modificationId,
        windowDays,
        settleDays,
        control: control as ImpactControlMode,
        controlGroupId,
      });
      setReport(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load the report");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [
    coId,
    branchId,
    modificationId,
    windowDays,
    settleDays,
    control,
    controlGroupId,
  ]);

  // Seed the branch ONCE when the sidebar context resolves; the user owns it after that.
  useEffect(() => {
    if (!branchSeeded.current && initialBranchId != null) {
      branchSeeded.current = true;
      setBranchId(initialBranchId);
    }
  }, [initialBranchId]);

  // Sidebar company switch: the loaded report, the options and the branch all
  // belong to the old company — drop them rather than show them mislabeled.
  useEffect(() => {
    if (coId == null) return;
    if (lastCoId.current != null && lastCoId.current !== coId) {
      setReport(null);
      setOptions(null);
      setModificationId("");
      setControlGroupId("");
      setBranchId(null);
      branchSeeded.current = false;
    }
    lastCoId.current = coId;
  }, [coId]);

  // Options (chains, CONTROL groups) per company + branch. The
  // branch must be one of the current company's: after a sidebar company
  // switch the hub URL's branch_id can still name the old company's branch.
  useEffect(() => {
    if (coId == null || branchId == null) return;
    if (!branches.some((b) => b.branch_id === branchId)) return;
    // No "already fetched for this key" ref guard here: React Strict Mode (on by
    // default in the Next dev server) mounts effects twice, and a guard set by the
    // first run made the second run bail out while the first fetch had already
    // been cancelled — the picker then stayed empty. The cancel flag alone is the
    // right pattern; a duplicate fetch in dev is harmless.
    let cancelled = false;
    setOptionsLoading(true);
    void (async () => {
      try {
        const res = await fetchLoomModificationImpactOptions({ coId, branchId });
        if (cancelled) return;
        setOptions(res);
        if (res.default_window_days && WINDOW_PRESETS.includes(res.default_window_days)) {
          setWindowDays(res.default_window_days);
        }
        // A chain picked for another branch is meaningless here; a URL id is
        // kept even when it is a follow-up's id — the endpoint resolves it.
        setModificationId((cur) =>
          cur !== "" && (cur === urlModificationId || res.modifications.some((m) => m.modification_id === cur))
            ? cur
            : "",
        );
        setControlGroupId("");
        setReport(null);
      } catch (err: unknown) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load the report options");
      } finally {
        if (!cancelled) setOptionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [coId, branchId, branches, urlModificationId]);

  // One automatic run when the page was opened with ?modification_id=.
  useEffect(() => {
    if (autoRan.current || options == null || modificationId === "" || urlModificationId === "") return;
    if (modificationId !== urlModificationId) return;
    autoRan.current = true;
    void runFetch();
  }, [options, modificationId, urlModificationId, runFetch]);

  const modificationOptions = useMemo(
    () => (options?.modifications ?? []).map((m) => ({ value: m.modification_id, label: m.label })),
    [options],
  );
  const controlGroupOptions = useMemo(
    () => (options?.control_groups ?? []).map((g) => ({ value: g.loom_group_id, label: g.group_name })),
    [options],
  );
  const windowOptions = useMemo(
    () => (options?.window_presets?.length ? options.window_presets : WINDOW_PRESETS).map((d) => ({ value: d, label: `${d} days` })),
    [options],
  );

  const header: ReportExportHeader = useMemo(
    () => ({
      companyName,
      branchName: selectedBranch?.branch_name,
      reportName: TITLE,
      reportFor: report
        ? `${report.windows.before.date_from} To ${report.windows.after[report.windows.after.length - 1]?.date_to ?? report.windows.before.date_to}`
        : null,
    }),
    [companyName, selectedBranch, report],
  );

  const meta = report?.meta ?? null;
  const thresholdPct = thresholdPctFor(meta?.thresholds);
  const coverage = coverageLine(report?.verdict ?? null);
  const canRun = coId != null && selectedBranch != null && modificationId !== "" && !loading;

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 } }}>
      <Typography variant="h5" sx={{ color: tokens.report.header, fontWeight: "bold", mb: 2 }}>
        {TITLE}
      </Typography>

      {mounted && (
        <>
          <Paper elevation={1} sx={{ mb: 2, p: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
              {/* Norm: the picker only when more than one branch is in scope. */}
              {branches.length > 1 ? (
                <Box sx={{ minWidth: 220 }}>
                  <SearchableSelect<BranchOption>
                    variant="outlined"
                    size="small"
                    label="Branch"
                    options={branches}
                    value={selectedBranch}
                    onChange={(opt) => {
                      setReport(null);
                      setBranchId(opt?.branch_id ?? null);
                    }}
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
              <SearchableOptionSelect<number>
                label="Modification"
                size="small"
                options={modificationOptions}
                value={modificationId}
                onChange={(v) => setModificationId(v === "" ? "" : Number(v))}
                loading={optionsLoading}
                placeholder={optionsLoading ? "Loading…" : "Pick a chain"}
                noOptionsText="No modifications entered for this branch"
                sx={{ minWidth: { xs: "100%", sm: 320 } }}
              />
              <SearchableOptionSelect<number>
                label="Window days per side"
                size="small"
                clearable={false}
                options={windowOptions}
                value={windowDays}
                onChange={(v) => {
                  if (v !== "") setWindowDays(Number(v));
                }}
                sx={{ width: 190 }}
              />
              {/* D4: 30 and 60 as one-tap presets beside the dropdown. */}
              <ButtonGroup size="small" variant="outlined" aria-label="window presets">
                {QUICK_WINDOW_PRESETS.map((d) => (
                  <Button
                    key={d}
                    onClick={() => setWindowDays(d)}
                    variant={windowDays === d ? "contained" : "outlined"}
                    sx={{ textTransform: "none" }}
                  >
                    {d} d
                  </Button>
                ))}
              </ButtonGroup>
              <SearchableOptionSelect<number>
                label="Settling days"
                size="small"
                options={SETTLE_OPTIONS}
                value={settleDays}
                onChange={(v) => setSettleDays(v === "" ? "" : Number(v))}
                placeholder="Event value"
                sx={{ width: 160 }}
              />
              <SearchableOptionSelect<string>
                label="Control"
                size="small"
                clearable={false}
                options={CONTROL_OPTIONS}
                value={control}
                onChange={(v) => {
                  if (v !== "") setControl(v);
                  if (v !== "control_group") setControlGroupId("");
                }}
                sx={{ minWidth: { xs: "100%", sm: 300 } }}
              />
              {control === "control_group" ? (
                <SearchableOptionSelect<number>
                  label="Control group"
                  size="small"
                  options={controlGroupOptions}
                  value={controlGroupId}
                  onChange={(v) => setControlGroupId(v === "" ? "" : Number(v))}
                  noOptionsText="No CONTROL groups in the master"
                  sx={{ width: 220 }}
                />
              ) : null}
              <Box sx={{ flexGrow: 1 }} />
              <Button
                variant="contained"
                disabled={!canRun}
                onClick={() => void runFetch()}
                sx={{
                  backgroundColor: tokens.report.header,
                  "&:hover": { backgroundColor: tokens.report.headerHover },
                  textTransform: "none",
                }}
              >
                Submit
              </Button>
            </Box>
          </Paper>

          {error ? (
            <Alert severity="error" sx={{ mb: 2 }} data-testid="report-error">
              {error}
            </Alert>
          ) : null}
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress />
            </Box>
          ) : null}

          {!loading && report ? (
            <>
              <ChainHeader chain={report.chain} windows={report.windows} meta={meta} />

              {/* Meta strip: windows, coverage, control and the data-source note. */}
              <Stack
                direction="row"
                spacing={3}
                useFlexGap
                flexWrap="wrap"
                sx={{ mb: 1.5, px: 0.5 }}
                data-testid="meta-strip"
              >
                <Typography variant="body2">
                  <strong>Window:</strong> {report.windows.window_days} d · settle {report.windows.settle_days} d
                  {report.windows.last_data_date ? ` · last data ${fmtDate(report.windows.last_data_date)}` : ""}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {windowLine(report.windows)}
                </Typography>
                {coverage ? (
                  <Typography variant="body2" color="text.secondary" data-testid="coverage-line">
                    <strong>Coverage:</strong> {coverage}
                  </Typography>
                ) : null}
                {meta?.control ? (
                  <Typography variant="body2" color="text.secondary">
                    <strong>Control:</strong> {meta.control.description ?? meta.control.mode}
                  </Typography>
                ) : null}
                {meta?.source ? (
                  <Typography variant="body2" color="text.secondary">
                    {meta.source}
                  </Typography>
                ) : null}
              </Stack>

              <VerdictStrip verdict={report.verdict} chain={report.chain} thresholdPct={thresholdPct} />

              {/* Owner 2026-09-29: the change in this loom set vs the looms not modified, side by side. */}
              <ComparisonBlock comparison={report.verdict.comparison} meta={meta} thresholdPct={thresholdPct} />

              <StageLadder
                segments={report.segments}
                thresholdPct={thresholdPct}
                branchId={branchId}
                loading={loading}
                header={{ ...header, reportName: `${TITLE} — Stage ladder` }}
              />

              {/* G is always visible: the notes explain every coverage gap. */}
              <Box sx={{ mb: 2 }}>
                <NotesAlert notes={meta?.notes ?? []} />
              </Box>

              <Tabs
                value={tab}
                onChange={(_, v) => setTab(v)}
                variant="scrollable"
                scrollButtons="auto"
                allowScrollButtonsMobile
                sx={{ borderBottom: 1, borderColor: "divider", mb: 2 }}
              >
                {TABS.map((t) => (
                  <Tab key={t} label={t} sx={{ minHeight: 44 }} />
                ))}
              </Tabs>

              {/* Unmounted, not hidden — DataGrid measures its container and a
                  display:none mount collapses it to zero height. */}
              {tab === 0 && (
                <PerLoomTab
                  rows={report.per_loom}
                  thresholdPct={thresholdPct}
                  branchId={branchId}
                  loading={loading}
                  error={null}
                  header={{ ...header, reportName: `${TITLE} — Per loom` }}
                />
              )}
              {tab === 1 && (
                <DaywiseTab
                  rows={report.daywise}
                  branchId={branchId}
                  loading={loading}
                  error={null}
                  header={{ ...header, reportName: `${TITLE} — Day-wise` }}
                />
              )}
              {tab === 2 && (
                <MechanicalTab
                  rows={report.mechanical}
                  branchId={branchId}
                  loading={loading}
                  error={null}
                  header={{ ...header, reportName: `${TITLE} — Breakdown & mechanical` }}
                />
              )}
              {tab === 3 && <NotesTab meta={meta} evidence={report.evidence} />}
            </>
          ) : null}

          {!loading && !report && !error ? (
            <Alert severity="info">
              Pick a modification chain and press Submit. Window 30 / 60 / 90 / 180 days per side;
              settling days default to the event&apos;s own value.
            </Alert>
          ) : null}
        </>
      )}
    </Box>
  );
}

export default function LoomModificationImpactPage() {
  // useReportBranches() and useSearchParams() — `next build` fails without a
  // Suspense boundary above them.
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
