"use client";
import React, { Suspense } from "react";
import {
  Alert,
  Box,
  CircularProgress,
  ToggleButtonGroup,
  ToggleButton,
  Typography,
} from "@mui/material";
import { GridColDef, GridRenderCellParams } from "@mui/x-data-grid";
import ReportPanel from "@/components/reports/ReportPanel";
import ReportGrid, { numCol } from "@/components/reports/ReportGrid";
import { exportGridSectionsToExcel, type GridSection } from "@/components/reports/gridSections";
import type { ReportExportHeader } from "@/components/reports/exportExcel";
import { tokens } from "@/styles/tokens";
import { useReportBranches } from "@/components/reports/useReportBranches";
import { yesterdayIso } from "@/components/reports/reportDates";
import { fetchBatchCostReportWithPlan, type JuteReportBasis } from "@/utils/juteReportService";
import {
  batchCostBreakupRows,
  batchCostYarnSummary,
  type BatchCostBreakupRow,
  type BatchCostYarnSummaryRow,
} from "./batchCostRows";
import { planMessages, type BatchPlanStatus } from "./planStatus";

const inrFormatter = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function fmtCurrency(value: unknown): string {
  if (value == null) return "";
  const n = Number(value);
  return Number.isFinite(n) ? inrFormatter.format(n) : "";
}

function valueCol<T extends object = BatchCostBreakupRow>(field: string, headerName: string): GridColDef<T> {
  return {
    field,
    headerName,
    type: "number",
    width: 140,
    valueFormatter: (value: unknown) => fmtCurrency(value),
  };
}

function varianceCol(field: string, headerName: string): GridColDef<BatchCostBreakupRow> {
  return {
    field,
    headerName,
    type: "number",
    width: 130,
    renderCell: (params: GridRenderCellParams<BatchCostBreakupRow, number>) => {
      const n = Number(params.value);
      if (!Number.isFinite(n)) return "";
      return (
        <Box
          component="span"
          sx={{ color: n >= 0 ? "success.main" : "error.main", fontWeight: 500 }}
        >
          {n.toFixed(2)}
        </Box>
      );
    },
  };
}

// TKT-000213: month-to-date columns sit beside the day columns, in the grid
// and in the Excel export (which writes these same columns).
const MTD_HINT = "Month to date: 1st of the month through the As of Date";
const mtd = <T extends object>(col: GridColDef<T>): GridColDef<T> => ({
  ...col,
  description: MTD_HINT,
});

// The jute-quality breakup below the summary (TKT-000213, comment 2026-10-08):
// each yarn quality's lines, then its "Total" row. Mix % and Cost/Ton Share
// break the yarn quality's cost per ton down by jute quality.
const SHARE_HINT =
  "This jute quality's value / the yarn quality's total weight x 1000 — the shares of a yarn quality add up to its cost per ton";
const share = (col: GridColDef<BatchCostBreakupRow>): GridColDef<BatchCostBreakupRow> => ({
  ...col,
  description: SHARE_HINT,
});

const columns: GridColDef<BatchCostBreakupRow>[] = [
  { field: "yarn_type_name", headerName: "Yarn Type", flex: 1, minWidth: 140 },
  { field: "item_name", headerName: "Jute Quality", flex: 1, minWidth: 160 },
  numCol("planned_weight", "Day Planned Wt (kg)", 140),
  numCol("actual_weight", "Day Actual Wt (kg)", 140),
  numCol("actual_rate", "Day Rate (per qtl)", 130),
  valueCol("issue_value", "Day Value"),
  varianceCol("variance", "Day Variance (kg)"),
  numCol("day_mix_pct", "Day Mix %", 110),
  share(valueCol("day_cost_per_ton_share", "Day Cost/Ton Share")),
  mtd(numCol("mtd_planned_weight", "MTD Planned Wt (kg)", 140)),
  mtd(numCol("mtd_actual_weight", "MTD Actual Wt (kg)", 140)),
  mtd(numCol("mtd_actual_rate", "MTD Rate (per qtl)", 130)),
  mtd(valueCol("mtd_issue_value", "MTD Value")),
  mtd(varianceCol("mtd_variance", "MTD Variance (kg)")),
  mtd(numCol("mtd_mix_pct", "MTD Mix %", 110)),
  share(mtd(valueCol("mtd_cost_per_ton_share", "MTD Cost/Ton Share"))),
];

const getRowId = (r: BatchCostBreakupRow) =>
  r.row_kind === "subtotal" ? `${r.yarn_type_id}-total` : `${r.yarn_type_id}-${r.item_id}`;

