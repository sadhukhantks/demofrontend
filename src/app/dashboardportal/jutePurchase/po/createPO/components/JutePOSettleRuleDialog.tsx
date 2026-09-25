"use client";

/**
 * @component JutePOSettleRuleDialog
 * @description "Settlement rules" dialog (PO list header gear). Three fields,
 * zod-validated; the parent loads/saves through `useJutePOSettleRule` and passes
 * state in. After a save the recompute counts ("closed n, reopened n") are shown.
 */

import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { Button } from "@/components/ui/button";
import { DEFAULT_TOLERANCE_LORRY_FRACTION, jutePOSettleRuleInputSchema } from "@/utils/jutePOService";
import type { JutePOSettleRule, JutePOSettleRuleInput } from "../types/jutePOTypes";

type JutePOSettleRuleDialogProps = {
  open: boolean;
  /** Current rule; null while loading or when the load failed. */
  rule: JutePOSettleRule | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  /** "closed n, reopened n" after a successful save; null otherwise. */
  saveSummary: string | null;
  onClose: () => void;
  onSave: (input: JutePOSettleRuleInput) => void | Promise<unknown>;
};

const DEFAULTS: JutePOSettleRuleInput = {
  lorry_rule_enabled: false,
  tolerance_lorry_fraction: DEFAULT_TOLERANCE_LORRY_FRACTION,
  stale_days: 30,
};

/** Number input → form number; empty becomes NaN so zod reports "Enter a number". */
const toNumber = (raw: string): number => (raw.trim() === "" ? Number.NaN : Number(raw));
const fromNumber = (value: number): string => (Number.isNaN(value) ? "" : String(value));

export function JutePOSettleRuleDialog({
  open,
  rule,
  loading,
  saving,
  error,
  saveSummary,
  onClose,
  onSave,
}: JutePOSettleRuleDialogProps) {
  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isDirty },
  } = useForm<JutePOSettleRuleInput>({
    resolver: zodResolver(jutePOSettleRuleInputSchema),
    defaultValues: DEFAULTS,
  });

  React.useEffect(() => {
    if (open && rule) {
      reset({
        lorry_rule_enabled: rule.lorry_rule_enabled,
        tolerance_lorry_fraction: rule.tolerance_lorry_fraction,
        stale_days: rule.stale_days,
      });
    }
  }, [open, rule, reset]);

  const lorryOn = watch("lorry_rule_enabled");
  const tolerance = watch("tolerance_lorry_fraction");
  const staleDays = watch("stale_days");
  const busy = loading || saving;

  const submit = handleSubmit(async (values) => {
    await onSave(values);
  });

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <form onSubmit={submit} noValidate>
        <DialogTitle>Settlement rules</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            A live PO closes automatically once its receipts meet either rule. Saving re-evaluates every
            PO of the company straight away.
          </DialogContentText>

          {loading ? (
            <Stack alignItems="center" sx={{ py: 3 }}>
              <CircularProgress size={28} />
            </Stack>
          ) : (
            <Stack spacing={2.5}>
              <Controller
                name="lorry_rule_enabled"
                control={control}
                render={({ field }) => (
                  <FormControlLabel
                    control={
                      <Switch checked={field.value} onChange={(_e, checked) => field.onChange(checked)} disabled={busy} />
                    }
                    label={
                      <Stack spacing={0}>
                        <Typography variant="body2">Settle when all lorries are received</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Received lorries ≥ vehicle quantity on the PO
                        </Typography>
                      </Stack>
                    }
                    sx={{ alignItems: "flex-start", ml: 0, "& .MuiSwitch-root": { mt: -0.5 } }}
                  />
                )}
              />

              <Controller
                name="tolerance_lorry_fraction"
                control={control}
                render={({ field }) => (
                  <TextField
                    label="Tolerance (fraction of one lorry)"
                    type="number"
                    fullWidth
                    value={fromNumber(field.value)}
                    onChange={(e) => field.onChange(toNumber(e.target.value))}
                    onBlur={field.onBlur}
                    disabled={busy}
                    error={Boolean(errors.tolerance_lorry_fraction)}
                    helperText={
                      errors.tolerance_lorry_fraction?.message ??
                      `0.5 = half a lorry: a 10 MT lorry gives 5 MT tolerance${
                        Number.isNaN(tolerance) || tolerance === 0.5 ? "" : ` (${tolerance} → ${Math.round(tolerance * 100) / 10} MT)`
                      }`
                    }
                    slotProps={{ htmlInput: { min: 0, max: 1, step: 0.05, inputMode: "decimal" } }}
                  />
                )}
              />

              <Controller
                name="stale_days"
                control={control}
                render={({ field }) => (
                  <TextField
                    label="Stale after (days)"
                    type="number"
                    fullWidth
                    value={fromNumber(field.value)}
                    onChange={(e) => field.onChange(toNumber(e.target.value))}
                    onBlur={field.onBlur}
                    disabled={busy}
                    error={Boolean(errors.stale_days)}
                    helperText={
                      errors.stale_days?.message ??
                      `Overdue POs with no receipt for ${Number.isNaN(staleDays) ? "…" : staleDays} days are flagged stale (1–365)`
                    }
                    slotProps={{ htmlInput: { min: 1, max: 365, step: 1, inputMode: "numeric" } }}
                  />
                )}
              />

              {rule?.is_default && !isDirty ? (
                <Typography variant="caption" color="text.secondary">
                  Showing the built-in defaults — this company has no saved rule yet.
                </Typography>
              ) : null}
              {rule?.legacy_pct_contract ? (
                <Alert severity="warning" variant="outlined" sx={{ py: 0 }}>
                  This server still uses the old percentage tolerance; the fraction shown is the default and
                  saving may be rejected until the backend is updated.
                </Alert>
              ) : null}
              {!lorryOn ? (
                <Typography variant="caption" color="text.secondary">
                  With the lorry rule off, only the weight rule can settle a PO.
                </Typography>
              ) : null}
            </Stack>
          )}

          {error ? (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          ) : null}
          {saveSummary ? (
            <Alert severity="success" sx={{ mt: 2 }}>
              Rules saved. Re-evaluated POs: {saveSummary}.
            </Alert>
          ) : null}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            {saveSummary ? "Done" : "Cancel"}
          </Button>
          <Button type="submit" variant="default" disabled={busy || rule === null}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

export default JutePOSettleRuleDialog;
