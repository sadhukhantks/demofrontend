"use client";

/**
 * The hand-off from "this frame needs attention" to the reports that hold the
 * detail: a small dialog (bottom sheet on phones) with the frame's figures
 * for the period, the reasons it was flagged, and the drill-down links —
 * Doff Analysis (day x shift weights and the doff events per spinner),
 * Spinning Low Producer (spinner efficiency on the frame) and, for a single
 * frame-shift, that day's doff details. "Focus this report" sets the global
 * frame filter instead of leaving the page.
 */

import React from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useRouter } from "next/navigation";
import type { AttentionRow, TrendFrameRow } from "../_service";
import {
  DOFF_ANALYSIS_CAP_DAYS,
  doffAnalysisDayUrl,
  doffAnalysisFrameUrl,
  lowProducerUrl,
  type DrillScope,
} from "../drillLinks";
import { fmtKg, longDate } from "../trendRows";

export interface FrameContext {
  frame: string;
  /** Set when the tap came from one frame-shift row. */
  date?: string | null;
  shift?: string | null;
}

const STATUS_LABEL: Record<string, string> = { low: "LOW", watch: "WATCH", ok: "OK" };
const STATUS_COLOR: Record<string, "error" | "warning" | "success"> = {
  low: "error",
  watch: "warning",
  ok: "success",
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ minWidth: 110 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {value}
      </Typography>
    </Box>
  );
}

export default function FrameDrillDialog({
  context,
  frame,
  attention,
  scope,
  onClose,
  onFocusFrame,
}: {
  context: FrameContext | null;
  /** The frame's period row (null when the frame is not in the loaded data). */
  frame: TrendFrameRow | null;
  attention: AttentionRow | null;
  scope: DrillScope;
  onClose: () => void;
  onFocusFrame: (frame: string) => void;
}) {
  const router = useRouter();
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down("sm"), { noSsr: true });
  const open = context != null;
  const name = context?.frame ?? "";

  const frameLink = doffAnalysisFrameUrl(scope, name);
  const lowLink = lowProducerUrl(scope, name);
  const dayLow = context?.date ? lowProducerUrl(scope, name, { date: context.date, shift: context.shift }) : null;

  const go = (url: string) => {
    onClose();
    router.push(url);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      slotProps={{
        paper: isPhone
          ? { sx: { position: "fixed", bottom: 0, m: 0, width: "100%", borderRadius: "12px 12px 0 0" } }
          : undefined,
      }}
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pb: 1 }}>
        Frame {name}
        {frame?.status ? (
          <Chip size="small" label={STATUS_LABEL[frame.status]} color={STATUS_COLOR[frame.status]} variant="outlined" />
        ) : null}
        {context?.date ? (
          <Typography variant="body2" color="text.secondary">
            {longDate(context.date)}
            {context.shift ? ` · shift ${context.shift}` : ""}
          </Typography>
        ) : null}
      </DialogTitle>
      <DialogContent sx={{ pt: 0 }}>
        {frame ? (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, mb: 1.5 }}>
            <Stat label="Kg / frame-shift" value={fmtKg(frame.kg_per_frame_shift, 1)} />
            <Stat label="Expected (its qualities)" value={fmtKg(frame.expected_kg_per_frame_shift, 1)} />
            <Stat label="vs peers" value={frame.vs_peers_pct == null ? "—" : `${fmtKg(frame.vs_peers_pct, 1)}%`} />
            <Stat label="Std / frame-shift" value={frame.std_kg_per_frame_shift == null ? "—" : `${fmtKg(frame.std_kg_per_frame_shift, 1)} kg`} />
            {frame.tgt_kg_per_frame_shift != null ? (
              <Stat label="Target / frame-shift" value={`${fmtKg(frame.tgt_kg_per_frame_shift, 1)} kg`} />
            ) : null}
            <Stat label="Gap to std" value={frame.gap_kg == null ? "—" : `${fmtKg(frame.gap_kg)} kg`} />
            <Stat label="Frame-shifts" value={String(frame.frame_shifts)} />
            <Stat label="Qualities" value={frame.qualities.join(", ") || "—"} />
          </Box>
        ) : null}
        {attention?.reasons.length ? (
          <Box sx={{ mb: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Why it is flagged
            </Typography>
            <Stack component="ul" sx={{ m: 0, pl: 2.5 }} spacing={0.25}>
              {attention.reasons.map((r) => (
                <Typography key={r} component="li" variant="body2">
                  {r}
                </Typography>
              ))}
            </Stack>
          </Box>
        ) : null}
        <Typography variant="caption" color="text.secondary">
          Period {longDate(scope.dateFrom)} – {longDate(scope.dateTo)}
          {scope.shift ? ` · shift ${scope.shift}` : ""}
          {frameLink.clamped ? ` · Doff Analysis shows the last ${DOFF_ANALYSIS_CAP_DAYS} days` : ""}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ flexWrap: "wrap", gap: 0.5, justifyContent: "flex-start", px: 3, pb: 2 }}>
        <Button variant="contained" size="small" onClick={() => go(frameLink.url)} sx={{ textTransform: "none" }}>
          Doff Analysis: this frame
        </Button>
        <Button variant="outlined" size="small" onClick={() => go(lowLink.url)} sx={{ textTransform: "none" }}>
          Low Producer: spinners on it
        </Button>
        {context?.date ? (
          <>
            <Button variant="outlined" size="small" onClick={() => go(doffAnalysisDayUrl(scope.branchId, context.date as string))} sx={{ textTransform: "none" }}>
              Doffs of {longDate(context.date)}
            </Button>
            {dayLow ? (
              <Button variant="outlined" size="small" onClick={() => go(dayLow.url)} sx={{ textTransform: "none" }}>
                Spinner that shift
              </Button>
            ) : null}
          </>
        ) : null}
        <Button
          variant="text"
          size="small"
          onClick={() => {
            onClose();
            onFocusFrame(name);
          }}
          sx={{ textTransform: "none" }}
        >
          Focus this report on it
        </Button>
      </DialogActions>
    </Dialog>
  );
}
