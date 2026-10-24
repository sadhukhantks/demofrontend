"use client";

/**
 * Check & issue: type the EB No and the joining date, see the attendance
 * criterion (absent working days vs the threshold), the letter figures and the
 * letter preview, then issue + print the pass. A pass already issued for the
 * same absence is reprinted instead of issued twice.
 */

import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Box, Button, Chip, CircularProgress, Grid, Paper, Stack, TextField, Typography } from "@mui/material";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import {
  checkJoiningPass,
  fetchJpPass,
  issueJoiningPass,
  jpIssueFormSchema,
  type JpCheck,
  type JpIssueForm,
  type JpSetup,
} from "@/utils/joiningPassService";
import { fmtDate, fmtLetterDate, prevDay, verdictOf, verdictText } from "../_utils";
import { printPasses } from "../_print";
import PassPreview from "./PassPreview";

export interface IssuePrefill {
  empCode: string;
  joinDate: string;
  /** Bumped on every prefill so the same worker can be re-checked. */
  seq: number;
}

interface IssuePanelProps {
  coId: number;
  branchId: number;
  today: string;
  setup: JpSetup;
  canCreate: boolean;
  prefill: IssuePrefill | null;
  onNotify: (text: string, severity: "success" | "info" | "warning" | "error") => void;
  onIssued: () => void;
}

const SEVERITY = {
  PASS_REQUIRED: "warning",
  PASS_ISSUED: "info",
  NOT_REQUIRED: "success",
  NO_HISTORY: "info",
  SEPARATED: "error",
} as const;

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {value === null || value === undefined || value === "" ? "—" : value}
      </Typography>
    </Box>
  );
}

