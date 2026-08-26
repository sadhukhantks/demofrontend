"use client";

/**
 * Quick filter chips — spell / quality / frame values derived from the loaded
 * data, plus a "Low only" toggle. Pure client-side: tapping a chip filters the
 * sections instantly, no refetch (floor Wi-Fi friendly). Empty selection on a
 * dimension = that dimension unfiltered.
 */

import React from "react";
import { Box, Chip, Typography } from "@mui/material";
import { emptySel, selActive, type FilterSel } from "../perf";

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function ChipRow({
  label,
  values,
  selected,
  onToggle,
}: {
  label: string;
  values: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  if (values.length < 2) return null; // one value = nothing to filter
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ width: 52, flexShrink: 0, fontWeight: 600 }}
      >
        {label}
      </Typography>
      {/* One scrollable strip — 50 frame chips stay one thumb-swipe, not a wall. */}
      <Box
        sx={{
          display: "flex",
          gap: 0.75,
          overflowX: "auto",
          flexWrap: { xs: "nowrap", md: "wrap" },
          py: 0.25,
          minWidth: 0,
        }}
      >
        {values.map((v) => (
          <Chip
            key={v}
            label={v}
            size="small"
            color={selected.includes(v) ? "primary" : "default"}
            variant={selected.includes(v) ? "filled" : "outlined"}
            onClick={() => onToggle(v)}
            sx={{ flexShrink: 0 }}
          />
        ))}
      </Box>
    </Box>
  );
}

export default function QuickFilters({
  spells,
  qualities,
  frames,
  sel,
  onChange,
}: {
  spells?: string[];
  qualities?: string[];
  frames?: string[];
  sel: FilterSel;
  onChange: (sel: FilterSel) => void;
}) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, mb: 1.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
        <Chip
          label="Low performers only"
          size="small"
          color={sel.lowOnly ? "error" : "default"}
          variant={sel.lowOnly ? "filled" : "outlined"}
          onClick={() => onChange({ ...sel, lowOnly: !sel.lowOnly })}
        />
        {selActive(sel) ? (
          <Chip label="Clear filters" size="small" onDelete={() => onChange(emptySel())} onClick={() => onChange(emptySel())} />
        ) : null}
      </Box>
      {spells ? (
        <ChipRow
          label="Spell"
          values={spells}
          selected={sel.spells}
          onToggle={(v) => onChange({ ...sel, spells: toggle(sel.spells, v) })}
        />
      ) : null}
      {qualities ? (
        <ChipRow
          label="Quality"
          values={qualities}
          selected={sel.qualities}
          onToggle={(v) => onChange({ ...sel, qualities: toggle(sel.qualities, v) })}
        />
      ) : null}
      {frames ? (
        <ChipRow
          label="Frame"
          values={frames}
          selected={sel.frames}
          onToggle={(v) => onChange({ ...sel, frames: toggle(sel.frames, v) })}
        />
      ) : null}
    </Box>
  );
}
