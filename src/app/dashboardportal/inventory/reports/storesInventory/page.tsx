"use client";
import React, { Suspense } from "react";
import { Box, CircularProgress } from "@mui/material";
import { GridColDef } from "@mui/x-data-grid";
import ReportPanel from "@/components/reports/ReportPanel";
import { numCol } from "@/components/reports/ReportGrid";
import { useReportBranches } from "@/components/reports/useReportBranches";
import { currentMonthRange } from "@/components/reports/reportDates";
import {
  fetchInventoryStockReport,
  type InventoryStockReportRow,
} from "@/utils/inventoryReportService";

const columns: GridColDef<InventoryStockReportRow>[] = [
  { field: "item_grp_name", headerName: "Item Group", flex: 1, minWidth: 140 },
  { field: "item_name", headerName: "Item", flex: 1, minWidth: 180 },
  { field: "uom_name", headerName: "UOM", width: 90 },
  numCol("opening_qty", "Opening"),
  numCol("receipt_qty", "Receipt"),
  numCol("issue_qty", "Issue"),
  numCol("closing_qty", "Closing"),
];

const getRowId = (r: InventoryStockReportRow) => r.item_id;

function StoresInventoryContent() {
  const { branches, coId, initialBranchId, dateParam } = useReportBranches();
  const { from, to } = currentMonthRange();

  return (
    <ReportPanel
      title="Stores Inventory List"
      branches={branches}
      initialBranchId={initialBranchId}
      dates="range"
      initialDateFrom={from}
      initialDateTo={dateParam || to}
      fetcher={(f) =>
        coId == null
          ? Promise.resolve([])
          : fetchInventoryStockReport({
              coId,
              dateFrom: f.dateFrom,
              dateTo: f.dateTo,
              branchId: f.branchId,
            })
      }
      columns={columns}
      getRowId={getRowId}
      sortField="item_grp_name"
      exportName="stores-inventory-list"
    />
  );
}

export default function StoresInventoryReportPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      }
    >
      <StoresInventoryContent />
    </Suspense>
  );
}
