"use client";
import React, { Suspense } from "react";
import {
  Box,
  CircularProgress,
  ToggleButtonGroup,
  ToggleButton,
  Typography,
} from "@mui/material";
import { GridColDef, GridRenderCellParams } from "@mui/x-data-grid";
import ReportPanel from "@/components/reports/ReportPanel";
import { numCol } from "@/components/reports/ReportGrid";
import { useReportBranches } from "@/components/reports/useReportBranches";
import { yesterdayIso } from "@/components/reports/reportDates";
import { fetchBatchCostReport, type JuteReportBasis } from "@/utils/juteReportService";
import type { BatchCostReportRow } from "../types/reportTypes";

const inrFormatter = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function fmtCurrency(value: unknown): string {
  if (value == null) return "";
  const n = Number(value);
  return Number.isFinite(n) ? inrFormatter.format(n) : "";
}

function valueCol(field: string, headerName: string): GridColDef<BatchCostReportRow> {
  return {
    field,
    headerName,
    type: "number",
    width: 140,
    valueFormatter: (value: unknown) => fmtCurrency(value),
  };
}

function varianceCol(field: string, headerName: string): GridColDef<BatchCostReportRow> {
  return {
    field,
    headerName,
    type: "number",
    width: 130,
    renderCell: (params: GridRenderCellParams<BatchCostReportRow, number>) => {
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
const mtd = (col: GridColDef<BatchCostReportRow>): GridColDef<BatchCostReportRow> => ({
  ...col,
  description: MTD_HINT,
});

const columns: GridColDef<BatchCostReportRow>[] = [
  { field: "yarn_type_name", headerName: "Yarn Type", flex: 1, minWidth: 140 },
  { field: "item_name", headerName: "Jute Quality", flex: 1, minWidth: 160 },
  numCol("planned_weight", "Day Planned Wt (kg)", 140),
  numCol("actual_weight", "Day Actual Wt (kg)", 140),
  numCol("actual_rate", "Day Rate (per qtl)", 130),
  valueCol("issue_value", "Day Value"),
  varianceCol("variance", "Day Variance (kg)"),
  mtd(numCol("mtd_planned_weight", "MTD Planned Wt (kg)", 140)),
  mtd(numCol("mtd_actual_weight", "MTD Actual Wt (kg)", 140)),
  mtd(numCol("mtd_actual_rate", "MTD Rate (per qtl)", 130)),
  mtd(valueCol("mtd_issue_value", "MTD Value")),
  mtd(varianceCol("mtd_variance", "MTD Variance (kg)")),
];

const getRowId = (r: BatchCostReportRow) => `${r.yarn_type_id}-${r.item_id}`;

function BatchCostPageContent() {
  const { branches, initialBranchId, dateParam } = useReportBranches();
  // Decision D5 (2026-09-03): actual = today's reports; accounts = receipt on
  // jute_mr_date, approved weight, issues shifted to the MR date.
  const [basis, setBasis] = React.useState<JuteReportBasis>("actual");

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
        </Typography>
      </Box>
      <ReportPanel
        title={`Batch Cost Report (${basis === "accounts" ? "Accounts" : "Actual"})`}
        branches={branches}
        initialBranchId={initialBranchId}
        dates="single"
        singleLabel="As of Date"
        initialDateTo={dateParam || yesterdayIso()}
        fetcher={(f) => fetchBatchCostReport(f.branchId, f.dateTo, basis)}
        columns={columns}
        getRowId={getRowId}
        sortField="yarn_type_name"
        exportName="batch-cost"
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
