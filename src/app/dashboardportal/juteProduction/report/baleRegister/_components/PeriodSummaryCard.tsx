"use client";

/**
 * Period summary across the register's groups: one row per quality (or
 * series · quality) with the period figures, then the Hessian / Sacking totals
 * (only for the types that have a group) and the All row. Closing MT is the
 * Σ net weight of the closing stock at 3 dp.
 */

import React from "react";
import type {
  BaleRegisterPeriod,
  BaleRegisterReport,
} from "@/utils/juteProductionReportService";
import {
  DprTable,
  NumTd,
  SectionCard,
  Td,
  Tr,
  totalRowSx,
} from "../../dailyProductionReport/_components/DprPieces";
import {
  QUALITY_TYPE_HESSIAN,
  QUALITY_TYPE_SACKING,
  groupLabel,
} from "../utils/registerShape";

/**
 * Quality names run to ~120 characters on the real masters. DprTable keeps
 * every cell on one line so the numeric columns would scroll off the card; the
 * name cell is the one place wrapping is right. `&&` doubles the class so this
 * outranks the table-level `& td { white-space: nowrap }` rule.
 */
export const WRAP_SX = { "&&": { whiteSpace: "normal", minWidth: 200 } } as const;

function PeriodCells({ p, bold }: { p: BaleRegisterPeriod; bold?: boolean }) {
  return (
    <>
      <NumTd value={p.opening} digits={0} bold={bold} />
      <NumTd value={p.pressed} digits={0} bold={bold} />
      <NumTd value={p.repacked_out} digits={0} bold={bold} />
      <NumTd value={p.despatched} digits={0} bold={bold} />
      <NumTd value={p.closing} digits={0} bold={bold} />
      <NumTd value={p.closing_mt} digits={3} bold={bold} />
    </>
  );
}

export interface PeriodSummaryCardProps {
  report: BaleRegisterReport;
}

export default function PeriodSummaryCard({ report }: PeriodSummaryCardProps) {
  const hasHessian = report.groups.some((g) => g.quality_type === QUALITY_TYPE_HESSIAN);
  const hasSacking = report.groups.some((g) => g.quality_type === QUALITY_TYPE_SACKING);
  const groupHead = report.group_by === "series" ? "Series · Quality" : "Quality";
  return (
    <SectionCard
      title="Period summary"
      subtitle={`${report.date_from} to ${report.date_to}`}
    >
      <DprTable
        head={
          <Tr>
            <Td>{groupHead}</Td>
            <Td align="right">Opening</Td>
            <Td align="right">Pressed</Td>
            <Td align="right">Repacked out</Td>
            <Td align="right">Despatched</Td>
            <Td align="right">Closing</Td>
            <Td align="right">Closing MT</Td>
          </Tr>
        }
      >
        {report.groups.map((g) => (
          <Tr key={g.key}>
            <Td sx={WRAP_SX}>{groupLabel(g, report.group_by)}</Td>
            <PeriodCells p={g.period} />
          </Tr>
        ))}
        {hasHessian ? (
          <Tr sx={totalRowSx()}>
            <Td>Hessian</Td>
            <PeriodCells p={report.totals.hessian} bold />
          </Tr>
        ) : null}
        {hasSacking ? (
          <Tr sx={totalRowSx()}>
            <Td>Sacking</Td>
            <PeriodCells p={report.totals.sacking} bold />
          </Tr>
        ) : null}
        <Tr sx={totalRowSx()}>
          <Td>All</Td>
          <PeriodCells p={report.totals.all} bold />
        </Tr>
      </DprTable>
    </SectionCard>
  );
}
