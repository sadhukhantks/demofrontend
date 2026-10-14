"use client";

import * as React from "react";
import { Alert, Paper, Typography } from "@mui/material";
import { ApprovalActionsBar } from "@/components/ui/transaction/ApprovalActionsBar";
import type { LaCase, LaPermissions } from "@/utils/longAbsenteeismService";
import { approvalBarStatus, approvalStatusLabel, struckOffBarPermissions } from "../_utils";
import { PanelTitle, touchTargetsSx } from "./CasePanels";

export interface StruckOffPanelProps {
  c: LaCase;
  perms: LaPermissions | null;
  permsError: string | null;
  canEdit: boolean;
  busy: boolean;
  onSend: () => void;
  /** Opens the struck-off date dialog. */
  onApprove: () => void;
  onReject: (reason: string) => void;
  onReopen: () => void;
}

/**
 * Struck-off approval through the standard engine (one level; no hierarchy row
 * means edit access approves). Fed by GET /struck_off/permissions.
 */
export default function StruckOffPanel({
  c,
  perms,
  permsError,
  canEdit,
  busy,
  onSend,
  onApprove,
  onReject,
  onReopen,
}: StruckOffPanelProps) {
  const permissions = React.useMemo(
    () => struckOffBarPermissions(c.status_id, perms, canEdit),
    [c.status_id, perms, canEdit],
  );
  const approvalInfo = React.useMemo(
    () => ({
      statusId: approvalBarStatus(c.status_id),
      statusLabel: approvalStatusLabel(c.status_id),
      approvalLevel: c.approval_level,
    }),
    [c.status_id, c.approval_level],
  );

  return (
    <Paper elevation={1} sx={[{ p: { xs: 1.5, md: 2 }, mb: 2 }, touchTargetsSx]}>
      <PanelTitle title="Struck-off approval" />
      {permsError ? (
        <Alert severity="error" sx={{ mb: 1 }}>
          {permsError}
        </Alert>
      ) : null}
      <ApprovalActionsBar
        approvalInfo={approvalInfo}
        permissions={permissions}
        onSendForApproval={onSend}
        onApprove={onApprove}
        onReject={onReject}
        onReopen={onReopen}
        loading={busy}
      />
      {c.status_id == null && perms && !perms.can_send && perms.send_blocked_reason ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {perms.send_blocked_reason}
        </Typography>
      ) : null}
      {c.status_id === 20 && perms && !perms.canApprove ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Waiting for the approver{perms.hierarchy_exists ? " set in the approval hierarchy" : " (edit access)"}.
        </Typography>
      ) : null}
      {c.status_id === 4 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Rejected — see the timeline for the reason. Re-open to send it again after the matter is settled.
        </Typography>
      ) : null}
    </Paper>
  );
}
