"use client";

/**
 * The small case dialogs: Verify, Note (park / resume / reopen), Exit,
 * Remarks & extras, and the struck-off approval date. Each is a
 * react-hook-form + zodResolver form over a schema factory in ../_schemas.ts;
 * the backend's refusal is shown inline.
 */

import * as React from "react";
import { Alert, Box, Checkbox, FormControlLabel, Stack, TextField, Typography } from "@mui/material";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import { FORM_GRID_2_SX, TOUCH_TARGET } from "@/components/ui/responsiveEntry";
import { fmtDate } from "@/components/lowPerformerFollowup/schemas";
import type { LaCase, LaCodeLabel } from "@/utils/longAbsenteeismService";
import {
  EXIT_REMARKS_MAX,
  EXTRA_MAX,
  NOTE_MAX,
  REMARKS_MAX,
  VERIFY_NOTE_MAX,
  caseFieldsDefaults,
  makeApproveSchema,
  makeCaseFieldsSchema,
  makeExitSchema,
  makeNoteSchema,
  makeVerifySchema,
  needsReturnDate,
  verifyDefaults,
  type ApproveFormValues,
  type CaseFieldsFormValues,
  type ExitFormValues,
  type NoteFormValues,
  type VerifyFormValues,
} from "../_schemas";
import type { ExtraColumn } from "../_utils";
import { DialogFormFrame, DialogShell } from "./DialogShell";

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

const checkboxSx = { minWidth: TOUCH_TARGET, minHeight: TOUCH_TARGET } as const;

// ─── Verify ──────────────────────────────────────────────────────────

export interface VerifyDialogProps {
  open: boolean;
  c: LaCase;
  esiStlResults: ReadonlyArray<LaCodeLabel>;
  onClose: () => void;
  onSubmit: (v: VerifyFormValues) => Promise<void>;
}

export function VerifyDialog(props: VerifyDialogProps) {
  return (
    <DialogShell open={props.open} onClose={props.onClose}>
      <VerifyForm {...props} />
    </DialogShell>
  );
}

function VerifyForm({ c, esiStlResults, onClose, onSubmit }: VerifyDialogProps) {
  const schema = React.useMemo(() => makeVerifySchema(), []);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<VerifyFormValues>({ resolver: zodResolver(schema), defaultValues: verifyDefaults(c) });
  const result = useWatch({ control, name: "esi_stl_result" });
  const confirmed = useWatch({ control, name: "timekeeper_confirmed" });
  const options = React.useMemo(() => esiStlResults.map((r) => ({ value: r.code, label: r.label })), [esiStlResults]);

  const submit = async (v: VerifyFormValues) => {
    setSaveError(null);
    try {
      await onSubmit(v);
    } catch (err: unknown) {
      setSaveError(errorText(err, "Could not save the verification"));
    }
  };

  return (
    <DialogFormFrame
      title="Verify absence"
      onClose={onClose}
      onSubmit={(e) => void handleSubmit(submit)(e)}
      busy={isSubmitting}
      submitLabel="Save"
    >
      <Stack spacing={2} sx={{ pt: 1 }}>
        {saveError ? <Alert severity="error">{saveError}</Alert> : null}
        <Controller
          name="esi_stl_result"
          control={control}
          render={({ field }) => (
            <SearchableOptionSelect<string>
              label="ESI / STL check"
              placeholder="Select result"
              options={options}
              value={field.value}
              onChange={(v) => field.onChange(v)}
              required
              disabled={isSubmitting}
              error={Boolean(errors.esi_stl_result)}
              helperText={errors.esi_stl_result?.message}
              fullWidth
            />
          )}
        />
        <Controller
          name="timekeeper_confirmed"
          control={control}
          render={({ field }) => (
            <FormControlLabel
              control={
                <Checkbox
                  checked={field.value}
                  onChange={(e) => field.onChange(e.target.checked)}
                  disabled={isSubmitting}
                  sx={checkboxSx}
                />
              }
              label="Time keeper confirmed the absence"
            />
          )}
        />
        <Controller
          name="habitual"
          control={control}
          render={({ field }) => (
            <FormControlLabel
              control={
                <Checkbox
                  checked={field.value}
                  onChange={(e) => field.onChange(e.target.checked)}
                  disabled={isSubmitting}
                  sx={checkboxSx}
                />
              }
              label="Habitual absentee"
            />
          )}
        />
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
              helperText={errors.note?.message ?? "Optional"}
              slotProps={{ htmlInput: { maxLength: VERIFY_NOTE_MAX } }}
              fullWidth
            />
          )}
        />
        {result === "ESI" || result === "STL" ? (
          <Alert severity="warning">
            Cases on ESI / STL go to the labour office, not through the letters. After saving you can close the case
            with this reason and an expected return date.
          </Alert>
        ) : result === "NONE" && !confirmed ? (
          <Alert severity="info">The first warning becomes due once the time keeper confirms the absence.</Alert>
        ) : null}
      </Stack>
    </DialogFormFrame>
  );
}

