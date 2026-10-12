"use client";

import * as React from "react";
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography,
} from "@mui/material";
import { X } from "lucide-react";
import {
  DIALOG_ACTIONS_SX,
  DIALOG_FORM_SCROLL_SX,
  MOBILE_FULL_BLEED_PAPER,
} from "@/components/ui/responsiveEntry";

export interface DialogShellProps {
  open: boolean;
  onClose: () => void;
  maxWidth?: "xs" | "sm" | "md" | "lg";
  children: React.ReactNode;
}

/** Full-width dialog, edge-to-edge on a phone. Children mount per opening. */
export function DialogShell({ open, onClose, maxWidth = "sm", children }: DialogShellProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth={maxWidth}
      slotProps={{ paper: MOBILE_FULL_BLEED_PAPER }}
      sx={DIALOG_FORM_SCROLL_SX}
    >
      {open ? children : null}
    </Dialog>
  );
}

export interface DialogFormFrameProps {
  title: string;
  onClose: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  submitLabel: string;
  submitColor?: "primary" | "error" | "warning";
  submitDisabled?: boolean;
  /** Extra buttons left of Cancel (e.g. Print). */
  extraActions?: React.ReactNode;
  /** Hides the submit button (a read-only step of a dialog). */
  hideSubmit?: boolean;
  cancelLabel?: string;
  children: React.ReactNode;
}

/** Title bar + scrolling content + thumb-sized Cancel / submit row. */
export function DialogFormFrame({
  title,
  onClose,
  onSubmit,
  busy,
  submitLabel,
  submitColor = "primary",
  submitDisabled = false,
  extraActions,
  hideSubmit = false,
  cancelLabel = "Cancel",
  children,
}: DialogFormFrameProps) {
  return (
    <form onSubmit={onSubmit} noValidate>
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", pb: 1 }}>
        <Typography variant="h6" component="span">
          {title}
        </Typography>
        <IconButton onClick={onClose} size="small" aria-label="Close dialog">
          <X size={20} />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>{children}</DialogContent>
      <DialogActions sx={[DIALOG_ACTIONS_SX, { flexWrap: "wrap" }]}>
        {extraActions}
        <Button onClick={onClose} disabled={busy}>
          {cancelLabel}
        </Button>
        {hideSubmit ? null : (
          <Button
            type="submit"
            variant="contained"
            color={submitColor}
            disabled={busy || submitDisabled}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {submitLabel}
          </Button>
        )}
      </DialogActions>
    </form>
  );
}
