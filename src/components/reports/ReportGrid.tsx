"use client";
import React from "react";
import { Box, Alert, CircularProgress, Typography } from "@mui/material";
import {
  DataGrid,
  GridColDef,
  GridValidRowModel,
} from "@mui/x-data-grid";

interface ReportGridProps<T extends GridValidRowModel> {
  rows: T[];
  columns: GridColDef<T>[];
  getRowId: (row: T) => string | number;
  loading: boolean;
  error: string | null;
  /** When provided and null, shows a "select a branch" prompt instead of the grid. */
  branchId?: number | null;
  height?: number;
  sortField?: string;
  sortDir?: "asc" | "desc";
}

/**
 * Shared presentational grid shell for the jute report pages — loading overlay,
 * error alert, branch-null guard, and the standard DataGrid styling. Each report
 * component supplies its own rows/columns/getRowId.
 */
export default function ReportGrid<T extends GridValidRowModel>({
  rows,
  columns,
  getRowId,
  loading,
  error,
  branchId,
  height = 600,
  sortField,
  sortDir = "asc",
}: ReportGridProps<T>) {
  if (branchId === null) {
    return (
      <Box sx={{ p: 4, textAlign: "center" }}>
        <Typography color="text.secondary">
          Select a branch to view the report
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ position: "relative", width: "100%" }}>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading && (
        <Box
          sx={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: "rgba(255,255,255,0.7)",
            zIndex: 10,
          }}
        >
          <CircularProgress />
        </Box>
      )}

      <Box sx={{ height, width: "100%" }}>
        <DataGrid
          rows={rows}
          columns={columns}
          getRowId={getRowId}
          pageSizeOptions={[25, 50, 100]}
          initialState={{
            pagination: { paginationModel: { page: 0, pageSize: 50 } },
            ...(sortField
              ? { sorting: { sortModel: [{ field: sortField, sort: sortDir }] } }
              : {}),
          }}
          disableRowSelectionOnClick
          sx={{
            "& .MuiDataGrid-columnHeader": {
              backgroundColor: "#3ea6da",
              color: "white",
              fontWeight: "bold",
            },
            "& .MuiDataGrid-columnHeaderTitle": { fontWeight: "bold" },
          }}
        />
      </Box>
    </Box>
  );
}

/** 2-decimal number formatter shared by the report column defs. */
export function fmtNum(value: unknown): string {
  if (value == null) return "";
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : "";
}

/** Helper to build a right-aligned 2-decimal numeric column. */
export function numCol<T extends GridValidRowModel>(
  field: string,
  headerName: string,
  width = 120,
): GridColDef<T> {
  return {
    field,
    headerName,
    type: "number",
    width,
    valueFormatter: (value: unknown) => fmtNum(value),
  };
}
