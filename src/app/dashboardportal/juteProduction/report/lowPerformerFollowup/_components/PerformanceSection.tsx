"use client";

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
  Typography,
} from "@mui/material";
import { ChevronDown } from "lucide-react";
import type { GridColDef } from "@mui/x-data-grid";
import ReportGrid from "@/components/reports/ReportGrid";
import { fmtDate } from "@/components/lowPerformerFollowup/schemas";
import type {
  FollowupPerformance,
  PerfRow,
  SameMachineRow,
  SameMachineSummary,
  SameQualityRow,
  TrendWeek,
} from "@/utils/lowPerformerFollowupService";
import { perfWindowSchema } from "../_schemas";
import { diffColor, fmtDiff, fmtHours, fmtNum, kgPerHr, numDiff, weekLabels, windowDays } from "../_utils";
import SimpleTable, { type SimpleColumn } from "./SimpleTable";
import TrendChart from "./TrendChart";

export interface PerformanceSectionProps {
  data: FollowupPerformance | null;
  loading: boolean;
  error: string | null;
  today: string;
  /** "" / "" = the server's default window. */
  onLoad: (from: string, to: string) => void;
}

type WithId<T> = T & { row_id: number };

const numFmt = (decimals: number) => (value: number | null | undefined) => fmtNum(value, decimals);

const personColumns: GridColDef<WithId<PerfRow>>[] = [
  { field: "tran_date", headerName: "Date", width: 105, valueFormatter: (v: string) => fmtDate(v) },
  { field: "shift", headerName: "Shift", width: 70 },
  { field: "spell_code", headerName: "Spell", width: 75 },
  { field: "machine", headerName: "Machine", width: 130 },
  { field: "quality", headerName: "Count / Quality", flex: 1, minWidth: 160 },
  { field: "prod_kg", headerName: "Prod kg", type: "number", width: 100, valueFormatter: numFmt(1) },
  { field: "std_kg", headerName: "Std kg", type: "number", width: 100, valueFormatter: numFmt(1) },
  { field: "eff_pct", headerName: "Eff %", type: "number", width: 90, valueFormatter: numFmt(2) },
  {
    field: "kg_per_hr",
    headerName: "kg/hr",
    type: "number",
    width: 85,
    valueGetter: (_v, row) => kgPerHr(row.prod_kg, row.hours),
    valueFormatter: numFmt(2),
  },
  { field: "hours", headerName: "Hours", type: "number", width: 80, valueFormatter: (v: number | null) => fmtHours(v) },
];

const sameMachineRowColumns: GridColDef<WithId<SameMachineRow>>[] = [
  { field: "tran_date", headerName: "Date", width: 105, valueFormatter: (v: string) => fmtDate(v) },
  { field: "machine", headerName: "Machine", width: 120 },
  { field: "person_spells", headerName: "Worker's spells", width: 120 },
  { field: "person_eff", headerName: "Worker eff %", type: "number", width: 110, valueFormatter: numFmt(2) },
  { field: "person_prod_kg", headerName: "Worker kg", type: "number", width: 100, valueFormatter: numFmt(1) },
  { field: "other_shift", headerName: "Other shift", width: 95 },
  { field: "other_spell_code", headerName: "Other spell", width: 95 },
  { field: "other_eb_no", headerName: "Other EB No", width: 105 },
  { field: "other_name", headerName: "Other worker", flex: 1, minWidth: 160 },
  { field: "quality", headerName: "Count / Quality", width: 150 },
  { field: "other_eff", headerName: "Other eff %", type: "number", width: 105, valueFormatter: numFmt(2) },
  { field: "other_prod_kg", headerName: "Other kg", type: "number", width: 95, valueFormatter: numFmt(1) },
  {
    field: "other_hours",
    headerName: "Other hours",
    type: "number",
    width: 100,
    valueFormatter: (v: number | null) => fmtHours(v),
  },
  {
    field: "other_kg_per_hr",
    headerName: "Other kg/hr",
    type: "number",
    width: 105,
    valueGetter: (_v, row) => kgPerHr(row.other_prod_kg, row.other_hours),
    valueFormatter: numFmt(2),
  },
];

