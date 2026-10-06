"use client";

/**
 * The dialog behind a row action of the Machines Worked grid (spec §12.4):
 *
 *   - Count   (a "no worker marked" row)  — asks the reason, pre-filled with
 *     "Production entered, no worker marked" when the row is a suggestion;
 *   - Exclude (a "worked" row)            — asks the reason;
 *   - Undo    (a manually added / excluded row) — shows what was done and by
 *     whom, and asks to confirm.
 *
 * Presentational: it validates the reason with the Zod schema in ../_service
 * and hands the parsed form (or the override id) back; the page does the API
 * call and the toast. It stays open on a failed save.
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from "@mui/material";
import { DIALOG_ACTIONS_SX } from "@/components/ui/responsiveEntry";
import {
  defaultOverrideReason,
  manualTooltipLines,
  OVERRIDE_REASON_MAX,
  validateMachineOverride,
  type MachineOverrideErrors,
  type MachineOverrideForm,
  type MachineOverrideInput,
  type MachineRowAction,
  type MachineWorkedRow,
} from "../_service";

/** The row an action was started on, and which action. */
export interface RowOverrideTarget {
  action: MachineRowAction;
  row: MachineWorkedRow;
}

export interface OverrideReasonDialogProps {
  /** Null keeps the dialog closed. */
  target: RowOverrideTarget | null;
  saving: boolean;
  onClose: () => void;
  /** Count / Exclude, with the validated form. */
  onSave: (form: MachineOverrideForm) => void;
  /** Undo, with the id of the override to retire. */
  onUndo: (overrideId: number) => void;
}

const TITLES: Record<MachineRowAction, string> = {
  count: "Count this machine as worked",
  exclude: "Exclude this machine",
  undo: "Undo this manual change",
};

const HINTS: Record<MachineRowAction, string> = {
  count: "It will count for the machine targets of this shift although no worker is marked on it.",
  exclude: "It will no longer count for the machine targets of this shift although a worker is marked on it.",
  undo: "The machine goes back to what the entries say for this shift.",
};

const CONFIRM_LABELS: Record<MachineRowAction, string> = {
  count: "Count",
  exclude: "Exclude",
  undo: "Undo",
};

const NO_ERRORS: MachineOverrideErrors = Object.freeze({});

function toInput(target: RowOverrideTarget, reason: string): MachineOverrideInput {
  return {
    tran_date: target.row.date,
    shift: target.row.shift,
    machine_ids: [target.row.machine_id],
    action: target.action === "exclude" ? "EXCLUDE" : "ADD",
    reason,
  };
}

export default function OverrideReasonDialog({
  target,
  saving,
  onClose,
  onSave,
  onUndo,
}: OverrideReasonDialogProps) {
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  // The last target is kept while the dialog animates shut, so its text does
  // not blank out mid-fade.
  const [shown, setShown] = useState<RowOverrideTarget | null>(target);

  useEffect(() => {
    if (!target) return;
    setShown(target);
    setReason(defaultOverrideReason(target.action, target.row));
    setSubmitted(false);
  }, [target]);

  const current = target ?? shown;
  const errors: MachineOverrideErrors = useMemo(() => {
    if (!submitted || !current || current.action === "undo") return NO_ERRORS;
    const result = validateMachineOverride(toInput(current, reason));
    return result.ok ? NO_ERRORS : result.errors;
  }, [submitted, current, reason]);

  if (!current) return null;
  const { action, row } = current;
  const asksReason = action !== "undo";
  // A fault that is not the reason's (e.g. a shift letter the endpoint does not
  // take) has no field to sit under.
  const otherError = errors.tran_date ?? errors.shift ?? errors.machine_ids ?? null;
  const manualLines = action === "undo" ? manualTooltipLines(row) : [];

  const handleConfirm = () => {
    if (action === "undo") {
      if (row.override_id != null) onUndo(row.override_id);
      return;
    }
    setSubmitted(true);
    const result = validateMachineOverride(toInput(current, reason));
    if (result.ok) onSave(result.data);
  };

  return (
    <Dialog
      open={target != null}
      onClose={saving ? undefined : onClose}
      maxWidth="xs"
      fullWidth
      aria-labelledby="row-override-title"
    >
      <DialogTitle id="row-override-title">{TITLES[action]}</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: "grid", gap: 2 }}>
          <Box>
            <Typography variant="subtitle2">
              {row.machine}
              {row.mech_code ? ` (${row.mech_code})` : ""}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {[row.date, `Shift ${row.shift}`, row.machine_type].filter(Boolean).join(" · ")}
            </Typography>
          </Box>
          {manualLines.length > 0 ? (
            <Box>
              {manualLines.map((line) => (
                <Typography key={line} variant="body2">
                  {line}
                </Typography>
              ))}
            </Box>
          ) : null}
          <Typography variant="body2" color="text.secondary">
            {HINTS[action]}
          </Typography>
          {asksReason ? (
            <TextField
              label="Reason"
              size="small"
              required
              autoFocus
              multiline
              minRows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              slotProps={{ htmlInput: { maxLength: OVERRIDE_REASON_MAX } }}
              error={!!errors.reason}
              helperText={errors.reason ?? "Kept with your name and the time"}
            />
          ) : null}
          {otherError ? <Alert severity="error">{otherError}</Alert> : null}
        </Box>
      </DialogContent>
      <DialogActions sx={DIALOG_ACTIONS_SX}>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color={action === "exclude" ? "error" : "primary"}
          onClick={handleConfirm}
          disabled={saving}
        >
          {saving ? "Saving..." : CONFIRM_LABELS[action]}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
