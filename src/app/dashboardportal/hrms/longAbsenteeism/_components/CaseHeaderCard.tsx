"use client";

import * as React from "react";
import { Alert, Box, Chip, Paper, Stack, Typography } from "@mui/material";
import { fmtDate } from "@/components/lowPerformerFollowup/schemas";
import type { LaCase } from "@/utils/longAbsenteeismService";
import { dueText, isDue, leaveHeaderChip, pendingLeaveText } from "../_utils";
import { ApprovalChip, CaseStatusChip, StageChip } from "./Chips";

export interface CaseHeaderCardProps {
  c: LaCase;
  branchName: string | null;
  today: string;
  /** Action buttons (already permission-filtered). */
  actions?: React.ReactNode;
  /** "Close as rejoined" on the marked-present banner (edit access). */
  rejoinAction?: React.ReactNode;
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

/** Who the case is about (snapshot at opening), how long absent, where on the ladder. */
export default function CaseHeaderCard({ c, branchName, today, actions, rejoinAction }: CaseHeaderCardProps) {
  const live = c.status !== 0;
  const leaveChip = leaveHeaderChip(c, today);
  const pendingLeave = pendingLeaveText(c);
  return (
    <Paper elevation={1} sx={{ p: { xs: 1.5, md: 2 }, mb: 2 }}>
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1.5, flexWrap: "wrap" }}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {c.emp_name || "(no name)"}
            </Typography>
            <StageChip code={c.stage_code} label={c.stage_label} />
            <CaseStatusChip status={c.status} label={c.status_label} />
            <ApprovalChip statusId={c.status_id} level={c.approval_level} />
            {c.habitual === 1 ? <Chip size="small" color="error" variant="outlined" label="Habitual" /> : null}
            {leaveChip ? <Chip size="small" color={leaveChip.color} label={leaveChip.label} sx={{ maxWidth: "100%" }} /> : null}
            {pendingLeave ? <Chip size="small" variant="outlined" label={pendingLeave} sx={{ maxWidth: "100%" }} /> : null}
          </Stack>
          <Typography variant="body2" color="text.secondary">
            EB {c.emp_code ?? c.eb_id}
            {c.case_no ? ` · Case ${c.case_no}` : ""}
            {branchName ? ` · ${branchName}` : ""}
          </Typography>
        </Box>
        {actions ? (
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ "& .MuiButton-root": { minHeight: { xs: 44, md: 32 } } }}>
            {actions}
          </Stack>
        ) : null}
      </Box>

      {live && c.rejoined_seen_date ? (
        <Alert severity="warning" sx={{ mt: 1.5 }} action={rejoinAction}>
          Marked present on {fmtDate(c.rejoined_seen_date)} — attendance found after the last working date. Check it and
          close the case as Rejoined.
        </Alert>
      ) : null}

      <Box
        sx={{
          mt: 1.5,
          display: "grid",
          gap: 1.5,
          gridTemplateColumns: {
            xs: "repeat(2, minmax(0, 1fr))",
            sm: "repeat(3, minmax(0, 1fr))",
            md: "repeat(6, minmax(0, 1fr))",
          },
        }}
      >
        <Field label="Last working date">{fmtDate(c.last_working_date)}</Field>
        <Field label="Absent days">{String(c.absent_days)}</Field>
        <Field label="Stage since">{fmtDate(c.stage_date)}</Field>
        <Field label="Next step">
          {live && c.next_due_date ? (
            <Box component="span" sx={{ color: isDue(c.next_due_date, today) ? "warning.main" : "inherit" }}>
              {dueText(c.next_due_date, today)}
            </Box>
          ) : (
            ""
          )}
        </Field>
        <Field label="Detected">{fmtDate(c.detected_date)}</Field>
        <Field label="Days absent at opening">{c.absent_days_at_open != null ? String(c.absent_days_at_open) : ""}</Field>
        <Field label="Department">
          {[c.dept_desc, c.sub_dept_desc].filter(Boolean).join(" / ")}
        </Field>
        <Field label="Designation">{c.designation}</Field>
        <Field label="Category">{c.category}</Field>
        <Field label="Date of joining">{fmtDate(c.date_of_join)}</Field>
        <Field label="Last machine / spell">{[c.last_machine, c.last_spell].filter(Boolean).join(" / ")}</Field>
        <Field label="Mobile">{c.mobile}</Field>
        <Field label="Father / spouse">{c.father_name}</Field>
        <Field label="ESI No">{c.esi_no}</Field>
        <Field label="PF No">{c.pf_no}</Field>
      </Box>
      {c.address ? (
        <Box sx={{ mt: 1.5 }}>
          <Field label="Address">{c.address}</Field>
        </Box>
      ) : null}
      {c.remarks ? (
        <Box sx={{ mt: 1.5 }}>
          <Field label="Remarks">
            <Box component="span" sx={{ whiteSpace: "pre-wrap", fontWeight: 400 }}>
              {c.remarks}
            </Box>
          </Field>
        </Box>
      ) : null}

      {!live ? (
        <Box sx={{ mt: 1.5, p: 1.25, borderRadius: 1, border: 1, borderColor: "divider", bgcolor: "action.hover" }}>
          <Typography variant="body2">
            <strong>Closed</strong>
            {c.exit_date ? ` on ${fmtDate(c.exit_date)}` : ""}
            {c.exit_reason_label ? ` — ${c.exit_reason_label}` : ""}
            {c.struck_off_date ? ` (struck off with effect from ${fmtDate(c.struck_off_date)})` : ""}
          </Typography>
          {c.expected_return_date ? (
            <Typography variant="body2" color="text.secondary">
              Expected back {fmtDate(c.expected_return_date)}
            </Typography>
          ) : null}
          {c.snooze_until ? (
            <Typography variant="body2" color="text.secondary">
              Not listed as a candidate until {fmtDate(c.snooze_until)}
            </Typography>
          ) : null}
          {c.exit_remarks ? (
            <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-wrap" }}>
              {c.exit_remarks}
            </Typography>
          ) : null}
        </Box>
      ) : null}
    </Paper>
  );
}
