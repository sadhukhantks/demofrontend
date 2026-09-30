"use client";

/**
 * Print-only rendering of the Bale Heavy/Light report: a plain table with the
 * exact sheet columns, because the on-screen DataGrid is virtualized and does
 * not print past the viewport. Hidden on screen (`displayPrint`), made the only
 * visible thing under `@media print` by the page's GlobalStyles.
 * Dumb component — rows arrive already flattened from the page.
 */

import React from "react";
import { Box, Typography } from "@mui/material";
import {
  DprTable,
  Td,
  Tr,
  fmt,
  totalRowSx,
} from "../../dailyProductionReport/_components/DprPieces";
import type { HeavyLightGridRow } from "../types";
import { classifyDeviation, deviationSx, fmtSignedPct } from "../heavyLightUtils";

export interface HeavyLightPrintSheetProps {
  rows: HeavyLightGridRow[];
  companyName: string | null;
  branchName: string | null;
  dateFrom: string;
  dateTo: string;
  notes: string[];
}

function PctTd({ value, bold }: { value: number | null; bold?: boolean }) {
  const kind = classifyDeviation(value);
  return (
    <Td align="right" sx={{ fontWeight: bold ? 700 : undefined }}>
      <Box component="span" sx={deviationSx(kind)}>
        {fmtSignedPct(value)}
      </Box>
    </Td>
  );
}

function NumTd({
  value,
  digits = 2,
  bold,
}: {
  value: number | null;
  digits?: number;
  bold?: boolean;
}) {
  return (
    <Td align="right" sx={{ fontWeight: bold ? 700 : undefined }}>
      {value === null ? "" : fmt(value, digits)}
    </Td>
  );
}

export default function HeavyLightPrintSheet({
  rows,
  companyName,
  branchName,
  dateFrom,
  dateTo,
  notes,
}: HeavyLightPrintSheetProps) {
  const period = dateFrom === dateTo ? dateFrom : `${dateFrom} To ${dateTo}`;
  return (
    <Box className="bhl-print-root" sx={{ display: "none", displayPrint: "block" }}>
      <Box sx={{ mb: 1, textAlign: "center" }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {companyName ?? ""} — Bale Heavy / Light
        </Typography>
        <Typography variant="caption">
          {branchName ?? ""} · {period}
        </Typography>
      </Box>
      <DprTable
        head={
          <Tr>
            <Td>Quality</Td>
            <Td>Type</Td>
            <Td align="right">No of Bales</Td>
            <Td align="right">Weft (lbs)</Td>
            <Td align="right">Avg MR %</Td>
            <Td>MR source</Td>
            <Td align="right">Std Wt (kg)</Td>
            <Td align="right">Obs kg/bale</Td>
            <Td align="right">Corr kg/bale</Td>
            <Td align="right">Obs %</Td>
            <Td align="right">Corr %</Td>
            <Td align="right">Total Std</Td>
            <Td align="right">Total Obs</Td>
            <Td align="right">Total Corr</Td>
          </Tr>
        }
      >
        {rows.map((r) => {
          const bold = r.__kind === "group";
          return (
            <Tr key={r.__id} sx={bold ? totalRowSx() : undefined}>
              <Td sx={{ "&&": { whiteSpace: "normal" } }}>{r.quality}</Td>
              <Td>{r.type}</Td>
              <NumTd value={r.bales} digits={0} bold={bold} />
              <NumTd value={r.weft_count} digits={0} bold={bold} />
              <NumTd value={r.avg_mr} bold={bold} />
              <Td>{r.mr_source}</Td>
              <NumTd value={r.std_bale_wt} bold={bold} />
              <NumTd value={r.obs_per_bale} bold={bold} />
              <NumTd value={r.corr_per_bale} bold={bold} />
              <PctTd value={r.obs_pct} bold={bold} />
              <PctTd value={r.corr_pct} bold={bold} />
              <NumTd value={r.total_std} bold={bold} />
              <NumTd value={r.total_obs} bold={bold} />
              <NumTd value={r.total_corr} bold={bold} />
            </Tr>
          );
        })}
      </DprTable>
      {notes.length > 0 ? (
        <Box component="ul" sx={{ mt: 1, pl: 2 }}>
          {notes.map((n, i) => (
            <Typography key={i} component="li" variant="caption">
              {n}
            </Typography>
          ))}
        </Box>
      ) : null}
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }}>
        Positive % = heavy (over standard), negative % = light. Corrected columns are blank
        where no MR reading exists for the quality or its group.
      </Typography>
    </Box>
  );
}
