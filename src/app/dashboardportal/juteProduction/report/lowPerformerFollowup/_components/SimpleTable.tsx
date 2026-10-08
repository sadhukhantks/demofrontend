"use client";

import * as React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

export interface SimpleColumn<T> {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  minWidth?: number;
  render: (row: T) => React.ReactNode;
}

export interface SimpleTableProps<T> {
  rows: ReadonlyArray<T>;
  columns: ReadonlyArray<SimpleColumn<T>>;
  getKey: (row: T, index: number) => string | number;
  emptyText: string;
}

/** Compact read-only table that scrolls sideways on a phone. */
export default function SimpleTable<T>({ rows, columns, getKey, emptyText }: SimpleTableProps<T>) {
  if (rows.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
        {emptyText}
      </Typography>
    );
  }
  return (
    <TableContainer sx={{ width: "100%", overflowX: "auto", border: 1, borderColor: "divider", borderRadius: 1 }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            {columns.map((c) => (
              <TableCell
                key={c.key}
                align={c.align ?? "left"}
                sx={{ fontWeight: 700, whiteSpace: "nowrap", minWidth: c.minWidth, bgcolor: "action.hover" }}
              >
                {c.label}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={getKey(row, i)} hover>
              {columns.map((c) => (
                <TableCell key={c.key} align={c.align ?? "left"} sx={{ whiteSpace: "nowrap" }}>
                  {c.render(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
