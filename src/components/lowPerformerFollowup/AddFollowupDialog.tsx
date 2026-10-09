"use client";

/**
 * @component AddFollowupDialog
 * @description Marks a worker (by EB No) for low-performer follow-up in one
 * department of a branch. Used by the Low Performer Follow-up page and by the
 * three Low Producer reports ("Follow up" on a worker row).
 *
 * The EB No is checked against the branch's rolls (Find button, Enter, or
 * leaving the field) and the worker's name is shown; a not-found EB No blocks
 * Save. The backend re-checks everything and answers 409 when the person is
 * already on an open follow-up in that department — that message is shown
 * inline.
 *
 * After a successful save it calls `onCreated(row)` and then `onClose()`.
 */

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Search, X } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import {
  DIALOG_ACTIONS_SX,
  DIALOG_FORM_SCROLL_SX,
  FORM_GRID_2_SX,
  MOBILE_FULL_BLEED_PAPER,
} from "@/components/ui/responsiveEntry";
import {
  createFollowup,
  type FollowupDeptCode,
  type FollowupRow,
} from "@/utils/lowPerformerFollowupService";
import { deptOptions } from "./constants";
import {
  REASON_MAX,
  localTodayISO,
  makeAddFollowupSchema,
  type AddFollowupFormValues,
} from "./schemas";
import { useFollowupSetup } from "./useFollowupSetup";
import { lookupWorkerByEbNo, type WorkerLookup } from "./workerLookup";

export interface AddFollowupDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called with the created follow-up; the dialog then calls onClose(). */
  onCreated: (row: FollowupRow) => void;
  coId: number;
  branchId: number;
  /** Prefills the EB No and looks the worker up as soon as the dialog opens. */
  initialEbNo?: string;
  initialDeptCode?: FollowupDeptCode;
  /** Keeps the department fixed (e.g. opened from the Weaving Low Producer report). */
  lockDept?: boolean;
}

export default function AddFollowupDialog(props: AddFollowupDialogProps) {
  const { open, onClose } = props;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      slotProps={{ paper: MOBILE_FULL_BLEED_PAPER }}
      sx={DIALOG_FORM_SCROLL_SX}
    >
      {/* Mounted per opening so every open starts from fresh defaults. */}
      {open ? <AddFollowupForm {...props} /> : null}
    </Dialog>
  );
}

type LookupState =
  | { ebNo: string; status: "loading" }
  | { ebNo: string; status: "found"; worker: WorkerLookup }
  | { ebNo: string; status: "missing" | "error"; message: string };

