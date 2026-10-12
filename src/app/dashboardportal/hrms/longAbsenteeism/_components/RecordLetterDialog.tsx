"use client";

/**
 * "Record a letter already issued" (owner 2026-10-12, back-dated entries): a
 * letter that went out before the case was tracked here is entered as the
 * case's NEXT letter with its real dates. The letter itself is shown read-only
 * (letters are recorded in order); the server takes the text from the current
 * template, marks the letter "recorded" and moves the case on exactly as an
 * issue would — without the wait / sent-date checks (these are past facts).
 *
 * Backend: POST /letter_record (long_absenteeism_letters.py).
 */

import * as React from "react";
import { Alert, Box, Stack, TextField, Typography } from "@mui/material";
import { Controller, useForm, useWatch, type Control, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { fmtDate } from "@/components/lowPerformerFollowup/schemas";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import { FORM_GRID_2_SX } from "@/components/ui/responsiveEntry";
import type { LaCase, LaCodeLabel, LaLetter } from "@/utils/longAbsenteeismService";
import {
  AD_NO_MAX,
  NOTE_MAX,
  letterRecordDefaults,
  letterRecordMinDate,
  makeLetterRecordSchema,
  type LetterRecordFormValues,
} from "../_schemas";
import { defaultDispatchMode, workerTitle } from "../_utils";
import { DialogFormFrame, DialogShell } from "./DialogShell";

export interface RecordLetterDialogProps {
  open: boolean;
  c: LaCase;
  /** The case's next letter stage (read-only in the dialog). */
  stageCode: string;
  stageLabel: string;
  /** The case's letters (the new one may not be dated before the latest). */
  letters: ReadonlyArray<LaLetter>;
  dispatchModes: ReadonlyArray<LaCodeLabel>;
  deliveryStatuses: ReadonlyArray<LaCodeLabel>;
  today: string;
  onClose: () => void;
  /** Saves the record (the dialog shows the error when it throws). */
  onSubmit: (values: LetterRecordFormValues) => Promise<void>;
}

export default function RecordLetterDialog(props: RecordLetterDialogProps) {
  return (
    <DialogShell open={props.open} onClose={props.onClose}>
      {props.open ? <RecordLetterForm {...props} /> : null}
    </DialogShell>
  );
}

function DateField({
  name,
  label,
  control,
  errors,
  busy,
  min,
  max,
  required = false,
  helper,
}: {
  name: "issue_date" | "sent_date" | "delivery_date";
  label: string;
  control: Control<LetterRecordFormValues>;
  errors: FieldErrors<LetterRecordFormValues>;
  busy: boolean;
  min?: string;
  max: string;
  required?: boolean;
  helper?: string;
}) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <TextField
          {...field}
          type="date"
          label={label}
          size="small"
          required={required}
          disabled={busy}
          error={Boolean(errors[name])}
          helperText={errors[name]?.message ?? helper}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: min || undefined, max } }}
          fullWidth
        />
      )}
    />
  );
}

function RecordLetterForm({
  c,
  stageCode,
  stageLabel,
  letters,
  dispatchModes,
  deliveryStatuses,
  today,
  onClose,
  onSubmit,
}: RecordLetterDialogProps) {
  const minDate = React.useMemo(() => letterRecordMinDate(c, letters), [c, letters]);
  const schema = React.useMemo(() => makeLetterRecordSchema({ today, minDate }), [today, minDate]);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LetterRecordFormValues>({
    resolver: zodResolver(schema),
    defaultValues: letterRecordDefaults(defaultDispatchMode(stageCode, dispatchModes)),
  });
  const issueDate = useWatch({ control, name: "issue_date" });
  const sentDate = useWatch({ control, name: "sent_date" });
  const modeOptions = React.useMemo(() => dispatchModes.map((m) => ({ value: m.code, label: m.label })), [dispatchModes]);
  const statusOptions = React.useMemo(
    () => deliveryStatuses.map((m) => ({ value: m.code, label: m.label })),
    [deliveryStatuses],
  );
  const posted = stageCode !== "GATE_NOTICE";

  const submit = async (v: LetterRecordFormValues) => {
    setSaveError(null);
    try {
      await onSubmit(v);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Could not record the letter");
    }
  };

  return (
    <DialogFormFrame
      title="Record a letter already issued"
      onClose={onClose}
      onSubmit={(e) => void handleSubmit(submit)(e)}
      busy={isSubmitting}
      submitLabel="Record letter"
    >
      <Stack spacing={2.5} sx={{ pt: 1 }}>
        {saveError ? <Alert severity="error">{saveError}</Alert> : null}
        <Alert severity="info">
          For a letter that was already issued and posted outside VoWERP for {workerTitle(c)}. It is entered as the
          case&apos;s next letter with its real dates; the text is taken from the current template and the case moves on
          as if it had been issued here. No waiting period is checked.
        </Alert>
        <TextField
          label="Letter"
          size="small"
          value={stageLabel}
          disabled
          helperText="Letters are recorded in order — this is the case's next letter"
          slotProps={{ htmlInput: { "data-testid": "record-letter-stage" } }}
          fullWidth
        />
        <Box sx={FORM_GRID_2_SX}>
          <DateField
            name="issue_date"
            label="Letter date"
            required
            control={control}
            errors={errors}
            busy={isSubmitting}
            min={minDate?.date}
            max={today}
            helper={minDate ? `Not before the ${minDate.what} (${fmtDate(minDate.date)})` : undefined}
          />
          <DateField
            name="sent_date"
            label="Sent date"
            control={control}
            errors={errors}
            busy={isSubmitting}
            min={issueDate || minDate?.date}
            max={today}
            helper="The wait for the next letter counts from it"
          />
          <Controller
            name="dispatch_mode"
            control={control}
            render={({ field }) => (
              <SearchableOptionSelect<string>
                label="Dispatch mode"
                options={modeOptions}
                value={field.value}
                onChange={(v) => field.onChange(v)}
                disabled={isSubmitting}
                fullWidth
              />
            )}
          />
          {posted ? (
            <Controller
              name="ad_no"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="A.D. / registered post no"
                  size="small"
                  disabled={isSubmitting}
                  error={Boolean(errors.ad_no)}
                  helperText={errors.ad_no?.message}
                  slotProps={{ htmlInput: { maxLength: AD_NO_MAX } }}
                  fullWidth
                />
              )}
            />
          ) : null}
          {posted ? (
            <Controller
              name="delivery_status"
              control={control}
              render={({ field }) => (
                <SearchableOptionSelect<string>
                  label="Delivery status"
                  options={statusOptions}
                  value={field.value}
                  onChange={(v) => field.onChange(v)}
                  disabled={isSubmitting}
                  fullWidth
                />
              )}
            />
          ) : null}
          {posted ? (
            <DateField
              name="delivery_date"
              label="Delivery / return date"
              control={control}
              errors={errors}
              busy={isSubmitting}
              min={sentDate || issueDate || minDate?.date}
              max={today}
            />
          ) : null}
        </Box>
        <Controller
          name="note"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label="Note"
              size="small"
              multiline
              minRows={2}
              disabled={isSubmitting}
              error={Boolean(errors.note)}
              helperText={errors.note?.message ?? "Optional — e.g. where the office copy is filed"}
              slotProps={{ htmlInput: { maxLength: NOTE_MAX } }}
              fullWidth
            />
          )}
        />
        <Typography variant="caption" color="text.secondary">
          The letter card will show a &quot;Recorded&quot; chip. Its print and PDF use the current template text.
        </Typography>
      </Stack>
    </DialogFormFrame>
  );
}
