"use client";

import * as React from "react";
import { Alert, Stack, TextField, Typography } from "@mui/material";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { dismissLaCandidate, type LaCandidate } from "@/utils/longAbsenteeismService";
import {
  DISMISS_REASON_MAX,
  SNOOZE_MAX,
  makeDismissSchema,
  parseWholeDays,
  type DismissFormValues,
} from "../_schemas";
import { DialogFormFrame, DialogShell } from "./DialogShell";

export interface DismissDialogProps {
  coId: number;
  branchId: number;
  /** null = closed. */
  candidate: LaCandidate | null;
  /** The rule's dismiss_snooze_days. */
  defaultSnooze: number;
  onClose: () => void;
  onDismissed: () => void;
}

/** A candidate that should not become a case (known reason) — hidden for the snooze days. */
export default function DismissDialog(props: DismissDialogProps) {
  return (
    <DialogShell open={props.candidate != null} onClose={props.onClose} maxWidth="xs">
      {props.candidate ? <DismissForm {...props} candidate={props.candidate} /> : null}
    </DialogShell>
  );
}

function DismissForm({
  coId,
  branchId,
  candidate,
  defaultSnooze,
  onClose,
  onDismissed,
}: DismissDialogProps & { candidate: LaCandidate }) {
  const schema = React.useMemo(() => makeDismissSchema(), []);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DismissFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { reason: "", snooze_days: String(defaultSnooze) },
  });

  const submit = async (v: DismissFormValues) => {
    setSaveError(null);
    try {
      await dismissLaCandidate({
        co_id: coId,
        branch_id: branchId,
        eb_id: candidate.eb_id,
        reason: v.reason.trim(),
        snooze_days: parseWholeDays(v.snooze_days),
      });
      onDismissed();
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Could not dismiss the candidate");
    }
  };

  return (
    <DialogFormFrame
      title="Dismiss candidate"
      onClose={onClose}
      onSubmit={(e) => void handleSubmit(submit)(e)}
      busy={isSubmitting}
      submitLabel="Dismiss"
      submitColor="warning"
    >
      <Stack spacing={2.5} sx={{ pt: 1 }}>
        {saveError ? <Alert severity="error">{saveError}</Alert> : null}
        <Typography variant="body2">
          <strong>{candidate.emp_name || "(no name)"}</strong> (EB {candidate.emp_code ?? candidate.eb_id}) will not be
          listed as a candidate again until the snooze ends.
        </Typography>
        <Controller
          name="reason"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label="Reason"
              required
              size="small"
              multiline
              minRows={2}
              autoFocus
              disabled={isSubmitting}
              error={Boolean(errors.reason)}
              helperText={errors.reason?.message ?? "e.g. on sanctioned leave, transferred, already informed"}
              slotProps={{ htmlInput: { maxLength: DISMISS_REASON_MAX } }}
              fullWidth
            />
          )}
        />
        <Controller
          name="snooze_days"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label="Snooze (days)"
              size="small"
              disabled={isSubmitting}
              error={Boolean(errors.snooze_days)}
              helperText={errors.snooze_days?.message ?? `0 to ${SNOOZE_MAX}; blank = the default in Settings`}
              slotProps={{ htmlInput: { inputMode: "numeric", pattern: "[0-9]*" } }}
              fullWidth
            />
          )}
        />
      </Stack>
    </DialogFormFrame>
  );
}
