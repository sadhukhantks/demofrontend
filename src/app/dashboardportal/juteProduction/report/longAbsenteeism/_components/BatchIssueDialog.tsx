"use client";

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  Stack,
  Typography,
} from "@mui/material";
import { Printer } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import { TOUCH_TARGET } from "@/components/ui/responsiveEntry";
import useCompanyHeader from "@/hooks/useCompanyHeader";
import {
  fetchLaLetters,
  fetchLaLettersDue,
  issueLaLetterBatch,
  type LaBatchResult,
  type LaCodeLabel,
  type LaLetter,
  type LaLetterDueRow,
} from "@/utils/longAbsenteeismService";
import { makeBatchSchema, type BatchFormValues } from "../_schemas";
import { printLetters } from "../_print";
import { DialogFormFrame, DialogShell } from "./DialogShell";

export interface BatchIssueDialogProps {
  open: boolean;
  coId: number;
  branchId: number;
  /** Cases ticked on the watchlist; empty = every case that is due. */
  preselected: ReadonlyArray<number>;
  dispatchModes: ReadonlyArray<LaCodeLabel>;
  isMobile: boolean;
  onClose: () => void;
  /** Letters were issued (the watchlist reloads). */
  onIssued: (result: LaBatchResult) => void;
}

/** Issues the next letter of many cases at once (default template text, never forced), then prints them. */
export default function BatchIssueDialog(props: BatchIssueDialogProps) {
  return (
    <DialogShell open={props.open} onClose={props.onClose} maxWidth="md">
      <BatchBody {...props} />
    </DialogShell>
  );
}

