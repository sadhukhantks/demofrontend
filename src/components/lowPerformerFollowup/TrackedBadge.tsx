"use client";

import React from "react";
import NextLink from "next/link";
import { Chip } from "@mui/material";
import type { TrackedFollowup } from "@/utils/lowPerformerFollowupService";

/** Route of the Low Performer Follow-up register — also the menu path its
 * portal permissions hang off. */
export const LOW_PERFORMER_FOLLOWUP_PATH =
  "/dashboardportal/juteProduction/report/lowPerformerFollowup";

/** Deep link to one person's follow-up (detail view on the same route). */
export function followupHref(followupId: number, branchId: number | null): string {
  const qs = new URLSearchParams({ followup_id: String(followupId) });
  if (branchId != null) qs.set("branch_id", String(branchId));
  return `${LOW_PERFORMER_FOLLOWUP_PATH}?${qs.toString()}`;
}

export interface TrackedBadgeProps {
  followup: Pick<TrackedFollowup, "followup_id" | "start_date" | "review_date">;
  /** Branch the follow-up belongs to; carried on the link so the register opens on it. */
  branchId: number | null;
  /** False when the user cannot open the follow-up page: the badge still
   * informs, it just doesn't lead anywhere. */
  linkable?: boolean;
}

/**
 * Small "Tracked" chip for a worker who already has an open low-performer
 * follow-up. Uses a native `title` rather than a MUI Tooltip: report grids set
 * a cell-level `title` on hover, and the chip's own one wins without stacking a
 * second tooltip on top.
 */
export default function TrackedBadge({ followup, branchId, linkable = true }: TrackedBadgeProps) {
  const title =
    `Under follow-up since ${followup.start_date}` +
    (followup.review_date ? ` · review on ${followup.review_date}` : "");
  return linkable ? (
    <Chip
      component={NextLink}
      href={followupHref(followup.followup_id, branchId)}
      clickable
      size="small"
      color="primary"
      variant="outlined"
      label="Tracked"
      title={title}
    />
  ) : (
    <Chip size="small" color="primary" variant="outlined" label="Tracked" title={title} />
  );
}
