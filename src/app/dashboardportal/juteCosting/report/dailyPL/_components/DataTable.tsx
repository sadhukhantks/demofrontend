"use client";

/**
 * One table, two renderers: the DataGrid on desktop, the compact
 * sticky-column table on phones. Both read the same column definitions, so
 * the figures and their formatting agree, and the exports read the grid
 * columns from the same source.
 *
 * Verbatim copy of spinningProductionTrend/_components/DataTable.tsx
 * (page-local, no cross-route import).
 */

import React from "react";
import type { GridColDef, GridValidRowModel } from "@mui/x-data-grid";
import ReportGrid from "@/components/reports/ReportGrid";
import { phoneColumns, toGridColumns, type Col } from "../tableColumns";
import CompactTable, { type RowTone } from "./CompactTable";

export default function DataTable<T extends GridValidRowModel>({
  cols,
  gridCols,
  rows,
  getRowId,
  isPhone,
  branchId,
  rowTone,
  rowClass,
  maxRows = 12,
  onRowClick,
}: {
  cols: Col<T>[];
  /** Pre-built grid columns (pass when the column set is static so the grid
   * does not rebuild them on every render). */
  gridCols?: GridColDef<T>[];
  rows: T[];
  getRowId: (row: T) => string | number;
  isPhone: boolean;
  branchId: number;
  rowTone?: (row: T) => RowTone;
  rowClass?: (row: T) => string;
  /** Rows visible before the grid scrolls. */
  maxRows?: number;
  /** Drill-down: a tap on phones, a double-click on the desktop grid. */
  onRowClick?: (row: T) => void;
}) {
  const grid = React.useMemo(() => gridCols ?? toGridColumns(cols), [gridCols, cols]);
  const phone = React.useMemo(() => phoneColumns(cols), [cols]);
  if (isPhone) {
    return (
      <CompactTable
        columns={phone}
        rows={rows}
        getRowId={getRowId}
        rowTone={rowTone}
        maxHeight={Math.min(520, 40 + Math.min(rows.length, maxRows) * 30 + 12)}
        onRowClick={onRowClick}
      />
    );
  }
  return (
    <ReportGrid
      rows={rows}
      columns={grid}
      getRowId={getRowId}
      loading={false}
      error={null}
      branchId={branchId}
      height={56 + Math.min(rows.length, maxRows) * 40 + 60}
      getRowClass={rowClass}
      onRowDoubleClick={onRowClick}
    />
  );
}
