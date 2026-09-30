"use client";

/**
 * @component JutePOApprovalBar
 * @description Renders the approval status chip and action buttons for Jute PO.
 * Includes the settlement actions: "Close PO" (remark dialog) for live POs and a
 * confirm step when reopening a CLOSED PO.
 */

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  TextField,
} from "@mui/material";
import type { ApprovalInfo, ApprovalActionPermissions } from "../types/jutePOTypes";
import { JutePOCloseDialog } from "./JutePOCloseDialog";

type JutePOApprovalBarProps = {
  approvalInfo: ApprovalInfo;
  permissions: ApprovalActionPermissions;
  loading: boolean;
  /** PO number shown in the Close PO dialog title. */
  poLabel?: string;
  onOpen?: () => void;
  onApprove?: () => void;
  onReject?: (reason: string) => void;
  onCancelDraft?: () => void;
  onReopen?: () => void;
  /**
   * When set, Reopen first asks for confirmation with this text (used for CLOSED
   * POs: "goes back to <prior status>"). Rejected/cancelled reopen stays one-click.
   */
  reopenConfirm?: { title: string; message: string } | null;
  onClose?: (remark: string) => void | Promise<void>;
};

export function JutePOApprovalBar({
  approvalInfo,
  permissions,
  loading,
  poLabel,
  onOpen,
  onApprove,
  onReject,
  onCancelDraft,
  onReopen,
  reopenConfirm = null,
  onClose,
}: JutePOApprovalBarProps) {
  const [rejectDialogOpen, setRejectDialogOpen] = React.useState(false);
  const [rejectReason, setRejectReason] = React.useState("");
  const [closeDialogOpen, setCloseDialogOpen] = React.useState(false);
  const [reopenConfirmOpen, setReopenConfirmOpen] = React.useState(false);

  const handleRejectConfirm = () => {
    if (onReject) {
      onReject(rejectReason);
    }
    setRejectDialogOpen(false);
    setRejectReason("");
  };

  const handleReopenClick = () => {
    if (!onReopen) return;
    if (reopenConfirm) {
      setReopenConfirmOpen(true);
    } else {
      onReopen();
    }
  };

  const handleReopenConfirmed = () => {
    setReopenConfirmOpen(false);
    onReopen?.();
  };

  const handleCloseConfirm = async (remark: string) => {
    if (!onClose) return;
    try {
      await onClose(remark);
      setCloseDialogOpen(false);
    } catch {
      // The caller has already shown the error toast; keep the dialog open for a retry.
    }
  };

  const getChipColor = () => {
    switch (approvalInfo.statusColor) {
      case "success":
        return "success";
      case "error":
        return "error";
      case "warning":
        return "warning";
      case "info":
        return "info";
      default:
        return "default";
    }
  };

  return (
    <>
      <div className="flex items-center gap-3 flex-wrap">
        {/* Status Chip */}
        <Chip
          label={approvalInfo.statusLabel}
          color={getChipColor()}
          size="small"
          className="font-medium"
        />

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {permissions.canOpen && onOpen && (
            <Button
              variant="outline"
              size="sm"
              onClick={onOpen}
              disabled={loading}
            >
              Open
            </Button>
          )}

          {permissions.canApprove && onApprove && (
            <Button
              variant="default"
              size="sm"
              onClick={onApprove}
              disabled={loading}
              className="bg-green-600 hover:bg-green-700"
            >
              Approve
            </Button>
          )}

          {permissions.canReject && onReject && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setRejectDialogOpen(true)}
              disabled={loading}
            >
              Reject
            </Button>
          )}

          {permissions.canCancelDraft && onCancelDraft && (
            <Button
              variant="outline"
              size="sm"
              onClick={onCancelDraft}
              disabled={loading}
              className="text-red-600 border-red-300 hover:bg-red-50"
            >
              Cancel Draft
            </Button>
          )}

          {permissions.canClose && onClose && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCloseDialogOpen(true)}
              disabled={loading}
              className="text-red-600 border-red-300 hover:bg-red-50"
            >
              Close PO
            </Button>
          )}

          {permissions.canReopen && onReopen && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleReopenClick}
              disabled={loading}
            >
              Reopen
            </Button>
          )}
        </div>
      </div>

      {/* Reject Reason Dialog */}
      <Dialog open={rejectDialogOpen} onClose={() => setRejectDialogOpen(false)}>
        <DialogTitle>Reject Jute PO</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Rejection Reason"
            type="text"
            fullWidth
            multiline
            rows={3}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Enter reason for rejection..."
          />
        </DialogContent>
        <DialogActions>
          <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleRejectConfirm}
            disabled={!rejectReason.trim()}
          >
            Confirm Reject
          </Button>
        </DialogActions>
      </Dialog>

      {/* Close PO (short close) */}
      <JutePOCloseDialog
        open={closeDialogOpen}
        poLabel={poLabel}
        loading={loading}
        onCancel={() => setCloseDialogOpen(false)}
        onConfirm={handleCloseConfirm}
      />

      {/* Reopen a CLOSED PO — confirm first */}
      <Dialog
        open={reopenConfirmOpen}
        onClose={() => setReopenConfirmOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>{reopenConfirm?.title ?? "Reopen PO"}</DialogTitle>
        <DialogContent>
          <DialogContentText>{reopenConfirm?.message}</DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="outline" onClick={() => setReopenConfirmOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button variant="default" onClick={handleReopenConfirmed} disabled={loading}>
            Reopen
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default JutePOApprovalBar;
