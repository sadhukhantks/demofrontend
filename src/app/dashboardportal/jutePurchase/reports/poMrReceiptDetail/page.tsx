"use client";
import React, { Suspense, useCallback, useMemo, useRef, useState } from "react";
import { Box, CircularProgress } from "@mui/material";
import { GridColDef } from "@mui/x-data-grid";
import ReportPanel from "@/components/reports/ReportPanel";
import { numCol } from "@/components/reports/ReportGrid";
import { useReportBranches } from "@/components/reports/useReportBranches";
import { fyStart, todayIso } from "@/components/reports/reportDates";
import {
  fetchJutePoMrReceiptDetail,
  fetchJutePoOptions,
} from "@/utils/juteReportService";
import type { JutePoMrReceiptDetailRow } from "../types/reportTypes";

// PO/ordered columns repeat across a PO's receipt rows (and are blank on
// row_group=1 receipts whose item matches no PO line) — keep them anyway so
// the Excel export carries the PO identity on every row.
const columns: GridColDef<JutePoMrReceiptDetailRow>[] = [
  { field: "po_label", headerName: "PO #", width: 190 },
  { field: "po_date", headerName: "PO Date", width: 110 },
  { field: "po_status", headerName: "PO Status", width: 110 },
  { field: "party_name", headerName: "Party", flex: 1, minWidth: 160 },
  { field: "mukam", headerName: "Mukam", width: 120 },
  { field: "item_name", headerName: "Item", flex: 1, minWidth: 140 },
  numCol("ordered_qty", "Ord Qty"),
  { field: "po_uom", headerName: "UOM", width: 80 },
  numCol("po_rate", "PO Rate"),
  { field: "mr_label", headerName: "MR / GE #", width: 170 },
  { field: "mr_date", headerName: "Recv Date", width: 110 },
  { field: "mr_status", headerName: "MR Status", width: 110 },
  numCol("challan_qty", "Challan Qty"),
  numCol("challan_weight", "Challan Wt"),
  numCol("received_qty", "Recv Qty"),
  numCol("received_weight", "Recv Wt"),
  numCol("accepted_weight", "Accepted Wt"),
  numCol("mr_rate", "MR Rate"),
  numCol("shortage_kgs", "Shortage"),
];

// A PO item with no receipts has a NULL jute_mr_li_id; an unmatched receipt
// (row_group 1) has a NULL item_id — neither alone is unique.
const getRowId = (r: JutePoMrReceiptDetailRow) =>
  `${r.row_group}-${r.jute_po_id}-${r.item_id ?? 0}-${r.jute_mr_li_id ?? 0}`;

function PoMrReceiptDetailPageContent() {
  const { coId, branches, initialBranchId, dateParam } = useReportBranches();
  const range = useMemo(
    () => ({ from: fyStart(new Date()), to: todayIso() }),
    [],
  );

  // Label of the PO actually fetched — drives the title so the header never
  // claims a date range the backend ignored (same pattern as mrIssueDetail).
  const [appliedPoLabel, setAppliedPoLabel] = useState("");
  const poLabels = useRef<Record<string, string>>({});

  const loadPoOptions = useCallback(
    async (branchId: number) => {
      if (coId == null) return [];
      const rows = await fetchJutePoOptions(coId, branchId);
      const opts = rows.map((r) => ({
        value: String(r.jute_po_id),
        // po_label, never po_number — po_number is NULL without po_no/po_date.
        label: [r.po_label, r.po_date, r.party_name]
          .filter(Boolean)
          .join("  |  "),
      }));
      poLabels.current = Object.fromEntries(
        opts.map((o) => [o.value, o.label]),
      );
      return opts;
    },
    [coId],
  );

  return (
    <ReportPanel
      title={
        appliedPoLabel
          ? `Jute PO Wise MR Receipt Detail - ${appliedPoLabel} (all receipts, dates ignored)`
          : "Jute PO Wise MR Receipt Detail (POs in period, by PO date)"
      }
      branches={branches}
      initialBranchId={initialBranchId}
      dates="range"
      initialDateFrom={range.from}
      initialDateTo={dateParam || range.to}
      extraAsync={{ label: "PO (blank = all)", load: loadPoOptions }}
      fetcher={(f) => {
        setAppliedPoLabel(f.extra ? (poLabels.current[f.extra] ?? f.extra) : "");
        return coId == null
          ? Promise.resolve([])
          : fetchJutePoMrReceiptDetail({
              coId,
              branchId: f.branchId,
              dateFrom: f.dateFrom,
              dateTo: f.dateTo,
              poId: f.extra || undefined,
            });
      }}
      columns={columns}
      getRowId={getRowId}
      sortField="po_date"
      sortDir="desc"
      exportName="jute-po-mr-receipt-detail"
    />
  );
}

export default function PoMrReceiptDetailPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      }
    >
      <PoMrReceiptDetailPageContent />
    </Suspense>
  );
}
