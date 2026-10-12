"use client";

/**
 * Letter preview → issue → print. Loads the merged text of the next stage (or
 * the given one) and shows it READ-ONLY under the company letterhead: letters
 * are never edited by hand (owner 2026-10-11) — the server merges the
 * company's template again at issue and stores that text; the wording is
 * changed on the Templates tab. Explains why the letter is blocked (with Force
 * + reason for edit users: timing only), then issues it and opens the print
 * window with the text as stored.
 */

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { FileDown, Printer } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import { TOUCH_TARGET } from "@/components/ui/responsiveEntry";
import { CompanyHeaderBlock } from "@/app/dashboardportal/procurement/_shared/PrintHeader";
import {
  downloadLaLettersPdf,
  issueLaLetter,
  previewLaLetter,
  type LaCase,
  type LaCodeLabel,
  type LaIssueResult,
  type LaPreview,
} from "@/utils/longAbsenteeismService";
import { NOTE_MAX, makeLetterIssueSchema, textOrNull, type LetterIssueFormValues } from "../_schemas";
import { defaultDispatchMode, workerTitle, type Letterhead } from "../_utils";
import { printLetters } from "../_print";
import { DialogFormFrame, DialogShell } from "./DialogShell";

const LETTER_FONT = "'Times New Roman', Times, serif";

export interface LetterPreviewDialogProps {
  open: boolean;
  coId: number;
  c: LaCase;
  /** null = the next stage of the case. */
  stageCode: string | null;
  dispatchModes: ReadonlyArray<LaCodeLabel>;
  letterhead: Letterhead;
  isMobile: boolean;
  onClose: () => void;
  /** The letter was issued (the case reloads). */
  onIssued: (result: LaIssueResult) => void;
}

export default function LetterPreviewDialog(props: LetterPreviewDialogProps) {
  return (
    <DialogShell open={props.open} onClose={props.onClose} maxWidth="md">
      <PreviewLoader {...props} />
    </DialogShell>
  );
}

function PreviewLoader(props: LetterPreviewDialogProps) {
  const { coId, c, stageCode, onClose } = props;
  const [preview, setPreview] = React.useState<LaPreview | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    previewLaLetter(coId, c.case_id, stageCode)
      .then((p) => {
        if (!cancelled) setPreview(p);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not prepare the letter");
      });
    return () => {
      cancelled = true;
    };
  }, [coId, c.case_id, stageCode]);

  if (!preview) {
    return (
      <DialogFormFrame
        title="Letter"
        onClose={onClose}
        onSubmit={(e) => e.preventDefault()}
        busy={false}
        submitLabel=""
        hideSubmit
        cancelLabel="Close"
      >
        {error ? (
          <Alert severity="error">{error}</Alert>
        ) : (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        )}
      </DialogFormFrame>
    );
  }
  return <IssueForm {...props} preview={preview} />;
}