function DiffCell({ value }: { value: number | null }) {
  return (
    <Box component="span" sx={{ color: diffColor(value), fontWeight: value == null ? undefined : 600 }}>
      {fmtDiff(value)}
    </Box>
  );
}

const sameMachineSummaryColumns: SimpleColumn<SameMachineSummary>[] = [
  { key: "machine", label: "Machine", render: (r) => r.machine ?? `#${r.machine_id}` },
  { key: "person_days", label: "Worker days", align: "right", render: (r) => r.person_days },
  { key: "person_avg_eff", label: "Worker avg eff %", align: "right", render: (r) => fmtNum(r.person_avg_eff) },
  { key: "others_avg_eff", label: "Others avg eff %", align: "right", render: (r) => fmtNum(r.others_avg_eff) },
  { key: "diff", label: "Eff diff", align: "right", render: (r) => <DiffCell value={r.diff} /> },
  { key: "person_kg_per_hr", label: "Worker kg/hr", align: "right", render: (r) => fmtNum(r.person_kg_per_hr) },
  { key: "others_kg_per_hr", label: "Others kg/hr", align: "right", render: (r) => fmtNum(r.others_kg_per_hr) },
  {
    key: "kg_diff",
    label: "kg/hr diff",
    align: "right",
    render: (r) => <DiffCell value={numDiff(r.person_kg_per_hr, r.others_kg_per_hr)} />,
  },
  { key: "others_rows", label: "Others' spells", align: "right", render: (r) => r.others_rows },
];

const sameQualityColumns: SimpleColumn<SameQualityRow>[] = [
  { key: "quality", label: "Count / Quality", minWidth: 140, render: (r) => r.quality ?? "—" },
  { key: "person_days", label: "Worker days", align: "right", render: (r) => r.person_days },
  { key: "person_avg_eff", label: "Worker avg eff %", align: "right", render: (r) => fmtNum(r.person_avg_eff) },
  { key: "others_avg_eff", label: "Others avg eff %", align: "right", render: (r) => fmtNum(r.others_avg_eff) },
  { key: "dept_avg_eff", label: "Dept avg (same dates)", align: "right", render: (r) => fmtNum(r.dept_avg_eff) },
  {
    key: "range_dept_avg_eff",
    label: "Dept avg (whole window)",
    align: "right",
    render: (r) => fmtNum(r.range_dept_avg_eff),
  },
  { key: "diff", label: "Eff diff", align: "right", render: (r) => <DiffCell value={r.diff} /> },
  { key: "person_kg_per_hr", label: "Worker kg/hr", align: "right", render: (r) => fmtNum(r.person_kg_per_hr) },
  { key: "others_kg_per_hr", label: "Others kg/hr", align: "right", render: (r) => fmtNum(r.others_kg_per_hr) },
  {
    key: "kg_diff",
    label: "kg/hr diff",
    align: "right",
    render: (r) => <DiffCell value={numDiff(r.person_kg_per_hr, r.others_kg_per_hr)} />,
  },
  { key: "others_workers", label: "Other workers", align: "right", render: (r) => r.others_workers },
];

