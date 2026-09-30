"use client";

/**
 * Meta line of the Purchased Yarn Ledger: what the opening and closing
 * figures were taken from, so a reader knows whether "difference" compares a
 * real count against the book or the book against itself.
 */

import React from "react";
import { Stack, Typography } from "@mui/material";
import type { LedgerMeta, LedgerRow } from "../_service";
import { floorCountEntries } from "../ledgerRows";

export interface LedgerMetaLineProps {
  meta: LedgerMeta;
  rows: readonly LedgerRow[];
  fromDate: string;
  toDate: string;
}

export function LedgerMetaLine({ meta, rows, fromDate, toDate }: LedgerMetaLineProps) {
  const floorCounts = floorCountEntries(meta, rows);
  const openingText =
    meta.opening_basis === "count"
      ? `physical count on ${meta.godown_opening_count_date ?? "—"}`
      : "book (no godown count before the month)";
  return (
    <Stack direction="row" spacing={3} useFlexGap flexWrap="wrap" sx={{ px: 0.5 }}>
      <Typography variant="body2">
        <strong>Period:</strong> {fromDate} to {toDate}
      </Typography>
      <Typography
        variant="body2"
        sx={meta.opening_basis === "book" ? { color: "warning.dark" } : undefined}
      >
        <strong>Godown opening basis:</strong> {openingText}
      </Typography>
      <Typography
        variant="body2"
        sx={meta.godown_closing_count_date == null ? { color: "warning.dark" } : undefined}
      >
        <strong>Godown closing count:</strong>{" "}
        {meta.godown_closing_count_date ?? "none in the month (counted closing not available)"}
      </Typography>
      <Typography variant="body2">
        <strong>Floor counts:</strong>{" "}
        {floorCounts.length
          ? floorCounts.map((f) => `${f.dept_desc} ${f.date}`).join(" · ")
          : "none"}
      </Typography>
    </Stack>
  );
}