function IssueForm({
  coId,
  c,
  dispatchModes,
  letterhead,
  isMobile,
  onClose,
  onIssued,
  preview,
}: LetterPreviewDialogProps & { preview: LaPreview }) {
  const ctx = React.useMemo(
    () => ({ blockedReason: preview.blocked_reason, canForce: preview.can_force }),
    [preview],
  );
  const schema = React.useMemo(() => makeLetterIssueSchema(ctx), [ctx]);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [issued, setIssued] = React.useState<LaIssueResult | null>(null);
  const [pdfBusy, setPdfBusy] = React.useState(false);
  const [pdfError, setPdfError] = React.useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LetterIssueFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      dispatch_mode: preview.dispatch_mode ?? defaultDispatchMode(preview.stage_code, dispatchModes),
      force: false,
      force_reason: "",
    },
  });
  const force = useWatch({ control, name: "force" });
  const modeOptions = React.useMemo(() => dispatchModes.map((m) => ({ value: m.code, label: m.label })), [dispatchModes]);
  const stageText = preview.stage_label || preview.stage_code;
  const blockedHard = Boolean(preview.blocked_reason) && !preview.can_force;

  const print = (res: LaIssueResult) =>
    printLetters(
      letterhead,
      [{ subject: res.letter.subject, body: res.letter.body }],
      `${stageText} - ${c.emp_name ?? c.emp_code ?? c.case_id}`,
    );

  /** Server-side PDF of the issued letter (reportlab: no browser header / footer). */
  const downloadPdf = async (res: LaIssueResult) => {
    setPdfBusy(true);
    setPdfError(null);
    try {
      await downloadLaLettersPdf(coId, [res.letter.letter_id]);
    } catch (err: unknown) {
      setPdfError(err instanceof Error ? err.message : "Could not download the PDF");
    } finally {
      setPdfBusy(false);
    }
  };

  const submit = async (v: LetterIssueFormValues) => {
    setSaveError(null);
    try {
      // No text is sent: the server merges the template for this stage and date.
      const res = await issueLaLetter({
        co_id: coId,
        case_id: c.case_id,
        stage_code: preview.stage_code,
        ...(preview.issue_date ? { issue_date: preview.issue_date } : {}),
        dispatch_mode: textOrNull(v.dispatch_mode),
        ...(preview.blocked_reason && v.force ? { force: true, force_reason: v.force_reason.trim() } : {}),
      });
      setIssued(res);
      onIssued(res);
      print(res);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Could not issue the letter");
    }
  };

  if (issued) {
    return (
      <DialogFormFrame
        title={`${stageText} issued`}
        onClose={onClose}
        onSubmit={(e) => e.preventDefault()}
        busy={false}
        submitLabel=""
        hideSubmit
        cancelLabel="Done"
        extraActions={
          <>
            <Button
              variant="outlined"
              startIcon={pdfBusy ? <CircularProgress size={16} color="inherit" /> : <FileDown size={16} />}
              disabled={pdfBusy}
              onClick={() => void downloadPdf(issued)}
            >
              Download PDF
            </Button>
            <Button variant="contained" startIcon={<Printer size={16} />} onClick={() => print(issued)}>
              Print again
            </Button>
          </>
        }
      >
        <Stack spacing={2}>
          {pdfError ? <Alert severity="error">{pdfError}</Alert> : null}
          <Alert severity="success">
            {stageText} for {workerTitle(c)} issued. The print window opened — if your browser blocked it, use Print
            again.
          </Alert>
          {isMobile ? <Alert severity="info">Letters print best from a desktop browser.</Alert> : null}
          <Alert severity="warning">
            Record the sent date (and A.D. no) on the letter card once it is posted — the next step waits for it.
          </Alert>
        </Stack>
      </DialogFormFrame>
    );
  }

  return (
    <DialogFormFrame
      title={`Issue ${stageText}`}
      onClose={onClose}
      onSubmit={(e) => void handleSubmit(submit)(e)}
      busy={isSubmitting}
      submitLabel="Issue & print"
      submitColor={preview.blocked_reason ? "warning" : "primary"}
      submitDisabled={blockedHard || (Boolean(preview.blocked_reason) && !force)}
    >
      <Stack spacing={2} sx={{ pt: 1 }}>
        {saveError ? <Alert severity="error">{saveError}</Alert> : null}
        {preview.blocked_reason ? (
          <Alert severity={preview.can_force ? "warning" : "error"}>
            {preview.blocked_reason}
            {preview.can_force ? " — you can force it with a reason." : ""}
          </Alert>
        ) : null}
        {isMobile ? <Alert severity="info">Print from a desktop browser for the best result.</Alert> : null}

        <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2.5 } }}>
          <Box sx={{ borderBottom: 1, borderColor: "divider", pb: 1, mb: 1.5 }}>
            <CompanyHeaderBlock coId={coId} branchId={c.branch_id} maxWidth="100%" />
          </Box>
          {preview.subject.trim() ? (
            <Typography
              data-testid="letter-preview-subject"
              sx={{ fontFamily: LETTER_FONT, fontWeight: 700, textAlign: "center", textDecoration: "underline", mb: 1.5 }}
            >
              {preview.subject}
            </Typography>
          ) : null}
          <Box
            data-testid="letter-preview-body"
            sx={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontFamily: LETTER_FONT,
              fontSize: { xs: 14, md: 15 },
              lineHeight: 1.5,
            }}
          >
            {preview.body}
          </Box>
        </Paper>
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: -1 }}>
          {preview.template_label ? `Merged from the template "${preview.template_label}"` : "Merged from the template"}{" "}
          — only the dates, names and numbers are filled in for this case. To change the wording, edit the template on
          the Templates tab.
        </Typography>

        <Controller
          name="dispatch_mode"
          control={control}
          render={({ field }) => (
            <SearchableOptionSelect<string>
              label="Dispatch mode"
              options={modeOptions}
              value={field.value}
              onChange={(v) => field.onChange(v)}
              disabled={isSubmitting}
              fullWidth
            />
          )}
        />

        {preview.blocked_reason && preview.can_force ? (
          <Box>
            <Controller
              name="force"
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={field.value}
                      onChange={(e) => field.onChange(e.target.checked)}
                      disabled={isSubmitting}
                      sx={{ minWidth: TOUCH_TARGET, minHeight: TOUCH_TARGET }}
                    />
                  }
                  label="Force — issue it now anyway (recorded on the letter)"
                />
              )}
            />
            {errors.force?.message ? (
              <Typography variant="caption" sx={{ color: "error.main", display: "block" }}>
                {errors.force.message}
              </Typography>
            ) : null}
            {force ? (
              <Controller
                name="force_reason"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Reason for forcing"
                    required
                    size="small"
                    multiline
                    minRows={2}
                    disabled={isSubmitting}
                    error={Boolean(errors.force_reason)}
                    helperText={errors.force_reason?.message}
                    slotProps={{ htmlInput: { maxLength: NOTE_MAX } }}
                    fullWidth
                    sx={{ mt: 1 }}
                  />
                )}
              />
            ) : null}
          </Box>
        ) : null}
      </Stack>
    </DialogFormFrame>
  );
}
