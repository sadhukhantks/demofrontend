"use client";

/**
 * Settings tab (edit access; read-only view otherwise): the company's rule —
 * detection (incl. the excluded EB prefixes, default T,C,R,L), the waits
 * between letters (counted from the previous letter's
 * SENT date), the reply windows, the clause / signatory printed in the
 * letters and the labels of the extra watchlist columns. Saving re-reads
 * /setup so the watchlist picks up new waits and column labels.
 *
 * Backend: GET /rule, POST /rule_save (long_absenteeism_letters.py clean_rule:
 * whole days 0..365, detect >= 1, lookback 0 = no limit or detect..3650;
 * exclude_prefixes single letters, stored as T,C,R,L; a blank text keeps the
 * default).
 */

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { RotateCcw, Save } from "lucide-react";
import { Controller, useForm, type Control, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FORM_GRID_SX, STICKY_ACTIONS_SX } from "@/components/ui/responsiveEntry";
import { fetchLaRule, saveLaRule, type LaRule } from "@/utils/longAbsenteeismService";
import {
  EXCLUDE_PREFIXES_DEFAULT,
  LOOKBACK_DAYS_MAX,
  RULE_DAYS_MAX,
  RULE_TEXT_LIMITS,
  makeSettingsSchema,
  settingsDefaults,
  settingsPayload,
  type RuleDayField,
  type RuleTextField,
  type SettingsFormValues,
} from "../../_tabsSchemas";
import type { LaTabProps } from "./types";

const SETTINGS_SCHEMA = makeSettingsSchema();

/** What each day field drives (the contract's stage table). */
const DAY_FIELDS: ReadonlyArray<{ name: RuleDayField; label: string; help: string }> = Object.freeze([
  {
    name: "detect_days",
    label: "Detect after",
    help: "A worker with no attendance or approved leave for this many days becomes a candidate.",
  },
  {
    name: "lookback_days",
    label: "Look back",
    help:
      "0 = no limit (every worker on the roll absent at least the detect days is listed). " +
      "Set a number of days to list only workers seen recently.",
  },
  {
    name: "dismiss_snooze_days",
    label: "Dismiss snooze",
    help: "A dismissed candidate stays off the list this long (default of the Dismiss dialog).",
  },
  {
    name: "wait_w2_days",
    label: "2nd warning after",
    help: "Days after the 1st warning's sent date before the 2nd warning can be issued.",
  },
  {
    name: "wait_w3_days",
    label: "3rd & last warning after",
    help: "Days after the 2nd warning's sent date before the 3rd & last warning.",
  },
  {
    name: "wait_sc_days",
    label: "Show cause after",
    help: "Days after the 3rd warning's sent date before the show cause.",
  },
  {
    name: "sc_reply_days",
    label: "Show cause reply window",
    help: "Days the show cause gives to reply ({sc_reply_days}); the gate notice can follow this long after its sent date.",
  },
  {
    name: "notice_reply_days",
    label: "Gate notice window",
    help: "Days the gate notice gives; struck off can be sent for approval this long after its sent date.",
  },
]);

const DAY_GROUPS: ReadonlyArray<{ title: string; hint?: string; fields: ReadonlyArray<RuleDayField> }> = Object.freeze([
  { title: "Detection", fields: ["detect_days", "lookback_days", "dismiss_snooze_days"] },
  {
    title: "Waits between letters",
    hint: "Counted from the previous letter's sent date. The warnings give 7 days to report.",
    fields: ["wait_w2_days", "wait_w3_days", "wait_sc_days"],
  },
  { title: "Reply windows", fields: ["sc_reply_days", "notice_reply_days"] },
]);

const TEXT_FIELDS: ReadonlyArray<{ name: RuleTextField; label: string; help: string; multiline?: boolean }> =
  Object.freeze([
    {
      name: "clause_text",
      label: "Standing Order clause",
      help: "Printed where a letter has {clause_text}. Blank = the standard clause 14(C)(V) text.",
      multiline: true,
    },
    {
      name: "signatory",
      label: "Signatory",
      help: "Printed where a letter has {signatory}. Blank = Personnel Manager.",
    },
  ]);

/** Amendment 11.17: replaces the old "Leave out T-codes" switch. */
const EXCLUDE_PREFIXES_FIELD = Object.freeze({
  name: "exclude_prefixes" as const,
  label: "Excluded EB prefixes",
  help:
    "Letters, comma separated. Workers whose EB No starts with one of these are not listed as candidates. " +
    `Default ${EXCLUDE_PREFIXES_DEFAULT}.`,
});

const EXTRA_FIELDS: ReadonlyArray<RuleTextField> = Object.freeze([
  "extra_1_label",
  "extra_2_label",
  "extra_3_label",
  "extra_4_label",
  "extra_5_label",
]);

const DAY_META = new Map(DAY_FIELDS.map((f) => [f.name, f]));

interface FieldProps {
  control: Control<SettingsFormValues>;
  errors: FieldErrors<SettingsFormValues>;
  readOnly: boolean;
  busy: boolean;
}

function DayField({ name, control, errors, readOnly, busy }: FieldProps & { name: RuleDayField }) {
  const meta = DAY_META.get(name);
  return (
    <Controller
      name={name}
      control={control}
      render={({ field: { ref, ...rest } }) => (
        <TextField
          {...rest}
          inputRef={ref}
          label={meta?.label ?? name}
          size="small"
          disabled={busy}
          error={Boolean(errors[name])}
          helperText={errors[name]?.message ?? meta?.help}
          slotProps={{
            htmlInput: {
              inputMode: "numeric",
              pattern: "[0-9]*",
              maxLength: String(name === "lookback_days" ? LOOKBACK_DAYS_MAX : RULE_DAYS_MAX).length,
              readOnly,
            },
            input: { endAdornment: <InputAdornment position="end">days</InputAdornment> },
          }}
          fullWidth
        />
      )}
    />
  );
}