// ─── Note (park / resume / reopen) ───────────────────────────────────

export interface NoteDialogProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  submitLabel: string;
  submitColor?: "primary" | "error" | "warning";
  required: boolean;
  onClose: () => void;
  onSubmit: (note: string) => Promise<void>;
}

export function NoteDialog(props: NoteDialogProps) {
  return (
    <DialogShell open={props.open} onClose={props.onClose} maxWidth="xs">
      <NoteForm {...props} />
    </DialogShell>
  );
}

function NoteForm({ title, message, submitLabel, submitColor, required, onClose, onSubmit }: NoteDialogProps) {
  const schema = React.useMemo(() => makeNoteSchema(required), [required]);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NoteFormValues>({ resolver: zodResolver(schema), defaultValues: { note: "" } });

  const submit = async (v: NoteFormValues) => {
    setSaveError(null);
    try {
      await onSubmit(v.note.trim());
    } catch (err: unknown) {
      setSaveError(errorText(err, "Something went wrong"));
    }
  };

  return (
    <DialogFormFrame
      title={title}
      onClose={onClose}
      onSubmit={(e) => void handleSubmit(submit)(e)}
      busy={isSubmitting}
      submitLabel={submitLabel}
      submitColor={submitColor}
    >
      <Stack spacing={2} sx={{ pt: 1 }}>
        {saveError ? <Alert severity="error">{saveError}</Alert> : null}
        <Typography variant="body2" component="div">
          {message}
        </Typography>
        <Controller
          name="note"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label="Note"
              required={required}
              size="small"
              multiline
              minRows={2}
              autoFocus
              disabled={isSubmitting}
              error={Boolean(errors.note)}
              helperText={errors.note?.message ?? (required ? undefined : "Optional")}
              slotProps={{ htmlInput: { maxLength: NOTE_MAX } }}
              fullWidth
            />
          )}
        />
      </Stack>
    </DialogFormFrame>
  );
}

// ─── Exit ────────────────────────────────────────────────────────────

export interface ExitPreset {
  exit_reason?: string;
  exit_date?: string;
}

export interface ExitDialogProps {
  open: boolean;
  c: LaCase;
  exitReasons: ReadonlyArray<LaCodeLabel>;
  today: string;
  preset: ExitPreset | null;
  onClose: () => void;
  onSubmit: (v: ExitFormValues) => Promise<void>;
}

export function ExitDialog(props: ExitDialogProps) {
  return (
    <DialogShell open={props.open} onClose={props.onClose}>
      <ExitForm {...props} />
    </DialogShell>
  );
}

