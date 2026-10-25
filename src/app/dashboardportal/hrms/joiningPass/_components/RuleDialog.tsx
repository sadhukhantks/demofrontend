"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField } from "@mui/material";
import { saveJpRule, type JpRule, type JpSetup } from "@/utils/joiningPassService";

interface RuleDialogProps {
  open: boolean;
  coId: number;
  branchId: number;
  setup: JpSetup;
  onClose: () => void;
  onSaved: (rule: JpRule) => void;
  onNotify: (text: string, severity: "success" | "info" | "warning" | "error") => void;
}

function ruleSchema(l: JpSetup["rule_limits"]) {
  const int = (lim: { min: number; max: number }) =>
    z.coerce
      .number()
      .int("Whole days only")
      .min(lim.min, `At least ${lim.min}`)
      .max(lim.max, `At most ${lim.max}`);
  return z.object({
    min_absent_days: int(l.min_absent_days),
    lookback_days: int(l.lookback_days),
    fortnight_days: int(l.fortnight_days),
  });
}

/** The company rule: pass needed when absent MORE than N working days, etc. */
export default function RuleDialog({ open, coId, branchId, setup, onClose, onSaved, onNotify }: RuleDialogProps) {
  const schema = React.useMemo(() => ruleSchema(setup.rule_limits), [setup.rule_limits]);
  const form = useForm<z.input<typeof schema>, unknown, JpRule>({
    resolver: zodResolver(schema),
    defaultValues: setup.rule,
  });
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) form.reset(setup.rule);
  }, [open, setup.rule, form]);

  const submit = form.handleSubmit(async (v) => {
    setBusy(true);
    try {
      const rule = await saveJpRule(coId, branchId, v);
      onNotify("Joining pass rule saved", "success");
      onSaved(rule);
    } catch (e) {
      onNotify(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
    }
  });

  const err = form.formState.errors;
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Joining pass rule (company)</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Pass needed when absent MORE than (working days)"
            type="number"
            {...form.register("min_absent_days")}
            error={!!err.min_absent_days}
            helperText={err.min_absent_days?.message ?? "Holidays and non-working days are not counted"}
          />
          <TextField
            label="Absentee list: last seen within (days)"
            type="number"
            {...form.register("lookback_days")}
            error={!!err.lookback_days}
            helperText={err.lookback_days?.message ?? "Longer absences belong to Long Absenteeism"}
          />
          <TextField
            label="Fortnight on the letter (days)"
            type="number"
            {...form.register("fortnight_days")}
            error={!!err.fortnight_days}
            helperText={err.fortnight_days?.message ?? "Days ending on the last attendance day"}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" disabled={busy} onClick={() => void submit()}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
