"use client";

/**
 * @component JutePOCloseDialog
 * @description Remark dialog for short-closing a live Jute PO. Presentational:
 * validates the remark (zod, required, ≤ 500 chars) and hands it to `onConfirm`.
 */

import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
} from "@mui/material";
import { Button } from "@/components/ui/button";

export const JUTE_PO_CLOSE_REMARK_MAX = 500;

const closeFormSchema = z.object({
  remark: z
    .string()
    .trim()
    .min(1, "A remark is required to close the PO")
    .max(JUTE_PO_CLOSE_REMARK_MAX, `Keep the remark under ${JUTE_PO_CLOSE_REMARK_MAX} characters`),
});
type CloseFormValues = z.infer<typeof closeFormSchema>;

type JutePOCloseDialogProps = {
  open: boolean;
  /** PO number for the title, e.g. "EJM/F/JPO/26-27/00047". */
  poLabel?: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: (remark: string) => void | Promise<void>;
};

export function JutePOCloseDialog({ open, poLabel, loading = false, onCancel, onConfirm }: JutePOCloseDialogProps) {
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CloseFormValues>({
    resolver: zodResolver(closeFormSchema),
    defaultValues: { remark: "" },
  });

  React.useEffect(() => {
    if (open) reset({ remark: "" });
  }, [open, reset]);

  const submit = handleSubmit(async (values) => {
    await onConfirm(values.remark);
  });

  return (
    <Dialog open={open} onClose={loading ? undefined : onCancel} fullWidth maxWidth="xs">
      <form onSubmit={submit} noValidate>
        <DialogTitle>Close PO{poLabel ? ` ${poLabel}` : ""}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 1.5 }}>
            This short-closes the PO. Pending lorries will no longer be expected. The PO can be reopened
            later from this page.
          </DialogContentText>
          <Controller
            name="remark"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                autoFocus
                required
                fullWidth
                multiline
                minRows={3}
                label="Reason for closing"
                placeholder="e.g. Supplier could not deliver the remaining lorries"
                disabled={loading}
                error={Boolean(errors.remark)}
                helperText={errors.remark?.message ?? `${field.value.length}/${JUTE_PO_CLOSE_REMARK_MAX}`}
                slotProps={{ htmlInput: { maxLength: JUTE_PO_CLOSE_REMARK_MAX + 1 } }}
              />
            )}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="destructive" disabled={loading}>
            {loading ? "Closing..." : "Close PO"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

export default JutePOCloseDialog;
