"use client";

/**
 * Case page (?case_id=N): header card + actions, struck-off approval, leave
 * (read from the leave module), letters, timeline, performance and earlier
 * cases. Container: owns the data hooks and every dialog; the panels are
 * presentational. There is no verification step: a case opens at VERIFIED.
 */

import * as React from "react";
import { Alert, Box, Button, CircularProgress, Typography } from "@mui/material";
import {
  ArrowLeft,
  CalendarCheck,
  FileClock,
  FileText,
  LogOut,
  MessageSquare,
  MessagesSquare,
  NotebookPen,
  Pause,
  Play,
  RotateCcw,
  Undo2,
} from "lucide-react";
import type { BranchOption } from "@/components/reports/types";
import { fmtDate, localTodayISO } from "@/components/lowPerformerFollowup/schemas";
import useCompanyHeader from "@/hooks/useCompanyHeader";
import {
  approveLaStruckOff,
  createLaEvent,
  deactivateLaEvent,
  deactivateLaReceipt,
  createLaReceipt,
  downloadLaLettersPdf,
  exitLaCase,
  fetchLaPerformance,
  fetchLaUnionNames,
  parkLaCase,
  rejectLaStruckOff,
  reopenLaCase,
  reopenLaStruckOff,
  recordLaLetter,
  resumeLaCase,
  sendLaStruckOff,
  updateLaCase,
  updateLaEvent,
  updateLaLetter,
  updateLaReceipt,
  type LaEvent,
  type LaLetter,
  type LaPerformance,
  type LaReceipt,
  type LaUserEventType,
} from "@/utils/longAbsenteeismService";
import { useLaCase } from "../_hooks/useLaCase";
import { useLaSetup } from "../_hooks/useLaSetup";
import {
  caseFieldsChanges,
  leaveTypeIdOrNull,
  letterRecordPayload,
  needsReturnDate,
  textOrNull,
  type ApproveFormValues,
  type CaseFieldsFormValues,
  type EventFormValues,
  type ExitFormValues,
  type LetterRecordFormValues,
  type LetterUpdateFields,
  type ReceiptFormValues,
} from "../_schemas";
import {
  exitAsLeaveConfirmText,
  exitAsLeavePayload,
  extraColumns,
  hasModuleLeave,
  moduleLeaveExitPreset,
  needsLeaveType,
  nextLetterStage,
  showsStruckOffPanel,
  stageLabel,
  type Letterhead,
} from "../_utils";
import { printLetters } from "../_print";
import { ApproveStruckOffDialog, CaseFieldsDialog, ExitDialog, NoteDialog, type ExitPreset } from "./CaseDialogs";
import CaseHeaderCard from "./CaseHeaderCard";
import { EarlierCasesPanel, LeavePanel, PerformancePanel } from "./CasePanels";
import CaseTimeline from "./CaseTimeline";
import ConfirmDialog from "./ConfirmDialog";
import EventDialog, { type EventDialogTarget } from "./EventDialog";
import LetterPreviewDialog from "./LetterPreviewDialog";
import LettersPanel from "./LettersPanel";
import LetterUpdateDialog from "./LetterUpdateDialog";
import ReceiptDialog, { type ReceiptDialogTarget } from "./ReceiptDialog";
import RecordLetterDialog from "./RecordLetterDialog";
import StruckOffPanel from "./StruckOffPanel";
import type { LaNotifySeverity } from "./tabs";

const EMPTY_LETTERS: ReadonlyArray<LaLetter> = Object.freeze([]);
const EMPTY_EVENTS: ReadonlyArray<LaEvent> = Object.freeze([]);

export interface CaseViewProps {
  coId: number;
  caseId: number;
  branches: ReadonlyArray<BranchOption>;
  /** Menu-level access (narrowed by the case branch's access level from /setup). */
  menuCreate: boolean;
  menuEdit: boolean;
  isMobile: boolean;
  onBack: (branchId: number | null) => void;
  onOpenCase: (caseId: number, branchId?: number | null) => void;
  onNotify: (msg: string, severity: LaNotifySeverity) => void;
}

type NoteKind = "park" | "resume" | "reopen";

const NOTE_DIALOGS: Record<
  NoteKind,
  { title: string; message: string; submitLabel: string; required: boolean; color?: "primary" | "warning" }
