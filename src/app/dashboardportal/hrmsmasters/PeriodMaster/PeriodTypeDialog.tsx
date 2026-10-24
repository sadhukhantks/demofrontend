"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { Plus, Trash2, X } from "lucide-react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import { previewLine, validateSlots } from "./periodPreview";
import {
  FREQUENCY_OPTIONS,
  WEEKDAY_OPTIONS,
  periodTypeFormSchema,
  presetSlots,
  type Frequency,
  type PeriodTypeFormValues,
  type PeriodTypeRecord,
  type SlotInput,
} from "./types";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved?: (message: string) => void;
  editId?: number;
  /** Read-only view of an existing period type. */
  viewOnly?: boolean;
  /** Opens the generated-periods dialog for this type (edit / view mode). */
  onOpenPeriods?: (periodTypeId: number, name: string) => void;
}

const DEFAULTS: PeriodTypeFormValues = {
  period_type_name: "",
  frequency: "FORTNIGHTLY",
  week_start_day: null,
  remarks: "",
  active: true,
  slots: presetSlots("FORTNIGHTLY"),
};

const toNum = (raw: string): number => (raw === "" ? Number.NaN : Number(raw));
const fromNum = (v: number): string => (Number.isNaN(v) ? "" : String(v));

/**
 * Create / edit dialog for a Period Type (rule scoped by sidebar company and
 * first selected branch). Slots are edited with a field array; rules lock once
 * periods have been generated.
 */
