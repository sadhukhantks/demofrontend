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

/**
 * The weight columns the summary cards total, in grid order.
 *
 * `split` marks the MOVEMENT columns — jute moves in and out through two
 * different stock sources, so their totals are shown broken into purchased raw
 * jute vs process waste. Sold is raw-jute invoices only, and opening/closing
 * are positions rather than movements, so those stay single numbers.
 */
const TOTAL_FIELDS: {
  field: keyof JuteStockReportRow;
  label: string;
  split?: boolean;
}[] = [
  { field: "opening_weight", label: "Opening" },
  { field: "receipt_weight", label: "Receipt", split: true },
  { field: "issue_weight", label: "Issue", split: true },
  { field: "sold_weight", label: "Sold" },
  { field: "closing_weight", label: "Closing" },
  { field: "mtd_receipt_weight", label: "MTD Receipt", split: true },
  { field: "mtd_issue_weight", label: "MTD Issue", split: true },
];

const fmtKg = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function TotalCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: number;
  sub?: string;
}) {
  return (
    <Paper elevation={1} sx={{ p: 1.5, minWidth: 150, flex: "1 1 150px" }}>
      <Typography variant="caption" color="text.secondary">
        {label} (kg)
      </Typography>
      <Typography variant="h6" sx={{ color: "#0C3C60", fontWeight: 700 }}>
        {fmtKg(value)}
      </Typography>
      {sub && (
        <Typography variant="caption" color="text.secondary" component="div">
          {sub}
        </Typography>
      )}
    </Paper>
  );
}

/**
 * Cards above the grid carrying the same totals as its Grand Total row, with
 * the movement columns broken into raw jute vs jute waste.
 *
 * Summed off the REAL rows (the appended Grand Total row is skipped, or it
 * would be counted twice) using the same 2dp rounding as withGrandTotal, so a
 * card and the grid's total row always print the same number. The waste share
 * comes from is_waste — the item group's own item_type_id — not from a name
 * match on the group.
 */
function SummaryCards(rows: JuteStockReportRow[]) {
  const real = rows.filter((r) => r.item_id !== -1);
  const sum = (f: keyof JuteStockReportRow, only?: (r: JuteStockReportRow) => boolean) =>
    Math.round(
      real
        .filter((r) => !only || only(r))
        .reduce((acc, r) => acc + (Number(r[f]) || 0), 0) * 100,
    ) / 100;

  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, mb: 2 }}>
      {TOTAL_FIELDS.map(({ field, label, split }) => {
        const waste = split ? sum(field, (r) => Boolean(r.is_waste)) : 0;
        const raw = split ? sum(field, (r) => !r.is_waste) : 0;
        return (
          <TotalCard
            key={field}
            label={label}
            value={sum(field)}
            sub={split ? `Raw ${fmtKg(raw)} · Waste ${fmtKg(waste)}` : undefined}
          />
        );
      })}
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
      // Totals span both stock sources; the split lives on the real rows.
      is_waste: 0,
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
