"use client";

import * as React from "react";
import { Alert, Box, Stack, TextField } from "@mui/material";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FORM_GRID_2_SX } from "@/components/ui/responsiveEntry";
import { REASON_MAX } from "@/components/lowPerformerFollowup/schemas";
import type { FollowupRow } from "@/utils/lowPerformerFollowupService";
import { makeEditFollowupSchema, type EditFollowupFormValues } from "../_schemas";
import { DialogFormFrame, DialogShell } from "./DialogShell";

export interface EditFollowupDialogProps {
  open: boolean;
  followup: FollowupRow;
  today: string;
  /** Earliest timeline entry; the start date may not move after it. */
  earliestEventDate: string | null;
  onClose: () => void;
  /** Rejects with the backend's message, shown inline. */
  onSubmit: (values: EditFollowupFormValues) => Promise<void>;
}

/** Edit the reason, start date and review date of a follow-up. */
export default function EditFollowupDialog(props: EditFollowupDialogProps) {
  return (
    <DialogShell open={props.open} onClose={props.onClose}>
      <EditFollowupForm {...props} />
    </DialogShell>
  );
}

function EditFollowupForm({ followup, today, earliestEventDate, onClose, onSubmit }: EditFollowupDialogProps) {
  const schema = React.useMemo(
    () => makeEditFollowupSchema(today, earliestEventDate),
    [today, earliestEventDate],
  );
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EditFollowupFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      reason: followup.reason ?? "",
      start_date: followup.start_date,
      review_date: followup.review_date ?? "",
    },
  });

  const submit = async (values: EditFollowupFormValues) => {
    setSaveError(null);
    try {
      await onSubmit(values);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Could not save the changes");
    }
  };

  return (
    <DialogFormFrame
      title="Edit follow-up"
      onClose={onClose}
      onSubmit={(e) => void handleSubmit(submit)(e)}
      busy={isSubmitting}
      submitLabel="Save"
    >
      <Stack spacing={2.5} sx={{ pt: 1 }}>
        {saveError ? <Alert severity="error">{saveError}</Alert> : null}
        <Controller
          name="reason"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label="Reason for follow-up"
              size="small"
              multiline
              minRows={2}
              disabled={isSubmitting}
              error={Boolean(errors.reason)}
              helperText={errors.reason?.message}
              slotProps={{ htmlInput: { maxLength: REASON_MAX } }}
              fullWidth
            />
          )}
        />
        <Box sx={FORM_GRID_2_SX}>
          <Controller
            name="start_date"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                type="date"
                label="Start date"
                required
                size="small"
                disabled={isSubmitting}
                error={Boolean(errors.start_date)}
                helperText={errors.start_date?.message}
                slotProps={{
                  inputLabel: { shrink: true },
                  htmlInput: { max: earliestEventDate && earliestEventDate < today ? earliestEventDate : today },
                }}
                fullWidth
              />
            )}
          />
          <Controller
            name="review_date"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                type="date"
                label="Review date"
                size="small"
                disabled={isSubmitting}
                error={Boolean(errors.review_date)}
                helperText={errors.review_date?.message ?? "Optional"}
                slotProps={{ inputLabel: { shrink: true } }}
                fullWidth
              />
            )}
          />
        </Box>
      </Stack>
    </DialogFormFrame>
  );
}