export default function PeriodTypeDialog({ open, onClose, onSaved, editId, viewOnly, onOpenPeriods }: Props) {
  const { selectedCompany, selectedBranches } = useSidebarContext();
  const coId = selectedCompany?.co_id;
  const branchId = selectedBranches.length > 0 ? selectedBranches[0] : undefined;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [record, setRecord] = useState<PeriodTypeRecord | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({
    open: false,
    message: "",
    severity: "success",
  });

  const isEdit = editId !== undefined;
  const locked = isEdit && record?.rules_locked === true;
  const readOnly = viewOnly === true;
  const rulesDisabled = readOnly || locked;

  const { control, handleSubmit, reset, setValue, formState } = useForm<PeriodTypeFormValues>({
    resolver: zodResolver(periodTypeFormSchema),
    defaultValues: DEFAULTS,
  });
  const { fields, append, remove } = useFieldArray({ control, name: "slots" });
  const frequency = useWatch({ control, name: "frequency" });
  const watchedSlots = useWatch({ control, name: "slots" });

  const notifyError = useCallback(
    (message: string) => setSnackbar({ open: true, message, severity: "error" }),
    [],
  );

  useEffect(() => {
    if (!open) {
      setRecord(null);
      return;
    }
    if (editId === undefined) {
      reset(DEFAULTS);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const { data, error } = await fetchWithCookie<{ data: PeriodTypeRecord }>(
          `${apiRoutesPortalMasters.PERIOD_TYPE_BY_ID}/${editId}`,
          "GET",
        );
        if (error || !data) throw new Error(error || "Failed to load period type");
        if (cancelled) return;
        const rec = data.data;
        setRecord(rec);
        reset({
          period_type_name: rec.period_type_name,
          frequency: rec.frequency,
          week_start_day: rec.week_start_day,
          remarks: rec.remarks ?? "",
          active: Boolean(rec.active),
          slots: rec.slots.map((s) => ({
            slot_no: s.slot_no,
            slot_name: s.slot_name,
            slot_code: s.slot_code,
            from_day: s.from_day,
            from_prev_month: s.from_prev_month ? 1 : 0,
            to_day: s.to_day,
          })),
        });
      } catch (err: unknown) {
        if (!cancelled) notifyError(err instanceof Error ? err.message : "Error loading period type");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, editId, reset, notifyError]);

  const handleFrequencyChange = (value: string) => {
    if (value === "") return;
    const freq = value as Frequency;
    setValue("frequency", freq, { shouldDirty: true });
    setValue("slots", presetSlots(freq));
    setValue("week_start_day", freq === "WEEKLY" ? 1 : null);
  };

  const preview = useMemo(() => {
    if (frequency === "WEEKLY") return "";
    const now = new Date();
    const slots: SlotInput[] = (watchedSlots ?? []).map((s) => ({
      ...s,
      from_day: Number.isNaN(s.from_day) ? 1 : s.from_day,
    }));
    return previewLine(slots, now.getFullYear(), now.getMonth() + 1);
  }, [frequency, watchedSlots]);

  const onValid = async (values: PeriodTypeFormValues) => {
    if (!isEdit && (coId == null || branchId == null)) {
      notifyError("Select a company and branch in the sidebar before saving");
      return;
    }
    const weekly = values.frequency === "WEEKLY";
    if (!weekly) {
      const msg = validateSlots(values.slots);
      if (msg) {
        notifyError(msg);
        return;
      }
    }
    setSaving(true);
    try {
      const payload = {
        co_id: coId,
        branch_id: branchId,
        period_type_name: values.period_type_name.trim(),
        frequency: values.frequency,
        week_start_day: weekly ? values.week_start_day : null,
        remarks: values.remarks,
        active: values.active ? 1 : 0,
        slots: weekly
          ? []
          : values.slots.map((s, i) => ({
              ...s,
              slot_no: i + 1,
              from_prev_month: i === 0 ? s.from_prev_month : 0,
            })),
      };
      const { error } = await fetchWithCookie(
        isEdit ? `${apiRoutesPortalMasters.PERIOD_TYPE_EDIT}/${editId}` : apiRoutesPortalMasters.PERIOD_TYPE_CREATE,
        isEdit ? "PUT" : "POST",
        payload,
      );
      if (error) throw new Error(error);
      onSaved?.(isEdit ? "Period type updated successfully" : "Period type created successfully");
      onClose();
    } catch (err: unknown) {
      notifyError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const title = readOnly ? "View Period Type" : isEdit ? "Edit Period Type" : "Add Period Type";
  const slotsError = formState.errors.slots?.message ?? formState.errors.slots?.root?.message;

  return (
    <>
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", pb: 1 }}>
          <Typography variant="h6" component="span">
            {title}
          </Typography>
          <IconButton onClick={onClose} size="small" aria-label="Close dialog">
            <X size={20} />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers>
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 200 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Box sx={{ pt: 1, display: "flex", flexDirection: "column", gap: 2 }}>
              <Controller
                control={control}
                name="period_type_name"
                render={({ field, fieldState }) => (
                  <TextField
                    {...field}
                    label="Period Type Name"
                    size="small"
                    fullWidth
                    required
                    disabled={readOnly}
                    error={!!fieldState.error}
                    helperText={fieldState.error?.message ?? 'e.g. "Wages Fortnight"'}
                  />
                )}
              />

              <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
                <SearchableOptionSelect
                  label="Frequency"
                  size="small"
                  fullWidth
                  required
                  clearable={false}
                  disabled={rulesDisabled}
                  options={FREQUENCY_OPTIONS}
                  value={frequency}
                  onChange={handleFrequencyChange}
                />
                {frequency === "WEEKLY" && (
                  <Controller
                    control={control}
                    name="week_start_day"
                    render={({ field, fieldState }) => (
                      <SearchableOptionSelect
                        label="Week Start Day"
                        size="small"
                        fullWidth
                        required
                        clearable={false}
                        disabled={rulesDisabled}
                        options={WEEKDAY_OPTIONS}
                        value={field.value}
                        onChange={(v) => field.onChange(v === "" ? null : Number(v))}
                        error={!!fieldState.error}
                        helperText={fieldState.error?.message}
                      />
                    )}
                  />
                )}
              </Box>

              {locked && (
                <Alert severity="info">
                  Rules are locked because periods were generated; delete the generated periods to change them.
                </Alert>
              )}

              {frequency !== "WEEKLY" && (
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    Slots (how the month is split)
                  </Typography>
                  <Box sx={{ overflowX: "auto" }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>#</TableCell>
                          <TableCell>Name</TableCell>
                          <TableCell>Code</TableCell>
                          <TableCell>From day</TableCell>
                          <TableCell>Prev. month</TableCell>
                          <TableCell>To day</TableCell>
                          {frequency === "CUSTOM" && !rulesDisabled && <TableCell />}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {fields.map((f, i) => (
                          <TableRow key={f.id}>
                            <TableCell>{i + 1}</TableCell>
                            <TableCell sx={{ minWidth: 150 }}>
                              <Controller
                                control={control}
                                name={`slots.${i}.slot_name`}
                                render={({ field, fieldState }) => (
                                  <TextField
                                    {...field}
                                    size="small"
                                    fullWidth
                                    disabled={rulesDisabled}
                                    error={!!fieldState.error}
                                    helperText={fieldState.error?.message}
                                  />
                                )}
                              />
                            </TableCell>
                            <TableCell sx={{ minWidth: 90 }}>
                              <Controller
                                control={control}
                                name={`slots.${i}.slot_code`}
                                render={({ field, fieldState }) => (
                                  <TextField
                                    {...field}
                                    size="small"
                                    fullWidth
                                    disabled={rulesDisabled}
                                    error={!!fieldState.error}
                                    helperText={fieldState.error?.message}
                                  />
                                )}
                              />
                            </TableCell>
                            <TableCell sx={{ minWidth: 90 }}>
                              <Controller
                                control={control}
                                name={`slots.${i}.from_day`}
                                render={({ field, fieldState }) => (
                                  <TextField
                                    name={field.name}
                                    inputRef={field.ref}
                                    onBlur={field.onBlur}
                                    value={fromNum(field.value)}
                                    onChange={(e) => field.onChange(toNum(e.target.value))}
                                    type="number"
                                    size="small"
                                    fullWidth
                                    disabled={rulesDisabled}
                                    slotProps={{ htmlInput: { min: 1, max: 31 } }}
                                    error={!!fieldState.error}
                                    helperText={fieldState.error?.message}
                                  />
                                )}
                              />
                            </TableCell>
                            <TableCell>
                              {i === 0 ? (
                                <Controller
                                  control={control}
                                  name="slots.0.from_prev_month"
                                  render={({ field }) => (
                                    <Checkbox
                                      checked={field.value === 1}
                                      onChange={(e) => field.onChange(e.target.checked ? 1 : 0)}
                                      disabled={rulesDisabled}
                                      inputProps={{ "aria-label": "Starts in previous month" }}
                                    />
                                  )}
                                />
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell sx={{ minWidth: 110 }}>
                              <Controller
                                control={control}
                                name={`slots.${i}.to_day`}
                                render={({ field, fieldState }) => (
                                  <TextField
                                    name={field.name}
                                    inputRef={field.ref}
                                    onBlur={field.onBlur}
                                    value={field.value == null ? "" : String(field.value)}
                                    onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                                    type="number"
                                    size="small"
                                    fullWidth
                                    placeholder="Month end"
                                    disabled={rulesDisabled}
                                    slotProps={{ htmlInput: { min: 1, max: 31 } }}
                                    error={!!fieldState.error}
                                    helperText={fieldState.error?.message}
                                  />
                                )}
                              />
                            </TableCell>
                            {frequency === "CUSTOM" && !rulesDisabled && (
                              <TableCell>
                                <IconButton
                                  size="small"
                                  aria-label="Remove slot"
                                  disabled={fields.length <= 1}
                                  onClick={() => remove(i)}
                                >
                                  <Trash2 size={16} />
                                </IconButton>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Box>
                  {typeof slotsError === "string" && (
                    <Typography variant="caption" color="error">
                      {slotsError}
                    </Typography>
                  )}
                  {frequency === "CUSTOM" && !rulesDisabled && (
                    <Button
                      size="small"
                      startIcon={<Plus size={16} />}
                      sx={{ mt: 1 }}
                      onClick={() =>
                        append({
                          slot_no: fields.length + 1,
                          slot_name: `Period ${fields.length + 1}`,
                          slot_code: `P${fields.length + 1}`,
                          from_day: 1,
                          from_prev_month: 0,
                          to_day: null,
                        })
                      }
                    >
                      Add slot
                    </Button>
                  )}
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                    Leave To day blank for month end. Tick “Prev. month” on slot 1 if the period starts in the previous
                    month (the last slot must then end the day before slot 1 starts).
                  </Typography>
                  {preview && (
                    <Typography variant="body2" sx={{ mt: 1, fontWeight: 500 }}>
                      Preview: {preview}
                    </Typography>
                  )}
                </Box>
              )}

              <Controller
                control={control}
                name="remarks"
                render={({ field, fieldState }) => (
                  <TextField
                    {...field}
                    label="Remarks"
                    size="small"
                    fullWidth
                    multiline
                    minRows={2}
                    disabled={readOnly}
                    error={!!fieldState.error}
                    helperText={fieldState.error?.message}
                  />
                )}
              />
              <Controller
                control={control}
                name="active"
                render={({ field }) => (
                  <FormControlLabel
                    control={
                      <Checkbox checked={field.value} onChange={(e) => field.onChange(e.target.checked)} disabled={readOnly} />
                    }
                    label="Active"
                  />
                )}
              />
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 1.5 }}>
          {isEdit && onOpenPeriods && record && (
            <Button
              onClick={() => onOpenPeriods(record.period_type_id, record.period_type_name)}
              sx={{ mr: "auto" }}
            >
              Periods ({record.period_count})
            </Button>
          )}
          <Button onClick={onClose}>{readOnly ? "Close" : "Cancel"}</Button>
          {!readOnly && (
            <Button variant="contained" disabled={saving || loading} onClick={handleSubmit(onValid)}>
              {saving ? "Saving..." : "Save"}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))} sx={{ width: "100%" }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
}
