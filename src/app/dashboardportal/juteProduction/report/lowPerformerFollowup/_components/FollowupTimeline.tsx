"use client";

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import type { Theme } from "@mui/material/styles";
import { Clock, FileWarning, MessageSquare, Pencil, Plus, Trash2 } from "lucide-react";
import AttachmentUploader from "@/components/AttachmentUploader";
import { labelOf } from "@/components/lowPerformerFollowup/constants";
import { fmtDate } from "@/components/lowPerformerFollowup/schemas";
import {
  FOLLOWUP_ATTACHMENT_MODULE,
  FOLLOWUP_NOTICE_FILE_TYPE,
  type CodeLabel,
  type FollowupEvent,
  type FollowupEventType,
} from "@/utils/lowPerformerFollowupService";
import { describeEvent, sortEventsNewestFirst } from "../_utils";

const TYPE_STYLE: Record<
  FollowupEventType,
  { icon: React.ReactNode; color: "default" | "warning" | "error" }
> = {
  REMARK: { icon: <MessageSquare size={14} />, color: "default" },
  NOTICE: { icon: <FileWarning size={14} />, color: "warning" },
  HOURS_CUT: { icon: <Clock size={14} />, color: "error" },
};

/**
 * Below `md` (phones, portrait tablets) every control in the timeline gets a
 * 44×44 px touch target (Apple HIG / WCAG 2.5.5 minimum); desktop keeps the
 * compact `size="small"` look. Set once on the root so it also reaches the
 * buttons inside the shared AttachmentUploader (upload / download / replace /
 * delete scan), which this component does not own.
 */
const touchTargetsSx = (theme: Theme) => ({
  [theme.breakpoints.down("md")]: {
    "& .MuiButtonBase-root": { minHeight: theme.spacing(5.5) },
    // Text buttons already have a 64px min-width; icon buttons need the width too.
    "& .MuiIconButton-root": { minWidth: theme.spacing(5.5) },
  },
});

export interface FollowupTimelineProps {
  /** null while loading. */
  events: FollowupEvent[] | null;
  error: string | null;
  eventTypes: ReadonlyArray<CodeLabel>;
  noticeTypes: ReadonlyArray<CodeLabel>;
  coId: number;
  /** Follow-up is open (entries can only be added / changed while open). */
  isOpen: boolean;
  canCreate: boolean;
  canEdit: boolean;
  onAdd: (type: FollowupEventType) => void;
  onEdit: (event: FollowupEvent) => void;
  onRemove: (event: FollowupEvent) => void;
}

/** Remarks, warning notices and hour cuts, newest first. */
export default function FollowupTimeline({
  events,
  error,
  eventTypes,
  noticeTypes,
  coId,
  isOpen,
  canCreate,
  canEdit,
  onAdd,
  onEdit,
  onRemove,
}: FollowupTimelineProps) {
  const sorted = React.useMemo(() => (events ? sortEventsNewestFirst(events) : []), [events]);
  const canChange = canEdit && isOpen;

  return (
    <Paper elevation={1} sx={[{ p: { xs: 1.5, md: 2 }, mb: 2 }, touchTargetsSx]}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          flexWrap: "wrap",
          mb: 1.5,
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Timeline
        </Typography>
        {isOpen && canCreate ? (
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Button size="small" variant="outlined" startIcon={<Plus size={14} />} onClick={() => onAdd("REMARK")}>
              Add remark
            </Button>
            <Button size="small" variant="outlined" startIcon={<Plus size={14} />} onClick={() => onAdd("NOTICE")}>
              Add notice
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<Plus size={14} />}
              onClick={() => onAdd("HOURS_CUT")}
            >
              Add hour cut
            </Button>
          </Stack>
        ) : null}
      </Box>

      {error ? (
        <Alert severity="error" sx={{ mb: 1.5 }}>
          {error}
        </Alert>
      ) : null}

      {events == null && !error ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
          <CircularProgress size={24} />
        </Box>
      ) : null}

      {events != null && sorted.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Nothing recorded yet.
        </Typography>
      ) : null}

      <Stack spacing={1.25}>
        {sorted.map((ev) => {
          const style = TYPE_STYLE[ev.event_type];
          const detail = describeEvent(ev, noticeTypes);
          return (
            <Paper key={ev.followup_event_id} variant="outlined" sx={{ p: 1.25 }}>
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
                    label={labelOf(eventTypes, ev.event_type)}
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
                {canChange ? (
                  <Stack direction="row" spacing={0.5}>
                    <Tooltip title="Edit">
                      <IconButton size="small" onClick={() => onEdit(ev)} aria-label="Edit entry">
                        <Pencil size={16} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Remove">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => onRemove(ev)}
                        aria-label="Remove entry"
                      >
                        <Trash2 size={16} />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                ) : null}
              </Box>
              {ev.remarks ? (
                <Typography variant="body2" sx={{ mt: 0.75, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {ev.remarks}
                </Typography>
              ) : null}
              {ev.event_type === "NOTICE" ? (
                <Box sx={{ mt: 1 }}>
                  <AttachmentUploader
                    module={FOLLOWUP_ATTACHMENT_MODULE}
                    fileType={FOLLOWUP_NOTICE_FILE_TYPE}
                    entityId={ev.followup_event_id}
                    coId={coId}
                    disabled={!canChange}
                    label="Scanned notice"
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
