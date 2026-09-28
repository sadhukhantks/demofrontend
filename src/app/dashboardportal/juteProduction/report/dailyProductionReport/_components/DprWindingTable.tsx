"use client";

/**
 * Winder production table of the Daily Production Report.
 *
 * TKT-000174: twisting production sits in its OWN block after the winding
 * Total instead of among the winding rows. The mill keys ply output into the
 * winding doff entry (there is no twisting screen), so the twisted quality used
 * to appear as one more winding row with a chip, right above a Total it was not
 * part of — the position was unclear. Layout now, top to bottom:
 *
 *   winding qualities … → Total (winding alone)
 *   "Twisting Production" band → twisted qualities … → Twisting Total
 *   Gross winder output (winding + twisting)
 *
 * Twisting is NOT part of the winding Total: ply yarn is re-wound single yarn,
 * so adding it would count the same tonnage twice. The gross line is the only
 * place the two are added, and it is labelled as winder output (wage basis).
 *
 * Presentational only — page.tsx passes the section in. Same DOM on screen and
 * on print, so the printed sheet cannot drift from the page.
 */

import React from "react";
import { Typography } from "@mui/material";
import type {
  DprWindingQualityRow,
  DprWindingSection,
} from "@/utils/juteProductionReportService";
import { DprTable, NumTd, Td, Tr, fmt, totalRowSx } from "./DprPieces";

const COLUMN_COUNT = 6;

export interface DprWindingTableProps {
  winding: DprWindingSection;
}

/** Split the quality rows into the winding list and the twisting block. */
export function splitWindingRows(qualities: DprWindingQualityRow[]): {
  winding: DprWindingQualityRow[];
  twisting: DprWindingQualityRow[];
} {
  return {
    winding: qualities.filter((q) => q.is_twisted !== 1),
    twisting: qualities.filter((q) => q.is_twisted === 1),
  };
}

function QualityRow({ q }: { q: DprWindingQualityRow }) {
  return (
    <Tr>
      <Td>{q.item_name ?? q.item_code ?? "Unmapped"}</Td>
      <NumTd value={q.production_kg} digits={0} />
      <NumTd value={q.winders} digits={0} />
      <NumTd value={q.kg_per_winder} digits={1} />
      <NumTd value={q.mtd_production_kg} digits={0} />
      <NumTd value={q.mtd_kg_per_winder_shift} digits={1} />
    </Tr>
  );
}

export function DprWindingTable({ winding }: DprWindingTableProps) {
  const rows = splitWindingRows(winding.qualities);
  const total = winding.total;
  const hasTwisting = rows.twisting.length > 0;

  return (
    <>
      <DprTable
        head={
          <Tr>
            <Td>Quality</Td>
            <Td align="right">Production (kg)</Td>
            <Td align="right">Winders</Td>
            <Td align="right">Kg/Winder</Td>
            <Td align="right">MTD (kg)</Td>
            <Td align="right">MTD Kg/Winder-Shift</Td>
          </Tr>
        }
      >
        {rows.winding.map((q) => (
          <QualityRow key={q.item_id ?? "na"} q={q} />
        ))}
        <Tr sx={totalRowSx()} data-testid="dpr-winding-total">
          <Td>{hasTwisting ? "Total Winding (excl. twisting)" : "Total"}</Td>
          <NumTd value={total.production_kg} digits={0} bold />
          <NumTd value={total.winders} digits={0} bold />
          <NumTd value={total.kg_per_winder} digits={1} bold />
          <NumTd value={total.mtd_production_kg} digits={0} bold />
          <Td align="right">—</Td>
        </Tr>

        {hasTwisting ? (
          <>
            <Tr data-testid="dpr-twisting-band">
              <Td
                colSpan={COLUMN_COUNT}
                sx={{ fontWeight: 700, bgcolor: "action.hover", pt: 1 }}
              >
                Twisting Production — ply yarn, not part of the winding total
              </Td>
            </Tr>
            {rows.twisting.map((q) => (
              <QualityRow key={q.item_id ?? "na"} q={q} />
            ))}
            <Tr sx={totalRowSx()} data-testid="dpr-twisting-total">
              <Td>Total Twisting</Td>
              <NumTd value={total.twisting.production_kg} digits={0} bold />
              <NumTd value={total.twisting.winders} digits={0} bold />
              <NumTd value={total.twisting.kg_per_winder} digits={1} bold />
              <NumTd value={total.twisting.mtd_production_kg} digits={0} bold />
              <Td align="right">—</Td>
            </Tr>
            <Tr data-testid="dpr-winding-gross">
              <Td>Gross winder output (winding + twisting)</Td>
              <NumTd value={total.gross.production_kg} digits={0} />
              <NumTd value={total.gross.winders} digits={0} />
              <NumTd value={total.gross.kg_per_winder} digits={1} />
              <NumTd value={total.gross.mtd_production_kg} digits={0} />
              <Td align="right">—</Td>
            </Tr>
          </>
        ) : null}
      </DprTable>

      {winding.twisting_available === false ? (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
          Twisting is not split out on this tenant yet — the is_twisted yarn-master flag is
          missing, so any twisted (ply) yarn is still included in the winding total.
        </Typography>
      ) : hasTwisting ? (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
          Twisted (ply) yarn is single yarn that was already wound once, so its{" "}
          {fmt(total.twisting.production_kg, 0)} kg is listed separately and kept out of the
          winding total to avoid counting it twice. The gross line is what the winders
          physically turned out.
        </Typography>
      ) : null}
    </>
  );
}
