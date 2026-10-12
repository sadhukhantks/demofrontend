"use client";

import * as React from "react";
import { Alert, Box, Button, CircularProgress, Stack, TextField, Typography } from "@mui/material";
import { Search } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { fmtDate } from "@/components/lowPerformerFollowup/schemas";
import { lookupWorkerByEbNo, type WorkerLookup } from "@/components/lowPerformerFollowup/workerLookup";
import { openLaCase, type LaCandidate, type LaCase } from "@/utils/longAbsenteeismService";
import { REMARKS_MAX, makeOpenCaseSchema, textOrNull, type OpenCaseFormValues } from "../_schemas";
import { DialogFormFrame, DialogShell } from "./DialogShell";
import { RepeatChip } from "./Chips";

export interface OpenCaseDialogProps {
  open: boolean;
  coId: number;
  branchId: number;
  /** Opened from a candidate row; null = pick the worker by EB No. */
  candidate: LaCandidate | null;
  today: string;
  onClose: () => void;
  /** Called with the new case (the dialog does not close itself). */
  onOpened: (c: LaCase) => void;
}

/** Opens a case for a candidate, or for any worker of the branch by EB No. */
export default function OpenCaseDialog(props: OpenCaseDialogProps) {
  return (
    <DialogShell open={props.open} onClose={props.onClose}>
      <OpenCaseForm {...props} />
    </DialogShell>
  );
}

type LookupState =
  | { ebNo: string; status: "loading" }
  | { ebNo: string; status: "found"; worker: WorkerLookup }
  | { ebNo: string; status: "missing" | "error"; message: string };

function OpenCaseForm({ coId, branchId, candidate, today, onClose, onOpened }: OpenCaseDialogProps) {
  const needsEbNo = candidate == null;
  const schema = React.useMemo(() => makeOpenCaseSchema({ today, needsEbNo }), [today, needsEbNo]);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [lookup, setLookup] = React.useState<LookupState | null>(null);
  const lookupSeq = React.useRef(0);

  const {
    control,
    handleSubmit,
    getValues,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<OpenCaseFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      eb_no: "",
      last_working_date: candidate?.last_seen?.slice(0, 10) ?? "",
      remarks: "",
    },
  });

  const ebNoValue = useWatch({ control, name: "eb_no" });
  const current = lookup && lookup.ebNo === (ebNoValue ?? "").trim() ? lookup : null;

  const runLookup = React.useCallback(
    async (raw: string): Promise<LookupState | null> => {
      const ebNo = raw.trim();
      const seq = ++lookupSeq.current;
      if (!ebNo) {
        setLookup(null);
        return null;
      }
      setLookup({ ebNo, status: "loading" });
      const res = await lookupWorkerByEbNo(branchId, ebNo);
      const next: LookupState = res.ok
        ? { ebNo, status: "found", worker: res.worker }
        : { ebNo, status: res.notFound ? "missing" : "error", message: res.message };
      if (seq === lookupSeq.current) setLookup(next);
      return next;
    },
    [branchId],
  );

  const submit = async (values: OpenCaseFormValues) => {
    setSaveError(null);
    let ebId = candidate?.eb_id ?? null;
    if (ebId == null) {
      let checked: LookupState | null = current;
      if (!checked || checked.status === "loading") checked = await runLookup(values.eb_no);
      if (!checked || checked.status !== "found") {
        setError("eb_no", {
          type: "manual",
          message: checked && checked.status !== "loading" && "message" in checked ? checked.message : "Find the worker first",
        });
        return;
      }
      ebId = checked.worker.eb_id;
    }
    try {
      const c = await openLaCase({
        co_id: coId,
        branch_id: branchId,
        eb_id: ebId,
        last_working_date: textOrNull(values.last_working_date),
        remarks: textOrNull(values.remarks),
      });
      onOpened(c);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Could not open the case");
    }
  };

  const busy = isSubmitting;

  return (
    <DialogFormFrame
      title="Open case"
      onClose={onClose}
      onSubmit={(e) => void handleSubmit(submit)(e)}
      busy={busy}
      submitLabel="Open case"
    >
      <Stack spacing={2.5} sx={{ pt: 1 }}>
        {saveError ? <Alert severity="error">{saveError}</Alert> : null}

        {candidate ? (
          <Box sx={{ p: 1.25, border: 1, borderColor: "divider", borderRadius: 1 }}>
            <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {candidate.emp_name || "(no name)"}
              </Typography>
              <RepeatChip count={candidate.closed_cases} />
            </Stack>
            <Typography variant="body2" color="text.secondary">
              EB {candidate.emp_code ?? candidate.eb_id}
              {candidate.dept_desc ? ` · ${candidate.dept_desc}` : ""}
              {candidate.designation ? ` · ${candidate.designation}` : ""}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Last seen {fmtDate(candidate.last_seen) || "—"} · {candidate.absent_days} days absent
            </Typography>
          </Box>
        ) : (
          <Controller
            name="eb_no"
            control={control}
            render={({ field }) => (
              <Box>
                <Stack direction="row" spacing={1} alignItems="flex-start">
                  <TextField
                    {...field}
                    label="EB No"
                    required
                    size="small"
                    autoFocus
                    disabled={busy}
                    error={Boolean(errors.eb_no)}
                    helperText={errors.eb_no?.message}
                    onBlur={() => {
                      field.onBlur();
                      const v = getValues("eb_no").trim();
                      if (v && !current) void runLookup(v);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void runLookup(getValues("eb_no"));
                      }
                    }}
                    fullWidth
                  />
                  <Button
                    variant="outlined"
                    onClick={() => void runLookup(getValues("eb_no"))}
                    disabled={busy}
                    startIcon={current?.status === "loading" ? <CircularProgress size={14} /> : <Search size={16} />}
                    sx={{ minHeight: 40, flexShrink: 0 }}
                  >
                    Find
                  </Button>
                </Stack>
                {current?.status === "found" ? (
                  <Typography variant="body2" sx={{ mt: 0.75, color: "success.main", fontWeight: 600 }}>
                    {current.worker.worker_name || "(no name)"} · EB {current.worker.eb_no}
                  </Typography>
                ) : null}
                {current && (current.status === "missing" || current.status === "error") && !errors.eb_no ? (
                  <Typography variant="body2" sx={{ mt: 0.75, color: "error.main" }}>
                    {current.message}
                  </Typography>
                ) : null}
              </Box>
            )}
          />
        )}

        <Controller
          name="last_working_date"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              type="date"
              label="Last working date"
              size="small"
              disabled={busy}
              error={Boolean(errors.last_working_date)}
              helperText={
                errors.last_working_date?.message ??
                "Leave blank to use the last day seen in attendance / approved leave"
              }
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today } }}
              fullWidth
            />
          )}
        />

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
              disabled={busy}
              error={Boolean(errors.remarks)}
              helperText={errors.remarks?.message ?? "Optional"}
              slotProps={{ htmlInput: { maxLength: REMARKS_MAX } }}
              fullWidth
            />
          )}
        />
      </Stack>
    </DialogFormFrame>
  );
}