// The yarn-quality summary on top: batch cost per ton (value / weight x 1000).
const summaryColumns: GridColDef<BatchCostYarnSummaryRow>[] = [
  { field: "yarn_type_name", headerName: "Yarn Quality", flex: 1, minWidth: 160 },
  numCol("day_weight", "Day Issue Wt (kg)", 140),
  valueCol("day_value", "Day Value"),
  valueCol("day_cost_per_ton", "Day Cost per Ton"),
  mtd(numCol("mtd_weight", "MTD Issue Wt (kg)", 140)),
  mtd(valueCol("mtd_value", "MTD Value")),
  mtd(valueCol("mtd_cost_per_ton", "MTD Cost per Ton")),
];

const SUMMARY_TITLE = "Yarn Quality Wise Batch Cost per Ton";
const BREAKUP_TITLE = "Jute Quality Breakup";

function BatchCostSummary({ rows }: { rows: BatchCostBreakupRow[] }) {
  const summaryRows = batchCostYarnSummary(rows);
  return (
    <Box sx={{ mb: 3 }}>
      <Typography
        variant="subtitle1"
        sx={{ color: tokens.report.header, fontWeight: 700, mb: 1 }}
      >
        {SUMMARY_TITLE}
      </Typography>
      <ReportGrid
        rows={summaryRows}
        columns={summaryColumns}
        getRowId={(r) => r.id}
        loading={false}
        error={null}
        height={Math.min(520, 90 + 44 * summaryRows.length)}
      />
      <Typography
        variant="subtitle1"
        sx={{ color: tokens.report.header, fontWeight: 700, mt: 3 }}
      >
        {BREAKUP_TITLE}
      </Typography>
    </Box>
  );
}

// Excel: the summary and the breakup as two sheets of one workbook.
async function exportBatchCost(rows: BatchCostBreakupRow[], header: ReportExportHeader) {
  const sections: GridSection[] = [
    {
      title: SUMMARY_TITLE,
      columns: summaryColumns as GridSection["columns"],
      rows: batchCostYarnSummary(rows),
    },
    {
      title: BREAKUP_TITLE,
      columns: columns as GridSection["columns"],
      rows,
    },
  ];
  await exportGridSectionsToExcel(sections, "batch-cost", header);
}

function BatchCostPageContent() {
  const { branches, initialBranchId, dateParam } = useReportBranches();
  // Decision D5 (2026-09-03): actual = today's reports; accounts = receipt on
  // jute_mr_date, approved weight, issues shifted to the MR date.
  const [basis, setBasis] = React.useState<JuteReportBasis>("actual");
  // TKT-000206: why planned weight is 0 (no batch plan assigned / no issue).
  const [planStatus, setPlanStatus] = React.useState<BatchPlanStatus | null>(null);
  const fetchRows = React.useCallback(
    async (branchId: number, date: string) => {
      setPlanStatus(null);
      const res = await fetchBatchCostReportWithPlan(branchId, date, basis);
      setPlanStatus(res.planStatus);
      return res.rows;
    },
    [basis],
  );

  return (
    <>
      <Box sx={{ mb: 2, display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
        <ToggleButtonGroup
          value={basis}
          exclusive
          onChange={(_e, v) => v && setBasis(v)}
          size="small"
        >
          <ToggleButton value="actual">Actual</ToggleButton>
          <ToggleButton value="accounts">Accounts</ToggleButton>
        </ToggleButtonGroup>
        <Typography variant="body2" color="text.secondary">
          Day = the As of Date. MTD = 1st of that month through the As of Date.
          Cost per ton = value / issue weight x 1000.
        </Typography>
      </Box>
      {planMessages(planStatus).map((m) => (
        <Alert key={m.text} severity={m.severity} sx={{ mb: 1 }}>
          {m.text}
        </Alert>
      ))}
      <ReportPanel
        title={`Batch Cost Report (${basis === "accounts" ? "Accounts" : "Actual"})`}
        branches={branches}
        initialBranchId={initialBranchId}
        dates="single"
        singleLabel="As of Date"
        initialDateTo={dateParam || yesterdayIso()}
        fetcher={async (f) => batchCostBreakupRows(await fetchRows(f.branchId, f.dateTo))}
        columns={columns}
        getRowId={getRowId}
        summary={(rows) => <BatchCostSummary rows={rows} />}
        exportName="batch-cost"
        exportOverride={(rows, header) => exportBatchCost(rows, header)}
      />
    </>
  );
}

export default function BatchCostPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      }
    >
      <BatchCostPageContent />
    </Suspense>
  );
}
