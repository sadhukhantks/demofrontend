"use client";
import React from "react";
import { Box, Paper, Typography } from "@mui/material";
import { GridColDef } from "@mui/x-data-grid";
import ReportPanel from "@/components/reports/ReportPanel";
import { numCol } from "@/components/reports/ReportGrid";
import { useReportBranches } from "@/components/reports/useReportBranches";
import { yesterdayIso } from "@/components/reports/reportDates";
import { fetchJuteStockReport, type JuteReportBasis } from "@/utils/juteReportService";
import { tokens } from "@/styles/tokens";
import type { JuteStockReportRow } from "../types/reportTypes";
import {
  GRAND_TOTAL_ID,
  roundStockRowsToKg,
  withStockGrandTotal,
  type StockWeightField,
} from "./juteStockRows";

/** Stock is reported in whole kg (TKT-000155). */
const KG_DECIMALS = 0;

const kgCol = (field: StockWeightField, headerName: string, width?: number) =>
  numCol<JuteStockReportRow>(field, headerName, width, KG_DECIMALS);

const columns: GridColDef<JuteStockReportRow>[] = [
  { field: "item_group_name", headerName: "Item Group", flex: 1, minWidth: 140 },
  { field: "item_name", headerName: "Item", flex: 1, minWidth: 160 },
  kgCol("opening_weight", "Opening (kg)", 130),
  kgCol("receipt_weight", "Receipt (kg)", 130),
  kgCol("issue_weight", "Issue (kg)"),
  kgCol("sold_weight", "Sold (kg)"),
  kgCol("closing_weight", "Closing (kg)", 130),
  kgCol("mtd_receipt_weight", "MTD Receipt (kg)", 150),
  kgCol("mtd_issue_weight", "MTD Issue (kg)", 140),
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
  field: StockWeightField;
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
  n.toLocaleString("en-IN", {
    minimumFractionDigits: KG_DECIMALS,
    maximumFractionDigits: KG_DECIMALS,
  });

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
      <Typography variant="h6" sx={{ color: tokens.report.header, fontWeight: 700 }}>
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
 * would be counted twice). The rows are already whole kg, so a card and the
 * grid's total row always print the same number. The waste share comes from
 * is_waste — the item group's own item_type_id — not from a name match on the
 * group.
 */
function SummaryCards(rows: JuteStockReportRow[]) {
  const real = rows.filter((r) => r.item_id !== GRAND_TOTAL_ID);
  const sum = (f: StockWeightField, only?: (r: JuteStockReportRow) => boolean) =>
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

interface JuteStockReportProps {
  /**
   * "actual" = Jute Stock (Production): physical receipt date and net weight.
   * "accounts" = Jute Stock (Accounts): receipt on the MR date at approved
   * weight, issues shifted to the MR date (decision D5, 2026-09-03).
   */
  basis: JuteReportBasis;
  /** Report heading; also printed on the Excel/PDF exports. */
  title: string;
  /** File-name stem for the exports. */
  exportName: string;
}

/**
 * Jute Stock report body, shared by the two report pages (TKT-000155 split
 * the old Actual/Accounts toggle into separate pages — one per basis).
 */
export default function JuteStockReport({
  basis,
  title,
  exportName,
}: JuteStockReportProps) {
  const { branches, initialBranchId, dateParam } = useReportBranches();

  return (
    <ReportPanel
      title={title}
      branches={branches}
      initialBranchId={initialBranchId}
      dates="single"
      singleLabel="As of Date"
      initialDateTo={dateParam || yesterdayIso()}
      fetcher={(f) =>
        fetchJuteStockReport(f.branchId, f.dateTo, basis)
          .then(roundStockRowsToKg)
          .then(withStockGrandTotal)
      }
      columns={columns}
      getRowId={getRowId}
      summary={SummaryCards}
      sortField="item_group_name"
      exportName={exportName}
    />
  );
}
