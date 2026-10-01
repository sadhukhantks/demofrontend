"use client";

/**
 * Section A: the chain header — one line per stage (seq, kind, dates, title,
 * looms "5 of 12", done by, control used), the window line, and the
 * data-source note. Plain text so it reads on a phone and prints.
 */

import React from "react";
import { Box, Chip, Stack, Typography } from "@mui/material";
import type { ImpactChain, ImpactMeta, ImpactWindows } from "../_service";
import { doneByLabel, fmtDate, fmtLooms, windowLine } from "../impactRows";

export interface ChainHeaderProps {
  chain: ImpactChain | null;
  windows: ImpactWindows | null;
  meta: ImpactMeta | null;
}

export default function ChainHeader({ chain, windows, meta }: ChainHeaderProps) {
  if (!chain) return null;
  return (
    <Box data-testid="chain-header" sx={{ mb: 1.5 }}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {chain.title}
        </Typography>
        {chain.loom_group ? (
          <Chip size="small" label={`${chain.loom_group.group_code} · ${chain.loom_group.group_name}`} />
        ) : null}
      </Stack>
      <Box component="ul" sx={{ m: 0, pl: 2.5, mt: 0.5 }}>
        {chain.stages.map((s) => (
          <Typography component="li" variant="body2" key={s.modification_id}>
            <strong>
              {s.seq}. {s.mod_kind_label || s.mod_kind}
            </strong>{" "}
            {fmtDate(s.mod_date)}
            {s.mod_to_date && s.mod_to_date !== s.mod_date ? `..${fmtDate(s.mod_to_date)}` : ""} ·{" "}
            {s.title} · {fmtLooms(s.loom_count, s.root_loom_count)} looms
            {s.mod_category_label ? ` · ${s.mod_category_label}` : ""}
            {s.done_by ? ` · ${doneByLabel(s.done_by, s.done_by_label)}` : ""}
            {s.settle_days != null ? ` · settle ${s.settle_days} d` : ""}
            {s.control_description ? ` · control: ${s.control_description}` : ""}
          </Typography>
        ))}
      </Box>
      {windows ? (
        <Typography variant="body2" sx={{ mt: 0.5 }} data-testid="window-line">
          <strong>Windows:</strong> {windowLine(windows)}
          {windows.last_data_date ? ` · last data ${fmtDate(windows.last_data_date)}` : ""}
        </Typography>
      ) : null}
      {meta?.control ? (
        <Typography variant="body2" color="text.secondary">
          <strong>Control:</strong> {meta.control.description ?? meta.control.mode}
          {meta.control.looms_n != null ? ` (${meta.control.looms_n} looms)` : ""}
        </Typography>
      ) : null}
      {meta?.source ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
          {meta.source}
        </Typography>
      ) : null}
    </Box>
  );
}
