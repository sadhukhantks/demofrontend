"use client";

/**
 * Phone table: a dense MUI table that scrolls sideways under a sticky header
 * with the first column pinned, so a day stays identified while the thumb
 * swipes through its figures. Replaces the DataGrid on small screens, where
 * a 20-column grid inside a fixed-height box is unreadable. Reads the same
 * column definitions as the grid and the exports.
 *
 * Copy of spinningProductionTrend/_components/CompactTable.tsx (page-local,
 * no cross-route import), importing this route's tableColumns, with the
 * tints and the sticky-cell edge taken from theme tokens instead of hex.
 */

import React from "react";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import type { GridValidRowModel } from "@mui/x-data-grid";
import { cellText, type Col } from "../tableColumns";

export type RowTone = "low" | "watch" | undefined;

export default function CompactTable<T extends GridValidRowModel>({
  columns,
  rows,
  getRowId,
  rowTone,
  maxHeight = 420,
  onRowClick,
}: {
  columns: Col<T>[];
  rows: T[];
  getRowId: (row: T) => string | number;
  /** Row tint for performance-highlight tables (LOW / WATCH). */
  rowTone?: (row: T) => RowTone;
  maxHeight?: number;
  /** Tap-to-drill; rows get a pointer cursor. */
  onRowClick?: (row: T) => void;
}) {
  const theme = useTheme();
  // Faint washes of the semantic palette, so dark mode follows the theme.
  const tint: Record<string, string> = React.useMemo(
    () => ({
      low: alpha(theme.palette.error.main, 0.1),
      watch: alpha(theme.palette.warning.main, 0.12),
    }),
    [theme],
  );
  const stickyCell = React.useMemo(
    () =>
      ({
        position: "sticky",
        left: 0,
        bgcolor: "background.paper",
        boxShadow: `1px 0 0 0 ${theme.palette.divider}`,
      }) as const,
    [theme],
  );
  return (
    <TableContainer
      sx={{
        maxHeight,
        overflow: "auto",
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
        WebkitOverflowScrolling: "touch",
      }}
    >
      <Table
        size="small"
        stickyHeader
        sx={{
          "& th, & td": { px: 0.75, py: 0.5, fontSize: 12, whiteSpace: "nowrap", lineHeight: 1.3 },
          "& th": { fontWeight: 700 },
          "& .num": { textAlign: "right", fontVariantNumeric: "tabular-nums" },
        }}
      >
        <TableHead>
          <TableRow>
            {columns.map((c, i) => (
              <TableCell
                key={c.field}
                className={c.num ? "num" : undefined}
                title={c.description}
                sx={i === 0 ? { ...stickyCell, zIndex: 3 } : undefined}
              >
                {c.short ?? c.header}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => {
            const tone = rowTone?.(row);
            const bg = tone ? tint[tone] : undefined;
            return (
              <TableRow
                key={getRowId(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                sx={{
                  ...(bg ? { "& td": { bgcolor: bg } } : {}),
                  ...(onRowClick ? { cursor: "pointer", "&:active td": { bgcolor: "action.hover" } } : {}),
                }}
              >
                {columns.map((c, i) => (
                  <TableCell
                    key={c.field}
                    className={c.num ? "num" : undefined}
                    sx={i === 0 ? { ...stickyCell, zIndex: 1, fontWeight: 600 } : undefined}
                  >
                    {cellText(c, row)}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
