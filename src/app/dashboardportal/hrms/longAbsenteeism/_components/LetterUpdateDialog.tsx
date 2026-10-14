"use client";

import * as React from "react";
import { Alert, Box, Stack, TextField, Typography } from "@mui/material";
import { Controller, useForm, type Control, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import { FORM_GRID_2_SX } from "@/components/ui/responsiveEntry";
import { fmtDate } from "@/components/lowPerformerFollowup/schemas";
import type { LaCodeLabel, LaLetter } from "@/utils/longAbsenteeismService";
import {
  AD_NO_MAX,
  letterUpdateChanges,
  letterUpdateDefaults,
  makeLetterUpdateSchema,
  type LetterUpdateFields,
  type LetterUpdateFormValues,
} from "../_schemas";
import { letterTitle } from "../_utils";
import { DialogFormFrame, DialogShell } from "./DialogShell";

export interface LetterUpdateDialogProps {
  /** null = closed. */
  letter: LaLetter | null;
  dispatchModes: ReadonlyArray<LaCodeLabel>;
  deliveryStatuses: ReadonlyArray<LaCodeLabel>;
  today: string;
  onClose: () => void;
  /** Only the changed fields (blank = clear). */
  onSubmit: (letter: LaLetter, changes: LetterUpdateFields) => Promise<void>;
}

/** Sent date, dispatch mode, A.D. no, delivery and (gate notice) display dates of one letter. */
export default function LetterUpdateDialog(props: LetterUpdateDialogProps) {
  return (
    <DialogShell open={props.letter != null} onClose={props.onClose}>
      {props.letter ? <LetterUpdateForm {...props} letter={props.letter} /> : null}
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
  helper,
}: {
  name: keyof LetterUpdateFormValues;
  label: string;
  control: Control<LetterUpdateFormValues>;
  errors: FieldErrors<LetterUpdateFormValues>;
  busy: boolean;
  min: string;
  max: string;
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
          disabled={busy}
          error={Boolean(errors[name])}
          helperText={errors[name]?.message ?? helper}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { min, max } }}
          fullWidth
        />
      )}
    />
  );
}

function LetterUpdateForm({
  letter,
  dispatchModes,
  deliveryStatuses,
  today,
  onClose,
  onSubmit,
}: LetterUpdateDialogProps & { letter: LaLetter }) {
  const schema = React.useMemo(
    () => makeLetterUpdateSchema({ today, issueDate: letter.issue_date }),
    [today, letter.issue_date],
  );
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LetterUpdateFormValues>({
    resolver: zodResolver(schema),
    defaultValues: letterUpdateDefaults(letter, today),
  });
  const modeOptions = React.useMemo(() => dispatchModes.map((m) => ({ value: m.code, label: m.label })), [dispatchModes]);
  const statusOptions = React.useMemo(
    () => deliveryStatuses.map((m) => ({ value: m.code, label: m.label })),
    [deliveryStatuses],
  );
  const isNotice = letter.stage_code === "GATE_NOTICE";

  const submit = async (v: LetterUpdateFormValues) => {
    setSaveError(null);
    const changes = letterUpdateChanges(letter, v);
    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }
    try {
      await onSubmit(letter, changes);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Could not update the letter");
    }
  };

  return (
    <DialogFormFrame
      title={`Dispatch — ${letterTitle(letter)}`}
      onClose={onClose}
      onSubmit={(e) => void handleSubmit(submit)(e)}
      busy={isSubmitting}
      submitLabel="Save"
    >
      <Stack spacing={2.5} sx={{ pt: 1 }}>
        {saveError ? <Alert severity="error">{saveError}</Alert> : null}
        <Typography variant="body2" color="text.secondary">
          Letter dated {fmtDate(letter.issue_date)}. The wait for the next letter counts from the sent date.
        </Typography>
        <Box sx={FORM_GRID_2_SX}>
          <DateField
            name="sent_date"
            label="Sent date"
            control={control}
            errors={errors}
            busy={isSubmitting}
            min={letter.issue_date}
            max={today}
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
          {!isNotice ? (
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
          {!isNotice ? (
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
          {!isNotice ? (
            <DateField
              name="delivery_date"
              label="Delivery / return date"
              control={control}
              errors={errors}
              busy={isSubmitting}
              min={letter.issue_date}
              max={today}
            />
          ) : null}
          {isNotice ? (
            <DateField
              name="gate_display_date"
              label="Displayed on gate board"
              control={control}
              errors={errors}
              busy={isSubmitting}
              min={letter.issue_date}
              max={today}
            />
          ) : null}
          {isNotice ? (
            <DateField
              name="dept_display_date"
              label="Displayed in department"
              control={control}
              errors={errors}
              busy={isSubmitting}
              min={letter.issue_date}
              max={today}
            />
          ) : null}
        </Box>
      </Stack>
    </DialogFormFrame>
  );
}
