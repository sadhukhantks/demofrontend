"use client";

/**
 * Detail view of one follow-up (?followup_id=N): header card with Edit /
 * Close / Reopen, the performance section and the timeline. This is the
 * container of the view — it owns the data hooks and the dialog state and
 * hands plain props to the presentational pieces.
 */

import * as React from "react";
import { Alert, Box, Button, CircularProgress } from "@mui/material";
import { ArrowLeft, Lock, Pencil, RotateCcw } from "lucide-react";
import type { BranchOption } from "@/components/reports/types";
import { EMPTY_CODE_LABELS, labelOf } from "@/components/lowPerformerFollowup/constants";
import { fmtDate, localTodayISO } from "@/components/lowPerformerFollowup/schemas";
import { useFollowupSetup } from "@/components/lowPerformerFollowup/useFollowupSetup";
import {
  closeFollowup,
  createFollowupEvent,
  deactivateFollowupEvent,
  reopenFollowup,
  updateFollowup,
  updateFollowupEvent,
  uploadFollowupNoticeAttachment,
  type FollowupEvent,
  type FollowupEventType,
  type FollowupSpell,
} from "@/utils/lowPerformerFollowupService";
import { useFollowupDetail } from "../_hooks/useFollowupDetail";
import { useFollowupPerformance } from "../_hooks/useFollowupPerformance";
import {
  eventPayloadFields,
  type CloseFollowupFormValues,
  type EditFollowupFormValues,
  type EventFormValues,
} from "../_schemas";
import { describeEvent, earliestEventDate, latestEventDate } from "../_utils";
import CloseFollowupDialog from "./CloseFollowupDialog";
import ConfirmDialog from "./ConfirmDialog";
import EditFollowupDialog from "./EditFollowupDialog";
import EventDialog, { type EventDialogTarget } from "./EventDialog";
import FollowupHeaderCard from "./FollowupHeaderCard";
import FollowupTimeline from "./FollowupTimeline";
import PerformanceSection from "./PerformanceSection";

const EMPTY_EVENTS: ReadonlyArray<FollowupEvent> = Object.freeze([]);
const EMPTY_SPELLS: ReadonlyArray<FollowupSpell> = Object.freeze([]);

export interface FollowupDetailViewProps {
  coId: number;
  followupId: number;
  branches: ReadonlyArray<BranchOption>;
  canCreate: boolean;
  canEdit: boolean;
  /** Back to the list, on the follow-up's branch when known. */
  onBack: (branchId: number | null) => void;
}

