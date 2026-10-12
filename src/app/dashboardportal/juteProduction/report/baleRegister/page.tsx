"use client";

/**
 * Bale Register — opening, pressed (production), repacked out, despatched
 * (against invoice / on challan) and closing, day by day for a date range,
 * per quality or per sacking series, plus the despatch detail with bale
 * numbers. No inspection figures — the Finishing Stock report carries them
 * (owner, 2026-10-12).
 *
 * Everything is computed by the backend (`/api/juteProductionReports/
 * bale_register`, spec §7c); this page only lays it out, prints it and
 * flattens it for Excel (`utils/registerShape.ts`).
 */

import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  GlobalStyles,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { FileSpreadsheet, Printer } from "lucide-react";
import { useReportBranches } from "@/components/reports/useReportBranches";
import PrintFrame from "@/components/reports/PrintFrame";
import { useMounted } from "@/components/reports/useMounted";
import { lastDaysRange, todayIso } from "@/components/reports/reportDates";
import { exportRowsToExcel } from "@/components/reports/exportExcel";
import type { BranchOption } from "@/components/reports/types";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import { tokens } from "@/styles/tokens";
import {
  fetchBaleStockSetup,
  type BaleStockQuality,
  type BaleStockSeries,
} from "@/utils/baleStockService";
import {
  fetchBaleRegister,
  type BaleRegisterGroupBy,
  type BaleRegisterReport,
} from "@/utils/juteProductionReportService";
import RegisterCard from "./_components/RegisterCard";
import PeriodSummaryCard from "./_components/PeriodSummaryCard";
import DespatchDetailCard from "./_components/DespatchDetailCard";
import {
  EXPORT_COLUMNS,
  GROUP_BY_OPTIONS,
  QUALITY_TYPE_HESSIAN,
  QUALITY_TYPE_OPTIONS,
  QUALITY_TYPE_SACKING,
  flattenRegister,
  isRegisterEmpty,
  qualityTypeLabel,
  qualityTypeParam,
  validateDateRange,
  type QualityTypeFilter,
} from "./utils/registerShape";

const REPORT_TITLE = "Bale Register";
/** Default range: the last 7 days ending today. */
const DEFAULT_DAYS = 7;

/** Quality / series options come from the Bale Stock page's setup endpoint —
 * the same masters the stock page filters on. A failed load just leaves the
 * (optional) filters empty; the register itself still runs. */
async function fetchFilterSetup(
  coId: number,
  branchId: number,
): Promise<{ qualities: BaleStockQuality[]; series: BaleStockSeries[] }> {
  try {
    const setup = await fetchBaleStockSetup({ coId, branchId });
    return { qualities: setup.qualities, series: setup.series };
  } catch {
    return { qualities: [], series: [] };
  }
}

