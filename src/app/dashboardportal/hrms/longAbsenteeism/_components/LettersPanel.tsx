"use client";

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { FileDown, Pencil, Plus, Printer, Trash2, Truck } from "lucide-react";
import AttachmentUploader from "@/components/AttachmentUploader";
import { fmtDate } from "@/components/lowPerformerFollowup/schemas";
import {
  LA_LETTER_ATTACHMENT_MODULE,
  LA_LETTER_FILE_TYPES,
  LA_RECEIPT_ATTACHMENT_MODULE,
  LA_RECEIPT_FILE_TYPE,
  type LaLetter,
  type LaReceipt,
} from "@/utils/longAbsenteeismService";
import { letterTitle, sortLettersOldestFirst } from "../_utils";
import { PanelTitle, touchTargetsSx } from "./CasePanels";

export interface LettersPanelProps {
  letters: ReadonlyArray<LaLetter>;
  coId: number;
  /** Dispatch updates, attachments and union receipts (edit access). */
  canEdit: boolean;
  /** Receipts may be added (gate notice of a live or struck-off case). */
  receiptsOpen: boolean;
  /** "Issue next letter" button, already permission-filtered. */
  headerAction?: React.ReactNode;
  /** Phone: remind that letters print best from a desktop browser. */
  printNote?: boolean;
  onUpdate: (letter: LaLetter) => void;
  onPrint: (letter: LaLetter) => void;
  /** Server-side PDF of the letter (no browser header / footer). */
  onDownloadPdf?: (letter: LaLetter) => void;
  /** The letter whose PDF is being downloaded (its button shows a spinner). */
  pdfBusyId?: number | null;
  onAddReceipt: (letter: LaLetter) => void;
  onEditReceipt: (letter: LaLetter, receipt: LaReceipt) => void;
  onRemoveReceipt: (receipt: LaReceipt) => void;
}

function Row({ label, value, warn = false }: { label: string; value: React.ReactNode; warn?: boolean }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
        {label}
      </Typography>
      <Typography variant="body2" component="div" sx={{ fontWeight: 600, color: warn ? "warning.main" : undefined }}>
        {value || "—"}
      </Typography>
    </Box>
  );
}