function ExitForm({ c, exitReasons, today, preset, onClose, onSubmit }: ExitDialogProps) {
  const schema = React.useMemo(
    () => makeExitSchema({ today, minDate: c.last_working_date }),
    [today, c.last_working_date],
  );
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ExitFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      exit_reason: preset?.exit_reason ?? "",
      exit_date: preset?.exit_date ?? today,
      exit_remarks: "",
      expected_return_date: "",
    },
  });
  const reason = useWatch({ control, name: "exit_reason" });
  const exitDate = useWatch({ control, name: "exit_date" });
  const options = React.useMemo(() => exitReasons.map((r) => ({ value: r.code, label: r.label })), [exitReasons]);

  const submit = async (v: ExitFormValues) => {
    setSaveError(null);
    try {
      await onSubmit(v);
    } catch (err: unknown) {
      setSaveError(errorText(err, "Could not close the case"));
    }
  };

  return (
    <DialogFormFrame
      title="Close case"
      onClose={onClose}
      onSubmit={(e) => void handleSubmit(submit)(e)}
      busy={isSubmitting}
      submitLabel="Close case"
      submitColor="warning"
    >
      <Stack spacing={2} sx={{ pt: 1 }}>
        {saveError ? <Alert severity="error">{saveError}</Alert> : null}
        <Box sx={FORM_GRID_2_SX}>
          <Controller
            name="exit_reason"
            control={control}
            render={({ field }) => (
              <SearchableOptionSelect<string>
                label="Reason"
                placeholder="Select reason"
                options={options}
                value={field.value}
                onChange={(v) => field.onChange(v)}
                required
                disabled={isSubmitting}
                error={Boolean(errors.exit_reason)}
                helperText={errors.exit_reason?.message}
                fullWidth
              />
            )}
          />
          <Controller
            name="exit_date"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                type="date"
                label="Exit date"
                required
                size="small"
                disabled={isSubmitting}
                error={Boolean(errors.exit_date)}
                helperText={errors.exit_date?.message}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: c.last_working_date, max: today } }}
                fullWidth
              />
            )}
          />
        </Box>
        {needsReturnDate(reason) ? (
          <Controller
            name="expected_return_date"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                type="date"
                label="Expected return date"
                size="small"
                disabled={isSubmitting}
                error={Boolean(errors.expected_return_date)}
                helperText={
                  errors.expected_return_date?.message ??
                  "Optional. The worker shows up as a candidate again if still absent after this date."
                }
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: exitDate || undefined } }}
                fullWidth
              />
            )}
          />
        ) : null}
        <Controller
          name="exit_remarks"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label="Remarks"
              size="small"
              multiline
              minRows={2}
              disabled={isSubmitting}
              error={Boolean(errors.exit_remarks)}
              helperText={errors.exit_remarks?.message ?? "Optional"}
              slotProps={{ htmlInput: { maxLength: EXIT_REMARKS_MAX } }}
              fullWidth
            />
          )}
        />
      </Stack>
    </DialogFormFrame>
  );
}

// ─── Remarks & extras ────────────────────────────────────────────────

export interface CaseFieldsDialogProps {
  open: boolean;
  c: LaCase;
  extraCols: ReadonlyArray<ExtraColumn>;
  today: string;
  /** Edit access: the last working date can be corrected too. */
  canEditDate: boolean;
  onClose: () => void;
  onSubmit: (v: CaseFieldsFormValues) => Promise<void>;
}

export function CaseFieldsDialog(props: CaseFieldsDialogProps) {
  return (
    <DialogShell open={props.open} onClose={props.onClose}>
      <CaseFieldsForm {...props} />
    </DialogShell>
  );
}

