"use client";

/**
 * Templates tab (edit access; read-only view otherwise): the six letter
 * templates (1st, 2nd and 3rd & last warning, show cause, gate notice,
 * struck-off memo), one accordion each. This is the only place the wording of
 * a letter changes: letters are rendered from these templates at issue and
 * are not edited by hand. Subject + body with the placeholder chips that
 * insert `{code}` at the cursor, Save (the backend rejects an unknown {token}
 * by name — shown inline), Reset to default, and "Preview on a case": the text
 * in the boxes (saved or not) merged with a real case picked by its number,
 * as the template's own letter (WARNING_2 previews the 2nd warning …).
 *
 * Backend: GET /templates, POST /template_save, /template_reset,
 * /letter_preview (long_absenteeism_letters.py).
 */

import * as React from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { ChevronDown, Eye, RotateCcw, Save, Undo2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { fmtDate } from "@/components/lowPerformerFollowup/schemas";
import {
  fetchLaTemplates,
  previewLaLetter,
  resetLaTemplate,
  saveLaTemplate,
  type LaCodeLabel,
  type LaPreview,
  type LaTemplate,
} from "@/utils/longAbsenteeismService";
import { BODY_MAX, SUBJECT_MAX } from "../../_schemas";
import {
  CASE_NO_MAX,
  insertAtCaret,
  makePreviewCaseSchema,
  makeTemplateSchema,
  previewStageFor,
  type TemplateFormValues,
} from "../../_tabsSchemas";
import { fmtDateTime } from "../../_tabsUtils";
import ConfirmDialog from "../ConfirmDialog";
import type { LaTabProps } from "./types";

const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";
const LETTER_FONT = "'Times New Roman', Times, serif";
const PREVIEW_CASE_SCHEMA = makePreviewCaseSchema();

type Field = keyof TemplateFormValues;

interface TemplateEditorProps {
  coId: number;
  template: LaTemplate;
  placeholders: ReadonlyArray<LaCodeLabel>;
  canEdit: boolean;
  onNotify: LaTabProps["onNotify"];
  /** A save / reset happened: the new template when the API echoed it. */
  onChanged: (code: string, template: LaTemplate | null) => void;
  onDirtyChange: (code: string, dirty: boolean) => void;
}

function TemplateEditor({
  coId,
  template,
  placeholders,
  canEdit,
  onNotify,
  onChanged,
  onDirtyChange,
}: TemplateEditorProps) {
  const code = template.template_code;
  const knownCodes = React.useMemo(() => placeholders.map((p) => p.code), [placeholders]);
  const schema = React.useMemo(() => makeTemplateSchema({ placeholders: knownCodes }), [knownCodes]);
  const {
    control,
    handleSubmit,
    reset,
    getValues,
    setValue,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<TemplateFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { subject: template.subject, body: template.body },
  });

  // A save / reset / reload brought new text: show it.
  React.useEffect(() => {
    reset({ subject: template.subject, body: template.body });
  }, [template.subject, template.body, reset]);

  React.useEffect(() => {
    onDirtyChange(code, isDirty);
  }, [code, isDirty, onDirtyChange]);

  // Where a placeholder chip inserts: the field last focused, at its caret.
  const subjectEl = React.useRef<HTMLInputElement | null>(null);
  const bodyEl = React.useRef<HTMLTextAreaElement | null>(null);
  const lastField = React.useRef<Field>("body");
  const caretKnown = React.useRef<Record<Field, boolean>>({ subject: false, body: false });

  const markFocus = (field: Field) => {
    lastField.current = field;
    caretKnown.current[field] = true;
  };

  const insertToken = (token: string) => {
    const field = lastField.current;
    const el = field === "subject" ? subjectEl.current : bodyEl.current;
    const known = caretKnown.current[field];
    const { text, caret } = insertAtCaret(
      getValues(field),
      known ? el?.selectionStart : null,
      known ? el?.selectionEnd : null,
      `{${token}}`,
    );
    setValue(field, text, { shouldDirty: true, shouldValidate: Boolean(errors[field]) });
    caretKnown.current[field] = true;
    // Put the caret after the token once React has written the new value.
    window.setTimeout(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(caret, caret);
    }, 0);
  };

  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [confirmReset, setConfirmReset] = React.useState(false);

  const submit = async (v: TemplateFormValues) => {
    setSaveError(null);
    try {
      const saved = await saveLaTemplate({ co_id: coId, template_code: code, subject: v.subject, body: v.body });
      reset({ subject: saved?.subject ?? v.subject, body: saved?.body ?? v.body });
      onChanged(code, saved ?? { ...template, subject: v.subject, body: v.body, is_default: false });
      onNotify(`${template.label} saved.`, "success");
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Could not save the template");
    }
  };

  const doReset = async () => {
    const t = await resetLaTemplate(coId, code);
    setConfirmReset(false);
    setSaveError(null);
    if (t) reset({ subject: t.subject, body: t.body });
    onChanged(code, t);
    onNotify(`${template.label} is back to the default text.`, "success");
  };

  // ── Preview on a case ──
  const [caseNo, setCaseNo] = React.useState("");
  const [caseNoError, setCaseNoError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<LaPreview | null>(null);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = React.useState(false);

  const runPreview = async () => {
    const parsed = PREVIEW_CASE_SCHEMA.safeParse({ case_no: caseNo });
    if (!parsed.success) {
      setCaseNoError(parsed.error.issues[0]?.message ?? "Enter a case number");
      return;
    }
    setCaseNoError(null);
    setPreviewError(null);
    setPreviewBusy(true);
    try {
      const v = getValues();
      const res = await previewLaLetter(coId, null, previewStageFor(code), {
        caseNo: caseNo.trim(),
        templateSubject: v.subject,
        templateBody: v.body,
      });
      setPreview(res);
    } catch (err: unknown) {
      setPreview(null);
      setPreviewError(err instanceof Error ? err.message : "Could not prepare the preview");
    } finally {
      setPreviewBusy(false);
    }
  };

  const busy = isSubmitting;

  return (
    <Stack spacing={2}>
      <Box component="form" noValidate onSubmit={(e: React.FormEvent<HTMLFormElement>) => void handleSubmit(submit)(e)}>
        <Stack spacing={2}>
          {saveError ? (
            <Alert severity="error" onClose={() => setSaveError(null)}>
              {saveError}
            </Alert>
          ) : null}
          <Controller
            name="subject"
            control={control}
            render={({ field: { ref, ...rest } }) => (
              <TextField
                {...rest}
                inputRef={(el: HTMLInputElement | null) => {
                  ref(el);
                  subjectEl.current = el;
                }}
                onFocus={() => markFocus("subject")}
                label="Subject"
                size="small"
                disabled={busy}
                error={Boolean(errors.subject)}
                helperText={errors.subject?.message}
                slotProps={{ htmlInput: { readOnly: !canEdit, maxLength: SUBJECT_MAX } }}
                fullWidth
              />
            )}
          />
          <Box
            sx={{
              display: "grid",
              gap: 2,
              alignItems: "start",
              gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "minmax(0, 1fr) 300px" },
              gridTemplateAreas: { xs: '"ph" "body"', md: '"body ph"' },
            }}
          >
            <Box sx={{ gridArea: "body", minWidth: 0 }}>
              <Controller
                name="body"
                control={control}
                render={({ field: { ref, ...rest } }) => (
                  <TextField
                    {...rest}
                    inputRef={(el: HTMLTextAreaElement | null) => {
                      ref(el);
                      bodyEl.current = el;
                    }}
                    onFocus={() => markFocus("body")}
                    label="Letter text"
                    multiline
                    minRows={14}
                    disabled={busy}
                    error={Boolean(errors.body)}
                    helperText={errors.body?.message ?? `${rest.value.length.toLocaleString()} / ${BODY_MAX.toLocaleString()} characters`}
                    slotProps={{ htmlInput: { readOnly: !canEdit, spellCheck: false } }}
                    sx={{
                      "& textarea": { fontFamily: MONO, fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" },
                    }}
                    fullWidth
                  />
                )}
              />
            </Box>
            <Box sx={{ gridArea: "ph", minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.75 }}>
                {canEdit
                  ? "Placeholders — tap one to insert it at the cursor (subject or text)."
                  : "Placeholders filled in when a letter is drafted."}
              </Typography>
              <Box
                sx={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 0.75,
                  maxHeight: { xs: 168, md: 360 },
                  overflowY: "auto",
                  p: 0.75,
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1,
                }}
              >
                {placeholders.map((p) => (
                  <Tooltip key={p.code} title={p.label} placement="top">
                    <Chip
                      size="small"
                      variant="outlined"
                      label={`{${p.code}}`}
                      clickable={canEdit && !busy}
                      // Keep the focus (and the caret) in the text box.
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={canEdit && !busy ? () => insertToken(p.code) : undefined}
                      sx={{ fontFamily: MONO, fontSize: 12 }}
                    />
                  </Tooltip>
                ))}
                {placeholders.length === 0 ? (
                  <Typography variant="caption" color="text.secondary">
                    No placeholder list.
                  </Typography>
                ) : null}
              </Box>
            </Box>
          </Box>
          {canEdit ? (
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
              <Button
                type="submit"
                variant="contained"
                startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <Save size={16} />}
                disabled={busy || !isDirty}
                sx={{ minHeight: 40 }}
              >
                Save
              </Button>
              {isDirty ? (
                <Button
                  startIcon={<Undo2 size={16} />}
                  onClick={() => reset({ subject: template.subject, body: template.body })}
                  disabled={busy}
                  sx={{ minHeight: 40 }}
                >
                  Discard changes
                </Button>
              ) : null}
              <Button
                color="warning"
                startIcon={<RotateCcw size={16} />}
                onClick={() => setConfirmReset(true)}
                disabled={busy || template.is_default}
                title={template.is_default ? "Already the default text" : undefined}
                sx={{ minHeight: 40 }}
              >
                Reset to default
              </Button>
            </Stack>
          ) : null}
        </Stack>
      </Box>

      <Box sx={{ borderTop: 1, borderColor: "divider", pt: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          Preview on a case
        </Typography>
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1.25 }}>
          Merges the text above (saved or not) with a case, dated today. Nothing is issued.
        </Typography>
        <Box
          sx={{
            display: "grid",
            gap: 1.5,
            alignItems: "start",
            gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "220px auto" },
          }}
        >
          <TextField
            size="small"
            label="Case number"
            placeholder="e.g. LA/12/26/0001"
            value={caseNo}
            onChange={(e) => {
              setCaseNo(e.target.value);
              if (caseNoError) setCaseNoError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void runPreview();
              }
            }}
            error={Boolean(caseNoError)}
            helperText={caseNoError}
            slotProps={{ htmlInput: { maxLength: CASE_NO_MAX } }}
            fullWidth
          />
          <Box>
            <Button
              variant="outlined"
              startIcon={previewBusy ? <CircularProgress size={16} color="inherit" /> : <Eye size={16} />}
              onClick={() => void runPreview()}
              disabled={previewBusy}
              sx={{ minHeight: 40 }}
            >
              Preview
            </Button>
          </Box>
        </Box>
        {previewError ? (
          <Alert severity="error" sx={{ mt: 1.5 }}>
            {previewError}
          </Alert>
        ) : null}
        {preview ? (
          <Paper variant="outlined" sx={{ mt: 1.5, p: { xs: 1.5, md: 2.5 }, bgcolor: "background.default" }}>
            <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>
              Case {preview.case_no ?? preview.case_id ?? ""} · {preview.stage_label ?? preview.stage_code}
              {preview.issue_date ? ` · letter date ${fmtDate(preview.issue_date)}` : ""}
            </Typography>
            {preview.subject.trim() ? (
              <Typography
                sx={{ fontFamily: LETTER_FONT, fontWeight: 700, textAlign: "center", textDecoration: "underline", mb: 1.5 }}
              >
                {preview.subject}
              </Typography>
            ) : null}
            <Box
              component="pre"
              data-testid="template-preview-body"
              sx={{
                m: 0,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontFamily: LETTER_FONT,
                fontSize: 14,
                lineHeight: 1.5,
              }}
            >
              {preview.body}
            </Box>
          </Paper>
        ) : null}
      </Box>

      <ConfirmDialog
        open={confirmReset}
        title="Reset to the default text?"
        message={`The company's own text of "${template.label}" is deleted and the standard text is used for new letters. Letters already issued keep their text.`}
        confirmLabel="Reset"
        confirmColor="warning"
        onClose={() => setConfirmReset(false)}
        onConfirm={doReset}
      />
    </Stack>
  );
}

