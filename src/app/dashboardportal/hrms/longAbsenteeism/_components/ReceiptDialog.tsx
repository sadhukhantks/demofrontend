"use client";

import * as React from "react";
import { Alert, Autocomplete, Box, Stack, TextField } from "@mui/material";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FORM_GRID_2_SX } from "@/components/ui/responsiveEntry";
import type { LaLetter, LaReceipt } from "@/utils/longAbsenteeismService";
import {
  RECEIPT_REMARKS_MAX,
  RECEIVED_BY_MAX,
  UNION_NAME_MAX,
  makeReceiptSchema,
  type ReceiptFormValues,
} from "../_schemas";
import { DialogFormFrame, DialogShell } from "./DialogShell";

export interface ReceiptDialogTarget {
  letter: LaLetter;
  /** null = add. */
  receipt: LaReceipt | null;
}

export interface ReceiptDialogProps {
  /** null = closed. */
  target: ReceiptDialogTarget | null;
  /** Union names used before in the branch (suggestions; free text allowed). */
  unionNames: ReadonlyArray<string>;
  today: string;
  onClose: () => void;
  onSubmit: (values: ReceiptFormValues, target: ReceiptDialogTarget) => Promise<void>;
}

/** One working union served with the gate notice. */
export default function ReceiptDialog(props: ReceiptDialogProps) {
  return (
    <DialogShell open={props.target != null} onClose={props.onClose}>
      {props.target ? <ReceiptForm {...props} target={props.target} /> : null}
    </DialogShell>
  );
}

function ReceiptForm({ target, unionNames, today, onClose, onSubmit }: ReceiptDialogProps & { target: ReceiptDialogTarget }) {
  const minDate = target.letter.issue_date;
  const schema = React.useMemo(() => makeReceiptSchema({ today, minDate }), [today, minDate]);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const r = target.receipt;
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ReceiptFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      union_name: r?.union_name ?? "",
      received_by: r?.received_by ?? "",
      received_date: r?.received_date ?? (today >= minDate ? today : minDate),
      remarks: r?.remarks ?? "",
    },
  });
  const options = React.useMemo(() => [...unionNames], [unionNames]);

  const submit = async (v: ReceiptFormValues) => {
    setSaveError(null);
    try {
      await onSubmit(v, target);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Could not save the receipt");
    }
  };

  return (
    <DialogFormFrame
      title={r ? "Edit union receipt" : "Add union receipt"}
      onClose={onClose}
      onSubmit={(e) => void handleSubmit(submit)(e)}
      busy={isSubmitting}
      submitLabel="Save"
    >
      <Stack spacing={2.5} sx={{ pt: 1 }}>
        {saveError ? <Alert severity="error">{saveError}</Alert> : null}
        <Controller
          name="union_name"
          control={control}
          render={({ field }) => (
            // Searchable with free text: earlier unions are suggested, a new name can be typed.
            <Autocomplete<string, false, false, true>
              freeSolo
              options={options}
              value={field.value}
              inputValue={field.value}
              onInputChange={(_e, value) => field.onChange(value)}
              onChange={(_e, value) => field.onChange(value ?? "")}
              disabled={isSubmitting}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Union"
                  required
                  size="small"
                  autoFocus
                  error={Boolean(errors.union_name)}
                  helperText={errors.union_name?.message ?? "Pick a union served before, or type a new name"}
                  inputProps={{ ...params.inputProps, maxLength: UNION_NAME_MAX }}
                />
              )}
              fullWidth
            />
          )}
        />
        <Box sx={FORM_GRID_2_SX}>
          <Controller
            name="received_by"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label="Received by"
                size="small"
                disabled={isSubmitting}
                error={Boolean(errors.received_by)}
                helperText={errors.received_by?.message ?? "Union representative"}
                slotProps={{ htmlInput: { maxLength: RECEIVED_BY_MAX } }}
                fullWidth
              />
            )}
          />
          <Controller
            name="received_date"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                type="date"
                label="Received on"
                size="small"
                disabled={isSubmitting}
                error={Boolean(errors.received_date)}
                helperText={errors.received_date?.message}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: minDate, max: today } }}
                fullWidth
              />
            )}
          />
        </Box>
        <Controller
          name="remarks"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label="Remarks"
              size="small"
              multiline
              minRows={2}
              disabled={isSubmitting}
              error={Boolean(errors.remarks)}
              helperText={errors.remarks?.message ?? "Optional"}
              slotProps={{ htmlInput: { maxLength: RECEIPT_REMARKS_MAX } }}
              fullWidth
            />
          )}
        />
      </Stack>
    </DialogFormFrame>
  );
}
