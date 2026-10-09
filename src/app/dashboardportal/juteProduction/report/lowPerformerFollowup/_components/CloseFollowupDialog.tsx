"use client";

import * as React from "react";
import { Alert, Stack, TextField } from "@mui/material";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import type { CodeLabel, FollowupRow } from "@/utils/lowPerformerFollowupService";
import { REASON_MAX } from "@/components/lowPerformerFollowup/schemas";
import { makeCloseFollowupSchema, type CloseFollowupFormValues } from "../_schemas";
import { DialogFormFrame, DialogShell } from "./DialogShell";

export interface CloseFollowupDialogProps {
  open: boolean;
  followup: FollowupRow;
  closeReasons: ReadonlyArray<CodeLabel>;
  today: string;
  /** Latest active timeline entry; the closed date may not be before it. */
  lastEntryDate?: string | null;
  onClose: () => void;
  /** Rejects with the backend's message, shown inline. */
  onSubmit: (values: CloseFollowupFormValues) => Promise<void>;
}

/** Stop following a person up: date, reason (improved / transferred / left / other), remarks. */
export default function CloseFollowupDialog(props: CloseFollowupDialogProps) {
  return (
    <DialogShell open={props.open} onClose={props.onClose}>
      <CloseFollowupForm {...props} />
    </DialogShell>
  );
}

function CloseFollowupForm({
  followup,
  closeReasons,
  today,
  lastEntryDate = null,
  onClose,
  onSubmit,
}: CloseFollowupDialogProps) {
  const schema = React.useMemo(
    () => makeCloseFollowupSchema(followup.start_date, today, lastEntryDate),
    [followup.start_date, today, lastEntryDate],
  );
  const minClose =
    lastEntryDate && lastEntryDate > followup.start_date ? lastEntryDate : followup.start_date;
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CloseFollowupFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { closed_date: today, close_reason: "", close_remarks: "" },
  });

  const reasonOptions = React.useMemo(
    () => closeReasons.map((r) => ({ value: r.code, label: r.label })),
    [closeReasons],
  );

  const submit = async (values: CloseFollowupFormValues) => {
    setSaveError(null);
    try {
      await onSubmit(values);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Could not close the follow-up");
    }
  };

  return (
    <DialogFormFrame
      title="Close follow-up"
      onClose={onClose}
      onSubmit={(e) => void handleSubmit(submit)(e)}
      busy={isSubmitting}
      submitLabel="Close follow-up"
      submitColor="warning"
    >
      <Stack spacing={2.5} sx={{ pt: 1 }}>
        {saveError ? <Alert severity="error">{saveError}</Alert> : null}
        <Controller
          name="closed_date"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              type="date"
              label="Closed date"
              required
              size="small"
              disabled={isSubmitting}
              error={Boolean(errors.closed_date)}
              helperText={errors.closed_date?.message}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: minClose, max: today } }}
              fullWidth
            />
          )}
        />
        <Controller
          name="close_reason"
          control={control}
          render={({ field }) => (
            <SearchableOptionSelect<string>
              label="Close reason"
              placeholder="Select reason"
              options={reasonOptions}
              value={field.value}
              onChange={(v) => field.onChange(v)}
              required
              disabled={isSubmitting}
              error={Boolean(errors.close_reason)}
              helperText={errors.close_reason?.message}
              fullWidth
            />
          )}
        />
        <Controller
          name="close_remarks"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label="Remarks"
              size="small"
              multiline
              minRows={2}
              disabled={isSubmitting}
              error={Boolean(errors.close_remarks)}
              helperText={errors.close_remarks?.message}
              slotProps={{ htmlInput: { maxLength: REASON_MAX } }}
              fullWidth
            />
          )}
        />
      </Stack>
    </DialogFormFrame>
  );
}