function CaseFieldsForm({ c, extraCols, today, canEditDate, onClose, onSubmit }: CaseFieldsDialogProps) {
  const schema = React.useMemo(() => makeCaseFieldsSchema({ today, canEditDate }), [today, canEditDate]);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CaseFieldsFormValues>({ resolver: zodResolver(schema), defaultValues: caseFieldsDefaults(c) });

  const submit = async (v: CaseFieldsFormValues) => {
    setSaveError(null);
    try {
      await onSubmit(v);
    } catch (err: unknown) {
      setSaveError(errorText(err, "Could not save"));
    }
  };

  return (
    <DialogFormFrame
      title="Remarks and details"
      onClose={onClose}
      onSubmit={(e) => void handleSubmit(submit)(e)}
      busy={isSubmitting}
      submitLabel="Save"
    >
      <Stack spacing={2} sx={{ pt: 1 }}>
        {saveError ? <Alert severity="error">{saveError}</Alert> : null}
        <Controller
          name="remarks"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label="Remarks"
              size="small"
              multiline
              minRows={3}
              autoFocus
              disabled={isSubmitting}
              error={Boolean(errors.remarks)}
              helperText={errors.remarks?.message}
              slotProps={{ htmlInput: { maxLength: REMARKS_MAX } }}
              fullWidth
            />
          )}
        />
        {extraCols.length ? (
          <Box sx={FORM_GRID_2_SX}>
            {extraCols.map((col) => (
              <Controller
                key={col.key}
                name={col.key}
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label={col.label}
                    size="small"
                    disabled={isSubmitting}
                    error={Boolean(errors[col.key])}
                    helperText={errors[col.key]?.message}
                    slotProps={{ htmlInput: { maxLength: EXTRA_MAX } }}
                    fullWidth
                  />
                )}
              />
            ))}
          </Box>
        ) : null}
        <Controller
          name="habitual"
          control={control}
          render={({ field }) => (
            <FormControlLabel
              control={
                <Checkbox
                  checked={field.value}
                  onChange={(e) => field.onChange(e.target.checked)}
                  disabled={isSubmitting}
                  sx={checkboxSx}
                />
              }
              label="Habitual absentee"
            />
          )}
        />
        {canEditDate ? (
          <Controller
            name="last_working_date"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                type="date"
                label="Last working date"
                required
                size="small"
                disabled={isSubmitting}
                error={Boolean(errors.last_working_date)}
                helperText={errors.last_working_date?.message ?? "Changing it recomputes the days absent at opening"}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today } }}
                fullWidth
              />
            )}
          />
        ) : null}
      </Stack>
    </DialogFormFrame>
  );
}

// ─── Struck-off approve ──────────────────────────────────────────────

export interface ApproveDialogProps {
  open: boolean;
  c: LaCase;
  today: string;
  /** The gate notice date (the struck-off date cannot be before it). */
  minDate: string | null;
  onClose: () => void;
  onSubmit: (v: ApproveFormValues) => Promise<void>;
}

export function ApproveStruckOffDialog(props: ApproveDialogProps) {
  return (
    <DialogShell open={props.open} onClose={props.onClose} maxWidth="xs">
      <ApproveForm {...props} />
    </DialogShell>
  );
}

function ApproveForm({ c, today, minDate, onClose, onSubmit }: ApproveDialogProps) {
  const schema = React.useMemo(() => makeApproveSchema(today, minDate), [today, minDate]);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ApproveFormValues>({ resolver: zodResolver(schema), defaultValues: { struck_off_date: today } });

  const submit = async (v: ApproveFormValues) => {
    setSaveError(null);
    try {
      await onSubmit(v);
    } catch (err: unknown) {
      setSaveError(errorText(err, "Could not approve"));
    }
  };

  return (
    <DialogFormFrame
      title="Approve struck off"
      onClose={onClose}
      onSubmit={(e) => void handleSubmit(submit)(e)}
      busy={isSubmitting}
      submitLabel="Approve"
      submitColor="error"
    >
      <Stack spacing={2} sx={{ pt: 1 }}>
        {saveError ? <Alert severity="error">{saveError}</Alert> : null}
        <Alert severity="warning">
          On final approval <strong>{c.emp_name || `EB ${c.emp_code ?? c.eb_id}`}</strong> is struck off the muster roll
          and marked <strong>Terminated</strong> in HRMS. The case closes. Reversing it needs HR to change the employee
          status.
        </Alert>
        <Controller
          name="struck_off_date"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              type="date"
              label="Struck off with effect from"
              required
              size="small"
              disabled={isSubmitting}
              error={Boolean(errors.struck_off_date)}
              helperText={
                errors.struck_off_date?.message ?? (minDate ? `Gate notice dated ${fmtDate(minDate)}` : undefined)
              }
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: minDate ?? undefined, max: today } }}
              fullWidth
            />
          )}
        />
      </Stack>
    </DialogFormFrame>
  );
}
