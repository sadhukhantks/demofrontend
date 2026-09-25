"use client";

/**
 * @component JutePOStatusHistory
 * @description Collapsible "Status history" list for a Jute PO (newest first).
 * Renders nothing when there are no rows, so a failed or empty log stays quiet.
 * Each row: when · user · source, from → to, trigger, remark. Stacked layout so
 * it reads well on a phone.
 */

import * as React from "react";
import { Box, Collapse, Divider, IconButton, Paper, Stack, Typography } from "@mui/material";
import { ChevronDown } from "lucide-react";
import { tokens } from "@/styles/tokens";
import type { JutePOStatusHistoryRow } from "../types/jutePOTypes";

type JutePOStatusHistoryProps = {
  rows: ReadonlyArray<JutePOStatusHistoryRow>;
  /** Start expanded (e.g. when the PO is closed). Default: collapsed. */
  defaultExpanded?: boolean;
};

export function JutePOStatusHistory({ rows, defaultExpanded = false }: JutePOStatusHistoryProps) {
  const [expanded, setExpanded] = React.useState(defaultExpanded);

  if (rows.length === 0) return null;

  return (
    <Paper variant="outlined" sx={{ borderColor: tokens.neutral[200] }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        component="button"
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls="jute-po-status-history"
        sx={{
          width: "100%",
          px: 2,
          py: 1.25,
          border: 0,
          background: "transparent",
          cursor: "pointer",
          textAlign: "left",
          color: "inherit",
          font: "inherit",
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Status history{" "}
          <Typography component="span" variant="caption" color="text.secondary">
            ({rows.length})
          </Typography>
        </Typography>
        <IconButton
          component="span"
          size="small"
          tabIndex={-1}
          aria-hidden
          sx={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 150ms" }}
        >
          <ChevronDown size={18} />
        </IconButton>
      </Stack>
      <Collapse in={expanded} unmountOnExit>
        <Divider />
        <Box id="jute-po-status-history" sx={{ px: 2, py: 1 }}>
          <Stack divider={<Divider flexItem />} spacing={1}>
            {rows.map((row) => (
              <Stack key={row.id} spacing={0.25} sx={{ py: 0.75 }}>
                <Stack direction="row" spacing={1} flexWrap="wrap" rowGap={0.25} alignItems="baseline">
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {row.when}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {row.user} · {row.source}
                  </Typography>
                </Stack>
                <Typography variant="body2">
                  {row.from} → {row.to}
                </Typography>
                {row.trigger !== "—" ? (
                  <Typography variant="caption" color="text.secondary" sx={{ wordBreak: "break-word" }}>
                    Trigger: {row.trigger}
                  </Typography>
                ) : null}
                {row.remark !== "—" ? (
                  <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-wrap" }}>
                    {row.remark}
                  </Typography>
                ) : null}
              </Stack>
            ))}
          </Stack>
        </Box>
      </Collapse>
    </Paper>
  );
}

export default JutePOStatusHistory;