function Content() {
  const { branches, coId, companyName, initialBranchId } = useReportBranches();
  // Branch comes from the localStorage-backed sidebar context — empty in the
  // server HTML, filled on the client. Hold the controls until mount so the
  // first client render matches the server one (same gate as ReportPanel).
  const mounted = useMounted();
  const defaultRange = useMemo(() => lastDaysRange(DEFAULT_DAYS), []);

  const [branchId, setBranchId] = useState<number | null>(initialBranchId);
  const [dateFrom, setDateFrom] = useState<string>(defaultRange.from);
  const [dateTo, setDateTo] = useState<string>(defaultRange.to);
  const [qualityType, setQualityType] = useState<QualityTypeFilter>("ALL");
  const [finishingQualityId, setFinishingQualityId] = useState<number | "">("");
  const [baleSeriesId, setBaleSeriesId] = useState<number | "">("");
  const [groupBy, setGroupBy] = useState<BaleRegisterGroupBy>("quality");
  const [qualities, setQualities] = useState<BaleStockQuality[]>([]);
  const [series, setSeries] = useState<BaleStockSeries[]>([]);

  const [data, setData] = useState<BaleRegisterReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchedOnce = useRef(false);
  const branchSeeded = useRef(false);
  const lastCoId = useRef<number | null>(null);

  const dateError = validateDateRange(dateFrom, dateTo, todayIso());

  const runFetch = useCallback(
    async (bId: number | null) => {
      if (coId == null || bId == null) return;
      if (validateDateRange(dateFrom, dateTo, todayIso())) return;
      setLoading(true);
      setError(null);
      try {
        setData(
          await fetchBaleRegister({
            coId,
            branchId: bId,
            dateFrom,
            dateTo,
            qualityType: qualityTypeParam(qualityType),
            finishingQualityId:
              finishingQualityId === "" ? undefined : finishingQualityId,
            baleSeriesId: baleSeriesId === "" ? undefined : baleSeriesId,
            groupBy,
          }),
        );
      } catch (e) {
        setData(null);
        setError(e instanceof Error ? e.message : "Failed to load the report");
      } finally {
        setLoading(false);
      }
    },
    [coId, dateFrom, dateTo, qualityType, finishingQualityId, baleSeriesId, groupBy],
  );

  // Seed the branch ONCE when the sidebar context resolves.
  useEffect(() => {
    if (!branchSeeded.current && initialBranchId != null) {
      branchSeeded.current = true;
      setBranchId(initialBranchId);
    }
  }, [initialBranchId]);

  // Sidebar company switch: the loaded register, the branch and the quality /
  // series lists belong to the old company — drop them so nothing renders (or
  // prints) mislabeled.
  useEffect(() => {
    if (coId == null) return;
    if (lastCoId.current != null && lastCoId.current !== coId) {
      setData(null);
      setBranchId(null);
      setQualities([]);
      setSeries([]);
      setFinishingQualityId("");
      setBaleSeriesId("");
      branchSeeded.current = false;
      fetchedOnce.current = false;
    }
    lastCoId.current = coId;
  }, [coId]);

  // One automatic load once a branch is available; afterwards only on Submit.
  useEffect(() => {
    const b = branchId ?? initialBranchId;
    if (!fetchedOnce.current && coId != null && b != null) {
      fetchedOnce.current = true;
      void runFetch(b);
    }
  }, [coId, branchId, initialBranchId, runFetch]);

  // Quality / series options follow the company + branch; a branch change
  // clears the chosen ids (they belong to the previous scope).
  useEffect(() => {
    const b = branchId ?? initialBranchId;
    if (coId == null || b == null) return;
    let alive = true;
    setFinishingQualityId("");
    setBaleSeriesId("");
    void fetchFilterSetup(coId, b).then((setup) => {
      if (!alive) return;
      setQualities(setup.qualities);
      setSeries(setup.series);
    });
    return () => {
      alive = false;
    };
  }, [coId, branchId, initialBranchId]);

  const selectedBranch: BranchOption | null =
    branches.find((b) => b.branch_id === branchId) ?? null;
  const selectedQuality =
    qualities.find((q) => q.finishing_quality_id === finishingQualityId) ?? null;
  const selectedSeries = series.find((s) => s.bale_series_id === baleSeriesId) ?? null;

  // The type the register is narrowed to: the explicit filter, else the type
  // of the chosen quality. Hessian bales have no sacking series to pick.
  const effectiveQualityType =
    qualityTypeParam(qualityType) ?? selectedQuality?.quality_type ?? null;
  const seriesDisabled = effectiveQualityType === QUALITY_TYPE_HESSIAN;

  const qualityOptions = useMemo(() => {
    const wanted = qualityTypeParam(qualityType);
    return qualities
      .filter((q) => wanted == null || q.quality_type === wanted)
      .map((q) => ({
        value: q.finishing_quality_id,
        label:
          wanted == null
            ? `${qualityTypeLabel(q.quality_type)} · ${q.item_name ?? `Quality ${q.finishing_quality_id}`}`
            : (q.item_name ?? `Quality ${q.finishing_quality_id}`),
      }));
  }, [qualities, qualityType]);

  // Sacking series only (the ask); hessian series are not offered.
  const seriesOptions = useMemo(
    () =>
      series
        .filter((s) => s.quality_type === QUALITY_TYPE_SACKING)
        .map((s) => ({ value: s.bale_series_id, label: s.series_name })),
    [series],
  );

  const handleQualityTypeChange = (v: QualityTypeFilter | "") => {
    const next: QualityTypeFilter = v === "" ? "ALL" : v;
    setQualityType(next);
    const wanted = qualityTypeParam(next);
    if (wanted != null && selectedQuality && selectedQuality.quality_type !== wanted) {
      setFinishingQualityId("");
    }
    if (wanted === QUALITY_TYPE_HESSIAN) setBaleSeriesId("");
  };

  const handleQualityChange = (v: number | "") => {
    const id = v === "" ? "" : Number(v);
    setFinishingQualityId(id);
    const q = qualities.find((x) => x.finishing_quality_id === id);
    if (q?.quality_type === QUALITY_TYPE_HESSIAN) setBaleSeriesId("");
  };

  // Filter description for the print letterhead and the Excel title.
  const filterBits = useMemo(
    () =>
      [
        qualityType !== "ALL" ? qualityTypeLabel(qualityTypeParam(qualityType)) : null,
        selectedQuality?.item_name ?? null,
        selectedSeries ? `Series ${selectedSeries.series_name}` : null,
      ].filter((x): x is string => Boolean(x)),
    [qualityType, selectedQuality, selectedSeries],
  );

  const handleExport = useCallback(() => {
    if (!data) return;
    const bits = [...filterBits, data.group_by === "series" ? "by series" : null].filter(
      (x): x is string => Boolean(x),
    );
    exportRowsToExcel(
      EXPORT_COLUMNS,
      flattenRegister(data),
      `bale-register-${data.date_from}-${data.date_to}`,
      {
        companyName: data.co_name ?? companyName,
        branchName: data.branch_name ?? selectedBranch?.branch_name,
        reportName: bits.length ? `${REPORT_TITLE} (${bits.join(", ")})` : REPORT_TITLE,
        reportFor: `${data.date_from} To ${data.date_to}`,
      },
    ).catch((e: unknown) =>
      setError(e instanceof Error ? e.message : "Failed to export the report"),
    );
  }, [data, filterBits, companyName, selectedBranch?.branch_name]);

  const empty = data ? isRegisterEmpty(data) : false;

  return (
    <Box sx={{ p: 3 }}>
      {/* On print, show ONLY the report: the portal shell (sidebar, back
          button) and this page's controls sit outside .breg-print-root and get
          visibility-hidden. */}
      <GlobalStyles
        styles={{
          "@media print": {
            // @page margin 0 suppresses the browser's own header/footer (date,
            // title, URL, page number). The paper margin (10mm) is the print
            // root's side padding plus the <PrintFrame> top/bottom spacers,
            // which repeat on every page.
            "@page": { size: "A4", margin: 0 },
            "body *": { visibility: "hidden" },
            ".breg-print-root, .breg-print-root *": { visibility: "visible" },
            ".breg-print-root": {
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
      <Typography
        variant="h5"
        sx={{ color: tokens.report.header, fontWeight: "bold", mb: 2, displayPrint: "none" }}
      >
        {REPORT_TITLE}
      </Typography>

      {mounted && (
        <>
          <Paper elevation={1} sx={{ mb: 2, p: 2, displayPrint: "none" }}>
            <Stack
              direction="row"
              spacing={1.5}
              alignItems="center"
              useFlexGap
              flexWrap="wrap"
            >
              {/* Norm: the picker appears only when the sidebar scope leaves a
                  choice to make. */}
              {branches.length > 1 ? (
                <Box sx={{ minWidth: 240 }}>
                  <SearchableSelect<BranchOption>
                    variant="outlined"
                    size="small"
                    label="Branch"
                    options={branches}
                    value={selectedBranch}
                    onChange={(opt) => setBranchId(opt?.branch_id ?? null)}
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
                type="date"
                label="Date from"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                error={Boolean(dateError)}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: dateTo || todayIso() } }}
                sx={{ width: 170 }}
              />
              <TextField
                size="small"
                type="date"
                label="Date to"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                error={Boolean(dateError)}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: dateFrom, max: todayIso() } }}
                sx={{ width: 170 }}
              />
              <Box sx={{ minWidth: 150 }}>
                <SearchableOptionSelect<QualityTypeFilter>
                  label="Quality type"
                  options={QUALITY_TYPE_OPTIONS}
                  value={qualityType}
                  onChange={handleQualityTypeChange}
                  clearable={false}
                  fullWidth
                />
              </Box>
              <Box sx={{ minWidth: 260, flex: "1 1 260px", maxWidth: 420 }}>
                <SearchableOptionSelect<number>
                  label="Quality"
                  placeholder="All qualities"
                  options={qualityOptions}
                  value={finishingQualityId}
                  onChange={handleQualityChange}
                  fullWidth
                  noOptionsText={
                    qualities.length === 0 ? "No qualities for this branch" : "No match"
                  }
                />
              </Box>
              <Box sx={{ minWidth: 170 }}>
                <SearchableOptionSelect<number>
                  label="Series"
                  placeholder={seriesDisabled ? "Sacking only" : "All series"}
                  options={seriesOptions}
                  value={baleSeriesId}
                  onChange={(v) => setBaleSeriesId(v === "" ? "" : Number(v))}
                  disabled={seriesDisabled}
                  fullWidth
                  noOptionsText={
                    seriesOptions.length === 0 ? "No sacking series for this branch" : "No match"
                  }
                />
              </Box>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="body2" color="text.secondary">
                  Group by
                </Typography>
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={groupBy}
                  onChange={(_, v: BaleRegisterGroupBy | null) => {
                    if (v) setGroupBy(v);
                  }}
                  aria-label="Group by"
                >
                  {GROUP_BY_OPTIONS.map((o) => (
                    <ToggleButton
                      key={o.value}
                      value={o.value}
                      sx={{ textTransform: "none", px: 1.5 }}
                    >
                      {o.label}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              </Stack>
              <Button
                variant="contained"
                disabled={loading || coId == null || branchId == null || Boolean(dateError)}
                onClick={() => void runFetch(branchId)}
                sx={{
                  backgroundColor: tokens.report.header,
                  "&:hover": { backgroundColor: tokens.report.headerHover },
                  textTransform: "none",
                }}
              >
                Submit
              </Button>
              <Button
                variant="outlined"
                startIcon={<Printer size={16} />}
                disabled={!data || empty}
                onClick={() => window.print()}
                sx={{ textTransform: "none" }}
              >
                Print
              </Button>
              <Button
                variant="outlined"
                startIcon={<FileSpreadsheet size={16} />}
                disabled={!data || empty}
                onClick={handleExport}
                sx={{ textTransform: "none" }}
              >
                Excel
              </Button>
              {dateError ? (
                <Typography variant="caption" color="error" sx={{ width: "100%" }}>
                  {dateError}
                </Typography>
              ) : null}
            </Stack>
          </Paper>

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
            <Box className="breg-print-root">
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
                    {data.date_from} to {data.date_to}
                    {filterBits.length ? ` · ${filterBits.join(" · ")}` : ""}
                    {data.group_by === "series" ? " · by series" : ""}
                  </Typography>
                </Box>

                {empty ? (
                  <Alert severity="info">No bales in this range</Alert>
                ) : (
                  <Stack spacing={2}>
                    {/* (1) Register — one card per quality / series. Two
                        columns on wide screens, one in print. */}
                    <Box
                      sx={{
                        display: "grid",
                        gap: 2,
                        gridTemplateColumns: {
                          xs: "minmax(0, 1fr)",
                          xl: "repeat(2, minmax(0, 1fr))",
                        },
                        "@media print": { gridTemplateColumns: "minmax(0, 1fr)" },
                      }}
                    >
                      {data.groups.map((g) => (
                        <RegisterCard
                          key={g.key}
                          group={g}
                          groupBy={data.group_by}
                          dateFrom={data.date_from}
                          dateTo={data.date_to}
                        />
                      ))}
                    </Box>

                    {/* (2) Period summary across groups */}
                    {data.groups.length ? <PeriodSummaryCard report={data} /> : null}

                    {/* (3) Despatch detail with bale numbers */}
                    <DespatchDetailCard
                      rows={data.despatch_detail}
                      dateFrom={data.date_from}
                      dateTo={data.date_to}
                    />
                  </Stack>
                )}
              </PrintFrame>
            </Box>
          ) : null}

          {!loading && !data && !error ? (
            <Alert severity="info">
              Select a branch and a date range, then press Submit to build the register.
            </Alert>
          ) : null}
        </>
      )}
    </Box>
  );
}

export default function BaleRegisterPage() {
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
