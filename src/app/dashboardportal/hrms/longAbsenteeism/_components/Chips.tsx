"use client";

import * as React from "react";
import { Chip } from "@mui/material";
import { approvalStatusColor, approvalStatusLabel, caseStatusColor, stageColor } from "../_utils";

/** The ladder stage of a case (label from /setup via the row's stage_label). */
export function StageChip({ code, label }: { code: string | null | undefined; label: string | null | undefined }) {
  if (!code) return null;
  return <Chip size="small" color={stageColor(code)} label={label || code} />;
}

/** Open / Parked / Closed. */
export function CaseStatusChip({ status, label }: { status: number; label: string }) {
  return <Chip size="small" variant="outlined" color={caseStatusColor(status)} label={label} />;
}

/** Struck-off approval state; nothing when the approval has not started. */
export function ApprovalChip({ statusId, level }: { statusId: number | null; level?: number | null }) {
  if (statusId == null) return null;
  const label =
    statusId === 20 && level != null ? `${approvalStatusLabel(statusId)} (level ${level})` : approvalStatusLabel(statusId);
  return <Chip size="small" color={approvalStatusColor(statusId)} label={label} />;
}

/** Repeat absentee: earlier closed cases of the worker in the branch. */
export function RepeatChip({ count }: { count: number }) {
  if (!count) return null;
  return (
    <Chip
      size="small"
      color="warning"
      variant="outlined"
      label={count === 1 ? "1 earlier case" : `${count} earlier cases`}
      title="Closed cases of this worker before"
    />
  );
}
