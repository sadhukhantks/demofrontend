"use client";

import * as React from "react";
import { Alert, Box, Button, Chip, Stack, TextField, Typography } from "@mui/material";
import { Paperclip } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import { FORM_GRID_2_SX } from "@/components/ui/responsiveEntry";
import { spellLabel } from "@/components/lowPerformerFollowup/constants";
import {
  NOTICE_FILE_MIME_TYPES,
  type CodeLabel,
  type FollowupEvent,
  type FollowupEventType,
  type FollowupSpell,
} from "@/utils/lowPerformerFollowupService";
import {
  ISSUED_BY_MAX,
  REMARKS_MAX,
  eventFormDefaults,
  makeEventSchema,
  type EventFormValues,
} from "../_schemas";
import { fmtHours } from "../_utils";
import { DialogFormFrame, DialogShell } from "./DialogShell";

export interface EventDialogTarget {
  mode: "create" | "edit";
  eventType: FollowupEventType;
  /** The event being edited; null on create. */
  event: FollowupEvent | null;
}

export interface EventDialogProps {
  /** null = closed. */
  target: EventDialogTarget | null;
  noticeTypes: ReadonlyArray<CodeLabel>;
  spells: ReadonlyArray<FollowupSpell>;
  startDate: string;
  today: string;
  /** The follow-up's active events (hour-cut cap per date + spell). */
  events: ReadonlyArray<FollowupEvent>;
  onClose: () => void;
  /** Rejects with the backend's message, shown inline. */
  onSubmit: (values: EventFormValues, target: EventDialogTarget) => Promise<void>;
}

const TITLES: Record<FollowupEventType, { create: string; edit: string }> = {
  REMARK: { create: "Add remark", edit: "Edit remark" },
  NOTICE: { create: "Add warning / notice", edit: "Edit warning / notice" },
  HOURS_CUT: { create: "Add hour cut", edit: "Edit hour cut" },
};

/** Create or edit one timeline entry: a remark, a warning notice or an hour cut. */
export default function EventDialog(props: EventDialogProps) {
  const { target, onClose } = props;
  return (
    <DialogShell open={target != null} onClose={onClose}>
      {target ? <EventForm {...props} target={target} /> : null}
    </DialogShell>
  );
}

