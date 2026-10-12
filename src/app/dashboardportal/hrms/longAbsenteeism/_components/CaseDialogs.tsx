"use client";

/**
 * The small case dialogs: Note (park / resume / reopen), Exit, Remarks &
 * extras (incl. habitual), and the struck-off approval date. Each is a
 * react-hook-form + zodResolver form over a schema factory in ../_schemas.ts;
 * the backend's refusal is shown inline. There is no verification dialog:
 * leave is read from the leave module (Leave Request page).
 */

import * as React from "react";
import { Alert, Box, Checkbox, FormControlLabel, Stack, TextField, Typography } from "@mui/material";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import { FORM_GRID_2_SX, TOUCH_TARGET } from "@/components/ui/responsiveEntry";
import { fmtDate } from "@/components/lowPerformerFollowup/schemas";
import type { LaCase, LaCodeLabel, LaLeaveOption } from "@/utils/longAbsenteeismService";
import {
  EXIT_REMARKS_MAX,
  EXTRA_MAX,
  NOTE_MAX,
  REMARKS_MAX,
  caseFieldsDefaults,
  leaveTypeIdOrNull,
  makeApproveSchema,
  makeCaseFieldsSchema,
  makeExitSchema,
  makeNoteSchema,
  needsReturnDate,
  type ApproveFormValues,
  type CaseFieldsFormValues,
  type ExitFormValues,
  type NoteFormValues,
} from "../_schemas";
import {
  decodeLeaveOption,
  encodeLeaveOption,
  hasModuleLeave,
  leaveChoices,
  moduleLeaveRange,
  normaliseLeaveChoice,
  type ExtraColumn,
} from "../_utils";
import { DialogFormFrame, DialogShell } from "./DialogShell";

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

const checkboxSx = { minWidth: TOUCH_TARGET, minHeight: TOUCH_TARGET } as const;

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

/** Starting values of the Exit dialog (e.g. reason LEAVE + the module leave's type and end). */
export interface ExitPreset {
  exit_reason?: string;
  /** With exit_reason LEAVE: the leave type of the leave-type master. */
  leave_type_id?: number | null;
  exit_date?: string;
  expected_return_date?: string | null;
  exit_remarks?: string | null;
}

export interface ExitDialogProps {
  open: boolean;
  c: LaCase;
  /** setup.exit_options: REJOINED, the leave choices ("On leave: …"), MEDICAL, RESIGNED, EXPIRED, OTHER. */
  exitOptions: ReadonlyArray<LaLeaveOption>;
  /** An older server without exit_options: its plain exit reasons. */
  exitReasons?: ReadonlyArray<LaCodeLabel>;
  today: string;
  preset: ExitPreset | null;
  onClose: () => void;
  /** exit_reason holds the choice's code, leave_type_id its leave type ("" = none). */
  onSubmit: (v: ExitFormValues) => Promise<void>;
}

export function ExitDialog(props: ExitDialogProps) {
  return (
    <DialogShell open={props.open} onClose={props.onClose}>
      <ExitForm {...props} />
    </DialogShell>
  );
}

function exitDefaults(
  preset: ExitPreset | null,
  today: string,
  choices: ReadonlyArray<LaLeaveOption>,
): ExitFormValues {
  const choice = normaliseLeaveChoice(
    choices,
    preset?.exit_reason ?? "",
    preset?.leave_type_id != null ? String(preset.leave_type_id) : "",
  );
  return {
    exit_reason: choice.code,
    leave_type_id: choice.leave_type_id,
    exit_date: preset?.exit_date ?? today,
    exit_remarks: preset?.exit_remarks ?? "",
    expected_return_date: preset?.expected_return_date ?? "",
  };
}

function ExitForm({ c, exitOptions, exitReasons, today, preset, onClose, onSubmit }: ExitDialogProps) {
  const schema = React.useMemo(
    () => makeExitSchema({ today, minDate: c.last_working_date }),
    [today, c.last_working_date],
  );
  const choices = React.useMemo(() => leaveChoices(exitOptions, exitReasons), [exitOptions, exitReasons]);
  const [defaults] = React.useState(() => exitDefaults(preset, today, choices));
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ExitFormValues>({ resolver: zodResolver(schema), defaultValues: defaults });
  const reason = useWatch({ control, name: "exit_reason" });
  const leaveTypeId = useWatch({ control, name: "leave_type_id" });
  const exitDate = useWatch({ control, name: "exit_date" });
  const options = React.useMemo(
    () => choices.map((o) => ({ value: encodeLeaveOption(o), label: o.label })),
    [choices],
  );
  const selected = reason ? encodeLeaveOption({ code: reason, leave_type_id: leaveTypeIdOrNull(leaveTypeId) }) : "";

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
        {hasModuleLeave(c) ? (
          <Alert severity="info">
            Approved leave in the leave module: {moduleLeaveRange(c) || "dates not known"}.
          </Alert>
        ) : null}
        <Box sx={FORM_GRID_2_SX}>
          <Controller
            name="exit_reason"
            control={control}
            render={({ field }) => (
              <SearchableOptionSelect<string>
                label="Reason"
                placeholder="Select reason"
                options={options}
                value={selected}
                onChange={(v) => {
                  const picked = decodeLeaveOption(v);
                  field.onChange(picked.code);
                  setValue("leave_type_id", picked.leave_type_id != null ? String(picked.leave_type_id) : "", {
                    shouldValidate: Boolean(errors.leave_type_id),
                  });
                }}
                required
                disabled={isSubmitting}
                error={Boolean(errors.exit_reason ?? errors.leave_type_id)}
                helperText={errors.exit_reason?.message ?? errors.leave_type_id?.message}
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
