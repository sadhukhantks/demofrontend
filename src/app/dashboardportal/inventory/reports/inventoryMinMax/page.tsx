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
  { field: "item_grp_name", headerName: "Item Group", flex: 1, minWidth: 140 },
  { field: "item_name", headerName: "Item", flex: 1, minWidth: 180 },
  { field: "uom_name", headerName: "UOM", width: 80 },
  numCol("min_qty", "Min"),
  numCol("max_qty", "Max"),
  numCol("reorder_qty", "Reorder"),
  { field: "lead_time", headerName: "Lead Time", type: "number", width: 100 },
  numCol("current_qty", "Current"),
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
      sortField="item_grp_name"
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