export default function IssuePanel({ coId, branchId, today, setup, canCreate, prefill, onNotify, onIssued }: IssuePanelProps) {
  const defaultAuthority = setup.authorities[0] ?? "";
  const spellOptions = React.useMemo(
    () => setup.spells.map((sp) => ({ value: sp.spell_id, label: sp.spell_code ?? String(sp.spell_id) })),
    [setup.spells],
  );
  const authorityOptions = React.useMemo(() => setup.authorities.map((a) => ({ value: a, label: a })), [setup.authorities]);
  const [empCode, setEmpCode] = React.useState("");
  const [joinDate, setJoinDate] = React.useState(today);
  const [check, setCheck] = React.useState<JpCheck | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const form = useForm<JpIssueForm>({
    resolver: zodResolver(jpIssueFormSchema),
    defaultValues: { joinDate: today, issueDate: today, spellId: "", authority: defaultAuthority, remarks: "" },
  });

  const runCheck = React.useCallback(
    async (code: string, jd: string) => {
      const c = code.trim();
      if (!c) {
        setError("Enter the EB No");
        return;
      }
      setLoading(true);
      setError(null);
      setCheck(null);
      try {
        const res = await checkJoiningPass({ coId, branchId, empCode: c, joinDate: jd || null });
        setCheck(res);
        // Spell defaults to the one of the worker's last attendance.
        const lastSpell = setup.spells.find((sp) => sp.spell_code === res.last_spell_code);
        form.reset({
          joinDate: res.join_date,
          issueDate: res.join_date < today ? res.join_date : today,
          spellId: lastSpell ? lastSpell.spell_id : "",
          authority: defaultAuthority,
          remarks: "",
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [coId, branchId, today, form, setup.spells, defaultAuthority],
  );

  React.useEffect(() => {
    if (!prefill) return;
    setEmpCode(prefill.empCode);
    setJoinDate(prefill.joinDate);
    void runCheck(prefill.empCode, prefill.joinDate);
  }, [prefill, runCheck]);

  const verdict = check ? verdictOf(check) : null;
  const canIssue = canCreate && check != null && (verdict === "PASS_REQUIRED" || verdict === "NOT_REQUIRED") && check.absent_working_days > 0;

  const onIssue = form.handleSubmit(async (v) => {
    if (!check) return;
    if (verdict === "NOT_REQUIRED") {
      const ok = window.confirm(
        `Absent only ${check.absent_working_days} working day(s) — a pass is not required. Issue one anyway?`,
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      const p = await issueJoiningPass({
        coId,
        branchId,
        ebId: check.eb_id,
        joinDate: v.joinDate,
        issueDate: v.issueDate,
        spellId: v.spellId === "" ? null : v.spellId,
        authority: v.authority,
        remarks: v.remarks,
      });
      onNotify(`Pass ${p.pass_no ?? ""} issued for ${p.emp_name ?? p.emp_code ?? ""}`, "success");
      printPasses([p.letter], `Joining pass ${p.pass_no ?? ""}`);
      onIssued();
      await runCheck(empCode, v.joinDate);
    } catch (e) {
      onNotify(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
    }
  });

  const reprint = async () => {
    if (!check?.existing_pass) return;
    setBusy(true);
    try {
      const p = await fetchJpPass(coId, check.existing_pass.joining_pass_id);
      printPasses([p.letter], `Joining pass ${p.pass_no ?? ""}`);
    } catch (e) {
      onNotify(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Box
          component="form"
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
            void runCheck(empCode, joinDate);
          }}
          sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}
        >
          <TextField
            label="EB No"
            size="small"
            value={empCode}
            onChange={(e) => setEmpCode(e.target.value)}
            autoFocus
            sx={{ width: { xs: "100%", sm: 160 } }}
          />
          <TextField
            label="Joining date"
            type="date"
            size="small"
            value={joinDate}
            onChange={(e) => setJoinDate(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ width: { xs: "100%", sm: 180 } }}
          />
          <Button type="submit" variant="contained" disabled={loading} sx={{ width: { xs: "100%", sm: "auto" } }}>
            {loading ? <CircularProgress size={20} color="inherit" /> : "Check"}
          </Button>
          <Typography variant="caption" color="text.secondary">
            Weavers / spinners / winders take a few seconds (fortnight efficiency).
          </Typography>
        </Box>
      </Paper>

      {error ? <Alert severity="error">{error}</Alert> : null}

      {check && verdict ? (
        <>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5, flexWrap: "wrap", rowGap: 1 }}>
              <Typography variant="h6" sx={{ mr: 1 }}>
                {check.emp_code} · {check.emp_name}
              </Typography>
              {check.category ? <Chip size="small" label={check.category} /> : null}
              {check.la_case ? (
                <Chip size="small" color="warning" variant="outlined" label={`Long Absenteeism case ${check.la_case.case_no ?? ""}`} />
              ) : null}
            </Stack>
            <Alert severity={SEVERITY[verdict]} sx={{ mb: 2 }}>
              {verdictText(check)}
            </Alert>
            {check.note ? (
              <Alert severity="info" sx={{ mb: 2 }}>
                {check.note}
              </Alert>
            ) : null}
            <Grid container spacing={2}>
              <Grid size={{ xs: 6, md: 3 }}>
                <Fact label="Department" value={check.sub_dept_desc ?? check.dept_desc} />
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Fact label="Designation" value={check.designation} />
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Fact label="Last seen (attendance / leave)" value={fmtDate(check.last_seen_date)} />
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Fact label="Absent from" value={fmtDate(check.absent_from)} />
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Fact label="Absent to" value={check.absent_from ? fmtDate(prevDay(check.join_date)) : null} />
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Fact
                  label="No of days (working)"
                  value={`${check.absent_working_days} (calendar ${check.absent_calendar_days})`}
                />
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Fact
                  label="Last fortnight of working"
                  value={check.fn_from ? `${fmtDate(check.fn_from)} – ${fmtDate(check.fn_to)}` : null}
                />
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Fact
                  label="Days present / working days"
                  value={check.fn_days_present != null ? `${check.fn_days_present} / ${check.fn_working_days}` : null}
                />
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Fact
                  label="Fortnight efficiency"
                  value={check.fn_efficiency != null ? `${check.fn_efficiency.toFixed(2)}%` : check.eff_note ?? null}
                />
              </Grid>
            </Grid>
          </Paper>

          {verdict === "PASS_ISSUED" ? (
            <Stack direction="row" spacing={1}>
              <Button variant="contained" onClick={reprint} disabled={busy}>
                Reprint pass {check.existing_pass?.pass_no ?? ""}
              </Button>
            </Stack>
          ) : canIssue ? (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Box component="form" onSubmit={onIssue} sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "flex-start" }}>
                <TextField
                  label="Join w.e.f."
                  type="date"
                  size="small"
                  disabled
                  value={form.watch("joinDate")}
                  slotProps={{ inputLabel: { shrink: true } }}
                  sx={{ width: { xs: "100%", sm: 170 } }}
                />
                <TextField
                  label="Pass issued on"
                  type="date"
                  size="small"
                  {...form.register("issueDate")}
                  error={!!form.formState.errors.issueDate}
                  helperText={form.formState.errors.issueDate?.message}
                  slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today } }}
                  sx={{ width: { xs: "100%", sm: 170 } }}
                />
                <Controller
                  control={form.control}
                  name="spellId"
                  render={({ field }) => (
                    <SearchableOptionSelect<number>
                      label="Spell"
                      size="small"
                      options={spellOptions}
                      value={field.value}
                      onChange={field.onChange}
                      sx={{ width: { xs: "100%", sm: 120 } }}
                    />
                  )}
                />
                <Controller
                  control={form.control}
                  name="authority"
                  render={({ field, fieldState }) => (
                    <SearchableOptionSelect<string>
                      label="Authority"
                      size="small"
                      options={authorityOptions}
                      value={field.value}
                      onChange={field.onChange}
                      clearable={false}
                      error={!!fieldState.error}
                      helperText={fieldState.error?.message}
                      sx={{ width: { xs: "100%", sm: 200 } }}
                    />
                  )}
                />
                <TextField
                  label="Reasons (not printed)"
                  size="small"
                  {...form.register("remarks")}
                  error={!!form.formState.errors.remarks}
                  helperText={form.formState.errors.remarks?.message}
                  sx={{ flex: 1, minWidth: { xs: "100%", sm: 240 } }}
                />
                <Button type="submit" variant="contained" disabled={busy} sx={{ width: { xs: "100%", sm: "auto" } }}>
                  {busy ? <CircularProgress size={20} color="inherit" /> : "Issue & print pass"}
                </Button>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                To change the joining date, change it above and press Check again.
              </Typography>
            </Paper>
          ) : !canCreate && verdict === "PASS_REQUIRED" ? (
            <Alert severity="info">You have view access only — ask the Personnel office to issue the pass.</Alert>
          ) : null}

          {verdict !== "SEPARATED" && verdict !== "NO_HISTORY" && check.absent_working_days > 0 ? (
            <Box>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                Letter preview
              </Typography>
              <PassPreview
                letter={{
                  ...check.letter,
                  issued_on: fmtLetterDate(form.watch("issueDate")),
                  authorised_label: `Authorised by ${form.watch("authority") || defaultAuthority}`,
                }}
              />
            </Box>
          ) : null}
        </>
      ) : null}
    </Stack>
  );
}
