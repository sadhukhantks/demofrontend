"use client";

/**
 * Frame x day grid of actual minus standard. The number in each cell is the
 * day's gap in kg (negative = below standard); the colour is the same gap
 * relative to the standard, so frames on different counts still compare in
 * one picture (blue above standard, neutral near, red below). A row that is
 * red across is a frame with a persistent problem; a column that is red down
 * is a bad day. Sticky header and first column; scrolls sideways on phones.
 */

import React from "react";
import { Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import type { HeatFrameRow } from "../_service";
import { fmtKg, shortDate } from "../trendRows";

interface Band {
  min: number;
  bg: string;
  ink: string;
  label: string;
}

/** Ordered high -> low; the first band whose `min` the value reaches wins. */
export const HEAT_BANDS: Band[] = [
  { min: 105, bg: "#b7d3f6", ink: "#0b0b0b", label: "5%+ over standard" },
  { min: 95, bg: "#f0efec", ink: "#0b0b0b", label: "within 5%" },
  { min: 85, bg: "#fde3e2", ink: "#0b0b0b", label: "5–15% short" },
  { min: 70, bg: "#f5aaa8", ink: "#0b0b0b", label: "15–30% short" },
  { min: -Infinity, bg: "#e34948", ink: "#ffffff", label: "30%+ short" },
];

export function heatBand(v: number | null | undefined): Band | null {
  if (v == null || Number.isNaN(v)) return null;
  return HEAT_BANDS.find((b) => v >= b.min) ?? null;
}

const sticky = {
  position: "sticky",
  left: 0,
  bgcolor: "background.paper",
  boxShadow: "1px 0 0 0 #e1e0d9",
} as const;

export default function AchHeatmap({
  dates,
  frames,
  maxHeight = 520,
  onFrame,
}: {
  dates: string[];
  frames: HeatFrameRow[];
  maxHeight?: number;
  /** Tap a frame label to drill into it. */
  onFrame?: (frame: string) => void;
}) {
  return (
    <Box>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 0.75, alignItems: "center" }}>
        {HEAT_BANDS.map((b) => (
          <Box key={b.label} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Box sx={{ width: 14, height: 14, bgcolor: b.bg, borderRadius: 0.5, border: "1px solid #e1e0d9" }} />
            <Typography variant="caption" color="text.secondary">
              {b.label}
            </Typography>
          </Box>
        ))}
      </Box>
      <TableContainer
        sx={{ maxHeight, overflow: "auto", border: 1, borderColor: "divider", borderRadius: 1 }}
      >
        <Table
          size="small"
          stickyHeader
          sx={{
            "& th, & td": {
              px: 0.5,
              py: 0.25,
              fontSize: 11,
              whiteSpace: "nowrap",
              lineHeight: 1.3,
              textAlign: "center",
              fontVariantNumeric: "tabular-nums",
            },
            "& th": { fontWeight: 700 },
          }}
        >
          <TableHead>
            <TableRow>
              <TableCell sx={{ ...sticky, zIndex: 3, textAlign: "left" }}>Frame</TableCell>
              <TableCell sx={{ zIndex: 2 }} title="Total actual − standard over the period">
                Gap kg
              </TableCell>
              {dates.map((d) => (
                <TableCell key={d} title={d}>
                  {shortDate(d)}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {frames.map((f) => {
              const mean = heatBand(f.mean_ach_pct);
              return (
                <TableRow key={f.frame ?? "?"}>
                  <TableCell
                    onClick={onFrame && f.frame ? () => onFrame(f.frame as string) : undefined}
                    sx={{
                      ...sticky,
                      zIndex: 1,
                      fontWeight: 600,
                      textAlign: "left",
                      ...(onFrame ? { cursor: "pointer", textDecoration: "underline dotted" } : {}),
                    }}
                  >
                    {f.frame ?? "?"}
                  </TableCell>
                  <TableCell
                    sx={{ fontWeight: 700, bgcolor: mean?.bg, color: mean?.ink }}
                    title={f.mean_ach_pct == null ? undefined : `${f.mean_ach_pct}% of standard`}
                  >
                    {fmtKg(f.gap_kg)}
                  </TableCell>
                  {dates.map((d) => {
                    const pct = f.cells[d];
                    const gap = f.gap_cells?.[d];
                    const band = heatBand(pct);
                    return (
                      <TableCell
                        key={d}
                        sx={{ bgcolor: band?.bg, color: band?.ink }}
                        title={pct == null ? undefined : `${d}: ${pct}% of standard`}
                      >
                        {gap == null ? "" : fmtKg(gap)}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
