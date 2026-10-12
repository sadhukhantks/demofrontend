"use client";

import * as React from "react";
import { Alert, Stack, Typography } from "@mui/material";
import { DialogFormFrame, DialogShell } from "./DialogShell";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  confirmColor?: "primary" | "error" | "warning";
  onClose: () => void;
  /** Rejects with an Error whose message is shown in the dialog. */
  onConfirm: () => Promise<void>;
}

/** Yes / no confirmation that shows the backend's refusal inline. */
export default function ConfirmDialog(props: ConfirmDialogProps) {
  return (
    <DialogShell open={props.open} onClose={props.onClose} maxWidth="xs">
      <ConfirmBody {...props} />
    </DialogShell>
  );
}

function ConfirmBody({ title, message, confirmLabel, confirmColor, onClose, onConfirm }: ConfirmDialogProps) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  };

  return (
    <DialogFormFrame
      title={title}
      onClose={onClose}
      onSubmit={(e) => void submit(e)}
      busy={busy}
      submitLabel={confirmLabel}
      submitColor={confirmColor}
    >
      <Stack spacing={2}>
        {error ? <Alert severity="error">{error}</Alert> : null}
        <Typography variant="body2" component="div">
          {message}
        </Typography>
      </Stack>
    </DialogFormFrame>
  );
}
