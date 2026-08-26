"use client";
import React, { Suspense } from "react";
import { Box, CircularProgress } from "@mui/material";
import { GridColDef } from "@mui/x-data-grid";
import ReportPanel from "@/components/reports/ReportPanel";
import { numCol } from "@/components/reports/ReportGrid";
import { useReportBranches } from "@/components/reports/useReportBranches";
import {
  fetchSrExceptionReport,
  type SrExceptionRow,
} from "@/utils/inventoryReportService";

const columns: GridColDef<SrExceptionRow>[] = [
  { field: "sr_no", headerName: "SR No", width: 200 },
  { field: "inward_date", headerName: "SR Date", width: 110 },
  { field: "branch_name", headerName: "Branch", width: 140 },
  { field: "item_code", headerName: "Item Code", width: 120 },
  { field: "item_name", headerName: "Item Description", width: 380 },
  { field: "item_grp_name", headerName: "Item Group", flex: 1, minWidth: 140 },
  { field: "uom_name", headerName: "UOM", width: 80 },
  numCol("received_qty", "Received"),
  numCol("issued_qty", "Issued"),
  numCol("return_qty", "Returned (DN)", 130),
  numCol("balance_qty", "Balance", 120),
];

const getRowId = (r: SrExceptionRow) => r.inward_dtl_id;

function SrExceptionContent() {
  const { coId, branches, initialBranchId } = useReportBranches();

  return (
    <ReportPanel
      title="SR Exception Report (Negative Stock)"
      branches={branches}
      initialBranchId={initialBranchId}
      dates="none"
      fetcher={(f) =>
        coId == null
          ? Promise.resolve([])
          : fetchSrExceptionReport({ coId, branchId: f.branchId })
      }
      columns={columns}
      getRowId={getRowId}
      sortField="balance_qty"
      exportName="sr-exception"
    />
  );
}

export default function SrExceptionPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      }
    >
      <SrExceptionContent />
    </Suspense>
  );
}
