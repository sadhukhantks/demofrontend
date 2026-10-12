"use client";

/**
 * The smaller case panels: Leave (read from the leave module), Performance
 * and Earlier cases. Presentational — the case view owns the data and the
 * dialogs.
 */

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import type { Theme } from "@mui/material/styles";
import { BarChart3, ChevronRight } from "lucide-react";
import { fmtDate } from "@/components/lowPerformerFollowup/schemas";
import type {
  LaCase,
  LaCodeLabel,
  LaEarlierCase,
  LaPerfRow,
  LaPerformance,
  LaSetup,
} from "@/utils/longAbsenteeismService";
import { exitLeaveText, fmtNum, isLeaveCode, labelOf, leaveStatusLine, stageLabel } from "../_utils";
import SimpleTable, { type SimpleColumn } from "./SimpleTable";

/** 44 px touch targets below `md` (FollowupTimeline pattern), compact on desktop. */
export const touchTargetsSx = (theme: Theme) => ({
  [theme.breakpoints.down("md")]: {
    "& .MuiButtonBase-root": { minHeight: theme.spacing(5.5) },
    "& .MuiIconButton-root": { minWidth: theme.spacing(5.5) },
  },
});

export function PanelTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
      <Typography variant="h6" sx={{ fontWeight: 600, fontSize: "1.05rem" }}>
        {title}
      </Typography>
      {action ? (
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          {action}
        </Stack>
      ) : null}
    </Box>
  );
}

function Line({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Box sx={{ display: "flex", gap: 1, justifyContent: "space-between", py: 0.5, borderBottom: 1, borderColor: "divider" }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" component="div" sx={{ fontWeight: 600, textAlign: "right" }}>
        {value || "—"}
      </Typography>
    </Box>
  );
}

// ─── Leave ───────────────────────────────────────────────────────────

export interface LeavePanelProps {
  c: LaCase;
  /** Server date (YYYY-MM-DD): whether the module leave is on, upcoming or over. */
  today: string;
  /** setup.esi_stl_results — labels of an old case's verification result. */
  esiStlResults?: ReadonlyArray<LaCodeLabel>;
}

const LEAVE_ALERT_SEVERITY = { now: "info", upcoming: "info", ended: "warning" } as const;

/**
 * The worker's leave as the leave module records it (approved requests of the
 * Leave Request page only), a pending request, and a leave-like exit reason.
 * Nothing here is entered on this page.
 */
export function LeavePanel({ c, today, esiStlResults }: LeavePanelProps) {
  const status = leaveStatusLine(c, today);
  const exitLeave = exitLeaveText(c);
  const oldCheck =
    c.verified_date && isLeaveCode(c.esi_stl_result)
      ? c.esi_stl_result_label || labelOf(esiStlResults, c.esi_stl_result)
      : null;
  return (
    <Paper elevation={1} sx={[{ p: { xs: 1.5, md: 2 }, mb: 2 }, touchTargetsSx]}>
      <PanelTitle title="Leave (leave module)" />
      {status.state ? (
        <Alert severity={LEAVE_ALERT_SEVERITY[status.state]}>{status.text}</Alert>
      ) : (
        <Typography variant="body2" color="text.secondary">
          {status.text}
        </Typography>
      )}
      {c.pending_leave_since ? (
        <Typography variant="body2" sx={{ mt: 1, color: "warning.main", fontWeight: 600 }}>
          Leave request pending approval since {fmtDate(c.pending_leave_since)}
        </Typography>
      ) : null}
      {exitLeave || oldCheck ? (
        <Box sx={{ mt: 1 }}>
          {exitLeave ? <Line label="Closed as" value={exitLeave} /> : null}
          {oldCheck ? <Line label="Recorded at verification" value={oldCheck} /> : null}
        </Box>
      ) : null}
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
        Leave is read from the Leave Request page (hrms/LeaveRequest); only approved requests count.
      </Typography>
    </Paper>
  );
}

// ─── Performance ─────────────────────────────────────────────────────

export interface PerformancePanelProps {
  c: LaCase;
  data: LaPerformance | null;
  loading: boolean;
  error: string | null;
  onLoad: () => void;
}

const PERF_COLUMNS: ReadonlyArray<SimpleColumn<LaPerfRow>> = [
  { key: "date", label: "Date", render: (r) => fmtDate(r.tran_date) },
  { key: "shift", label: "Spell", render: (r) => r.spell_code ?? r.shift ?? "" },
  { key: "machine", label: "Machine", render: (r) => r.machine ?? "" },
  { key: "quality", label: "Quality", render: (r) => r.quality ?? "" },
  { key: "prod", label: "Prod kg", align: "right", render: (r) => fmtNum(r.prod_kg, 1) },
  { key: "eff", label: "Eff %", align: "right", render: (r) => fmtNum(r.eff_pct, 1) },
  { key: "hours", label: "Hours", align: "right", render: (r) => fmtNum(r.hours, 1) },
];

/** Production in the 30 days before the last working date (weaving / spinning / winding). */
export function PerformancePanel({ c, data, loading, error, onLoad }: PerformancePanelProps) {
  const cached = c.perf_from != null;
  return (
    <Paper elevation={1} sx={[{ p: { xs: 1.5, md: 2 }, mb: 2 }, touchTargetsSx]}>
      <PanelTitle
        title="Performance"
        action={
          <Button
            size="small"
            variant="outlined"
            startIcon={loading ? <CircularProgress size={14} /> : <BarChart3 size={14} />}
            onClick={onLoad}
            disabled={loading}
          >
            Load last 30 days
          </Button>
        }
      />
      {error ? (
        <Alert severity="error" sx={{ mb: 1.5 }}>
          {error}
        </Alert>
      ) : null}
      {data == null && cached ? (
        <Box>
          <Typography variant="caption" color="text.secondary">
            Last loaded for {fmtDate(c.perf_from)} – {fmtDate(c.perf_to)}
            {c.perf_dept ? ` (${c.perf_dept.toLowerCase()})` : ""}
          </Typography>
          <Line label="Average efficiency" value={c.perf_avg_eff != null ? `${fmtNum(c.perf_avg_eff, 1)} %` : ""} />
          <Line label="Kg per hour" value={fmtNum(c.perf_kg_per_hr, 2)} />
          <Line label="Days worked" value={c.perf_days_worked != null ? String(c.perf_days_worked) : ""} />
        </Box>
      ) : null}
      {data == null && !cached && !error ? (
        <Typography variant="body2" color="text.secondary">
          How the worker produced before going absent — useful when deciding on a reply.
        </Typography>
      ) : null}
      {data && !data.available ? <Alert severity="info">{data.reason}</Alert> : null}
      {data && data.available ? (
        <Box>
          <Typography variant="caption" color="text.secondary">
            {data.dept}
            {data.date_from ? ` · ${fmtDate(data.date_from)} – ${fmtDate(data.date_to)}` : ""}
          </Typography>
          <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: "repeat(3, minmax(0, 1fr))", my: 1 }}>
            <Stat label="Avg efficiency" value={data.summary.avg_eff != null ? `${fmtNum(data.summary.avg_eff, 1)} %` : "—"} />
            <Stat label="Kg / hour" value={fmtNum(data.summary.kg_per_hr, 2) || "—"} />
            <Stat label="Days worked" value={String(data.summary.days_worked)} />
          </Box>
          <SimpleTable
            rows={data.rows}
            columns={PERF_COLUMNS}
            getKey={(r, i) => `${r.tran_date}-${r.spell_code ?? r.shift ?? ""}-${r.machine_id ?? ""}-${i}`}
            emptyText="No production recorded in the window."
          />
        </Box>
      ) : null}
    </Paper>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ p: 1, border: 1, borderColor: "divider", borderRadius: 1, textAlign: "center" }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
        {label}
      </Typography>
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
        {value}
      </Typography>
    </Box>
  );
}

