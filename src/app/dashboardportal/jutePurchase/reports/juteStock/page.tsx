"use client";
import React, { Suspense } from "react";
import { Box, CircularProgress, Paper, Typography } from "@mui/material";
import { GridColDef } from "@mui/x-data-grid";
import ReportPanel from "@/components/reports/ReportPanel";
import { numCol } from "@/components/reports/ReportGrid";
import { useReportBranches } from "@/components/reports/useReportBranches";
import { yesterdayIso } from "@/components/reports/reportDates";
import { fetchJuteStockReport } from "@/utils/juteReportService";
import type { JuteStockReportRow } from "../types/reportTypes";

const columns: GridColDef<JuteStockReportRow>[] = [
  { field: "item_group_name", headerName: "Item Group", flex: 1, minWidth: 140 },
  { field: "item_name", headerName: "Item", flex: 1, minWidth: 160 },
  numCol("opening_weight", "Opening (kg)", 130),
  numCol("receipt_weight", "Receipt (kg)", 130),
  numCol("issue_weight", "Issue (kg)"),
  numCol("sold_weight", "Sold (kg)"),
  numCol("closing_weight", "Closing (kg)", 130),
  numCol("mtd_receipt_weight", "MTD Receipt (kg)", 150),
  numCol("mtd_issue_weight", "MTD Issue (kg)", 140),
];

const getRowId = (r: JuteStockReportRow) => `${r.item_grp_id}-${r.item_id}`;

/** The weight columns the summary cards total, in grid order. */
const TOTAL_FIELDS: { field: keyof JuteStockReportRow; label: string }[] = [
  { field: "opening_weight", label: "Opening" },
  { field: "receipt_weight", label: "Receipt" },
  { field: "issue_weight", label: "Issue" },
  { field: "sold_weight", label: "Sold" },
  { field: "closing_weight", label: "Closing" },
  { field: "mtd_receipt_weight", label: "MTD Receipt" },
  { field: "mtd_issue_weight", label: "MTD Issue" },
];

const fmtKg = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function TotalCard({ label, value }: { label: string; value: number }) {
  return (
    <Paper elevation={1} sx={{ p: 1.5, minWidth: 150, flex: "1 1 150px" }}>
      <Typography variant="caption" color="text.secondary">
        {label} (kg)
      </Typography>
      <Typography variant="h6" sx={{ color: "#0C3C60", fontWeight: 700 }}>
        {fmtKg(value)}
      </Typography>
    </Paper>
  );
}

/**
 * Cards above the grid carrying the same totals as its Grand Total row.
 *
 * Read straight off that appended row rather than re-summing: withGrandTotal
 * already did the arithmetic, and re-adding the rows here would double-count
 * it. If the row is somehow absent, sum the real rows instead of showing zeros.
 */
function SummaryCards(rows: JuteStockReportRow[]) {
  const total = rows.find((r) => r.item_id === -1);
  const value = (f: keyof JuteStockReportRow) =>
    total
      ? Number(total[f]) || 0
      : rows.reduce((acc, r) => acc + (Number(r[f]) || 0), 0);

  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, mb: 2 }}>
      {TOTAL_FIELDS.map(({ field, label }) => (
        <TotalCard key={field} label={label} value={value(field)} />
      ))}
    </Box>
  );
}

/** Append a Grand Total row summing every weight column. */
function withGrandTotal(rows: JuteStockReportRow[]): JuteStockReportRow[] {
  if (rows.length === 0) return rows;
  const sum = (f: keyof JuteStockReportRow) =>
    Math.round(rows.reduce((acc, r) => acc + (Number(r[f]) || 0), 0) * 100) /
    100;
  return [
    ...rows,
    {
      item_grp_id: -1,
      // null (not "") so the grid's null-last sorting keeps this row at the bottom
      item_group_name: null,
      item_id: -1,
      item_name: "Grand Total",
      opening_weight: sum("opening_weight"),
      receipt_weight: sum("receipt_weight"),
      issue_weight: sum("issue_weight"),
      sold_weight: sum("sold_weight"),
      closing_weight: sum("closing_weight"),
      mtd_receipt_weight: sum("mtd_receipt_weight"),
      mtd_issue_weight: sum("mtd_issue_weight"),
    },
  ];
}

function JuteStockPageContent() {
  const { branches, initialBranchId, dateParam } = useReportBranches();

  return (
    <ReportPanel
      title="Jute Stock Report"
      branches={branches}
      initialBranchId={initialBranchId}
      dates="single"
      singleLabel="As of Date"
      initialDateTo={dateParam || yesterdayIso()}
      fetcher={(f) => fetchJuteStockReport(f.branchId, f.dateTo).then(withGrandTotal)}
      columns={columns}
      getRowId={getRowId}
      summary={SummaryCards}
      sortField="item_group_name"
      exportName="jute-stock"
    />
  );
}

export default function JuteStockPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      }
    >
      <JuteStockPageContent />
    </Suspense>
  );
}