function EventForm({
  target,
  noticeTypes,
  spells,
  startDate,
  today,
  events,
  onClose,
  onSubmit,
}: EventDialogProps & { target: EventDialogTarget }) {
  const { eventType, mode, event } = target;
  const schema = React.useMemo(
    () =>
      makeEventSchema({
        eventType,
        startDate,
        today,
        spells,
        events,
        editingId: event?.followup_event_id ?? null,
      }),
    [eventType, startDate, today, spells, events, event],
  );
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const fileInput = React.useRef<HTMLInputElement | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EventFormValues>({
    resolver: zodResolver(schema),
    defaultValues: eventFormDefaults(event, today),
  });

  const spellId = useWatch({ control, name: "spell_id" });
  const pickedSpell = spells.find((s) => s.spell_id === spellId) ?? null;

  const noticeOptions = React.useMemo(
    () => noticeTypes.map((n) => ({ value: n.code, label: n.label })),
    [noticeTypes],
  );
  const spellOptions = React.useMemo(
    () =>
      spells.map((s) => ({
        value: s.spell_id,
        label: s.spell_name ? `${spellLabel(s)} — ${s.spell_name}` : spellLabel(s),
      })),
    [spells],
  );

  const submit = async (values: EventFormValues) => {
    setSaveError(null);
    try {
      await onSubmit(values, target);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Could not save the entry");
    }
  };

  const busy = isSubmitting;
  const remarksLabel =
    eventType === "REMARK" ? "Remark" : eventType === "HOURS_CUT" ? "Reason" : "Notes";

  return (
    <DialogFormFrame
      title={TITLES[eventType][mode]}
      onClose={onClose}
      onSubmit={(e) => void handleSubmit(submit)(e)}
      busy={busy}
      submitLabel="Save"
    >
      <Stack spacing={2.5} sx={{ pt: 1 }}>
        {saveError ? <Alert severity="error">{saveError}</Alert> : null}

        <Controller
          name="event_date"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              type="date"
              label="Date"
              required
              size="small"
              disabled={busy}
              error={Boolean(errors.event_date)}
              helperText={errors.event_date?.message}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: startDate, max: today } }}
              fullWidth
            />
          )}
        />

        {eventType === "NOTICE" ? (
          <Box sx={FORM_GRID_2_SX}>
            <Controller
              name="notice_type"
              control={control}
              render={({ field }) => (
                <SearchableOptionSelect<string>
                  label="Notice type"
                  placeholder="Select type"
                  options={noticeOptions}
                  value={field.value}
                  onChange={(v) => field.onChange(v)}
                  required
                  disabled={busy}
                  error={Boolean(errors.notice_type)}
                  helperText={errors.notice_type?.message}
                  fullWidth
                />
              )}
            />
            <Controller
              name="issued_by"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Issued by"
                  size="small"
                  disabled={busy}
                  error={Boolean(errors.issued_by)}
                  helperText={errors.issued_by?.message ?? "Optional"}
                  slotProps={{ htmlInput: { maxLength: ISSUED_BY_MAX } }}
                  fullWidth
                />
              )}
            />
          </Box>
        ) : null}

        {eventType === "HOURS_CUT" ? (
          <Box sx={FORM_GRID_2_SX}>
            <Controller
              name="spell_id"
              control={control}
              render={({ field }) => (
                <SearchableOptionSelect<number>
                  label="Spell"
                  placeholder="Select spell"
                  options={spellOptions}
                  value={field.value ?? ""}
                  onChange={(v) => field.onChange(v === "" ? null : v)}
                  required
                  disabled={busy}
                  error={Boolean(errors.spell_id)}
                  helperText={errors.spell_id?.message}
                  noOptionsText="No spells set up for this branch"
                  fullWidth
                />
              )}
            />
            <Controller
              name="hours_cut"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  type="number"
                  label="Hours cut"
                  required
                  size="small"
                  disabled={busy}
                  error={Boolean(errors.hours_cut)}
                  helperText={
                    errors.hours_cut?.message ??
                    (pickedSpell?.working_hours != null
                      ? `Spell has ${fmtHours(pickedSpell.working_hours)} h`
                      : undefined)
                  }
                  slotProps={{
                    htmlInput: {
                      min: 0,
                      step: 0.25,
                      inputMode: "decimal",
                      ...(pickedSpell?.working_hours != null ? { max: pickedSpell.working_hours } : {}),
                    },
                  }}
                  fullWidth
                />
              )}
            />
          </Box>
        ) : null}

        <Controller
          name="remarks"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label={remarksLabel}
              required={eventType !== "NOTICE"}
              size="small"
              multiline
              minRows={eventType === "REMARK" ? 3 : 2}
              disabled={busy}
              error={Boolean(errors.remarks)}
              helperText={errors.remarks?.message ?? (eventType === "NOTICE" ? "Optional" : undefined)}
              slotProps={{ htmlInput: { maxLength: REMARKS_MAX } }}
              fullWidth
            />
          )}
        />

        {eventType === "NOTICE" && mode === "create" ? (
          <Controller
            name="file"
            control={control}
            render={({ field }) => (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                  Scanned notice (optional) — PDF or photo, up to 10 MB
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<Paperclip size={16} />}
                    onClick={() => fileInput.current?.click()}
                    disabled={busy}
                    sx={{ minHeight: 40 }}
                  >
                    {field.value ? "Change file" : "Attach scan"}
                  </Button>
                  {field.value ? (
                    <Chip
                      label={field.value.name}
                      onDelete={busy ? undefined : () => field.onChange(null)}
                      sx={{ maxWidth: "100%" }}
                    />
                  ) : null}
                </Stack>
                <input
                  ref={fileInput}
                  type="file"
                  accept={NOTICE_FILE_MIME_TYPES.join(",")}
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    e.target.value = "";
                    if (file) field.onChange(file);
                  }}
                />
                {errors.file?.message ? (
                  <Typography variant="caption" sx={{ color: "error.main", display: "block", mt: 0.5 }}>
                    {errors.file.message}
                  </Typography>
                ) : null}
              </Box>
            )}
          />
        ) : null}

        {eventType === "NOTICE" && mode === "edit" ? (
          <Typography variant="caption" color="text.secondary">
            The scanned copy is replaced or removed from the timeline entry itself.
          </Typography>
        ) : null}
      </Stack>
    </DialogFormFrame>
  );
}
