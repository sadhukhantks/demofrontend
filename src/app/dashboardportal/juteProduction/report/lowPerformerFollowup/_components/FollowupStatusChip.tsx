"use client";

import { Chip } from "@mui/material";

/** Open (being followed up) / Closed. */
export default function FollowupStatusChip({ status }: { status: 0 | 1 }) {
  return status === 1 ? (
    <Chip size="small" color="info" label="Open" />
  ) : (
    <Chip size="small" variant="outlined" label="Closed" />
  );
}
