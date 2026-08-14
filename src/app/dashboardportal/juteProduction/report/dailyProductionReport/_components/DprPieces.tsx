"use client";

/**
 * Presentational pieces for the Daily Production Report page.
 * Dumb components only — all data arrives via props from page.tsx.
 */

import React from "react";
import {
  Card,
  CardContent,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

/** Compact number: fixed decimals, em-dash for null/undefined. */
export function fmt(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export type KpiState = "good" | "warn" | "bad" | undefined;

export interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  state?: KpiState;
}

/** Single stat tile of the KPI strip. Value stays in text ink; only the small
 * state caption is tinted, and it always carries text (never color alone). */
export function KpiCard({ label, value, sub, state }: KpiCardProps) {
  const stateColor =
    state === "good" ? "success.main" : state === "warn" ? "warning.main" : state === "bad" ? "error.main" : "text.secondary";
  return (
    <Card variant="outlined" sx={{ minWidth: 150, flex: "1 1 150px" }}>
      <CardContent sx={{ py: 1.25, "&:last-child": { pb: 1.25 } }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
          {label}
        </Typography>
        <Typography variant="h6" sx={{ lineHeight: 1.3 }}>
          {value}
        </Typography>
        {sub ? (
          <Typography variant="caption" sx={{ color: stateColor }}>
            {sub}
          </Typography>
        ) : null}
      </CardContent>
    </Card>
  );
}

export interface SectionCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

/** Titled wrapper for one report section. */
export function SectionCard({ title, subtitle, children }: SectionCardProps) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, breakInside: "avoid" }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.25 }}>
        {title}
      </Typography>
      {subtitle ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75 }}>
          {subtitle}
        </Typography>
      ) : null}
      {children}
    </Paper>
  );
}

export interface DprTableProps {
  head: React.ReactNode;
  children: React.ReactNode;
}

/** Compact table shell shared by every section. */
export function DprTable({ head, children }: DprTableProps) {
  return (
    <TableContainer sx={{ overflowX: "auto" }}>
      <Table
        size="small"
        sx={{
          "& th": {
            fontWeight: 700,
            whiteSpace: "nowrap",
            bgcolor: "action.hover",
            py: 0.5,
          },
          "& td": { py: 0.4, whiteSpace: "nowrap" },
          // Print cannot scroll: let wide tables wrap instead of clipping.
          "@media print": {
            "& td, & th": { whiteSpace: "normal" },
          },
        }}
      >
        <TableHead>{head}</TableHead>
        <TableBody>{children}</TableBody>
      </Table>
    </TableContainer>
  );
}

export interface NumTdProps {
  value: number | null | undefined;
  digits?: number;
  /** Tint the text by sign/threshold; value text itself carries the signal.
   * "nonzero-bad" is for deviation metrics where BOTH signs are off-standard. */
  tone?: "pos-bad" | "neg-bad" | "nonzero-bad" | undefined;
  bold?: boolean;
}

/** Right-aligned numeric cell; optional variance tinting (text tint + sign). */
export function NumTd({ value, digits = 2, tone, bold }: NumTdProps) {
  let color: string | undefined;
  if (tone && value !== null && value !== undefined && value !== 0) {
    const isBad =
      tone === "nonzero-bad" ? true : tone === "pos-bad" ? value > 0 : value < 0;
    color = isBad ? "error.main" : "success.main";
  }
  return (
    <TableCell align="right" sx={{ color, fontWeight: bold ? 700 : undefined }}>
      {fmt(value, digits)}
    </TableCell>
  );
}

/** HEAVY / LIGHT / OK verdict chip — label always textual. */
export function VerdictChip({ remark }: { remark: "HEAVY" | "LIGHT" | "OK" | null }) {
  if (!remark) return <TableCell>—</TableCell>;
  const color = remark === "OK" ? "success" : remark === "HEAVY" ? "error" : "warning";
  return (
    <TableCell>
      <Chip size="small" label={remark} color={color} variant="outlined" />
    </TableCell>
  );
}

/** Total row styling helper. */
export function totalRowSx() {
  return { "& td": { fontWeight: 700, bgcolor: "action.selected" } } as const;
}

export { TableCell as Td, TableRow as Tr };