/** One card per issued letter: dates, dispatch, attachments, union receipts (gate notice). */
export default function LettersPanel({
  letters,
  coId,
  canEdit,
  receiptsOpen,
  headerAction,
  printNote = false,
  onUpdate,
  onPrint,
  onDownloadPdf,
  pdfBusyId = null,
  onAddReceipt,
  onEditReceipt,
  onRemoveReceipt,
}: LettersPanelProps) {
  const sorted = React.useMemo(() => sortLettersOldestFirst(letters), [letters]);
  return (
    <Paper elevation={1} sx={[{ p: { xs: 1.5, md: 2 }, mb: 2 }, touchTargetsSx]}>
      <PanelTitle title="Letters" action={headerAction} />
      {printNote && sorted.length ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
          Printing works best from a desktop browser.
        </Typography>
      ) : null}
      {sorted.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No letter issued yet.
        </Typography>
      ) : null}
      <Stack spacing={1.5}>
        {sorted.map((l) => {
          const isNotice = l.stage_code === "GATE_NOTICE";
          return (
            <Paper key={l.letter_id} variant="outlined" sx={{ p: 1.5 }}>
              <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, flexWrap: "wrap", mb: 1 }}>
                <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap" sx={{ flex: "1 1 auto" }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    {letterTitle(l)}
                  </Typography>
                  {l.sent_date ? (
                    <Chip size="small" color="success" variant="outlined" label={`Sent ${fmtDate(l.sent_date)}`} />
                  ) : (
                    <Chip size="small" color="warning" label="Sent date not recorded" />
                  )}
                  {l.forced ? <Chip size="small" color="error" variant="outlined" label="Forced" /> : null}
                  {l.recorded ? (
                    <Chip
                      size="small"
                      color="info"
                      variant="outlined"
                      label="Recorded"
                      title="Issued outside VoWERP and entered afterwards (back-dated entry)"
                    />
                  ) : null}
                </Stack>
                <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                  {canEdit ? (
                    <Button size="small" variant="outlined" startIcon={<Truck size={14} />} onClick={() => onUpdate(l)}>
                      {l.sent_date ? "Dispatch details" : "Record sent date"}
                    </Button>
                  ) : null}
                  <Button size="small" startIcon={<Printer size={14} />} onClick={() => onPrint(l)}>
                    Print again
                  </Button>
                  {onDownloadPdf ? (
                    <Button
                      size="small"
                      startIcon={
                        pdfBusyId === l.letter_id ? <CircularProgress size={14} color="inherit" /> : <FileDown size={14} />
                      }
                      disabled={pdfBusyId === l.letter_id}
                      onClick={() => onDownloadPdf(l)}
                    >
                      Download PDF
                    </Button>
                  ) : null}
                </Stack>
              </Box>
              <Box
                sx={{
                  display: "grid",
                  gap: 1,
                  gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(4, minmax(0, 1fr))" },
                }}
              >
                <Row label="Letter date" value={fmtDate(l.issue_date)} />
                <Row label="Sent" value={fmtDate(l.sent_date)} warn={!l.sent_date} />
                <Row label="Dispatch" value={l.dispatch_mode_label ?? l.dispatch_mode} />
                <Row label="A.D. No" value={l.ad_no} />
                <Row
                  label="Delivery"
                  value={[l.delivery_status_label ?? l.delivery_status, fmtDate(l.delivery_date)].filter(Boolean).join(" · ")}
                />
                <Row label="Reply due" value={fmtDate(l.reply_due_date)} />
                {isNotice ? <Row label="On gate board" value={fmtDate(l.gate_display_date)} /> : null}
                {isNotice ? <Row label="In department" value={fmtDate(l.dept_display_date)} /> : null}
                {l.batch_ref ? <Row label="Batch" value={l.batch_ref} /> : null}
              </Box>
              {l.subject ? (
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                  Subject: {l.subject}
                </Typography>
              ) : null}

              <Box sx={{ mt: 1.25, display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" } }}>
                <AttachmentUploader
                  module={LA_LETTER_ATTACHMENT_MODULE}
                  fileType={LA_LETTER_FILE_TYPES.SIGNED_COPY}
                  entityId={l.letter_id}
                  coId={coId}
                  disabled={!canEdit}
                  label="Signed office copy"
                />
                {l.stage_code !== "GATE_NOTICE" ? (
                  <AttachmentUploader
                    module={LA_LETTER_ATTACHMENT_MODULE}
                    fileType={LA_LETTER_FILE_TYPES.AD_CARD}
                    entityId={l.letter_id}
                    coId={coId}
                    disabled={!canEdit}
                    label="A.D. card"
                  />
                ) : null}
              </Box>

              {isNotice ? (
                <Box sx={{ mt: 1.5 }}>
                  <Divider sx={{ mb: 1 }} />
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
                    <Typography variant="subtitle2">Served on the unions ({l.receipts.length})</Typography>
                    {canEdit && receiptsOpen ? (
                      <Button size="small" variant="outlined" startIcon={<Plus size={14} />} onClick={() => onAddReceipt(l)}>
                        Add union receipt
                      </Button>
                    ) : null}
                  </Box>
                  {l.receipts.length === 0 ? (
                    <Alert severity="info" sx={{ mt: 1 }}>
                      Record each working union that received a copy of the notice.
                    </Alert>
                  ) : (
                    <Stack spacing={1} sx={{ mt: 1 }}>
                      {l.receipts.map((r) => (
                        <Paper key={r.receipt_id} variant="outlined" sx={{ p: 1 }}>
                          <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, flexWrap: "wrap" }}>
                            <Box sx={{ flex: "1 1 auto", minWidth: 0 }}>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {r.union_name}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {[r.received_by ? `received by ${r.received_by}` : null, fmtDate(r.received_date) || null]
                                  .filter(Boolean)
                                  .join(" · ") || "No receipt details"}
                              </Typography>
                              {r.remarks ? (
                                <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-wrap" }}>
                                  {r.remarks}
                                </Typography>
                              ) : null}
                            </Box>
                            {canEdit ? (
                              <Stack direction="row" spacing={0.5}>
                                <Tooltip title="Edit">
                                  <IconButton size="small" aria-label="Edit receipt" onClick={() => onEditReceipt(l, r)}>
                                    <Pencil size={16} />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Remove">
                                  <IconButton
                                    size="small"
                                    color="error"
                                    aria-label="Remove receipt"
                                    onClick={() => onRemoveReceipt(r)}
                                  >
                                    <Trash2 size={16} />
                                  </IconButton>
                                </Tooltip>
                              </Stack>
                            ) : null}
                          </Box>
                          <Box sx={{ mt: 0.75 }}>
                            <AttachmentUploader
                              module={LA_RECEIPT_ATTACHMENT_MODULE}
                              fileType={LA_RECEIPT_FILE_TYPE}
                              entityId={r.receipt_id}
                              coId={coId}
                              disabled={!canEdit}
                              label="Signed receipt"
                            />
                          </Box>
                        </Paper>
                      ))}
                    </Stack>
                  )}
                </Box>
              ) : null}
            </Paper>
          );
        })}
      </Stack>
    </Paper>
  );
}