export default function TemplatesTab({ coId, setup, canEdit, onNotify }: LaTabProps) {
  const [templates, setTemplates] = React.useState<LaTemplate[]>([]);
  const [placeholders, setPlaceholders] = React.useState<LaCodeLabel[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<string | false>(false);
  const [dirty, setDirty] = React.useState<ReadonlySet<string>>(new Set<string>());
  const seq = React.useRef(0);

  const load = React.useCallback(
    async (quiet = false) => {
      const mine = ++seq.current;
      if (!quiet) setLoading(true);
      setError(null);
      try {
        const data = await fetchLaTemplates(coId);
        if (mine !== seq.current) return;
        setTemplates(data.templates);
        setPlaceholders(data.placeholders);
        setExpanded((prev) => (prev === false && !quiet ? (data.templates[0]?.template_code ?? false) : prev));
      } catch (err: unknown) {
        if (mine === seq.current) setError(err instanceof Error ? err.message : "Could not load the templates");
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    },
    [coId],
  );

  React.useEffect(() => {
    void load();
  }, [load]);

  const setupPlaceholders = setup?.placeholders;
  const placeholderList = React.useMemo<ReadonlyArray<LaCodeLabel>>(
    () => (placeholders.length ? placeholders : (setupPlaceholders ?? [])),
    [placeholders, setupPlaceholders],
  );

  const onChanged = React.useCallback(
    (code: string, t: LaTemplate | null) => {
      if (t) setTemplates((prev) => prev.map((x) => (x.template_code === code ? { ...x, ...t } : x)));
      // Re-read quietly for the saved time (and the default text after a reset).
      void load(true);
    },
    [load],
  );

  const onDirtyChange = React.useCallback((code: string, isDirty: boolean) => {
    setDirty((prev) => {
      if (prev.has(code) === isDirty) return prev;
      const next = new Set(prev);
      if (isDirty) next.add(code);
      else next.delete(code);
      return next;
    });
  }, []);

  return (
    <Box>
      {!canEdit ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          View only — changing the letter templates needs edit access.
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
      {loading && templates.length === 0 ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : null}
      {templates.map((t) => (
        <Accordion
          key={t.template_code}
          expanded={expanded === t.template_code}
          onChange={(_e, open) => setExpanded(open ? t.template_code : false)}
          disableGutters
          sx={{ mb: 1 }}
        >
          <AccordionSummary expandIcon={<ChevronDown size={18} />} sx={{ minHeight: 52 }}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={{ xs: 0.5, sm: 1.5 }}
              alignItems={{ xs: "flex-start", sm: "center" }}
              sx={{ width: "100%", pr: 1, minWidth: 0 }}
            >
              <Typography sx={{ fontWeight: 600, flex: "1 1 auto", minWidth: 0 }}>{t.label}</Typography>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
                {dirty.has(t.template_code) ? <Chip size="small" color="warning" label="Unsaved" /> : null}
                <Chip
                  size="small"
                  variant="outlined"
                  color={t.is_default ? "default" : "primary"}
                  label={t.is_default ? "Default" : "Company text"}
                />
                {t.updated_date_time ? (
                  <Typography variant="caption" color="text.secondary">
                    Saved {fmtDateTime(t.updated_date_time)}
                  </Typography>
                ) : null}
              </Stack>
            </Stack>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            <TemplateEditor
              coId={coId}
              template={t}
              placeholders={placeholderList}
              canEdit={canEdit}
              onNotify={onNotify}
              onChanged={onChanged}
              onDirtyChange={onDirtyChange}
            />
          </AccordionDetails>
        </Accordion>
      ))}
      {!loading && !error && templates.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No templates.
        </Typography>
      ) : null}
    </Box>
  );
}
