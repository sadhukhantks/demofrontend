"use client";

/**
 * Phone table: a dense MUI table that scrolls sideways under a sticky header
 * with the first column pinned, so a day or a frame stays identified while
 * the thumb swipes through its figures. Replaces the DataGrid on small
 * screens, where a 13-column grid inside a fixed-height box is unreadable.
 * Reads the same column definitions as the grid and the exports.
 */

import React from "react";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from "@mui/material";
import type { GridValidRowModel } from "@mui/x-data-grid";
import { cellText, type Col } from "../tableColumns";

export type RowTone = "low" | "watch" | undefined;

const TINT: Record<string, string> = { low: "#fdecea", watch: "#fff8e1" };

const stickyCell = {
  position: "sticky",
  left: 0,
  bgcolor: "background.paper",
  boxShadow: "1px 0 0 0 #e1e0d9",
} as const;

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
            const bg = tone ? TINT[tone] : undefined;
            return (
              <TableRow
                key={getRowId(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                sx={{
                  ...(bg ? { "& td": { bgcolor: bg } } : {}),
                  ...(onRowClick ? { cursor: "pointer", "&:active td": { bgcolor: "#f3f4f6" } } : {}),
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
