"use client";

/**
 * Presentational renderer for ONE gain/loss statement (FNG / WVG / WDG) —
 * the mill's one-page monthly document: A) INPUT, B) OUTPUT, GAIN/LOSS and
 * the PROCESS STOCK block. Dumb component: everything arrives via props.
 */

import React from "react";
import { Box, Tooltip, Typography } from "@mui/material";
import type { SxProps } from "@mui/material";
import { alpha, type Theme } from "@mui/material/styles";
import { TriangleAlert } from "lucide-react";
import type {
  GlPctRow,
  GlProcessStockReportRow,
  GlReportRow,
  GlStatement,
} from "@/utils/juteGainLossService";
import {
  DprTable,
  SectionCard,
  Td,
  Tr,
  fmt,
  totalRowSx,
} from "../../dailyProductionReport/_components/DprPieces";

/** Columns in the main figures table (PARTICULARS + 7 numeric columns). */
const COLS = 8;

/** Right-aligned quantity cell — negatives carry the theme error ink. */
function GlNum({
  value,
  digits = 3,
  bold,
}: {
  value: number | null | undefined;
  digits?: number;
  bold?: boolean;
}) {
  const neg = typeof value === "number" && value < 0;
  return (
    <Td
      align="right"
      sx={{ color: neg ? "error.main" : undefined, fontWeight: bold ? 700 : undefined }}
    >
      {fmt(value, digits)}
    </Td>
  );
}

/** "Less :-" rows are prefixed when the backend label doesn't already say so. */
function displayLabel(row: GlReportRow): string {
  if (row.sign === -1 && !/^\s*less\b/i.test(row.label)) return `Less :- ${row.label}`;
  return row.label;
}

/** One figure row: label + Hess/Sack/Total/To-Date + prev Hess/Sack/Total. */
function FigureRow({
  row,
  bold,
  sx,
}: {
  row: GlReportRow;
  bold?: boolean;
  sx?: SxProps<Theme>;
}) {
  return (
    <Tr sx={sx}>
      <Td sx={{ fontWeight: bold ? 700 : undefined }}>{displayLabel(row)}</Td>
      <GlNum value={row.hess} bold={bold} />
      <GlNum value={row.sack} bold={bold} />
      <GlNum value={row.total} bold={bold} />
      <GlNum value={row.to_date} bold={bold} />
      <GlNum value={row.prev_hess} bold={bold} />
      <GlNum value={row.prev_sack} bold={bold} />
      <GlNum value={row.prev_total} bold={bold} />
    </Tr>
  );
}

/** Full-width section band ("A) INPUT", "B) OUTPUT"). */
function SectionRow({ label }: { label: string }) {
  return (
    <Tr>
      <Td colSpan={COLS} sx={{ fontWeight: 700, bgcolor: "action.hover" }}>
        {label}
      </Td>
    </Tr>
  );
}

/** Quality-group subhead ("HESSIAN (Quality Wise)"). */
function SubheadRow({ label }: { label: string }) {
  return (
    <Tr>
      <Td colSpan={COLS} sx={{ fontStyle: "italic", color: "text.secondary" }}>
        {label}
      </Td>
    </Tr>
  );
}

/** Percentage cell of the GAIN/LOSS % row: 2 decimals, null → em-dash. */
function PctCell({ value }: { value: number | null }) {
  const neg = value !== null && value < 0;
  return (
    <Td align="right" sx={{ fontWeight: 700, color: neg ? "error.main" : undefined }}>
      {value === null ? "—" : `${fmt(value, 2)}%`}
    </Td>
  );
}

function PctRow({ row }: { row: GlPctRow }) {
  return (
    <Tr>
      <Td sx={{ fontWeight: 700 }}>{row.label}</Td>
      <PctCell value={row.hess} />
      <PctCell value={row.sack} />
      <PctCell value={row.total} />
      <PctCell value={row.to_date} />
      <PctCell value={row.prev_hess} />
      <PctCell value={row.prev_sack} />
      <PctCell value={row.prev_total} />
    </Tr>
  );
}

/**
 * INPUT rows in the mill sheet's order: first figure row, then the opening
 * process stock; the closing process stock slots in right before the first
 * "Less :-" (sign −1) row — or at the end when there is none.
 */
function buildInputRows(input: GlStatement["input"]): GlReportRow[] {
  const { rows, opening_ps: openingPs, closing_ps: closingPs } = input;
  if (rows.length === 0) return [openingPs, closingPs];
  const rest = rows.slice(1);
  const lessIdx = rest.findIndex((r) => r.sign === -1);
  return lessIdx === -1
    ? [rows[0], openingPs, ...rest, closingPs]
    : [rows[0], openingPs, ...rest.slice(0, lessIdx), closingPs, ...rest.slice(lessIdx)];
}

/** Subtle wash behind the GAIN/LOSS row — success when positive, error when negative. */
function gainLossTint(total: number): SxProps<Theme> | undefined {
  if (total < 0) return { bgcolor: (t: Theme) => alpha(t.palette.error.light, 0.18) };
  if (total > 0) return { bgcolor: (t: Theme) => alpha(t.palette.success.light, 0.18) };
  return undefined;
}

