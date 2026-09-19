"use client";

/**
 * One quality's block of the Daily Bale Sheet: header (item, Hessian/Sacking,
 * std bale wt, packsheet), the bale rows, and the block footer (PROD / REPACK
 * counts, Σ gross, Σ net, avg net over PROD rows, deviation % vs the standard
 * tinted heavy / light). REPACK rows sit in the same block, flagged, with the
 * Original Bale No column filled (spec D2).
 * Dumb component — everything arrives via props.
 */

import React from "react";
import { Box, Chip, Paper, Stack, Typography } from "@mui/material";
import {
  DprTable,
  Td,
  Tr,
  totalRowSx,
} from "../../dailyProductionReport/_components/DprPieces";
import { classifyDeviation, deviationSx } from "../../baleHeavyLight/heavyLightUtils";
import type { DailySheetBlock } from "../types";
import {
  entryTypeLabel,
  fmtKg,
  fmtSignedPct,
  fmtWeighTime,
  qualityTypeLabel,
} from "../dailySheetUtils";

export interface BaleSheetBlockProps {
  block: DailySheetBlock;
}

/** Deviation vs standard as a tinted pill: "+2.08 % Heavy" / "-0.59 % Light". */
function DeviationPill({ value }: { value: number | null }) {
  if (value === null || value === undefined) return <span>—</span>;
  const kind = classifyDeviation(value);
  const word = kind === "heavy" ? "Heavy" : kind === "light" ? "Light" : "On std";
  return (
    <Box component="span" sx={deviationSx(kind)}>
      {fmtSignedPct(value)} % {word}
    </Box>
  );
}

export default function BaleSheetBlock({ block }: BaleSheetBlockProps) {
  const typeLabel = qualityTypeLabel(block.quality_type);
  return (
    <Paper variant="outlined" sx={{ p: 1.5, breakInside: "avoid" }}>
      <Stack
        direction="row"
        spacing={1}
        useFlexGap
        flexWrap="wrap"
        alignItems="center"
        sx={{ mb: 0.75 }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 700, flexGrow: 1 }}>
          {block.item_name}
        </Typography>
        {typeLabel ? <Chip size="small" label={typeLabel} variant="outlined" /> : null}
        <Chip
          size="small"
          variant="outlined"
          label={`Std ${block.std_bale_wt === null ? "—" : fmtKg(block.std_bale_wt)} kg`}
        />
        <Chip
          size="small"
          variant="outlined"
          label={`Packsheet ${block.packsheet_wt === null ? "—" : fmtKg(block.packsheet_wt)} kg`}
        />
      </Stack>

      <DprTable
        head={
          <Tr>
            <Td align="right">SL</Td>
            <Td>Type</Td>
            <Td>Series</Td>
            <Td align="right">Bale No</Td>
            <Td align="right">Orig. Bale No</Td>
            <Td>Spell</Td>
            <Td align="right">Gross (kg)</Td>
            <Td>Trolley</Td>
            <Td align="right">Net (kg)</Td>
            <Td>Time</Td>
          </Tr>
        }
      >
        {block.rows.map((r) => {
          const repack = r.entry_type === "REPACK";
          return (
            <Tr key={`${r.sl_no}:${r.bale_no}:${r.weigh_time}`}>
              <Td align="right">{r.sl_no}</Td>
              <Td>
                {repack ? (
                  <Chip
                    size="small"
                    color="warning"
                    variant="outlined"
                    label={entryTypeLabel(r.entry_type)}
                    title={`Re-pressed bale ${r.original_bale_no ?? ""}`}
                  />
                ) : (
                  entryTypeLabel(r.entry_type)
                )}
              </Td>
              <Td>{r.series_name}</Td>
              <Td align="right">{r.bale_no}</Td>
              <Td align="right" sx={{ fontWeight: repack ? 600 : undefined }}>
                {r.original_bale_no ?? ""}
              </Td>
              <Td>{r.spell_code ?? ""}</Td>
              <Td align="right">{fmtKg(r.gross_wt)}</Td>
              <Td>{r.trolly_name ?? ""}</Td>
              <Td align="right">{fmtKg(r.net_wt)}</Td>
              <Td>{fmtWeighTime(r.weigh_time)}</Td>
            </Tr>
          );
        })}
        <Tr sx={totalRowSx()}>
          <Td colSpan={6}>
            Total — PROD {block.prod_bales} bale{block.prod_bales === 1 ? "" : "s"} · REPACK{" "}
            {block.repack_bales} bale{block.repack_bales === 1 ? "" : "s"}
          </Td>
          <Td align="right">{fmtKg(block.total_gross)}</Td>
          <Td />
          <Td align="right">{fmtKg(block.total_net)}</Td>
          <Td />
        </Tr>
        <Tr>
          <Td colSpan={8} sx={{ color: "text.secondary" }}>
            Avg net (PROD) vs std {block.std_bale_wt === null ? "—" : fmtKg(block.std_bale_wt)} kg
          </Td>
          <Td align="right" sx={{ fontWeight: 600 }}>
            {block.avg_net === null ? "—" : fmtKg(block.avg_net)}
          </Td>
          <Td>
            <DeviationPill value={block.dev_pct} />
          </Td>
        </Tr>
      </DprTable>
    </Paper>
  );
}
