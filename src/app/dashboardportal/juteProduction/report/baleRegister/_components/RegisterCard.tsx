"use client";

/**
 * One register card: a quality (or series · quality) with its day-by-day
 * Opening · Pressed · Repacked out · Desp. (Invoice) · Desp. (Challan) ·
 * Closing rows, a bold Period row and the closing stock caption. Dumb — every
 * figure comes from the backend's `BaleRegisterGroup`.
 */

import React from "react";
import { Typography } from "@mui/material";
import type {
  BaleRegisterGroup,
  BaleRegisterGroupBy,
} from "@/utils/juteProductionReportService";
import {
  DprTable,
  NumTd,
  SectionCard,
  Td,
  Tr,
  fmt,
  totalRowSx,
} from "../../dailyProductionReport/_components/DprPieces";
import { groupLabel, isIdleDay } from "../utils/registerShape";

/** Days with no movement stay in the register (it lists every calendar day)
 * but step back visually so the active days read first. */
const IDLE_ROW_SX = { "& td": { color: "text.secondary" } } as const;

export interface RegisterCardProps {
  group: BaleRegisterGroup;
  groupBy: BaleRegisterGroupBy;
  dateFrom: string;
  dateTo: string;
}

export default function RegisterCard({
  group,
  groupBy,
  dateFrom,
  dateTo,
}: RegisterCardProps) {
  const p = group.period;
  return (
    <SectionCard
      title={groupLabel(group, groupBy)}
      subtitle={`${dateFrom} to ${dateTo}`}
    >
      <DprTable
        head={
          <Tr>
            <Td>Date</Td>
            <Td align="right">Opening</Td>
            <Td align="right">Pressed</Td>
            <Td align="right">Repacked out</Td>
            <Td align="right">Desp. (Invoice)</Td>
            <Td align="right">Desp. (Challan)</Td>
            <Td align="right">Closing</Td>
          </Tr>
        }
      >
        {group.days.map((d) => (
          <Tr key={d.date} sx={isIdleDay(d) ? IDLE_ROW_SX : undefined}>
            <Td>{d.date}</Td>
            <NumTd value={d.opening} digits={0} />
            <NumTd value={d.pressed} digits={0} />
            <NumTd value={d.repacked_out} digits={0} />
            <NumTd value={d.despatched_invoice} digits={0} />
            <NumTd value={d.despatched_no_invoice} digits={0} />
            <NumTd value={d.closing} digits={0} />
          </Tr>
        ))}
        <Tr sx={totalRowSx()}>
          <Td>Period</Td>
          <NumTd value={p.opening} digits={0} bold />
          <NumTd value={p.pressed} digits={0} bold />
          <NumTd value={p.repacked_out} digits={0} bold />
          <NumTd value={p.despatched_invoice} digits={0} bold />
          <NumTd value={p.despatched_no_invoice} digits={0} bold />
          <NumTd value={p.closing} digits={0} bold />
        </Tr>
      </DprTable>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", mt: 0.75 }}
      >
        Closing: {fmt(p.closing, 0)} bales · {fmt(p.closing_mt, 3)} MT
      </Typography>
    </SectionCard>
  );
}