export default function FollowupDetailView({
  coId,
  followupId,
  branches,
  canCreate,
  canEdit,
  onBack,
}: FollowupDetailViewProps) {
  const detail = useFollowupDetail(coId, followupId);
  const f = detail.followup;
  const { setup } = useFollowupSetup(coId, f?.branch_id ?? null);
  const perf = useFollowupPerformance(coId, followupId);
  const [localToday] = React.useState(() => localTodayISO());
  const today = setup?.today ?? localToday;

  const events = detail.events ?? EMPTY_EVENTS;
  const earliest = React.useMemo(() => earliestEventDate(events), [events]);
  const latest = React.useMemo(() => latestEventDate(events), [events]);

  const [editOpen, setEditOpen] = React.useState(false);
  const [closeOpen, setCloseOpen] = React.useState(false);
  const [reopenOpen, setReopenOpen] = React.useState(false);
  const [eventTarget, setEventTarget] = React.useState<EventDialogTarget | null>(null);
  const [removeTarget, setRemoveTarget] = React.useState<FollowupEvent | null>(null);
  const [banner, setBanner] = React.useState<{ severity: "success" | "warning"; text: string } | null>(null);

  const isOpen = f?.status === 1;
  const noticeTypes = setup?.notice_types ?? EMPTY_CODE_LABELS;

  const handleEdit = async (v: EditFollowupFormValues) => {
    if (!f) return;
    const row = await updateFollowup({
      co_id: coId,
      followup_id: f.followup_id,
      reason: v.reason.trim(),
      start_date: v.start_date,
      review_date: v.review_date.trim() || null,
    });
    detail.setFollowup(row);
    setEditOpen(false);
    // The start date moves the default window and the trend weeks.
    if (row.start_date !== f.start_date) void perf.reload();
  };

  const handleClose = async (v: CloseFollowupFormValues) => {
    if (!f) return;
    const remarks = v.close_remarks.trim();
    const row = await closeFollowup({
      co_id: coId,
      followup_id: f.followup_id,
      closed_date: v.closed_date,
      close_reason: v.close_reason,
      ...(remarks ? { close_remarks: remarks } : {}),
    });
    detail.setFollowup(row);
    setCloseOpen(false);
    setBanner({ severity: "success", text: "Follow-up closed." });
    // The default performance window now ends at the close date.
    void perf.reload();
  };

  const handleReopen = async () => {
    if (!f) return;
    const row = await reopenFollowup(coId, f.followup_id);
    detail.setFollowup(row);
    setReopenOpen(false);
    setBanner({ severity: "success", text: "Follow-up reopened." });
    // The backend adds an automatic remark with the old close details: refresh
    // the timeline (and counts); the default window runs to yesterday again.
    await Promise.all([detail.reload(), perf.reload()]);
  };

  const handleEventSubmit = async (values: EventFormValues, target: EventDialogTarget) => {
    if (!f) return;
    const fields = eventPayloadFields(values, target.eventType);
    let uploadProblem: string | null = null;
    if (target.mode === "edit" && target.event) {
      await updateFollowupEvent({
        co_id: coId,
        followup_event_id: target.event.followup_event_id,
        ...fields,
      });
    } else {
      const created = await createFollowupEvent({
        co_id: coId,
        followup_id: f.followup_id,
        event_type: target.eventType,
        ...fields,
      });
      // The entry exists now: an upload failure must not leave the dialog open
      // (saving again would record the notice twice).
      if (values.file) {
        try {
          await uploadFollowupNoticeAttachment(coId, created.followup_event_id, values.file);
        } catch (err: unknown) {
          uploadProblem = err instanceof Error ? err.message : "upload failed";
        }
      }
    }
    setEventTarget(null);
    setBanner(
      uploadProblem
        ? {
            severity: "warning",
            text: `The notice was saved, but the scan did not upload (${uploadProblem}). Upload it again on the timeline entry.`,
          }
        : null,
    );
    await detail.reload();
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    await deactivateFollowupEvent(coId, removeTarget.followup_event_id);
    setRemoveTarget(null);
    await detail.reload();
  };

  const backButton = (
    <Button
      variant="text"
      startIcon={<ArrowLeft size={16} />}
      onClick={() => onBack(f?.branch_id ?? null)}
      sx={{ mb: 1.5 }}
    >
      Back to list
    </Button>
  );

  if (!f) {
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

  const actions =
    canEdit && isOpen ? (
      <>
        <Button size="small" variant="outlined" startIcon={<Pencil size={14} />} onClick={() => setEditOpen(true)}>
          Edit
        </Button>
        <Button
          size="small"
          variant="outlined"
          color="warning"
          startIcon={<Lock size={14} />}
          onClick={() => setCloseOpen(true)}
        >
          Close
        </Button>
      </>
    ) : canEdit && !isOpen ? (
      <Button size="small" variant="outlined" startIcon={<RotateCcw size={14} />} onClick={() => setReopenOpen(true)}>
        Reopen
      </Button>
    ) : null;

  return (
    <Box>
      {backButton}
      {banner ? (
        <Alert severity={banner.severity} onClose={() => setBanner(null)} sx={{ mb: 2 }}>
          {banner.text}
        </Alert>
      ) : null}
      {detail.error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {detail.error}
        </Alert>
      ) : null}

      <FollowupHeaderCard
        followup={f}
        deptLabel={labelOf(setup?.depts, f.dept_code)}
        branchName={branches.find((b) => b.branch_id === f.branch_id)?.branch_name ?? null}
        closeReasonLabel={labelOf(setup?.close_reasons, f.close_reason)}
        lastNoticeLabel={labelOf(noticeTypes, f.last_notice_type)}
        actions={actions}
      />

      <PerformanceSection
        data={perf.data}
        loading={perf.loading}
        error={perf.error}
        today={today}
        onLoad={(from, to) => void perf.load(from, to)}
      />

      <FollowupTimeline
        events={detail.events}
        error={detail.eventsError}
        eventTypes={setup?.event_types ?? EMPTY_CODE_LABELS}
        noticeTypes={noticeTypes}
        coId={coId}
        isOpen={isOpen}
        canCreate={canCreate}
        canEdit={canEdit}
        onAdd={(type: FollowupEventType) => setEventTarget({ mode: "create", eventType: type, event: null })}
        onEdit={(ev) => setEventTarget({ mode: "edit", eventType: ev.event_type, event: ev })}
        onRemove={setRemoveTarget}
      />

      <EditFollowupDialog
        open={editOpen}
        followup={f}
        today={today}
        earliestEventDate={earliest}
        onClose={() => setEditOpen(false)}
        onSubmit={handleEdit}
      />
      <CloseFollowupDialog
        open={closeOpen}
        followup={f}
        closeReasons={setup?.close_reasons ?? EMPTY_CODE_LABELS}
        today={today}
        lastEntryDate={latest}
        onClose={() => setCloseOpen(false)}
        onSubmit={handleClose}
      />
      <ConfirmDialog
        open={reopenOpen}
        title="Reopen follow-up"
        message={`Start following up ${f.worker_name ?? `EB ${f.eb_no ?? f.eb_id}`} again? Remarks, notices and hour cuts can be added once it is open.`}
        confirmLabel="Reopen"
        onClose={() => setReopenOpen(false)}
        onConfirm={handleReopen}
      />
      <EventDialog
        target={eventTarget}
        noticeTypes={noticeTypes}
        spells={setup?.spells ?? EMPTY_SPELLS}
        startDate={f.start_date}
        today={today}
        events={events}
        onClose={() => setEventTarget(null)}
        onSubmit={handleEventSubmit}
      />
      <ConfirmDialog
        open={removeTarget != null}
        title="Remove entry"
        message={
          removeTarget
            ? `Remove the ${labelOf(setup?.event_types, removeTarget.event_type).toLowerCase()} of ${fmtDate(removeTarget.event_date)}${
                describeEvent(removeTarget, noticeTypes) ? ` (${describeEvent(removeTarget, noticeTypes)})` : ""
              }?`
            : ""
        }
        confirmLabel="Remove"
        confirmColor="error"
        onClose={() => setRemoveTarget(null)}
        onConfirm={handleRemove}
      />
    </Box>
  );
}