// ─── Earlier cases ───────────────────────────────────────────────────

export interface EarlierCasesPanelProps {
  cases: ReadonlyArray<LaEarlierCase>;
  setup: LaSetup | null;
  onOpen: (caseId: number) => void;
}

/** The worker's earlier cases in the branch (repeat absentee history). */
export function EarlierCasesPanel({ cases, setup, onOpen }: EarlierCasesPanelProps) {
  if (cases.length === 0) return null;
  return (
    <Paper elevation={1} sx={[{ p: { xs: 1.5, md: 2 }, mb: 2 }, touchTargetsSx]}>
      <PanelTitle title={`Earlier cases (${cases.length})`} />
      <Stack spacing={0.75}>
        {cases.map((e) => (
          <Box
            key={e.case_id}
            sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", borderBottom: 1, borderColor: "divider", pb: 0.75 }}
          >
            <Box sx={{ flex: "1 1 auto", minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {e.case_no ?? `Case ${e.case_id}`} · detected {fmtDate(e.detected_date)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {stageLabel(setup, e.stage_code)}
                {e.exit_reason ? ` · ${labelOf(setup?.all_exit_reasons, e.exit_reason)}` : ""}
                {e.exit_date ? ` on ${fmtDate(e.exit_date)}` : ""}
              </Typography>
            </Box>
            <Button size="small" endIcon={<ChevronRight size={14} />} onClick={() => onOpen(e.case_id)}>
              Open
            </Button>
          </Box>
        ))}
      </Stack>
    </Paper>
  );
}
