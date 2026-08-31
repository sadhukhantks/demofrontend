"use client";
import React, { Suspense } from "react";
import { Box, CircularProgress } from "@mui/material";
import { GridColDef } from "@mui/x-data-grid";
import ReportPanel from "@/components/reports/ReportPanel";
import { numCol } from "@/components/reports/ReportGrid";
import { useReportBranches } from "@/components/reports/useReportBranches";
import { fetchJutePoPending } from "@/utils/juteReportService";
import type { JutePoPendingRow } from "../types/reportTypes";

// One row per PO item. The PO-level columns (PO Wt / Recv / Pending, lorries)
// repeat across a PO's item rows — only the item columns are summable.
const columns: GridColDef<JutePoPendingRow>[] = [
  { field: "po_label", headerName: "PO #", width: 190 },
  { field: "po_date", headerName: "PO Date", width: 110 },
  { field: "po_status", headerName: "Status", width: 110 },
  { field: "party_name", headerName: "Party", flex: 1, minWidth: 160 },
  { field: "mukam", headerName: "Mukam", width: 120 },
  { field: "due_date", headerName: "Due Date", width: 110 },
  { field: "vehicle_quantity", headerName: "Lorries", width: 90 },
  { field: "received_lorries", headerName: "Recv Lorries", width: 110 },
  { field: "pending_lorries", headerName: "Pend Lorries", width: 110 },
  numCol("po_weight", "PO Wt"),
  numCol("po_received_weight", "Recv Wt (PO)"),
  numCol("po_pending_weight", "Pending Wt (PO)"),
  { field: "item_name", headerName: "Item", flex: 1, minWidth: 140 },
  { field: "po_uom", headerName: "UOM", width: 80 },
  numCol("po_rate", "Rate"),
  numCol("ordered_qty", "Ord Qty"),
  numCol("received_qty", "Recv Qty"),
  numCol("pending_qty", "Pending Qty"),
  numCol("received_weight", "Recv Wt (Item)"),
];

const getRowId = (r: JutePoPendingRow) => `${r.jute_po_id}-${r.item_id ?? 0}`;

function PoPendingPageContent() {
  const { coId, branches, initialBranchId } = useReportBranches();

  return (
    <ReportPanel
      title="Jute Pending PO (arrival pending)"
      branches={branches}
      initialBranchId={initialBranchId}
      dates="none"
      fetcher={(f) =>
        coId == null
          ? Promise.resolve([])
          : fetchJutePoPending(coId, f.branchId)
      }
      columns={columns}
      getRowId={getRowId}
      sortField="po_date"
      sortDir="desc"
      exportName="jute-po-pending"
    />
  );
}

export default function PoPendingPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      }
    >
      <PoPendingPageContent />
    </Suspense>
  );
}