function trendColumns(labels: string[]): SimpleColumn<WithId<TrendWeek>>[] {
  return [
    { key: "week", label: "Week", render: (r) => labels[r.row_id] ?? r.week_no },
    {
      key: "range",
      label: "Dates",
      render: (r) => `${fmtDate(r.week_start)} – ${fmtDate(r.week_end)}`,
    },
    { key: "days_worked", label: "Days", align: "right", render: (r) => r.days_worked },
    { key: "prod_kg", label: "Prod kg", align: "right", render: (r) => fmtNum(r.prod_kg, 1) },
    { key: "avg_eff", label: "Worker eff %", align: "right", render: (r) => fmtNum(r.avg_eff) },
    { key: "peer_avg_eff", label: "Others eff %", align: "right", render: (r) => fmtNum(r.peer_avg_eff) },
    {
      key: "diff",
      label: "Eff diff",
      align: "right",
      render: (r) => <DiffCell value={numDiff(r.avg_eff, r.peer_avg_eff)} />,
    },
    { key: "kg_per_hr", label: "Worker kg/hr", align: "right", render: (r) => fmtNum(r.kg_per_hr) },
    { key: "peer_kg_per_hr", label: "Others kg/hr", align: "right", render: (r) => fmtNum(r.peer_kg_per_hr) },
    {
      key: "kg_diff",
      label: "kg/hr diff",
      align: "right",
      render: (r) => <DiffCell value={numDiff(r.kg_per_hr, r.peer_kg_per_hr)} />,
    },
  ];
}

function withIds<T>(rows: ReadonlyArray<T>): WithId<T>[] {
  return rows.map((r, i) => ({ ...r, row_id: i }));
}

function SubHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <Box sx={{ mt: 3, mb: 1 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      {hint ? (
        <Typography variant="caption" color="text.secondary">
          {hint}
        </Typography>
      ) : null}
    </Box>
  );
}

/**
 * What the person worked on (machine, count / quality per day + spell) and how
 * they compare: (a) the same machines in other shifts, (b) the same count /
 * quality across the department, (c) their own week-by-week trend since marked.
 */
