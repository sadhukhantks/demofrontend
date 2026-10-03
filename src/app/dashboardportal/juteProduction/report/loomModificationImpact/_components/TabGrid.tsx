"use client";

/**
 * One grid of the impact report plus an Export button that writes exactly the
 * sheet on screen (cloned from weavingLowProducer's TabGrid). The wrapper also
 * carries the two row tints this page adds on top of ReportGrid's own
 * (`lmi-row-excluded` for settling days, `lmi-row-control` for control twins).
 */

import React from "react";
import { Box, Button } from "@mui/material";
import { usePathname } from "next/navigation";
import type { GridColDef, GridValidRowModel } from "@mui/x-data-grid";
import ReportGrid from "@/components/reports/ReportGrid";
import { exportRowsToExcel, type ReportExportHeader } from "@/components/reports/exportExcel";
import { resolveReportMenuId } from "@/utils/reportMenuService";
import { tokens } from "@/styles/tokens";
import { ROW_CLASS_CONTROL, ROW_CLASS_EXCLUDED } from "../impactRows";

export interface TabGridProps<T extends GridValidRowModel & { row_id: number }> {
  rows: T[];
  columns: GridColDef<T>[];
  loading: boolean;
  error: string | null;
  branchId: number | null;
  sortField?: string;
  sortDir?: "asc" | "desc";
  exportName: string;
  header: ReportExportHeader;
  height?: number;
  getRowClass?: (row: T) => string;
  isTotalRow?: (row: T) => boolean;
  /** Extra controls rendered left of the Export button (segment pickers etc.). */
  toolbar?: React.ReactNode;
}

export default function TabGrid<T extends GridValidRowModel & { row_id: number }>({
  rows,
  columns,
  loading,
  error,
  branchId,
  sortField,
  sortDir,
  exportName,
  header,
  height,
  getRowClass,
  isTotalRow,
  toolbar,
}: TabGridProps<T>) {
  const pathname = usePathname();
  return (
    <Box
      sx={{
        [`& .${ROW_CLASS_EXCLUDED}, & .${ROW_CLASS_EXCLUDED}:hover, & .${ROW_CLASS_EXCLUDED}.Mui-hovered`]:
          {
            backgroundColor: tokens.neutral[100],
            color: tokens.neutral[500],
          },
        [`& .${ROW_CLASS_CONTROL}, & .${ROW_CLASS_CONTROL}:hover, & .${ROW_CLASS_CONTROL}.Mui-hovered`]:
          {
            backgroundColor: tokens.surface.muted,
            color: tokens.neutral[700],
            fontStyle: "italic",
          },
      }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 1,
          flexWrap: "wrap",
          mb: 1,
        }}
      >
        {toolbar}
        <Button
          variant="outlined"
          size="small"
          disabled={branchId == null || rows.length === 0}
          onClick={() => {
            void (async () => {
              await exportRowsToExcel(columns, rows, exportName, {
                ...header,
                reportNo: await resolveReportMenuId(pathname),
              });
            })();
          }}
          sx={{ textTransform: "none" }}
        >
          Export to Excel
        </Button>
      </Box>
      <ReportGrid
        rows={rows}
        columns={columns}
        getRowId={(r) => r.row_id}
        loading={loading}
        error={error}
        branchId={branchId}
        sortField={sortField}
        sortDir={sortDir}
        height={height}
        getRowClass={getRowClass}
        isTotalRow={isTotalRow}
      />
    </Box>
  );
}