> = {
  park: {
    title: "Park case",
    message: "Parking stops the case from ageing while a reply is reviewed. No letter can be issued while parked.",
    submitLabel: "Park",
    required: true,
    color: "warning",
  },
  resume: {
    title: "Resume case",
    message: "The case continues; if the next step was due while parked it becomes due today.",
    submitLabel: "Resume",
    required: false,
  },
  reopen: {
    title: "Reopen case",
    message: "The case goes back to open at the stage it had. The exit details stay on the timeline.",
    submitLabel: "Reopen",
    required: true,
  },
};

export default function CaseView({
  coId,
  caseId,
  branches,
  menuCreate,
  menuEdit,
  isMobile,
  onBack,
  onOpenCase,
  onNotify,
}: CaseViewProps) {
  const detail = useLaCase(coId, caseId);
  const c = detail.detail?.case ?? null;
  const branchId = c?.branch_id ?? null;
  const { setup } = useLaSetup(coId, branchId);
  const head = useCompanyHeader(coId, branchId);
  const [localToday] = React.useState(() => localTodayISO());
  const today = setup?.today ?? localToday;

  // Actions wait for the case branch's /setup: its access level narrows the
  // menu access, and the next-letter label comes from it.
  const level = setup?.access_level ?? 0;
  const canCreate = menuCreate && level >= 3;
  const canEdit = menuEdit && level >= 4;

  const letters = detail.detail?.letters ?? EMPTY_LETTERS;
  const events = detail.detail?.events ?? EMPTY_EVENTS;
  const extraCols = React.useMemo(() => extraColumns(setup?.rule), [setup]);
  const letterhead = React.useMemo<Letterhead>(
    () => ({ coName: head.coName, address: head.address, logoBase64: head.logoBase64 }),
    [head.coName, head.address, head.logoBase64],
  );

  // Dialogs
  const [eventTarget, setEventTarget] = React.useState<EventDialogTarget | null>(null);
  const [noteKind, setNoteKind] = React.useState<NoteKind | null>(null);
  const [exitState, setExitState] = React.useState<{ preset: ExitPreset | null } | null>(null);
  const [exitAsLeaveOpen, setExitAsLeaveOpen] = React.useState(false);
  const [fieldsOpen, setFieldsOpen] = React.useState(false);
  const [approveOpen, setApproveOpen] = React.useState(false);
  const [preview, setPreview] = React.useState<{ stage: string | null } | null>(null);
  const [letterToUpdate, setLetterToUpdate] = React.useState<LaLetter | null>(null);
  const [receiptTarget, setReceiptTarget] = React.useState<ReceiptDialogTarget | null>(null);
  const [removeEvent, setRemoveEvent] = React.useState<LaEvent | null>(null);
  const [removeReceipt, setRemoveReceipt] = React.useState<LaReceipt | null>(null);
  const [unionNames, setUnionNames] = React.useState<string[]>([]);
  const [approvalBusy, setApprovalBusy] = React.useState(false);
  const [recordOpen, setRecordOpen] = React.useState(false);
  const [pdfLetterId, setPdfLetterId] = React.useState<number | null>(null);

  // Performance (on demand)
  const [perf, setPerf] = React.useState<LaPerformance | null>(null);
  const [perfLoading, setPerfLoading] = React.useState(false);
  const [perfError, setPerfError] = React.useState<string | null>(null);

  const reload = detail.reload;

  const loadPerf = async () => {
    setPerfLoading(true);
    setPerfError(null);
    try {
      setPerf(await fetchLaPerformance(coId, caseId));
    } catch (err: unknown) {
      setPerfError(err instanceof Error ? err.message : "Failed to load the performance");
    } finally {
      setPerfLoading(false);
    }
  };

  const openReceipt = (target: ReceiptDialogTarget) => {
    setReceiptTarget(target);
    if (branchId != null) {
      fetchLaUnionNames(coId, branchId)
        .then(setUnionNames)
        .catch(() => setUnionNames([]));
    }
  };

  const backButton = (
    <Button variant="text" startIcon={<ArrowLeft size={16} />} onClick={() => onBack(branchId)} sx={{ mb: 1.5 }}>
      Back to watchlist
    </Button>
  );

  if (!c) {
    return (
      <Box>
        {backButton}
        {detail.error ? (
          <Alert severity="error">{detail.error}</Alert>
        ) : (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress />
          </Box>
        )}
      </Box>
    );
  }

  const live = c.status !== 0;
  const isOpen = c.status === 1;
  const parked = c.status === 2;
  const pending = c.status_id === 20;
  const nextLetter = nextLetterStage(setup, c.stage_code);
  const memoIssued = letters.some((l) => l.stage_code === "STRUCK_OFF");
  const gateNotice = letters.find((l) => l.stage_code === "GATE_NOTICE") ?? null;

  // ─── Handlers ──────────────────────────────────────────────────────

  const handleEvent = async (values: EventFormValues, target: EventDialogTarget) => {
    const isReply = target.eventType === "REPLY";
    if (target.mode === "edit" && target.event) {
      await updateLaEvent({
        co_id: coId,
        event_id: target.event.event_id,
        event_date: values.event_date,
        ...(isReply ? { channel: textOrNull(values.channel), contact_name: textOrNull(values.contact_name) } : {}),
        text: values.text.trim(),
      });
    } else {
      await createLaEvent({
        co_id: coId,
        case_id: c.case_id,
        event_type: target.eventType,
        event_date: values.event_date,
        ...(isReply
          ? {
              channel: textOrNull(values.channel),
              contact_name: textOrNull(values.contact_name),
              park: isOpen && values.park,
            }
          : {}),
        text: values.text.trim(),
      });
    }
    setEventTarget(null);
    await reload();
    if (isReply && target.mode === "create" && isOpen && values.park) {
      onNotify("Reply recorded — the case is parked while it is reviewed.", "success");
    }
  };

  const handleNote = async (note: string) => {
    if (!noteKind) return;
    const payload = { co_id: coId, case_id: c.case_id, note: note || null };
    if (noteKind === "park") await parkLaCase(payload);
    else if (noteKind === "resume") await resumeLaCase(payload);
    else await reopenLaCase(payload);
    const done = noteKind === "park" ? "parked" : noteKind === "resume" ? "resumed" : "reopened";
    setNoteKind(null);
    await reload();
    onNotify(`Case ${done}.`, "success");
  };

  const handleExit = async (v: ExitFormValues) => {
    await exitLaCase({
      co_id: coId,
      case_id: c.case_id,
      exit_reason: v.exit_reason,
      leave_type_id: needsLeaveType(v.exit_reason) ? leaveTypeIdOrNull(v.leave_type_id) : null,
      exit_date: v.exit_date,
      exit_remarks: textOrNull(v.exit_remarks),
      expected_return_date: needsReturnDate(v.exit_reason) ? textOrNull(v.expected_return_date) : null,
    });
    setExitState(null);
    await reload();
    onNotify("Case closed.", "success");
  };

  /** "Exit as on leave": one click, from the module leave linked to the case. */
  const handleExitAsLeave = async () => {
    const payload = exitAsLeavePayload(c, coId, today);
    if (!payload) return;
    await exitLaCase(payload);
    setExitAsLeaveOpen(false);
    await reload();
    onNotify("Case closed as on leave.", "success");
  };

  const handleFields = async (v: CaseFieldsFormValues) => {
    const changes = caseFieldsChanges(c, v, canEdit);
    if (Object.keys(changes).length === 0) {
      setFieldsOpen(false);
      return;
    }
    const updated = await updateLaCase({ co_id: coId, case_id: c.case_id, ...changes });
    detail.setCase(updated);
    setFieldsOpen(false);
    await reload();
  };

  const handleLetterUpdate = async (letter: LaLetter, changes: LetterUpdateFields) => {
    await updateLaLetter({ co_id: coId, letter_id: letter.letter_id, ...changes });
    setLetterToUpdate(null);
    await reload();
    onNotify("Letter updated.", "success");
  };

  const handleReceipt = async (v: ReceiptFormValues, target: ReceiptDialogTarget) => {
    const fields = {
      union_name: v.union_name.trim(),
      received_by: textOrNull(v.received_by),
      received_date: textOrNull(v.received_date),
      remarks: textOrNull(v.remarks),
    };
    if (target.receipt) {
      await updateLaReceipt({ co_id: coId, receipt_id: target.receipt.receipt_id, ...fields });
    } else {
      await createLaReceipt({ co_id: coId, letter_id: target.letter.letter_id, ...fields });
    }
    setReceiptTarget(null);
    await reload();
  };

  const runApproval = async (fn: () => Promise<string>) => {
    setApprovalBusy(true);
    try {
      const msg = await fn();
      await reload();
      onNotify(msg, "success");
    } catch (err: unknown) {
      onNotify(err instanceof Error ? err.message : "The approval action failed", "error");
      await reload();
    } finally {
      setApprovalBusy(false);
    }
  };

  const handleApprove = async (v: ApproveFormValues) => {
    const res = await approveLaStruckOff({ co_id: coId, case_id: c.case_id, struck_off_date: v.struck_off_date });
    setApproveOpen(false);
    await reload();
    const finalised = res.approval?.new_status_id === 3 || res.case?.stage_code === "STRUCK_OFF";
    onNotify(
      finalised
        ? "Struck off approved — the employee is marked Terminated."
        : (res.approval?.message ?? "Approved; sent to the next level."),
      "success",
    );
  };

  const printLetter = (l: LaLetter) => {
    printLetters(letterhead, [{ subject: l.subject, body: l.body }], `${l.stage_label} - ${c.emp_name ?? c.emp_code ?? ""}`);
  };

  /** Server-side PDF of one letter (reportlab: no browser header / footer). */
  const downloadPdf = async (l: LaLetter) => {
    setPdfLetterId(l.letter_id);
    try {
      await downloadLaLettersPdf(coId, [l.letter_id]);
    } catch (err: unknown) {
      onNotify(err instanceof Error ? err.message : "Could not download the PDF", "error");
    } finally {
      setPdfLetterId(null);
    }
  };

  /** A letter issued outside VoWERP, entered as the case's next letter (back-dated entry). */
  const handleRecord = async (v: LetterRecordFormValues) => {
    if (!nextLetter) return;
    await recordLaLetter(letterRecordPayload(coId, c.case_id, nextLetter, v));
    setRecordOpen(false);
    await reload();
    onNotify(`${stageLabel(setup, nextLetter)} recorded as already issued.`, "success");
  };

  const addEntry = (type: LaUserEventType) => setEventTarget({ mode: "create", eventType: type, event: null });

  // ─── Actions (per contract section 5) ──────────────────────────────

  const actions = (
    <>
      {canEdit && isOpen && !pending && nextLetter ? (
        <Button size="small" variant="contained" startIcon={<FileText size={14} />} onClick={() => setPreview({ stage: null })}>
          Issue {stageLabel(setup, nextLetter).toLowerCase()}
        </Button>
      ) : null}
      {canEdit && isOpen && !pending && nextLetter ? (
        <Button size="small" variant="outlined" startIcon={<FileClock size={14} />} onClick={() => setRecordOpen(true)}>
          Record a letter already issued
        </Button>
      ) : null}
      {canEdit && c.stage_code === "STRUCK_OFF" && !memoIssued ? (
        <Button size="small" variant="outlined" startIcon={<FileText size={14} />} onClick={() => setPreview({ stage: "STRUCK_OFF" })}>
          Struck-off memo
        </Button>
      ) : null}
      {canCreate && live ? (
        <>
          <Button size="small" variant="outlined" startIcon={<MessageSquare size={14} />} onClick={() => addEntry("REMARK")}>
            Add remark
          </Button>
          <Button size="small" variant="outlined" startIcon={<MessagesSquare size={14} />} onClick={() => addEntry("FEEDBACK")}>
            Add feedback
          </Button>
          <Button size="small" variant="outlined" startIcon={<Undo2 size={14} />} onClick={() => addEntry("REPLY")}>
            Record reply
          </Button>
        </>
      ) : null}
      {canCreate && isOpen && !pending ? (
        <Button size="small" variant="outlined" color="warning" startIcon={<Pause size={14} />} onClick={() => setNoteKind("park")}>
          Park
        </Button>
      ) : null}
      {canEdit && parked ? (
        <Button size="small" variant="outlined" startIcon={<Play size={14} />} onClick={() => setNoteKind("resume")}>
          Resume
        </Button>
      ) : null}
      {parked && c.leave_parked === 1 ? (
        <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center" }}>
          Parked automatically by the leave module
        </Typography>
      ) : null}
      {canEdit && live && !pending && hasModuleLeave(c) ? (
        <Button
          size="small"
          variant="outlined"
          color="info"
          startIcon={<CalendarCheck size={14} />}
          onClick={() => setExitAsLeaveOpen(true)}
        >
          Exit as on leave
        </Button>
      ) : null}
      {canEdit && live && !pending ? (
        <Button
          size="small"
          variant="outlined"
          color="warning"
          startIcon={<LogOut size={14} />}
          onClick={() => setExitState({ preset: moduleLeaveExitPreset(c, today) })}
        >
          Close case
        </Button>
      ) : null}
      {canEdit && !live && c.exit_reason !== "STRUCK_OFF" ? (
        <Button size="small" variant="outlined" startIcon={<RotateCcw size={14} />} onClick={() => setNoteKind("reopen")}>
          Reopen
        </Button>
      ) : null}
      {canCreate ? (
        <Button size="small" variant="text" startIcon={<NotebookPen size={14} />} onClick={() => setFieldsOpen(true)}>
          Remarks
        </Button>
      ) : null}
    </>
  );

  const rejoinAction =
    canEdit && !pending ? (
      <Button
        color="inherit"
        size="small"
        onClick={() => setExitState({ preset: { exit_reason: "REJOINED", exit_date: c.rejoined_seen_date ?? today } })}
      >
        Close as rejoined
      </Button>
    ) : undefined;

  const note = noteKind ? NOTE_DIALOGS[noteKind] : null;
  const branchName = branches.find((b) => b.branch_id === c.branch_id)?.branch_name ?? null;

  return (
    <Box>
      {backButton}
      {detail.error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {detail.error}
        </Alert>
      ) : null}

      <CaseHeaderCard c={c} branchName={branchName} today={today} actions={actions} rejoinAction={rejoinAction} />

      {showsStruckOffPanel(c) ? (
        <StruckOffPanel
          c={c}
          perms={detail.perms}
          permsError={detail.permsError}
          canEdit={canEdit}
          busy={approvalBusy}
          onSend={() =>
            void runApproval(async () => {
              await sendLaStruckOff(coId, c.case_id);
              return "Sent for struck-off approval.";
            })
          }
          onApprove={() => setApproveOpen(true)}
          onReject={(reason) =>
            void runApproval(async () => {
              await rejectLaStruckOff(coId, c.case_id, reason);
              return "Struck off rejected — the case stays at the gate notice.";
            })
          }
          onReopen={() =>
            void runApproval(async () => {
              await reopenLaStruckOff(coId, c.case_id);
              return "Approval reopened — it can be sent again.";
            })
          }
        />
      ) : null}

      <Box
        sx={{
          display: "grid",
          gap: { xs: 0, md: 2 },
          alignItems: "start",
          gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "minmax(0, 3fr) minmax(0, 2fr)" },
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <LeavePanel c={c} today={today} esiStlResults={setup?.esi_stl_results ?? []} />
          <LettersPanel
            letters={letters}
            coId={coId}
            canEdit={canEdit}
            receiptsOpen={live || c.exit_reason === "STRUCK_OFF"}
            printNote={isMobile}
            headerAction={
              canEdit && isOpen && !pending && nextLetter ? (
                <Button size="small" variant="outlined" startIcon={<FileText size={14} />} onClick={() => setPreview({ stage: null })}>
                  Issue {stageLabel(setup, nextLetter).toLowerCase()}
                </Button>
              ) : null
            }
            onUpdate={setLetterToUpdate}
            onPrint={printLetter}
            onDownloadPdf={(l) => void downloadPdf(l)}
            pdfBusyId={pdfLetterId}
            onAddReceipt={(l) => openReceipt({ letter: l, receipt: null })}
            onEditReceipt={(l, r) => openReceipt({ letter: l, receipt: r })}
            onRemoveReceipt={setRemoveReceipt}
          />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <CaseTimeline
            events={events}
            coId={coId}
            canEditEntry={(canCreate || canEdit) && live}
            canRemoveEntry={canEdit && live}
            canAttach={canCreate}
            onEdit={(ev) =>
              setEventTarget({ mode: "edit", eventType: ev.event_type as LaUserEventType, event: ev })
            }
            onRemove={setRemoveEvent}
          />
          <PerformancePanel c={c} data={perf} loading={perfLoading} error={perfError} onLoad={() => void loadPerf()} />
          <EarlierCasesPanel
            cases={detail.detail?.earlier_cases ?? []}
            setup={setup}
            onOpen={(id) => onOpenCase(id, c.branch_id)}
          />
        </Box>
      </Box>

      {/* ─── Dialogs ─── */}
      <EventDialog
        target={eventTarget}
        replyChannels={setup?.reply_channels ?? []}
        eventTypes={setup?.event_types ?? []}
        today={today}
        minDate={c.detected_date}
        caseOpen={isOpen}
        onClose={() => setEventTarget(null)}
        onSubmit={handleEvent}
      />
      {note ? (
        <NoteDialog
          open
          title={note.title}
          message={note.message}
          submitLabel={note.submitLabel}
          submitColor={note.color}
          required={note.required}
          onClose={() => setNoteKind(null)}
          onSubmit={handleNote}
        />
      ) : null}
      <ExitDialog
        open={exitState != null}
        c={c}
        exitOptions={setup?.exit_options ?? []}
        exitReasons={setup?.exit_reasons ?? []}
        today={today}
        preset={exitState?.preset ?? null}
        onClose={() => setExitState(null)}
        onSubmit={handleExit}
      />
      <CaseFieldsDialog
        open={fieldsOpen}
        c={c}
        extraCols={extraCols}
        today={today}
        canEditDate={canEdit}
        onClose={() => setFieldsOpen(false)}
        onSubmit={handleFields}
      />
      <ApproveStruckOffDialog
        open={approveOpen}
        c={c}
        today={today}
        minDate={gateNotice?.issue_date ?? null}
        onClose={() => setApproveOpen(false)}
        onSubmit={handleApprove}
      />
      <LetterPreviewDialog
        open={preview != null}
        coId={coId}
        c={c}
        stageCode={preview?.stage ?? null}
        dispatchModes={setup?.dispatch_modes ?? []}
        letterhead={letterhead}
        isMobile={isMobile}
        onClose={() => setPreview(null)}
        onIssued={() => void reload()}
      />
      {nextLetter ? (
        <RecordLetterDialog
          open={recordOpen}
          c={c}
          stageCode={nextLetter}
          stageLabel={stageLabel(setup, nextLetter)}
          letters={letters}
          dispatchModes={setup?.dispatch_modes ?? []}
          deliveryStatuses={setup?.delivery_statuses ?? []}
          today={today}
          onClose={() => setRecordOpen(false)}
          onSubmit={handleRecord}
        />
      ) : null}
      <LetterUpdateDialog
        letter={letterToUpdate}
        dispatchModes={setup?.dispatch_modes ?? []}
        deliveryStatuses={setup?.delivery_statuses ?? []}
        today={today}
        onClose={() => setLetterToUpdate(null)}
        onSubmit={handleLetterUpdate}
      />
      <ReceiptDialog
        target={receiptTarget}
        unionNames={unionNames}
        today={today}
        onClose={() => setReceiptTarget(null)}
        onSubmit={handleReceipt}
      />
      <ConfirmDialog
        open={exitAsLeaveOpen}
        title="Exit as on leave"
        message={exitAsLeaveConfirmText(c, today)}
        confirmLabel="Close case"
        confirmColor="warning"
        onClose={() => setExitAsLeaveOpen(false)}
        onConfirm={handleExitAsLeave}
      />
      <ConfirmDialog
        open={removeEvent != null}
        title="Remove entry"
        message={
          removeEvent
            ? `Remove the ${removeEvent.event_type_label.toLowerCase()} of ${fmtDate(removeEvent.event_date)}?`
            : ""
        }
        confirmLabel="Remove"
        confirmColor="error"
        onClose={() => setRemoveEvent(null)}
        onConfirm={async () => {
          if (!removeEvent) return;
          await deactivateLaEvent(coId, removeEvent.event_id);
          setRemoveEvent(null);
          await reload();
        }}
      />
      <ConfirmDialog
        open={removeReceipt != null}
        title="Remove union receipt"
        message={removeReceipt ? `Remove the receipt of ${removeReceipt.union_name}?` : ""}
        confirmLabel="Remove"
        confirmColor="error"
        onClose={() => setRemoveReceipt(null)}
        onConfirm={async () => {
          if (!removeReceipt) return;
          await deactivateLaReceipt(coId, removeReceipt.receipt_id);
          setRemoveReceipt(null);
          await reload();
        }}
      />
    </Box>
  );
}
