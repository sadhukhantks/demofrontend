"use client";

import * as React from "react";
import { Alert, Box, Checkbox, FormControlLabel, Stack, TextField } from "@mui/material";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import { FORM_GRID_2_SX, TOUCH_TARGET } from "@/components/ui/responsiveEntry";
import type { LaCodeLabel, LaEvent, LaUserEventType } from "@/utils/longAbsenteeismService";
import { CONTACT_MAX, TEXT_MAX, makeEventSchema, type EventFormValues } from "../_schemas";
import { DialogFormFrame, DialogShell } from "./DialogShell";

export interface EventDialogTarget {
  mode: "create" | "edit";
  eventType: LaUserEventType;
  /** The entry being edited; null on create. */
  event: LaEvent | null;
}

export interface EventDialogProps {
  /** null = closed. */
  target: EventDialogTarget | null;
  replyChannels: ReadonlyArray<LaCodeLabel>;
  eventTypes: ReadonlyArray<LaCodeLabel>;
  today: string;
  /** Entries cannot predate the case (its detected date). */
  minDate: string | null;
  /** The case is open (a new reply may park it). */
  caseOpen: boolean;
  onClose: () => void;
  /** Rejects with the backend's message, shown inline. */
  onSubmit: (values: EventFormValues, target: EventDialogTarget) => Promise<void>;
}

const VERBS: Record<LaUserEventType, string> = { REMARK: "remark", FEEDBACK: "feedback", REPLY: "reply / contact" };

/** Create or edit a remark, feedback (time keeper / department) or a reply from the worker. */
export default function EventDialog(props: EventDialogProps) {
  return (
    <DialogShell open={props.target != null} onClose={props.onClose}>
      {props.target ? <EventForm {...props} target={props.target} /> : null}
    </DialogShell>
  );
}

function EventForm({
  target,
  replyChannels,
  eventTypes,
  today,
  minDate,
  caseOpen,
  onClose,
  onSubmit,
}: EventDialogProps & { target: EventDialogTarget }) {
  const { eventType, mode, event } = target;
  const schema = React.useMemo(() => makeEventSchema({ eventType, today, minDate }), [eventType, today, minDate]);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EventFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      event_date: event?.event_date ?? today,
      channel: event?.channel ?? "",
      contact_name: event?.contact_name ?? "",
      text: event?.text ?? "",
      park: mode === "create" && eventType === "REPLY" && caseOpen,
    },
  });
  const channelOptions = React.useMemo(
    () => replyChannels.map((c) => ({ value: c.code, label: c.label })),
    [replyChannels],
  );
  const typeLabel = eventTypes.find((t) => t.code === eventType)?.label ?? VERBS[eventType];

  const submit = async (values: EventFormValues) => {
    setSaveError(null);
    try {
      await onSubmit(values, target);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Could not save the entry");
    }
  };

  return (
    <DialogFormFrame
      title={`${mode === "create" ? "Add" : "Edit"} ${typeLabel.toLowerCase()}`}
      onClose={onClose}
      onSubmit={(e) => void handleSubmit(submit)(e)}
      busy={isSubmitting}
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
              disabled={isSubmitting}
              error={Boolean(errors.event_date)}
              helperText={errors.event_date?.message}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: minDate ?? undefined, max: today } }}
              fullWidth
            />
          )}
        />
        {eventType === "REPLY" ? (
          <Box sx={FORM_GRID_2_SX}>
            <Controller
              name="channel"
              control={control}
              render={({ field }) => (
                <SearchableOptionSelect<string>
                  label="How"
                  placeholder="In person, union, letter…"
                  options={channelOptions}
                  value={field.value}
                  onChange={(v) => field.onChange(v)}
                  disabled={isSubmitting}
                  error={Boolean(errors.channel)}
                  helperText={errors.channel?.message}
                  fullWidth
                />
              )}
            />
            <Controller
              name="contact_name"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Contact / representative"
                  size="small"
                  disabled={isSubmitting}
                  error={Boolean(errors.contact_name)}
                  helperText={errors.contact_name?.message ?? "Optional"}
                  slotProps={{ htmlInput: { maxLength: CONTACT_MAX } }}
                  fullWidth
                />
              )}
            />
          </Box>
        ) : null}
        <Controller
          name="text"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label={eventType === "REPLY" ? "What was said / submitted" : "Text"}
              required
              size="small"
              multiline
              minRows={3}
              disabled={isSubmitting}
              error={Boolean(errors.text)}
              helperText={errors.text?.message}
              slotProps={{ htmlInput: { maxLength: TEXT_MAX } }}
              fullWidth
            />
          )}
        />
        {eventType === "REPLY" && mode === "create" && caseOpen ? (
          <Controller
            name="park"
            control={control}
            render={({ field }) => (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={field.value}
                    onChange={(e) => field.onChange(e.target.checked)}
                    disabled={isSubmitting}
                    sx={{ minWidth: TOUCH_TARGET, minHeight: TOUCH_TARGET }}
                  />
                }
                label="Park the case while the reply is reviewed (it stops ageing)"
              />
            )}
          />
        ) : null}
        {eventType === "REPLY" && mode === "create" ? (
          <Alert severity="info">Attach the reply letter or medical certificate on the timeline entry after saving.</Alert>
        ) : null}
      </Stack>
    </DialogFormFrame>
  );
}
