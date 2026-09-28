"use client";

/**
 * Remark dialog for closing jute POs from the Outstanding PO Position report —
 * shared by the per-row "Close" action (one PO → `JUTE_PO_CLOSE`) and the
 * "Close selected" button (several POs → `JUTE_PO_BULK_CLOSE`). Presentational:
 * validates the remark (zod, required, ≤ 500) and hands it back; the page does
 * the API call. Full-width on phones.
 */

import React, { useEffect } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
} from "@mui/material";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

export const closeRemarkSchema = z.object({
  remark: z
    .string()
    .trim()
    .min(1, "A remark is required")
    .max(500, "Keep the remark to 500 characters"),
});

export type CloseRemarkForm = z.infer<typeof closeRemarkSchema>;

/** What is being closed — drives the title and the explanatory line. */
export type CloseTarget =
  | { kind: "single"; jute_po_id: number; po_label: string }
  | { kind: "bulk"; jute_po_ids: number[] };

interface ClosePoDialogProps {
  target: CloseTarget | null;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (target: CloseTarget, remark: string) => void;
}

export default function ClosePoDialog({ target, submitting, onCancel, onSubmit }: ClosePoDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CloseRemarkForm>({
    resolver: zodResolver(closeRemarkSchema),
    defaultValues: { remark: "" },
  });

  // Fresh remark every time the dialog opens for a new target.
  useEffect(() => {
    if (target) reset({ remark: "" });
  }, [target, reset]);

  const open = target != null;
  const count = target?.kind === "bulk" ? target.jute_po_ids.length : 1;
  const title =
    target?.kind === "single"
      ? `Close PO ${target.po_label}`
      : `Close ${count} PO${count === 1 ? "" : "s"}`;

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onCancel}
      fullWidth
      maxWidth="sm"
      sx={{
        "& .MuiDialog-paper": {
          m: { xs: 1, sm: 4 },
          width: { xs: "calc(100% - 16px)", sm: undefined },
        },
      }}
    >
      <form
        onSubmit={handleSubmit((values) => {
          if (target) onSubmit(target, values.remark);
        })}
        noValidate
      >
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {target?.kind === "bulk"
              ? "The selected POs are short-closed and stop showing as outstanding. POs that are not live any more are skipped and reported."
              : "The PO is short-closed and stops showing as outstanding. It can be reopened from the PO page."}
          </DialogContentText>
          <TextField
            {...register("remark")}
            label="Remark"
            required
            multiline
            minRows={2}
            maxRows={6}
            fullWidth
            autoFocus
            disabled={submitting}
            error={Boolean(errors.remark)}
            helperText={errors.remark?.message ?? "Why the PO is being closed (up to 500 characters)"}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onCancel} disabled={submitting} sx={{ textTransform: "none" }}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            color="error"
            disabled={submitting}
            sx={{ textTransform: "none" }}
          >
            {submitting ? "Closing…" : `Close ${count === 1 ? "PO" : `${count} POs`}`}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
