"use client";

/**
 * Despatch detail: every despatch of the range, one row per day × series ×
 * quality × (invoice or reason/ref) with the bale numbers compressed by the
 * backend ("601, 603-604"). The reference cell reads "#no · date" against an
 * invoice, or "<reason> · <ref>" for a challan / DO / transfer / sample.
 */

import React from "react";
import { Typography } from "@mui/material";
import type { BaleRegisterDespatchDetail } from "@/utils/juteProductionReportService";
import {
  DprTable,
  NumTd,
  SectionCard,
  Td,
  Tr,
  totalRowSx,
} from "../../dailyProductionReport/_components/DprPieces";
import { despatchRefLabel } from "../utils/registerShape";
import { WRAP_SX } from "./PeriodSummaryCard";

export interface DespatchDetailCardProps {
  rows: BaleRegisterDespatchDetail[];
  dateFrom: string;
  dateTo: string;
}

export default function DespatchDetailCard({
  rows,
  dateFrom,
  dateTo,
}: DespatchDetailCardProps) {
  const totalCount = rows.reduce((sum, r) => sum + r.count, 0);
  return (
    <SectionCard title="Despatch detail" subtitle={`${dateFrom} to ${dateTo}`}>
      {rows.length ? (
        <DprTable
          head={
            <Tr>
              <Td>Date</Td>
              <Td>Series</Td>
              <Td>Quality</Td>
              <Td>Bale nos</Td>
              <Td align="right">Count</Td>
              <Td>Invoice / Challan</Td>
              <Td>Party</Td>
            </Tr>
          }
        >
          {rows.map((r, i) => (
            <Tr key={`${r.date}-${r.series_name ?? ""}-${r.item_name ?? ""}-${r.invoice_id ?? r.despatch_ref ?? ""}-${i}`}>
              <Td>{r.date}</Td>
              <Td>{r.series_name ?? "—"}</Td>
              <Td sx={WRAP_SX}>{r.item_name ?? "—"}</Td>
              <Td sx={WRAP_SX}>{r.bale_nos}</Td>
              <NumTd value={r.count} digits={0} />
              <Td sx={WRAP_SX}>
                {despatchRefLabel(r)}
                {r.remarks ? (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block" }}
                  >
                    {r.remarks}
                  </Typography>
                ) : null}
              </Td>
              <Td sx={WRAP_SX}>{r.party_name ?? "—"}</Td>
            </Tr>
          ))}
          <Tr sx={totalRowSx()}>
            <Td colSpan={4}>Total</Td>
            <NumTd value={totalCount} digits={0} bold />
            <Td colSpan={2} />
          </Tr>
        </DprTable>
      ) : (
        <Typography variant="body2" color="text.secondary">
          No despatch in this range.
        </Typography>
      )}
    </SectionCard>
  );
}
