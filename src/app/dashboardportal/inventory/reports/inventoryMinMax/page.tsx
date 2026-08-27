"use client";
import React, { Suspense } from "react";
import { Box, CircularProgress } from "@mui/material";
import { GridColDef } from "@mui/x-data-grid";
import ReportPanel from "@/components/reports/ReportPanel";
import { numCol } from "@/components/reports/ReportGrid";
import { useReportBranches } from "@/components/reports/useReportBranches";
import { todayIso } from "@/components/reports/reportDates";
import {
  fetchInventoryMinMax,
  type InventoryMinMaxRow,
} from "@/utils/inventoryReportService";

const columns: GridColDef<InventoryMinMaxRow>[] = [
  { field: "item_code", headerName: "Item Code", width: 120 },
  { field: "item_grp_name", headerName: "Item Group", flex: 1, minWidth: 140 },
  { field: "item_name", headerName: "Item Description", width: 450 },
  { field: "uom_name", headerName: "UOM", width: 80 },
  numCol("min_qty", "Min"),
  numCol("max_qty", "Max"),
  numCol("reorder_qty", "Reorder"),
  { field: "lead_time", headerName: "Lead Time", type: "number", width: 100 },
  numCol("current_qty", "Stock Qty"),
  // Shortfall against min — 0 when at/above min (TKT-000114).
  numCol("below_min_qty", "Below Min By", 130),
  numCol("pending_indent_qty", "Pending Indent"),
  numCol("pending_po_qty", "Pending PO"),
  numCol("qty_to_be_ordered", "Qty To Be Ordered", 150),
  { field: "status", headerName: "Status", width: 120 },
];

const getRowId = (r: InventoryMinMaxRow) => r.item_id;

function InventoryMinMaxContent() {
  const { coId, branches, initialBranchId, dateParam } = useReportBranches();

  return (
    <ReportPanel
      title="Stores Min-Max"
      branches={branches}
      initialBranchId={initialBranchId}
      dates="single"
      singleLabel="As on Date"
      initialDateTo={dateParam || todayIso()}
      fetcher={(f) =>
        coId == null
          ? Promise.resolve([])
          : fetchInventoryMinMax({
              coId,
              branchId: f.branchId,
              dateTo: f.dateTo,
            })
      }
      columns={columns}
      getRowId={getRowId}
      // Biggest shortfall first — same order the server returns (TKT-000114);
      // the grid would otherwise re-sort the page by group and hide it.
      sortField="below_min_qty"
      sortDir="desc"
      exportName="stores-min-max"
    />
  );
}

export default function InventoryMinMaxPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      }
    >
      <InventoryMinMaxContent />
    </Suspense>
  );
}