export default function PerformanceSection({ data, loading, error, today, onLoad }: PerformanceSectionProps) {
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<{ from?: string; to?: string }>({});

  const personRows = React.useMemo(() => withIds(data?.person_rows ?? []), [data]);
  const sameMachineRows = React.useMemo(() => withIds(data?.same_machine.rows ?? []), [data]);
  const trendRows = React.useMemo(() => withIds(data?.weekly_trend ?? []), [data]);
  const labels = React.useMemo(() => weekLabels(data?.weekly_trend ?? []), [data]);
  const trendCols = React.useMemo(() => trendColumns(labels), [labels]);

  const submit = () => {
    const parsed = perfWindowSchema.safeParse({ from, to });
    if (!parsed.success) {
      const next: { from?: string; to?: string } = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if ((key === "from" || key === "to") && !next[key]) next[key] = issue.message;
      }
      setFieldErrors(next);
      return;
    }
    setFieldErrors({});
    onLoad(from.trim(), to.trim());
  };

  const s = data?.person_summary;
  const shownDays = data ? windowDays(data.date_from, data.date_to) : null;

  return (
    <Paper elevation={1} sx={{ p: { xs: 1.5, md: 2 }, mb: 2 }}>
      <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5 }}>
        Performance
      </Typography>

      <Box
        component="form"
        onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          submit();
        }}
        noValidate
        sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "flex-start" }}
      >
        <TextField
          type="date"
          label="From"
          size="small"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          error={Boolean(fieldErrors.from)}
          helperText={fieldErrors.from}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today } }}
          sx={{ width: { xs: "100%", sm: 170 } }}
        />
        <TextField
          type="date"
          label="To"
          size="small"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          error={Boolean(fieldErrors.to)}
          helperText={fieldErrors.to}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today } }}
          sx={{ width: { xs: "100%", sm: 170 } }}
        />
        <Button
          type="submit"
          variant="contained"
          disabled={loading}
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}
          sx={{ minHeight: 40 }}
        >
          Load
        </Button>
        <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center", flexBasis: { xs: "100%", md: "auto" } }}>
          Leave both dates blank for the default window: from the start date up to yesterday (or the close
          date){data ? `, at most ${data.default_days} days; From / To can cover up to ${data.max_days} days` : ""}.
        </Typography>
      </Box>

      {error ? (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      ) : null}

      {loading && !data ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress />
        </Box>
      ) : null}

      {data ? (
        <Box sx={{ mt: 2, opacity: loading ? 0.6 : 1 }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Showing <strong>{fmtDate(data.date_from)}</strong> to <strong>{fmtDate(data.date_to)}</strong>
            {shownDays != null ? ` (${shownDays} day${shownDays === 1 ? "" : "s"})` : null}
            {data.clipped ? ` — the default window, shortened to whole weeks of the follow-up` : null}
          </Typography>
          {/* When clipped, the first note (from the server) explains the default window and its limits. */}
          {data.notes.length ? (
            <Alert severity="info" sx={{ mb: 1.5 }}>
              {data.notes.length === 1 ? (
                data.notes[0]
              ) : (
                <Box component="ul" sx={{ m: 0, pl: 2 }}>
                  {data.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </Box>
              )}
            </Alert>
          ) : null}

          {s ? (
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 1 }}>
              <Chip label={`Days worked: ${s.days_worked}`} />
              <Chip label={`Spells: ${s.rows}`} variant="outlined" />
              <Chip label={`Production: ${fmtNum(s.prod_kg, 1)} kg`} />
              {s.std_kg ? <Chip label={`Standard: ${fmtNum(s.std_kg, 1)} kg`} variant="outlined" /> : null}
              <Chip color="secondary" label={`Avg eff: ${s.avg_eff != null ? `${fmtNum(s.avg_eff)} %` : "—"}`} />
              <Chip
                color="secondary"
                variant="outlined"
                label={`kg/hr: ${s.kg_per_hr != null ? fmtNum(s.kg_per_hr) : "—"}`}
              />
            </Stack>
          ) : null}

          <SubHeading title="Machine and count, day by day" />
          <ReportGrid
            rows={personRows}
            columns={personColumns}
            getRowId={(r) => r.row_id}
            loading={false}
            error={null}
            height={420}
            sortField="tran_date"
          />

          <SubHeading
            title="Same machine, other shifts"
            hint="The worker's average on each machine against everyone else who ran it in the other spells of the same days."
          />
          <SimpleTable
            rows={data.same_machine.summary}
            columns={sameMachineSummaryColumns}
            getKey={(r) => r.machine_id}
            emptyText="No other worker ran these machines on those days."
          />
          {sameMachineRows.length ? (
            <Accordion disableGutters sx={{ mt: 1 }} slotProps={{ transition: { unmountOnExit: true } }}>
              <AccordionSummary expandIcon={<ChevronDown size={18} />}>
                <Typography variant="body2">Day by day — who else ran them ({sameMachineRows.length})</Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ p: { xs: 0.5, md: 1 } }}>
                <ReportGrid
                  rows={sameMachineRows}
                  columns={sameMachineRowColumns}
                  getRowId={(r) => r.row_id}
                  loading={false}
                  error={null}
                  height={420}
                  sortField="tran_date"
                />
              </AccordionDetails>
            </Accordion>
          ) : null}

          <SubHeading
            title="Same count / quality in the department"
            hint="On the dates the worker ran each count / quality: the worker, the others, and the whole department."
          />
          <SimpleTable
            rows={data.same_quality}
            columns={sameQualityColumns}
            getKey={(r, i) => r.quality_id ?? `q${i}`}
            emptyText="No count / quality to compare."
          />

          <SubHeading
            title="Trend since marked"
            hint="Weekly averages from the start date (weeks before it read 'Before'). The chart shows efficiency, or kg/hr when the counts have no standard."
          />
          {data.weekly_trend.length ? (
            <>
              <Box sx={{ width: "100%", minWidth: 0 }}>
                <TrendChart weeks={data.weekly_trend} />
              </Box>
              <SimpleTable
                rows={trendRows}
                columns={trendCols}
                getKey={(r) => r.week_no}
                emptyText="No weeks to show."
              />
            </>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No weeks to show yet.
            </Typography>
          )}
        </Box>
      ) : null}
    </Paper>
  );
}
