"use client";

import * as React from "react";
import { Box, Chip, IconButton, Paper, Stack, Tooltip, Typography } from "@mui/material";
import {
  Ban,
  CheckCircle2,
  FileText,
  Gavel,
  LogOut,
  MessageSquare,
  MessagesSquare,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Trash2,
  Undo2,
} from "lucide-react";
import AttachmentUploader from "@/components/AttachmentUploader";
import { fmtDate } from "@/components/lowPerformerFollowup/schemas";
import {
  LA_EVENT_ATTACHMENT_MODULE,
  LA_EVENT_FILE_TYPES,
  type LaEvent,
} from "@/utils/longAbsenteeismService";
import { isUserEvent, sortEventsNewestFirst, type ChipColor } from "../_utils";
import { PanelTitle, touchTargetsSx } from "./CasePanels";

const TYPE_STYLE: Record<string, { icon: React.ReactNode; color: ChipColor }> = {
  REMARK: { icon: <MessageSquare size={14} />, color: "default" },
  FEEDBACK: { icon: <MessagesSquare size={14} />, color: "info" },
  REPLY: { icon: <Undo2 size={14} />, color: "primary" },
  VERIFY: { icon: <ShieldCheck size={14} />, color: "info" },
  STAGE: { icon: <FileText size={14} />, color: "warning" },
  PARK: { icon: <Pause size={14} />, color: "warning" },
  RESUME: { icon: <Play size={14} />, color: "default" },
  EXIT: { icon: <LogOut size={14} />, color: "default" },
  REOPEN: { icon: <RotateCcw size={14} />, color: "default" },
  DISMISS: { icon: <Ban size={14} />, color: "default" },
  APPROVAL: { icon: <Gavel size={14} />, color: "error" },
  SYSTEM: { icon: <Settings2 size={14} />, color: "default" },
};
const FALLBACK_STYLE = { icon: <CheckCircle2 size={14} />, color: "default" as ChipColor };

export interface CaseTimelineProps {
  events: ReadonlyArray<LaEvent>;
  coId: number;
  /** Edit a user entry (create access edits own entries; the backend checks ownership). */
  canEditEntry: boolean;
  /** Remove a user entry (edit access). */
  canRemoveEntry: boolean;
  /** Upload reply / medical / other documents on REPLY entries (create access). */
  canAttach: boolean;
  /** Add-entry buttons, already permission-filtered. */
  headerAction?: React.ReactNode;
  onEdit: (event: LaEvent) => void;
  onRemove: (event: LaEvent) => void;
}

/** Everything that happened on the case, newest first. */
export default function CaseTimeline({
  events,
  coId,
  canEditEntry,
  canRemoveEntry,
  canAttach,
  headerAction,
  onEdit,
  onRemove,
}: CaseTimelineProps) {
  const sorted = React.useMemo(() => sortEventsNewestFirst(events), [events]);
  return (
    <Paper elevation={1} sx={[{ p: { xs: 1.5, md: 2 }, mb: 2 }, touchTargetsSx]}>
      <PanelTitle title="Timeline" action={headerAction} />
      {sorted.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Nothing recorded yet.
        </Typography>
      ) : null}
      <Stack spacing={1.25}>
        {sorted.map((ev) => {
          const style = TYPE_STYLE[ev.event_type] ?? FALLBACK_STYLE;
          const user = isUserEvent(ev);
          const detail =
            ev.event_type === "REPLY"
              ? [ev.channel_label ?? ev.channel, ev.contact_name].filter(Boolean).join(" · ")
              : "";
          return (
            <Paper key={ev.event_id} variant="outlined" sx={{ p: 1.25 }}>
              <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, flexWrap: "wrap" }}>
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  useFlexGap
                  flexWrap="wrap"
                  sx={{ flex: "1 1 auto", minWidth: 0 }}
                >
                  <Chip
                    size="small"
                    color={style.color}
                    icon={<Box sx={{ display: "flex", pl: 0.5 }}>{style.icon}</Box>}
                    label={ev.event_type_label}
                  />
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {fmtDate(ev.event_date)}
                  </Typography>
                  {detail ? (
                    <Typography variant="body2" color="text.secondary">
                      {detail}
                    </Typography>
                  ) : null}
                </Stack>
                {user && (canEditEntry || canRemoveEntry) ? (
                  <Stack direction="row" spacing={0.5}>
                    {canEditEntry ? (
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => onEdit(ev)} aria-label="Edit entry">
                          <Pencil size={16} />
                        </IconButton>
                      </Tooltip>
                    ) : null}
                    {canRemoveEntry ? (
                      <Tooltip title="Remove">
                        <IconButton size="small" color="error" onClick={() => onRemove(ev)} aria-label="Remove entry">
                          <Trash2 size={16} />
                        </IconButton>
                      </Tooltip>
                    ) : null}
                  </Stack>
                ) : null}
              </Box>
              {ev.text ? (
                <Typography variant="body2" sx={{ mt: 0.75, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {ev.text}
                </Typography>
              ) : null}
              {ev.event_type === "REPLY" ? (
                <Box sx={{ mt: 1, display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" } }}>
                  <AttachmentUploader
                    module={LA_EVENT_ATTACHMENT_MODULE}
                    fileType={LA_EVENT_FILE_TYPES.REPLY}
                    entityId={ev.event_id}
                    coId={coId}
                    disabled={!canAttach}
                    label="Reply letter"
                  />
                  <AttachmentUploader
                    module={LA_EVENT_ATTACHMENT_MODULE}
                    fileType={LA_EVENT_FILE_TYPES.MEDICAL}
                    entityId={ev.event_id}
                    coId={coId}
                    disabled={!canAttach}
                    label="Medical certificate"
                  />
                  <AttachmentUploader
                    module={LA_EVENT_ATTACHMENT_MODULE}
                    fileType={LA_EVENT_FILE_TYPES.OTHER}
                    entityId={ev.event_id}
                    coId={coId}
                    disabled={!canAttach}
                    label="Other proof"
                  />
                </Box>
              ) : null}
            </Paper>
          );
        })}
      </Stack>
    </Paper>
  );
}
