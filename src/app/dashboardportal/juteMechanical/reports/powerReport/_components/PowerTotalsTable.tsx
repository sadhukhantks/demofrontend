"use client";

/**
 * Range | MTD | Std (30-day median) for every figure of the report — the
 * table twin of the KPI strip and the chart, and the same rows the print-out
 * carries. Em dash for a value that cannot be formed (no keyed day, no
 * tonnes, no median).
 */

import React from "react";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import type { MechPowerReport } from "@/utils/juteMechanicalService";
import { fmt, SectionCard } from "@/app/dashboardportal/juteProduction/report/dailyProductionReport/_components/DprPieces";
import { totalsRows } from "../powerReportColumns";

export default function PowerTotalsTable({ data }: { data: MechPowerReport }) {
  const rows = React.useMemo(() => totalsRows(data), [data]);
  const { totals, mtd, std } = data;
  return (
    <SectionCard
      title="Totals"
      subtitle={`Range ${totals.days_keyed} of ${totals.days} days keyed · MTD ${mtd.days_keyed} of ${mtd.days} · std = ${std.basis || "30-day median"} over ${std.days_used} keyed days`}
    >
      <TableContainer sx={{ overflowX: "auto" }}>
        <Table
          size="small"
          sx={{
            maxWidth: 560,
            "& th": { fontWeight: 700, whiteSpace: "nowrap", bgcolor: "action.hover", py: 0.5 },
            "& td": { py: 0.4, whiteSpace: "nowrap" },
            "& .num": { textAlign: "right", fontVariantNumeric: "tabular-nums" },
          }}
        >
          <TableHead>
            <TableRow>
              <TableCell />
              <TableCell className="num">Range</TableCell>
              <TableCell className="num">MTD</TableCell>
              <TableCell className="num">Std (30-day median)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.label}>
                <TableCell>{r.label}</TableCell>
                <TableCell className="num">{fmt(r.range, r.decimals)}</TableCell>
                <TableCell className="num">{fmt(r.mtd, r.decimals)}</TableCell>
                <TableCell className="num">{fmt(r.std, r.decimals)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.75 }}>
        Range / MTD kWh per tonne = kWh of the keyed days ÷ tonnes of those same days, so the ratio
        reconciles with the kWh shown.
      </Typography>
    </SectionCard>
  );
}
