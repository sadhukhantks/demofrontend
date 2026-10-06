"use client";

/**
 * @component JutePOClosedPanel
 * @description Read-only "Closed" panel for a CLOSED Jute PO: when, by whom,
 * how (Auto-settled / Short-closed / Bulk-closed / Migrated) and the remark.
 */

import * as React from "react";
import { Chip, Paper, Stack, Typography } from "@mui/material";
import { tokens } from "@/styles/tokens";
import type { JutePOClosedInfo } from "../types/jutePOTypes";

type JutePOClosedPanelProps = {
  info: JutePOClosedInfo;
};

const chipColorFor = (type: JutePOClosedInfo["closeType"]): "success" | "warning" | "default" | "info" => {
  switch (type) {
    case "AUTO":
      return "success";
    case "SHORT":
    case "BULK":
      return "warning";
    case "MIGRATED":
      return "default";
    default:
      return "info";
  }
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Stack spacing={0.25} sx={{ minWidth: 140 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" component="div">
        {value}
      </Typography>
    </Stack>
  );
}

export function JutePOClosedPanel({ info }: JutePOClosedPanelProps) {
  return (
    <Paper
      variant="outlined"
      sx={{ p: 2, bgcolor: tokens.surface.muted, borderColor: tokens.neutral[200] }}
      aria-label="PO closed details"
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }} flexWrap="wrap" rowGap={1}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Closed
        </Typography>
        <Chip size="small" label={info.closeTypeLabel} color={chipColorFor(info.closeType)} />
      </Stack>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={{ xs: 1.5, sm: 4 }} flexWrap="wrap" rowGap={1.5}>
        <Field label="Closed on" value={info.closedOn ?? "—"} />
        <Field label="Closed by" value={info.closedBy ?? "—"} />
        <Field label="Type" value={info.closeTypeLabel} />
      </Stack>
      <Stack spacing={0.25} sx={{ mt: 1.5 }}>
        <Typography variant="caption" color="text.secondary">
          Remark
        </Typography>
        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
          {info.remark ?? "—"}
        </Typography>
      </Stack>
    </Paper>
  );
}

export default JutePOClosedPanel;