function TextRuleField({
  name,
  label,
  help,
  multiline,
  control,
  errors,
  readOnly,
  busy,
}: FieldProps & { name: RuleTextField; label: string; help: string; multiline?: boolean }) {
  const max = RULE_TEXT_LIMITS[name];
  return (
    <Controller
      name={name}
      control={control}
      render={({ field: { ref, ...rest } }) => (
        <TextField
          {...rest}
          inputRef={ref}
          label={label}
          size="small"
          multiline={multiline}
          minRows={multiline ? 3 : undefined}
          disabled={busy}
          error={Boolean(errors[name])}
          helperText={errors[name]?.message ?? help}
          slotProps={{ htmlInput: { maxLength: max, readOnly } }}
          fullWidth
        />
      )}
    />
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      {hint ? (
        <Typography variant="caption" color="text.secondary" component="div">
          {hint}
        </Typography>
      ) : null}
      <Box sx={{ mt: 1.5 }}>{children}</Box>
    </Box>
  );
}

function SettingsForm({
  coId,
  rule,
  canEdit,
  onSaved,
}: {
  coId: number;
  rule: LaRule;
  canEdit: boolean;
  onSaved: (rule: LaRule) => void;
}) {
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<SettingsFormValues>({
    resolver: zodResolver(SETTINGS_SCHEMA),
    defaultValues: settingsDefaults(rule),
  });
  const readOnly = !canEdit;
  const busy = isSubmitting;
  const fieldProps: FieldProps = { control, errors, readOnly, busy };

  const submit = async (v: SettingsFormValues) => {
    setSaveError(null);
    try {
      const saved = await saveLaRule(settingsPayload(coId, v));
      reset(settingsDefaults(saved));
      onSaved(saved);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Could not save the settings");
    }
  };

  return (
    <Box component="form" noValidate onSubmit={(e: React.FormEvent<HTMLFormElement>) => void handleSubmit(submit)(e)}>
      <Stack spacing={3}>
        {saveError ? (
          <Alert severity="error" onClose={() => setSaveError(null)}>
            {saveError}
          </Alert>
        ) : null}

        {DAY_GROUPS.map((g) => (
          <Section key={g.title} title={g.title} hint={g.hint}>
            <Box sx={FORM_GRID_SX}>
              {g.fields.map((name) => (
                <DayField key={name} name={name} {...fieldProps} />
              ))}
              {g.title === "Detection" ? <TextRuleField {...EXCLUDE_PREFIXES_FIELD} {...fieldProps} /> : null}
            </Box>
          </Section>
        ))}

        <Section title="Letter text">
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "2fr 1fr" } }}>
            {TEXT_FIELDS.map((f) => (
              <TextRuleField key={f.name} {...f} {...fieldProps} />
            ))}
          </Box>
        </Section>

        <Section
          title="Extra watchlist columns"
          hint="Name a column to show it on the watchlist and in the Excel export (edited like Remarks). Blank = hidden."
        >
          <Box sx={FORM_GRID_SX}>
            {EXTRA_FIELDS.map((name, i) => (
              <TextRuleField
                key={name}
                name={name}
                label={`Extra column ${i + 1}`}
                help={`Up to ${RULE_TEXT_LIMITS[name]} characters`}
                {...fieldProps}
              />
            ))}
          </Box>
        </Section>

        {canEdit ? (
          <Box sx={STICKY_ACTIONS_SX}>
            <Button
              type="submit"
              variant="contained"
              startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <Save size={16} />}
              disabled={busy || !isDirty}
            >
              Save settings
            </Button>
            <Button
              startIcon={<RotateCcw size={16} />}
              onClick={() => {
                setSaveError(null);
                reset(settingsDefaults(rule));
              }}
              disabled={busy || !isDirty}
            >
              Discard changes
            </Button>
          </Box>
        ) : null}
      </Stack>
    </Box>
  );
}

export default function SettingsTab({ coId, canEdit, onNotify, onSetupChanged }: LaTabProps) {
  const [rule, setRule] = React.useState<LaRule | null>(null);
  const [version, setVersion] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRule(await fetchLaRule(coId));
      setVersion((v) => v + 1);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not load the settings");
    } finally {
      setLoading(false);
    }
  }, [coId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const onSaved = (saved: LaRule) => {
    setRule(saved);
    onSetupChanged?.();
    onNotify("Settings saved. New waits apply to the next due dates worked out.", "success");
  };

  return (
    <Paper elevation={1} sx={{ p: { xs: 1.5, md: 2.5 } }}>
      <Typography variant="h6" sx={{ fontWeight: 600 }}>
        Settings
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        For the whole company. Days are whole days, 0 to {RULE_DAYS_MAX} (look back up to {LOOKBACK_DAYS_MAX}; 0 = no
        limit).
      </Typography>
      {!canEdit ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          View only — changing the settings needs edit access.
        </Alert>
      ) : null}
      {error ? (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => void load()}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      ) : null}
      {loading && !rule ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : null}
      {rule ? <SettingsForm key={version} coId={coId} rule={rule} canEdit={canEdit} onSaved={onSaved} /> : null}
    </Paper>
  );
}
