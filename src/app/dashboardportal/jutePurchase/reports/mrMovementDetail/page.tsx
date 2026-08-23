"use client";
import React, { Suspense, useCallback, useMemo, useRef, useState } from "react";
import { Box, CircularProgress } from "@mui/material";
import { GridColDef } from "@mui/x-data-grid";
import ReportPanel from "@/components/reports/ReportPanel";
import { numCol } from "@/components/reports/ReportGrid";
import { useReportBranches } from "@/components/reports/useReportBranches";
import { fyStart, todayIso } from "@/components/reports/reportDates";
import {
  fetchJuteMrMovementDetail,
  fetchJuteMrOptions,
} from "@/utils/juteReportService";
import type { JuteMrMovementDetailRow } from "../types/reportTypes";

// Sibling of mrIssueDetail: same MR block, same picker, one row per MOVEMENT
// instead of one row per issue. "Movement" leads because it is the only column
// that tells you which half of the row to read — issue columns are blank on a
// sale row and vice versa. A "Sale (unattributed)" row is a raw-jute invoice
// whose sales_invoice_jute.mr_id did not survive the backend's guard (resolves,
// same branch, MR line holds that item); its MR columns are blank and the
// Invoice MR ID / # columns show what the invoice claimed.
const columns: GridColDef<JuteMrMovementDetailRow>[] = [
  { field: "movement_type", headerName: "Movement", width: 150 },
  // Plain, not numCol — numCol would render an id as "27743.00".
  { field: "jute_mr_id", headerName: "MR ID", width: 90 },
  // mr_label, never mr_number — mr_number is NULL until the MR is approved.
  { field: "mr_label", headerName: "MR #", width: 180 },
  { field: "mr_date", headerName: "MR / Inward Date", width: 120 },
  { field: "jute_gate_entry_no", headerName: "GE #", width: 120 },
  { field: "party_name", headerName: "Supplier", flex: 1, minWidth: 160 },
  { field: "warehouse_name", headerName: "Godown", width: 120 },
  { field: "quality", headerName: "Quality", flex: 1, minWidth: 150 },
  { field: "marka", headerName: "Marka", width: 110 },
  { field: "crop_year", headerName: "Crop Year", width: 100 },
  numCol("received_qty", "Recv Qty"),
  numCol("received_weight", "Recv Wt"),
  numCol("actual_rate", "Rate"),
  { field: "jute_issue_id", headerName: "Issue #", width: 100 },
  { field: "issue_date", headerName: "Issue Date", width: 110 },
  numCol("issued_qty", "Issued Qty"),
  numCol("issued_weight", "Issued Wt"),
  numCol("issue_value", "Issue Value"),
  { field: "issue_item_name", headerName: "Issue Item", flex: 1, minWidth: 150 },
  { field: "yarn_type_name", headerName: "Yarn Type", width: 130 },
  { field: "issue_status", headerName: "Issue Status", width: 120 },
  { field: "invoice_no", headerName: "Invoice #", width: 120 },
  { field: "invoice_date", headerName: "Invoice Date", width: 110 },
  { field: "customer_name", headerName: "Customer", flex: 1, minWidth: 170 },
  { field: "sale_item_name", headerName: "Sold Item", flex: 1, minWidth: 150 },
  numCol("sold_qty", "Sold Qty"),
  numCol("sold_weight", "Sold Wt"),
  numCol("sale_rate", "Sale Rate"),
  numCol("sale_value", "Sale Value"),
  { field: "invoice_status", headerName: "Invoice Status", width: 120 },
  { field: "claimed_mr_id", headerName: "Invoice MR ID", width: 110 },
  { field: "claimed_mr_no", headerName: "Invoice MR #", width: 120 },
  numCol("balance_qty", "Bal Qty"),
  numCol("balance_weight", "Bal Wt"),
  { field: "updated_by", headerName: "Updated By", width: 120 },
  { field: "update_date_time", headerName: "Updated On", width: 150 },
];

// One invoice can bill the same MR line on several lines, so invoice_id alone
// is not unique; row_group separates an attributed sale from an unattributed
// one, whose jute_mr_li_id is null.
const getRowId = (r: JuteMrMovementDetailRow) =>
  `${r.row_group}-${r.jute_mr_li_id ?? 0}-${r.jute_issue_id ?? 0}-${r.invoice_line_item_id ?? 0}`;

function MrMovementDetailPageContent() {
  const { coId, branches, initialBranchId, dateParam } = useReportBranches();
  const range = useMemo(
    () => ({ from: fyStart(new Date()), to: todayIso() }),
    [],
  );

  // Label of the MR actually fetched (not whatever the picker now shows) —
  // drives the title so the header never claims a date range the backend
  // ignored.
  const [appliedMrLabel, setAppliedMrLabel] = useState("");
  const mrLabels = useRef<Record<string, string>>({});

  const loadMrOptions = useCallback(
    async (branchId: number) => {
      if (coId == null) return [];
      const rows = await fetchJuteMrOptions(coId, branchId);
      const opts = rows.map((r) => ({
        value: String(r.jute_mr_id),
        label: [r.mr_label, r.mr_date, r.party_name]
          .filter(Boolean)
          .join("  |  "),
      }));
      mrLabels.current = Object.fromEntries(
        opts.map((o) => [o.value, o.label]),
      );
      return opts;
    },
    [coId],
  );

  return (
    <ReportPanel
      title={
        appliedMrLabel
          ? `Jute MR Issue & Sales Detail - ${appliedMrLabel} (all movements, dates ignored)`
          : "Jute MR Issue & Sales Detail (all MRs in period)"
      }
      branches={branches}
      initialBranchId={initialBranchId}
      dates="range"
      initialDateFrom={range.from}
      initialDateTo={dateParam || range.to}
      extraAsync={{ label: "MR (blank = all)", load: loadMrOptions }}
      fetcher={(f) => {
        setAppliedMrLabel(f.extra ? (mrLabels.current[f.extra] ?? f.extra) : "");
        return coId == null
          ? Promise.resolve([])
          : fetchJuteMrMovementDetail({
              coId,
              branchId: f.branchId,
              dateFrom: f.dateFrom,
              dateTo: f.dateTo,
              mrId: f.extra || undefined,
            });
      }}
      columns={columns}
      getRowId={getRowId}
      // No initial sort: the backend already orders MR rows first and the
      // unattributed-sales block last, and a client sort on mr_date would
      // scatter that block through the grid (its mr_date is null).
      exportName="jute-mr-movement-detail"
    />
  );
}

export default function MrMovementDetailPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      }
    >
      <MrMovementDetailPageContent />
    </Suspense>
  );
}