function ProcessStockRow({
  row,
  bold,
  sx,
}: {
  row: Omit<GlProcessStockReportRow, "dept_code" | "opening_mismatch"> &
    Partial<Pick<GlProcessStockReportRow, "opening_mismatch">>;
  bold?: boolean;
  sx?: SxProps<Theme>;
}) {
  return (
    <Tr sx={sx}>
      <Td sx={{ fontWeight: bold ? 700 : undefined }}>
        {row.label}
        {row.opening_mismatch ? (
          <Tooltip title="Opening differs from previous month's closing">
            <Box
              component="span"
              sx={{
                color: "warning.main",
                ml: 0.5,
                display: "inline-flex",
                verticalAlign: "text-bottom",
              }}
            >
              <TriangleAlert size={14} aria-label="Opening mismatch" />
            </Box>
          </Tooltip>
        ) : null}
      </Td>
      <GlNum value={row.hess} bold={bold} />
      <GlNum value={row.sack} bold={bold} />
      <GlNum value={row.total} bold={bold} />
      <GlNum value={row.prev_hess} bold={bold} />
      <GlNum value={row.prev_sack} bold={bold} />
      <GlNum value={row.prev_total} bold={bold} />
      <GlNum value={row.diff} bold={bold} />
    </Tr>
  );
}

export interface GlStatementViewProps {
  statement: GlStatement;
  /** Long heading month, e.g. "JANUARY 2026". */
  monthLong: string;
  /** Current-month column band label, e.g. "JAN '26". */
  monthShort: string;
  /** Previous-month column band label, e.g. "DEC '25". */
  prevShort: string;
}

export function GlStatementView({
  statement,
  monthLong,
  monthShort,
  prevShort,
}: GlStatementViewProps) {
  const { input, output } = statement;
  const inputRows = buildInputRows(input);

  return (
    <Box>
      {/* Title block — the printed sheet's letterhead */}
      <Box sx={{ textAlign: "center", mb: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {statement.title}
        </Typography>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          FOR THE MONTH OF {monthLong}
        </Typography>
      </Box>

      <SectionCard title="Gain / Loss Statement">
        <DprTable
          head={
            <>
              <Tr>
                <Td rowSpan={2}>PARTICULARS</Td>
                <Td colSpan={3} align="center">
                  {monthShort}
                </Td>
                <Td rowSpan={2} align="right">
                  TO-DATE
                </Td>
                <Td colSpan={3} align="center">
                  {prevShort}
                </Td>
              </Tr>
              <Tr>
                <Td align="right">Hess</Td>
                <Td align="right">Sack</Td>
                <Td align="right">TOTAL</Td>
                <Td align="right">Hess</Td>
                <Td align="right">Sack</Td>
                <Td align="right">TOTAL</Td>
              </Tr>
            </>
          }
        >
          {/* ------------------------- A) INPUT ------------------------- */}
          <SectionRow label="A) INPUT" />
          {inputRows.map((r, i) => (
            <FigureRow key={`in-${i}`} row={r} />
          ))}
          <FigureRow row={input.net_consumed} bold sx={totalRowSx()} />

          {/* ------------------------- B) OUTPUT ------------------------ */}
          <SectionRow label="B) OUTPUT" />
          {output.hessian_rows.length > 0 ? (
            <>
              <SubheadRow label="HESSIAN (Quality Wise)" />
              {output.hessian_rows.map((r, i) => (
                <FigureRow key={`hess-${i}`} row={r} />
              ))}
              <FigureRow row={output.hessian_total} bold />
            </>
          ) : null}
          {output.sacking_rows.length > 0 ? (
            <>
              <SubheadRow label="SACKING (Quality Wise)" />
              {output.sacking_rows.map((r, i) => (
                <FigureRow key={`sack-${i}`} row={r} />
              ))}
              <FigureRow row={output.sacking_total} bold />
            </>
          ) : null}
          <FigureRow row={output.sub_total} bold sx={totalRowSx()} />
          {output.misc_rows.map((r, i) => (
            <FigureRow key={`misc-${i}`} row={r} />
          ))}
          <FigureRow row={output.total_output} bold sx={totalRowSx()} />

          {/* ------------------------- GAIN / LOSS ---------------------- */}
          <FigureRow
            row={statement.gain_loss}
            bold
            sx={gainLossTint(statement.gain_loss.total)}
          />
          <PctRow row={statement.gain_loss_pct} />
        </DprTable>
      </SectionCard>

      {/* ------------------------- PROCESS STOCK ---------------------- */}
      <Box sx={{ mt: 2 }}>
        <SectionCard title="Process Stock" subtitle="Department-wise closing process stock">
          <DprTable
            head={
              <>
                <Tr>
                  <Td rowSpan={2}>DEPARTMENT</Td>
                  <Td colSpan={3} align="center">
                    {monthShort}
                  </Td>
                  <Td colSpan={3} align="center">
                    {prevShort}
                  </Td>
                  <Td rowSpan={2} align="right">
                    DIFF
                  </Td>
                </Tr>
                <Tr>
                  <Td align="right">Hess</Td>
                  <Td align="right">Sack</Td>
                  <Td align="right">Total</Td>
                  <Td align="right">Hess</Td>
                  <Td align="right">Sack</Td>
                  <Td align="right">Total</Td>
                </Tr>
              </>
            }
          >
            {statement.process_stock.rows.map((r) => (
              <ProcessStockRow key={r.dept_code} row={r} />
            ))}
            <ProcessStockRow row={statement.process_stock.total} bold sx={totalRowSx()} />
          </DprTable>
        </SectionCard>
      </Box>
    </Box>
  );
}
