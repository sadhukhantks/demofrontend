"use client";

/**
 * Phone-first frame cards — one card per frame row, sorted worst-first, with a
 * red / amber / green status edge. Replaces the summary / pivot DataGrid on
 * small screens where a wide grid is unreadable on the floor.
 */

import React from "react";
import { Box, Chip, Paper, Typography } from "@mui/material";
import { perfRank, type PerfStatus } from "../perf";

export interface FrameCardItem {
  key: string;
  frame: string;
  quality: string;
  spell?: string | null;
  status: PerfStatus;
  /** value / peer median, for the "% of peers" line. */
  wtPct: number | null;
  doffPct?: number | null;
  avgWt: number | null;
  wtMedian: number | null;
  doffs?: number | null;
  doffMedian?: number | null;
  netWt?: number | null;
}

const EDGE: Record<PerfStatus, string> = {
  low: "#d32f2f",
  watch: "#ed6c02",
  ok: "#2e7d32",
};
const TINT: Record<PerfStatus, string> = {
  low: "#fdecea",
  watch: "#fff8e1",
  ok: "#ffffff",
};
const LABEL: Record<PerfStatus, string> = { low: "LOW", watch: "WATCH", ok: "OK" };

function fmt(v: number | null | undefined): string {
  return v == null ? "—" : v.toFixed(2);
}

/** The metric that dragged the frame down — what the badge % must speak about. */
function worstPct(c: FrameCardItem): number | null {
  const live = [c.wtPct, c.doffPct].filter((p): p is number => p != null);
  return live.length ? Math.min(...live) : null;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ minWidth: 72 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {value}
      </Typography>
    </Box>
  );
}

export default function FrameCards({
  items,
  onTap,
}: {
  items: FrameCardItem[];
  onTap?: (frame: string) => void;
}) {
  const sorted = [...items].sort(
    (a, b) =>
      perfRank(a.status) - perfRank(b.status) ||
      (worstPct(a) ?? 1) - (worstPct(b) ?? 1),
  );
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {sorted.map((c) => (
        <Paper
          key={c.key}
          variant="outlined"
          onClick={onTap ? () => onTap(c.frame) : undefined}
          sx={{
            display: "flex",
            overflow: "hidden",
            bgcolor: TINT[c.status],
            cursor: onTap ? "pointer" : undefined,
          }}
        >
          <Box sx={{ width: 5, flexShrink: 0, bgcolor: EDGE[c.status] }} />
          <Box sx={{ p: 1.25, flexGrow: 1, minWidth: 0 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                Frame {c.frame}
              </Typography>
              {c.spell ? <Chip label={`Spell ${c.spell}`} size="small" /> : null}
              <Box sx={{ flexGrow: 1 }} />
              <Typography
                variant="caption"
                sx={{ fontWeight: 700, color: EDGE[c.status] }}
              >
                {LABEL[c.status]}
                {c.status !== "ok" && worstPct(c) != null
                  ? ` · ${Math.round((worstPct(c) as number) * 100)}% of peers`
                  : ""}
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary" noWrap component="p">
              {c.quality}
            </Typography>
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mt: 0.5 }}>
              <Metric label="Avg doff" value={`${fmt(c.avgWt)} kg`} />
              <Metric label="Peers avg" value={`${fmt(c.wtMedian)} kg`} />
              {c.doffs != null ? (
                <Metric
                  label="Doffs"
                  value={`${c.doffs}${c.doffMedian != null ? ` / ${c.doffMedian}` : ""}`}
                />
              ) : null}
              {c.netWt != null ? <Metric label="Net" value={`${fmt(c.netWt)} kg`} /> : null}
            </Box>
          </Box>
        </Paper>
      ))}
    </Box>
  );
}
