"use client";

import * as React from "react";
import { Box, Chip, Paper, Stack, Typography } from "@mui/material";
import type { FollowupRow } from "@/utils/lowPerformerFollowupService";
import { fmtDate } from "@/components/lowPerformerFollowup/schemas";
import { fmtHours } from "../_utils";
import FollowupStatusChip from "./FollowupStatusChip";

export interface FollowupHeaderCardProps {
  followup: FollowupRow;
  deptLabel: string;
  branchName: string | null;
  closeReasonLabel: string;
  lastNoticeLabel: string;
  /** Edit / Close / Reopen buttons (already permission-filtered). */
  actions?: React.ReactNode;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
        {label}
      </Typography>
      <Typography variant="body2" component="div" sx={{ fontWeight: 600, wordBreak: "break-word" }}>
        {children || "—"}
      </Typography>
    </Box>
  );
}

/** Who is being followed up, since when, and the running counts. */
export default function FollowupHeaderCard({
  followup: f,
  deptLabel,
  branchName,
  closeReasonLabel,
  lastNoticeLabel,
  actions,
}: FollowupHeaderCardProps) {
  return (
    <Paper elevation={1} sx={{ p: { xs: 1.5, md: 2 }, mb: 2 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 1.5,
          flexWrap: "wrap",
          mb: 1.5,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {f.worker_name || "(no name)"}
            </Typography>
            <FollowupStatusChip status={f.status} />
            {f.review_due ? <Chip size="small" color="warning" label="Review due" /> : null}
          </Stack>
          <Typography variant="body2" color="text.secondary">
            EB No {f.eb_no ?? f.eb_id} · {deptLabel}
            {branchName ? ` · ${branchName}` : ""}
          </Typography>
        </Box>
        {actions ? (
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            {actions}
          </Stack>
        ) : null}
      </Box>

      <Box
        sx={{
          display: "grid",
          gap: 1.5,
          gridTemplateColumns: {
            xs: "repeat(2, minmax(0, 1fr))",
            sm: "repeat(3, minmax(0, 1fr))",
            md: "repeat(6, minmax(0, 1fr))",
          },
        }}
      >
        <Field label="Since">{fmtDate(f.start_date)}</Field>
        <Field label="Days tracked">{String(f.days_tracked)}</Field>
        <Field label="Review date">{fmtDate(f.review_date)}</Field>
        <Field label="Remarks">{String(f.remark_count)}</Field>
        <Field label="Notices">
          {f.notice_count ? `${f.notice_count}${lastNoticeLabel ? ` · last: ${lastNoticeLabel}` : ""}` : "0"}
        </Field>
        <Field label="Hour cuts">
          {f.hours_cut_count ? `${f.hours_cut_count} · ${fmtHours(f.total_hours_cut)} h` : "0"}
        </Field>
      </Box>

      {f.reason ? (
        <Box sx={{ mt: 1.5 }}>
          <Field label="Reason">{f.reason}</Field>
        </Box>
      ) : null}

      {f.status === 0 ? (
        <Box
          sx={{
            mt: 1.5,
            p: 1.25,
            borderRadius: 1,
            border: 1,
            borderColor: "divider",
            bgcolor: "action.hover",
          }}
        >
          <Typography variant="body2">
            <strong>Closed</strong> on {fmtDate(f.closed_date)}
            {closeReasonLabel ? ` — ${closeReasonLabel}` : ""}
          </Typography>
          {f.close_remarks ? (
            <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-wrap" }}>
              {f.close_remarks}
            </Typography>
          ) : null}
        </Box>
      ) : null}
    </Paper>
  );
}
