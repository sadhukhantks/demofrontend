"use client";
import React, { Suspense, useCallback, useMemo, useState } from "react";
import {
  Box,
  CircularProgress,
  Paper,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import type { GridColDef } from "@mui/x-data-grid";
import ReportPanel, {
  type ReportFilters,
} from "@/components/reports/ReportPanel";
import { numCol } from "@/components/reports/ReportGrid";
import { useReportBranches } from "@/components/reports/useReportBranches";
import { yesterdayIso } from "@/components/reports/reportDates";
import { fetchJuteIssueYarnWise } from "@/utils/juteReportService";
import { tokens } from "@/styles/tokens";
import {
  WASTAGE_MODE_TEXT,
  formatIssueWeight,
  formatReportDay,
  issueTotals,
  issueYarnWiseView,
  monthStartIso,
  toIssueYarnWiseRows,
  type IssueSplit,
  type IssueUnit,
  type IssueYarnWiseRow,
  type WastageMode,
} from "./issueYarnWiseRows";

const yarnCol: GridColDef<IssueYarnWiseRow> = {
  field: "yarn_type_name",
  headerName: "Yarn Quality",
  flex: 1,
  minWidth: 150,
};

/** One column set per (wastage mode, unit). The rows carry every figure, so
 * either switch re-labels the grid (and what Export writes) without another
 * request. Flat short headers rather than a "Day Issue / MTD Issue" header
 * group: the Excel and PDF writers print one header row, and a flat header
 * reads the same on screen and on paper. Yarn quality stays first (column
 * pinning is not in the DataGrid edition in use). */
function columnsFor(
  mode: WastageMode,
  unit: IssueUnit,
): GridColDef<IssueYarnWiseRow>[] {
  const u = unit === "kg" ? "kg" : "MT";
  const dec = unit === "kg" ? 0 : 3;
  const col = (field: string, header: string, width = 120) =>
    numCol<IssueYarnWiseRow>(`${field}_${unit}`, `${header} (${u})`, width, dec);
  if (mode === "raw") {
    return [
      yarnCol,
      col("day_issue", "Day Raw", 130),
      col("mtd_issue", "MTD Raw", 140),
    ];
  }
  return [
    yarnCol,
    col("day_raw", "Day Raw"),
    col("day_waste", "Day Waste"),
    col("day_total", "Day Total"),
    col("mtd_raw", "MTD Raw"),
    col("mtd_waste", "MTD Waste"),
    col("mtd_total", "MTD Total"),
  ];
}

const getRowId = (r: IssueYarnWiseRow) => r.id;

const toggleSx = { textTransform: "none" } as const;

function TotalCard({
  label,
  period,
  split,
  unit,
  wastage,
}: {
  label: string;
  period: string;
  split: IssueSplit;
  unit: IssueUnit;
  wastage: WastageMode;
}) {
  return (
    <Paper elevation={1} sx={{ p: 1.5, minWidth: 170, flex: "1 1 170px" }}>
      <Typography variant="caption" color="text.secondary" component="div">
        {label}
      </Typography>
      <Typography
        variant="h6"
        sx={{ color: tokens.report.header, fontWeight: 700 }}
      >
        {formatIssueWeight(split.shown, unit)}
      </Typography>
      {/* The other unit, so both are always on screen for the totals. */}
      <Typography variant="caption" color="text.secondary" component="div">
        {formatIssueWeight(split.shown, unit === "kg" ? "mt" : "kg")}
      </Typography>
      {/* What the figure is made of / what was left out of it. */}
      <Typography variant="caption" color="text.secondary" component="div">
        {wastage === "all"
          ? `Raw jute ${formatIssueWeight(split.raw, unit)} · Wastage ${formatIssueWeight(split.wastage, unit)}`
          : `Wastage excluded: ${formatIssueWeight(split.wastage, unit)}`}
      </Typography>
      {period && (
        <Typography variant="caption" color="text.secondary" component="div">
          {period}
        </Typography>
      )}
    </Paper>
  );
}

function IssueYarnWisePageContent() {
  const { branches, initialBranchId, dateParam } = useReportBranches();
  const [unit, setUnit] = useState<IssueUnit>("kg");
  // Default: raw jute + wastage, the figure that ties to the Jute Stock report.
  const [wastage, setWastage] = useState<WastageMode>("all");
  // The date of the rows on screen (the filter's date may have been edited
  // since the last Submit) — labels the two total cards.
  const [loadedDate, setLoadedDate] = useState("");

  const fetcher = useCallback(async (f: ReportFilters) => {
    const rows = await fetchJuteIssueYarnWise(f.branchId, f.dateTo);
    setLoadedDate(f.dateTo);
    return toIssueYarnWiseRows(rows);
  }, []);

  // Excluding wastage is a view of the rows already loaded — no request.
  const rowsView = useCallback(
    (rows: IssueYarnWiseRow[]) => issueYarnWiseView(rows, wastage),
    [wastage],
  );

  const columns = useMemo(() => columnsFor(wastage, unit), [wastage, unit]);

  const summary = useCallback(
    (rows: IssueYarnWiseRow[]) => {
      const totals = issueTotals(rows);
      const day = formatReportDay(loadedDate);
      const what = wastage === "all" ? "Total jute issue" : "Raw jute issue";
      return (
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 1.5,
            mb: 2,
          }}
        >
          <TotalCard
            label={`${what} — day`}
            period={day}
            split={totals.day}
            unit={unit}
            wastage={wastage}
          />
          <TotalCard
            label={`${what} — month to date`}
            period={
              loadedDate
                ? `${formatReportDay(monthStartIso(loadedDate))} to ${day}`
                : ""
            }
            split={totals.mtd}
            unit={unit}
            wastage={wastage}
          />
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5 }}>
            <ToggleButtonGroup
              value={unit}
              exclusive
              onChange={(_e, v: IssueUnit | null) => v && setUnit(v)}
              size="small"
              aria-label="Weight unit"
            >
              <ToggleButton value="kg">Kg</ToggleButton>
              <ToggleButton value="mt">MT</ToggleButton>
            </ToggleButtonGroup>
            <ToggleButtonGroup
              value={wastage}
              exclusive
              onChange={(_e, v: WastageMode | null) => v && setWastage(v)}
              size="small"
              aria-label="Wastage filter"
            >
              <ToggleButton value="all" sx={toggleSx}>
                {WASTAGE_MODE_TEXT.all.button}
              </ToggleButton>
              <ToggleButton value="raw" sx={toggleSx}>
                {WASTAGE_MODE_TEXT.raw.button}
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </Box>
      );
    },
    [loadedDate, unit, wastage],
  );

  return (
    <ReportPanel
      // The heading doubles as the title block of the Excel / PDF export, so
      // a printed figure always says whether wastage is in it.
      title={`Jute Issue — Yarn Quality Wise (${WASTAGE_MODE_TEXT[wastage].title})`}
      branches={branches}
      initialBranchId={initialBranchId}
      dates="single"
      singleLabel="Date"
      initialDateTo={dateParam || yesterdayIso()}
      fetcher={fetcher}
      rowsView={rowsView}
      columns={columns}
      getRowId={getRowId}
      summary={summary}
      exportName={`jute-issue-yarn-wise-${WASTAGE_MODE_TEXT[wastage].file}-${unit}`}
      pdfExport
    />
  );
}

export default function IssueYarnWisePage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      }
    >
      <IssueYarnWisePageContent />
    </Suspense>
  );
}