function BatchBody({ coId, branchId, preselected, dispatchModes, isMobile, onClose, onIssued }: BatchIssueDialogProps) {
  const [due, setDue] = React.useState<LaLetterDueRow[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<LaBatchResult | null>(null);
  const [printing, setPrinting] = React.useState(false);
  const [printError, setPrintError] = React.useState<string | null>(null);
  const head = useCompanyHeader(coId, branchId);
  const schema = React.useMemo(() => makeBatchSchema(), []);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<BatchFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { case_ids: [], dispatch_mode: "" },
  });
  const caseIds = useWatch({ control, name: "case_ids" });
  // Read once per opening (the dialog body mounts per opening).
  const initialPick = React.useRef(preselected);

  React.useEffect(() => {
    let cancelled = false;
    fetchLaLettersDue({ coId, branchId })
      .then((rows) => {
        if (cancelled) return;
        setDue(rows);
        const wanted = initialPick.current;
        const pick = wanted.length
          ? rows.filter((r) => wanted.includes(r.case_id)).map((r) => r.case_id)
          : rows.map((r) => r.case_id);
        reset({ case_ids: pick, dispatch_mode: "" });
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Failed to load the letters due");
      });
    return () => {
      cancelled = true;
    };
  }, [coId, branchId, reset]);

  const notDue = preselected.length && due ? preselected.filter((id) => !due.some((r) => r.case_id === id)).length : 0;
  const modeOptions = React.useMemo(() => dispatchModes.map((m) => ({ value: m.code, label: m.label })), [dispatchModes]);

  const submit = async (v: BatchFormValues) => {
    setSaveError(null);
    try {
      const res = await issueLaLetterBatch({
        co_id: coId,
        branch_id: branchId,
        case_ids: v.case_ids,
        dispatch_mode: v.dispatch_mode || null,
      });
      setResult(res);
      onIssued(res);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Could not issue the letters");
    }
  };

  const printIssued = async () => {
    if (!result || result.issued.length === 0) return;
    setPrinting(true);
    setPrintError(null);
    try {
      // The batch response carries each stored text; fetch only what is missing.
      const missing = result.issued.filter((i) => !i.body);
      const byId = new Map<number, LaLetter>();
      if (missing.length) {
        const caseIdsToLoad = [...new Set(missing.map((i) => i.case_id))];
        const lists = await Promise.all(caseIdsToLoad.map((id) => fetchLaLetters(coId, id)));
        for (const list of lists) for (const l of list) byId.set(l.letter_id, l);
      }
      const letters = result.issued.flatMap((i) => {
        if (i.body) return [{ subject: i.subject, body: i.body }];
        const l = byId.get(i.letter_id);
        return l ? [{ subject: l.subject, body: l.body }] : [];
      });
      if (letters.length < result.issued.length) {
        setPrintError(`${result.issued.length - letters.length} letter(s) could not be loaded for printing.`);
      }
      printLetters(
        { coName: head.coName, address: head.address, logoBase64: head.logoBase64 },
        letters,
        `Letters ${result.batch_ref ?? ""}`.trim(),
      );
    } catch (err: unknown) {
      setPrintError(err instanceof Error ? err.message : "Could not load the letters for printing");
    } finally {
      setPrinting(false);
    }
  };

  const nameOf = (caseId: number) => {
    const r = due?.find((d) => d.case_id === caseId);
    return r ? `${r.emp_name || "(no name)"} (EB ${r.emp_code ?? "?"})` : `Case ${caseId}`;
  };

  if (result) {
    return (
      <DialogFormFrame
        title="Letters issued"
        onClose={onClose}
        onSubmit={(e) => e.preventDefault()}
        busy={false}
        submitLabel=""
        hideSubmit
        cancelLabel="Done"
        extraActions={
          result.issued.length ? (
            <Button
              variant="contained"
              startIcon={printing ? <CircularProgress size={16} color="inherit" /> : <Printer size={16} />}
              onClick={() => void printIssued()}
              disabled={printing}
            >
              Print {result.issued.length} letter{result.issued.length === 1 ? "" : "s"}
            </Button>
          ) : null
        }
      >
        <Stack spacing={2}>
          <Alert severity={result.issued.length ? "success" : "warning"}>
            {result.issued.length} issued{result.batch_ref ? ` in batch ${result.batch_ref}` : ""}
            {result.skipped.length ? `, ${result.skipped.length} skipped` : ""}.
          </Alert>
          {isMobile ? <Alert severity="info">Letters print best from a desktop browser.</Alert> : null}
          {printError ? <Alert severity="error">{printError}</Alert> : null}
          {result.skipped.length ? (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                Skipped
              </Typography>
              <Stack spacing={0.5}>
                {result.skipped.map((s) => (
                  <Typography key={s.case_id} variant="body2" color="text.secondary">
                    {nameOf(s.case_id)} — {s.reason}
                  </Typography>
                ))}
              </Stack>
            </Box>
          ) : null}
          <Typography variant="caption" color="text.secondary">
            Record each letter&apos;s sent date (and A.D. no) once it is posted — the next letter waits for it.
          </Typography>
        </Stack>
      </DialogFormFrame>
    );
  }

  return (
    <DialogFormFrame
      title="Issue letters"
      onClose={onClose}
      onSubmit={(e) => void handleSubmit(submit)(e)}
      busy={isSubmitting}
      submitLabel={`Issue ${caseIds.length} letter${caseIds.length === 1 ? "" : "s"}`}
      submitDisabled={due == null || caseIds.length === 0}
    >
      <Stack spacing={2} sx={{ pt: 1 }}>
        {saveError ? <Alert severity="error">{saveError}</Alert> : null}
        {loadError ? <Alert severity="error">{loadError}</Alert> : null}
        {due == null && !loadError ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
            <CircularProgress size={24} />
          </Box>
        ) : null}
        {notDue ? (
          <Alert severity="info">
            {notDue} of the selected case{notDue === 1 ? " is" : "s are"} not due for a letter today and left out.
          </Alert>
        ) : null}
        {due && due.length === 0 ? (
          <Alert severity="info">No letters are due today in this branch.</Alert>
        ) : null}

        {due && due.length ? (
          <>
            <Controller
              name="dispatch_mode"
              control={control}
              render={({ field }) => (
                <SearchableOptionSelect<string>
                  label="Dispatch mode"
                  placeholder="Each letter's default"
                  options={modeOptions}
                  value={field.value}
                  onChange={(v) => field.onChange(v)}
                  disabled={isSubmitting}
                  helperText="Leave blank to use each letter's usual mode"
                  fullWidth
                />
              )}
            />
            <Controller
              name="case_ids"
              control={control}
              render={({ field }) => {
                const set = new Set(field.value);
                const allOn = due.every((r) => set.has(r.case_id));
                return (
                  <Box>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={allOn}
                          indeterminate={!allOn && set.size > 0}
                          onChange={(e) => field.onChange(e.target.checked ? due.map((r) => r.case_id) : [])}
                          sx={{ minWidth: TOUCH_TARGET, minHeight: TOUCH_TARGET }}
                        />
                      }
                      label={`All ${due.length} due`}
                    />
                    <Stack spacing={0.5} sx={{ pl: { xs: 0, sm: 2 } }}>
                      {due.map((r) => (
                        <FormControlLabel
                          key={r.case_id}
                          control={
                            <Checkbox
                              checked={set.has(r.case_id)}
                              onChange={(e) =>
                                field.onChange(
                                  e.target.checked
                                    ? [...field.value, r.case_id]
                                    : field.value.filter((id) => id !== r.case_id),
                                )
                              }
                              sx={{ minWidth: TOUCH_TARGET, minHeight: TOUCH_TARGET }}
                            />
                          }
                          label={
                            <Box>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {r.emp_name || "(no name)"} · EB {r.emp_code ?? "?"}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {r.next_stage_label || r.next_stage_code}
                                {r.dept_desc ? ` · ${r.dept_desc}` : ""}
                                {r.absent_days != null ? ` · ${r.absent_days} days absent` : ""}
                                {r.case_no ? ` · ${r.case_no}` : ""}
                              </Typography>
                            </Box>
                          }
                        />
                      ))}
                    </Stack>
                    {errors.case_ids?.message ? (
                      <Typography variant="caption" sx={{ color: "error.main" }}>
                        {errors.case_ids.message}
                      </Typography>
                    ) : null}
                  </Box>
                );
              }}
            />
            <Typography variant="caption" color="text.secondary">
              Letters are issued with today&apos;s date and the saved template text. A case that is blocked (previous
              letter not sent, wait not over) is skipped — force it from the case page.
            </Typography>
          </>
        ) : null}
      </Stack>
    </DialogFormFrame>
  );
}
