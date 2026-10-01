"use client";

/**
 * "This loom set vs looms not modified" (owner, 2026-09-29): the explicit
 * side-by-side under the verdict strip — the modified looms, the un-modified
 * control looms and the net effect, each with Looms | Efficiency before |
 * Efficiency after | Change (pts and %). Every figure is the server's
 * `verdict.comparison`; the page only formats and tints. Compact enough for
 * a phone: five narrow columns, headers may wrap.
 */

import React from "react";
import { Box, Table, TableBody, TableCell, TableHead, TableRow, Typography, useTheme } from "@mui/material";
import { tokens } from "@/styles/tokens";
import type { ImpactComparison, ImpactMeta } from "../_service";
import { comparisonBasisNote, comparisonRows, noComparisonReason, type ComparisonRow } from "../impactRows";

export interface ComparisonBlockProps {
  comparison: ImpactComparison | null | undefined;
  meta: ImpactMeta | null;
  /** Relative-% verdict threshold (meta.thresholds) — tints the change cells. */
  thresholdPct: number;
}

const TITLE = "This loom set vs looms not modified";

const cellSx = { px: { xs: 0.75, sm: 1.5 }, py: 0.5, whiteSpace: "normal" as const, lineHeight: 1.25 };

export default function ComparisonBlock({ comparison, meta, thresholdPct }: ComparisonBlockProps) {
  const theme = useTheme();
  if (!comparison) return null;
  const rows = comparisonRows(comparison, thresholdPct);
  const basisNote = comparisonBasisNote(comparison);

  const changeColor = (r: ComparisonRow): string | undefined =>
    r.state === "good" ? theme.palette.success.main : r.state === "bad" ? theme.palette.error.main : undefined;

  return (
    <Box data-testid="comparison-block" sx={{ mb: 2 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
        {TITLE}
      </Typography>
      <Box sx={{ overflowX: "auto" }}>
        <Table size="small" sx={{ maxWidth: 720, "& th": { fontWeight: 700 } }} aria-label={TITLE}>
          <TableHead>
            <TableRow>
              <TableCell sx={cellSx} />
              <TableCell sx={cellSx} align="right">
                Looms
              </TableCell>
              <TableCell sx={cellSx} align="right">
                Efficiency before
              </TableCell>
              <TableCell sx={cellSx} align="right">
                Efficiency after
              </TableCell>
              <TableCell sx={cellSx} align="right">
                Change
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow
                key={r.row_id}
                data-testid={`comparison-row-${r.kind}`}
                sx={{
                  bgcolor: r.kind === "control" ? tokens.surface.muted : undefined,
                  "& td": { fontWeight: r.kind === "net" ? 700 : undefined },
                }}
              >
                <TableCell sx={cellSx} component="th" scope="row">
                  {r.label}
                </TableCell>
                <TableCell sx={cellSx} align="right">
                  {r.looms}
                </TableCell>
                <TableCell sx={cellSx} align="right">
                  {r.before}
                </TableCell>
                <TableCell sx={cellSx} align="right">
                  {r.after}
                </TableCell>
                <TableCell sx={{ ...cellSx, color: changeColor(r) }} align="right">
                  {r.change}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
      {comparison.control ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }} data-testid="comparison-description">
          {comparison.description ?? meta?.control?.description ?? ""}
        </Typography>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }} data-testid="comparison-none">
          No comparison set: {noComparisonReason(meta)}
        </Typography>
      )}
      {basisNote ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }} data-testid="comparison-basis">
          {basisNote}
        </Typography>
      ) : null}
    </Box>
  );
}