function AddFollowupForm({
  onClose,
  onCreated,
  coId,
  branchId,
  initialEbNo,
  initialDeptCode,
  lockDept = false,
}: AddFollowupDialogProps) {
  const { setup, error: setupError } = useFollowupSetup(coId, branchId);
  const [localToday] = React.useState(() => localTodayISO());
  const today = setup?.today ?? localToday;
  const schema = React.useMemo(() => makeAddFollowupSchema(today), [today]);
  const initialEb = initialEbNo?.trim() ?? "";

  const {
    control,
    handleSubmit,
    getValues,
    getFieldState,
    setValue,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<AddFollowupFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      eb_no: initialEb,
      dept_code: initialDeptCode ?? "",
      reason: "",
      start_date: localToday,
      review_date: "",
    },
  });

  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [lookup, setLookup] = React.useState<LookupState | null>(() =>
    initialEb ? { ebNo: initialEb, status: "loading" } : null,
  );
  const lookupSeq = React.useRef(0);

  const ebNoValue = useWatch({ control, name: "eb_no" });
  const currentLookup = lookup && lookup.ebNo === (ebNoValue ?? "").trim() ? lookup : null;

  const options = React.useMemo(() => deptOptions(setup?.depts), [setup]);

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
      // A newer lookup (the user kept typing) wins.
      if (seq === lookupSeq.current) setLookup(next);
      return next;
    },
    [branchId],
  );

  // Prefilled EB No (opened from a Low Producer row): look it up straight away.
  React.useEffect(() => {
    if (initialEb) void runLookup(initialEb);
  }, [initialEb, runLookup]);

  // The server date can trail the browser's around midnight — never default
  // the start date into the server's future.
  React.useEffect(() => {
    if (!setup) return;
    if (!getFieldState("start_date").isDirty && getValues("start_date") > setup.today) {
      setValue("start_date", setup.today);
    }
  }, [setup, getFieldState, getValues, setValue]);

  const lookupCurrent = () => {
    const ebNo = getValues("eb_no").trim();
    if (!ebNo) return;
    if (currentLookup && currentLookup.status !== "error") return;
    clearErrors("eb_no");
    void runLookup(ebNo);
  };

  const onSubmit = async (values: AddFollowupFormValues) => {
    setSaveError(null);
    if (values.dept_code === "") return;
    const ebNo = values.eb_no.trim();
    let checked: LookupState | null = currentLookup;
    if (!checked || checked.status === "loading") checked = await runLookup(ebNo);
    if (checked?.status === "missing") {
      setError("eb_no", { type: "manual", message: checked.message });
      return;
    }
    // A lookup that failed for another reason does not block: the backend
    // resolves and validates the EB No itself.
    try {
      const reason = values.reason.trim();
      const row = await createFollowup({
        co_id: coId,
        branch_id: branchId,
        eb_no: ebNo,
        dept_code: values.dept_code,
        ...(reason ? { reason } : {}),
        start_date: values.start_date,
        review_date: values.review_date.trim() || null,
      });
      onCreated(row);
      onClose();
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Could not add the follow-up");
    }
  };

  const ebHelper: React.ReactNode = errors.eb_no?.message
    ? errors.eb_no.message
    : currentLookup?.status === "loading"
      ? "Looking up…"
      : currentLookup?.status === "found"
        ? null
        : currentLookup?.status === "missing" || currentLookup?.status === "error"
          ? currentLookup.message
          : "Enter the EB No and press Find";

  const busy = isSubmitting;

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(onSubmit)(e);
      }}
      noValidate
    >
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", pb: 1 }}>
        <Typography variant="h6" component="span">
          Add person to follow-up
        </Typography>
        <IconButton onClick={onClose} size="small" aria-label="Close dialog">
          <X size={20} />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          {setupError ? <Alert severity="warning">{setupError}</Alert> : null}
          {saveError ? <Alert severity="error">{saveError}</Alert> : null}

          <Box>
            <Stack direction="row" spacing={1} alignItems="flex-start">
              <Controller
                name="eb_no"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    onBlur={() => {
                      field.onBlur();
                      lookupCurrent();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        lookupCurrent();
                      }
                    }}
                    label="EB No"
                    required
                    size="small"
                    autoFocus={!initialEb}
                    disabled={busy}
                    error={
                      Boolean(errors.eb_no) ||
                      currentLookup?.status === "missing"
                    }
                    helperText={ebHelper}
                    fullWidth
                  />
                )}
              />
              <Button
                variant="outlined"
                onClick={() => {
                  clearErrors("eb_no");
                  void runLookup(getValues("eb_no"));
                }}
                disabled={busy || !(ebNoValue ?? "").trim()}
                startIcon={<Search size={16} />}
                sx={{ minHeight: 40, flexShrink: 0 }}
              >
                Find
              </Button>
            </Stack>
            {currentLookup?.status === "found" ? (
              <Typography variant="body2" sx={{ mt: 1, color: "success.main", fontWeight: 600 }}>
                {currentLookup.worker.worker_name ?? "(no name on record)"}
              </Typography>
            ) : null}
          </Box>

          <Controller
            name="dept_code"
            control={control}
            render={({ field }) => (
              <SearchableOptionSelect<FollowupDeptCode>
                label="Department"
                placeholder="Select department"
                options={options}
                value={field.value}
                onChange={(value) => field.onChange(value)}
                required
                disabled={busy || lockDept}
                clearable={!lockDept}
                error={Boolean(errors.dept_code)}
                helperText={errors.dept_code?.message}
                fullWidth
              />
            )}
          />

          <Controller
            name="reason"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label="Reason for follow-up"
                placeholder="e.g. efficiency below 60% for three weeks"
                size="small"
                multiline
                minRows={2}
                disabled={busy}
                error={Boolean(errors.reason)}
                helperText={errors.reason?.message}
                slotProps={{ htmlInput: { maxLength: REASON_MAX } }}
                fullWidth
              />
            )}
          />

          <Box sx={FORM_GRID_2_SX}>
            <Controller
              name="start_date"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  type="date"
                  label="Start date"
                  required
                  size="small"
                  disabled={busy}
                  error={Boolean(errors.start_date)}
                  helperText={errors.start_date?.message}
                  slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today } }}
                  fullWidth
                />
              )}
            />
            <Controller
              name="review_date"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  type="date"
                  label="Review date"
                  size="small"
                  disabled={busy}
                  error={Boolean(errors.review_date)}
                  helperText={errors.review_date?.message ?? "Optional — when to look at this person again"}
                  slotProps={{ inputLabel: { shrink: true } }}
                  fullWidth
                />
              )}
            />
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions sx={DIALOG_ACTIONS_SX}>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="contained"
          disabled={busy || currentLookup?.status === "loading"}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
        >
          Save
        </Button>
      </DialogActions>
    </form>
  );
}
