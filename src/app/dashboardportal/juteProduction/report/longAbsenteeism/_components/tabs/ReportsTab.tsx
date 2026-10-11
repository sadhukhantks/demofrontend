"use client";

/**
 * Reports tab (view access; designed phone-first — the owner reads it on a
 * phone). Three sections stacked:
 *   1. Stage summary — a totals card, then one small card per department with
 *      a bar per stage (live cases), then the exits of the last 90 days;
 *   2. Struck-off register — date range + department, cards on a phone (with
 *      a "Show as table" switch) / grid on a desktop, Excel export;
 *   3. Monthly trend — opened / struck off / rejoined / other exits over 12
 *      months as a line chart, with the numbers in a table under it.
 *
 * Backend: GET /report/stage_summary, /report/struck_off_register,
 * /report/monthly_trend (long_absenteeism_letters.py).
 */

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControlLabel,
  LinearProgress,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { LineChart } from "@mui/x-charts/LineChart";
import { FileSpreadsheet, RefreshCw } from "lucide-react";
import { fmtDate, localTodayISO } from "@/components/lowPerformerFollowup/schemas";
import { CardStat, MobileCard } from "@/components/ui/responsiveEntry";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import {
  fetchLaMonthlyTrend,
  fetchLaStageSummary,
  fetchLaStruckOffRegister,
  type LaRegisterRow,
  type LaSetup,
  type LaStageSummary,
  type LaStageSummaryDept,
  type LaTrendRow,
} from "@/utils/longAbsenteeismService";
import { REGISTER_REPORT_NAME, exportRegisterToExcel } from "../../_export";
import { useExportHeader, type ExportHeaderContext } from "../../_hooks/useExportHeader";
import { useIsMobile } from "../../_hooks/useIsMobile";
import { fieldErrors, makeRangeSchema, type RangeFormValues } from "../../_tabsSchemas";
import {
  TREND_SERIES,
  monthLabel,
  stageBars,
  stageSummaryTotals,
  trendTotals,
  type StageBar,
  type TrendKey,
} from "../../_tabsUtils";
import { addDays, letterCell, type ChipColor } from "../../_utils";
import SimpleTable, { type SimpleColumn } from "../SimpleTable";
import type { LaTabProps } from "./types";

/** Default register range: the last 365 days. */
const REGISTER_DEFAULT_DAYS = 365;
const TREND_MONTHS = 12;
const RANGE_SCHEMA = makeRangeSchema();

/** Loads one section; `reload` re-runs it. Stale answers are dropped. */
function useSection<T>(fetcher: (() => Promise<T>) | null) {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const seq = React.useRef(0);

  const reload = React.useCallback(async () => {
    if (!fetcher) return;
    const mine = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const out = await fetcher();
      if (mine === seq.current) setData(out);
    } catch (err: unknown) {
      if (mine === seq.current) setError(err instanceof Error ? err.message : "Could not load the report");
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [fetcher]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, reload };
}

function SectionHead({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={1}
      justifyContent="space-between"
      alignItems={{ xs: "stretch", sm: "flex-start" }}
      sx={{ mb: 1.5 }}
    >
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
          {title}
        </Typography>
        {hint ? (
          <Typography variant="caption" color="text.secondary">
            {hint}
          </Typography>
        ) : null}
      </Box>
      {action}
    </Stack>
  );
}

// ─── 1. Stage summary ────────────────────────────────────────────────

type ProgressColor = "primary" | "secondary" | "error" | "info" | "success" | "warning" | "inherit";

function progressColor(c: ChipColor): ProgressColor {
  return c === "default" ? "inherit" : c;
}

function StageBarRow({ bar }: { bar: StageBar }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 7.5rem) minmax(0, 1fr) 2.25rem",
        alignItems: "center",
        gap: 1,
        minHeight: 24,
      }}
    >
      <Typography variant="caption" noWrap title={bar.label} sx={{ color: "text.secondary" }}>
        {bar.label}
      </Typography>
      <LinearProgress
        variant="determinate"
        value={bar.pct}
        color={progressColor(bar.color)}
        aria-label={`${bar.label}: ${bar.count}`}
        sx={{ height: 8, borderRadius: 4, color: bar.color === "default" ? "text.disabled" : undefined }}
      />
      <Typography variant="body2" sx={{ fontWeight: 700, textAlign: "right" }}>
        {bar.count}
      </Typography>
    </Box>
  );
}

function StageCard({
  dept,
  setup,
  wholeLadder = false,
}: {
  dept: LaStageSummaryDept;
  setup: LaSetup | null;
  /** The totals card shows every live stage, zeros included. */
  wholeLadder?: boolean;
}) {
  const bars = stageBars(dept.counts, dept.total_live, setup, wholeLadder);
  return (
    <Paper
      variant="outlined"
      data-testid="stage-card"
      sx={{ p: 1.5, borderColor: wholeLadder ? "primary.main" : "divider", height: "100%" }}
    >
      <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="baseline" sx={{ mb: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, minWidth: 0, wordBreak: "break-word" }}>
          {dept.dept_desc}
        </Typography>
        <Typography variant="body2" sx={{ whiteSpace: "nowrap" }}>
          <strong>{dept.total_live}</strong> live
          {dept.parked ? ` · ${dept.parked} parked` : ""}
        </Typography>
      </Stack>
      {bars.length ? (
        <Stack spacing={0.5}>
          {bars.map((b) => (
            <StageBarRow key={b.code} bar={b} />
          ))}
        </Stack>
      ) : (
        <Typography variant="caption" color="text.secondary">
          No live cases.
        </Typography>
      )}
    </Paper>
  );
}

function StageSummarySection({ coId, branchId, setup }: { coId: number; branchId: number; setup: LaSetup | null }) {
  const fetcher = React.useCallback(() => fetchLaStageSummary({ coId, branchId }), [coId, branchId]);
  const { data, loading, error, reload } = useSection<LaStageSummary>(fetcher);
  const totals = data ? stageSummaryTotals(data) : null;

  return (
    <Paper elevation={1} sx={{ p: { xs: 1.5, md: 2 } }}>
      <SectionHead
        title="Stage summary"
        hint={data?.as_on ? `Live cases as on ${fmtDate(data.as_on)}, per department` : "Live cases per department"}
        action={
          <Button
            size="small"
            variant="outlined"
            startIcon={loading ? <CircularProgress size={14} color="inherit" /> : <RefreshCw size={14} />}
            onClick={() => void reload()}
            disabled={loading}
            sx={{ minHeight: 36, alignSelf: { xs: "flex-start", sm: "auto" } }}
          >
            Refresh
          </Button>
        }
      />
      {error ? (
        <Alert severity="error" sx={{ mb: 1.5 }}>
          {error}
        </Alert>
      ) : null}
      {!data && loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
          <CircularProgress size={28} />
        </Box>
      ) : null}
      {data && totals ? (
        <>
          <Box
            sx={{
              display: "grid",
              gap: 1.5,
              gridTemplateColumns: {
                xs: "minmax(0, 1fr)",
                sm: "repeat(2, minmax(0, 1fr))",
                lg: "repeat(3, minmax(0, 1fr))",
              },
            }}
          >
            <StageCard dept={totals} setup={setup} wholeLadder />
            {data.by_dept.map((d, i) => (
              <StageCard key={`${d.dept_desc}-${i}`} dept={d} setup={setup} />
            ))}
          </Box>
          {data.by_dept.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              No live cases in this branch.
            </Typography>
          ) : null}

          <Typography variant="subtitle2" sx={{ fontWeight: 700, mt: 2, mb: 1 }}>
            Closed in the last 90 days
          </Typography>
          {data.exits.length ? (
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              {data.exits.map((e) => (
                <Chip
                  key={e.exit_reason}
                  variant="outlined"
                  color={e.exit_reason === "STRUCK_OFF" ? "secondary" : e.exit_reason === "REJOINED" ? "success" : "default"}
                  label={`${e.label}: ${e.count}`}
                />
              ))}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No case closed in the last 90 days.
            </Typography>
          )}
        </>
      ) : null}
    </Paper>
  );
}

// ─── 2. Struck-off register ──────────────────────────────────────────

function RegisterCards({ rows }: { rows: LaRegisterRow[] }) {
  return (
    <Stack spacing={1.25}>
      {rows.map((r, i) => (
        <MobileCard
          key={r.case_id ?? `r${i}`}
          header={
            <Box sx={{ flex: "1 1 auto", minWidth: 0 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, wordBreak: "break-word" }}>
                {r.emp_name || "(no name)"}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                EB {r.emp_code ?? "—"}
                {r.dept_desc ? ` · ${r.dept_desc}` : ""}
                {r.designation ? ` · ${r.designation}` : ""}
              </Typography>
            </Box>
          }
        >
          <CardStat label="Struck off" value={fmtDate(r.struck_off_date) || "—"} />
          <CardStat label="Last working" value={fmtDate(r.last_working_date) || "—"} align="right" />
          <CardStat label="1st letter" value={letterCell(r.warning1_date, r.warning1_sent) || "—"} />
          <CardStat label="2nd letter" value={letterCell(r.warning2_date, r.warning2_sent) || "—"} align="right" />
          <CardStat label="3rd letter" value={letterCell(r.warning3_date, r.warning3_sent) || "—"} />
          <CardStat label="Show cause" value={fmtDate(r.show_cause_date) || "—"} align="right" />
          <CardStat label="Gate notice" value={fmtDate(r.gate_notice_date) || "—"} />
          <CardStat label="Case" value={r.case_no ?? "—"} align="right" />
          {r.remarks ? (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ gridColumn: "1 / -1", whiteSpace: "pre-wrap", wordBreak: "break-word" }}
            >
              {r.remarks}
            </Typography>
          ) : null}
        </MobileCard>
      ))}
    </Stack>
  );
}

const dateCol = (field: keyof LaRegisterRow, headerName: string, width = 105): GridColDef<LaRegisterRow> => ({
  field,
  headerName,
  width,
  valueFormatter: (v: string | null) => fmtDate(v),
});

const REGISTER_COLUMNS: GridColDef<LaRegisterRow>[] = [
  { field: "case_no", headerName: "Case", width: 130 },
  { field: "emp_code", headerName: "EB No", width: 85 },
  { field: "emp_name", headerName: "Name", flex: 1, minWidth: 160 },
  { field: "dept_desc", headerName: "Dept", width: 120 },
  { field: "designation", headerName: "Designation", width: 130 },
  dateCol("last_working_date", "Last working", 110),
  dateCol("warning1_date", "1st letter"),
  dateCol("warning1_sent", "1st sent"),
  dateCol("warning2_date", "2nd letter"),
  dateCol("warning2_sent", "2nd sent"),
  dateCol("warning3_date", "3rd letter"),
  dateCol("warning3_sent", "3rd sent"),
  dateCol("show_cause_date", "Show cause"),
  dateCol("gate_notice_date", "Gate notice"),
  dateCol("struck_off_date", "Struck off"),
  { field: "remarks", headerName: "Remarks", width: 220 },
];

function StruckOffRegisterSection({
  coId,
  branchId,
  setup,
  today,
  isMobile,
  exportHeader,
  onNotify,
}: {
  coId: number;
  branchId: number;
  setup: LaSetup | null;
  today: string;
  isMobile: boolean;
  exportHeader: ExportHeaderContext;
  onNotify: LaTabProps["onNotify"];
}) {
  const [range, setRange] = React.useState<RangeFormValues>(() => ({
    date_from: addDays(today, -REGISTER_DEFAULT_DAYS),
    date_to: today,
  }));
  const [applied, setApplied] = React.useState<RangeFormValues>(range);
  const [deptId, setDeptId] = React.useState<number | null>(null);
  const [errors, setErrors] = React.useState<Partial<Record<keyof RangeFormValues, string>>>({});
  const [asTable, setAsTable] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);

  const fetcher = React.useCallback(
    () =>
      fetchLaStruckOffRegister({
        coId,
        branchId,
        dateFrom: applied.date_from,
        dateTo: applied.date_to,
        deptId,
      }),
    [coId, branchId, applied, deptId],
  );
  const { data, loading, error } = useSection<LaRegisterRow[]>(fetcher);
  const rows = data ?? [];

  const deptOptions = React.useMemo(
    () => [
      { value: 0, label: "All departments" },
      ...(setup?.depts ?? []).map((d) => ({ value: d.dept_id, label: d.dept_desc })),
    ],
    [setup],
  );

  const apply = () => {
    const result = RANGE_SCHEMA.safeParse(range);
    setErrors(fieldErrors<keyof RangeFormValues>(result));
    if (result.success) setApplied({ ...range });
  };

  const period = `${fmtDate(applied.date_from)} To ${fmtDate(applied.date_to)}`;

  const exportExcel = async () => {
    setExporting(true);
    try {
      await exportRegisterToExcel(rows, await exportHeader.build(REGISTER_REPORT_NAME, period));
    } catch (err: unknown) {
      onNotify(err instanceof Error ? err.message : "Could not write the Excel file", "error");
    } finally {
      setExporting(false);
    }
  };

  const grid = (
    <Box sx={{ width: "100%", overflowX: "auto" }}>
      <DataGrid
        autoHeight
        rows={rows}
        columns={REGISTER_COLUMNS}
        getRowId={(r) => r.case_id ?? `${r.case_no}-${r.emp_code}`}
        loading={loading}
        density="compact"
        disableRowSelectionOnClick
        pageSizeOptions={[25, 50, 100]}
        initialState={{ pagination: { paginationModel: { pageSize: 25, page: 0 } } }}
        localeText={{ noRowsLabel: "No name struck off in this range." }}
        sx={{ minWidth: 1100 }}
      />
    </Box>
  );

  return (
    <Paper elevation={1} sx={{ p: { xs: 1.5, md: 2 } }}>
      <SectionHead title="Struck-off register" hint={`Names struck off the muster roll, ${period}`} />
      <Box
        component="form"
        noValidate
        onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          apply();
        }}
        sx={{
          display: "grid",
          gap: 1.5,
          alignItems: "start",
          mb: 1.5,
          gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "160px 160px 240px 1fr" },
        }}
      >
        <TextField
          type="date"
          size="small"
          label="Struck off from"
          value={range.date_from}
          onChange={(e) => setRange((p) => ({ ...p, date_from: e.target.value }))}
          error={Boolean(errors.date_from)}
          helperText={errors.date_from}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: range.date_to || today } }}
          fullWidth
        />
        <TextField
          type="date"
          size="small"
          label="Struck off to"
          value={range.date_to}
          onChange={(e) => setRange((p) => ({ ...p, date_to: e.target.value }))}
          error={Boolean(errors.date_to)}
          helperText={errors.date_to}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: range.date_from || undefined } }}
          fullWidth
        />
        <Box sx={{ gridColumn: { xs: "1 / -1", md: "auto" } }}>
          <SearchableOptionSelect<number>
            label="Department"
            options={deptOptions}
            value={deptId ?? 0}
            onChange={(v) => setDeptId(v === "" || v === 0 ? null : v)}
            clearable={false}
            fullWidth
          />
        </Box>
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          flexWrap="wrap"
          justifyContent={{ md: "flex-end" }}
          sx={{ gridColumn: { xs: "1 / -1", md: "auto" } }}
        >
          <Button
            type="submit"
            variant="outlined"
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <RefreshCw size={16} />}
            disabled={loading}
            sx={{ minHeight: 40 }}
          >
            Refresh
          </Button>
          <Button
            variant="outlined"
            startIcon={exporting ? <CircularProgress size={16} color="inherit" /> : <FileSpreadsheet size={16} />}
            onClick={() => void exportExcel()}
            disabled={rows.length === 0 || exporting}
            sx={{ minHeight: 40 }}
          >
            Export
          </Button>
        </Stack>
      </Box>

      {error ? (
        <Alert severity="error" sx={{ mb: 1.5 }}>
          {error}
        </Alert>
      ) : null}

      {isMobile ? (
        <>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {loading && !data ? "Loading…" : `${rows.length} name${rows.length === 1 ? "" : "s"}`}
            </Typography>
            <FormControlLabel
              control={<Switch size="small" checked={asTable} onChange={(e) => setAsTable(e.target.checked)} />}
              label="Show as table"
              sx={{ mr: 0 }}
            />
          </Stack>
          {asTable ? (
            grid
          ) : rows.length ? (
            <RegisterCards rows={rows} />
          ) : loading ? null : (
            <Typography variant="body2" color="text.secondary">
              No name struck off in this range.
            </Typography>
          )}
        </>
      ) : (
        grid
      )}
    </Paper>
  );
}

// ─── 3. Monthly trend ────────────────────────────────────────────────

interface TrendTableRow {
  key: string;
  month: string;
  values: Record<TrendKey, number>;
  total: boolean;
}

function MonthlyTrendSection({ coId, branchId, isMobile }: { coId: number; branchId: number; isMobile: boolean }) {
  const theme = useTheme();
  const fetcher = React.useCallback(
    () => fetchLaMonthlyTrend({ coId, branchId, months: TREND_MONTHS }),
    [coId, branchId],
  );
  const { data, loading, error } = useSection<LaTrendRow[]>(fetcher);
  const rows = React.useMemo(() => data ?? [], [data]);

  const colors: Record<TrendKey, string> = {
    opened: theme.palette.info.main,
    struck_off: theme.palette.error.main,
    rejoined: theme.palette.success.main,
    other_exits: theme.palette.warning.main,
  };

  const tableRows: TrendTableRow[] = React.useMemo(() => {
    const out: TrendTableRow[] = rows.map((r) => ({
      key: r.month,
      month: monthLabel(r.month, true),
      values: { opened: r.opened, struck_off: r.struck_off, rejoined: r.rejoined, other_exits: r.other_exits },
      total: false,
    }));
    if (rows.length) out.push({ key: "total", month: "Total", values: trendTotals(rows), total: true });
    return out;
  }, [rows]);

  const columns: SimpleColumn<TrendTableRow>[] = [
    {
      key: "month",
      label: "Month",
      render: (r) => (r.total ? <strong>{r.month}</strong> : r.month),
    },
    ...TREND_SERIES.map<SimpleColumn<TrendTableRow>>((s) => ({
      key: s.key,
      label: s.label,
      align: "right",
      render: (r) => (r.total ? <strong>{r.values[s.key]}</strong> : r.values[s.key]),
    })),
  ];

  return (
    <Paper elevation={1} sx={{ p: { xs: 1.5, md: 2 } }}>
      <SectionHead title="Monthly trend" hint={`Cases opened and closed per month, last ${TREND_MONTHS} months`} />
      {error ? (
        <Alert severity="error" sx={{ mb: 1.5 }}>
          {error}
        </Alert>
      ) : null}
      {!data && loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
          <CircularProgress size={28} />
        </Box>
      ) : null}
      {rows.length ? (
        <>
          <Box sx={{ width: "100%", minWidth: 0 }} data-testid="trend-chart">
            <LineChart
              height={isMobile ? 240 : 300}
              xAxis={[
                {
                  scaleType: "point",
                  data: rows.map((r) => r.month),
                  valueFormatter: (v: string, ctx: { location: string }) =>
                    monthLabel(v, ctx.location !== "tick"),
                  tickLabelStyle: { fontSize: 11 },
                  tickLabelMinGap: 6,
                },
              ]}
              yAxis={[{ width: 32, tickLabelStyle: { fontSize: 11 }, min: 0, tickMinStep: 1 }]}
              series={TREND_SERIES.map((s) => ({
                id: s.key,
                label: s.label,
                color: colors[s.key],
                data: rows.map((r) => r[s.key]),
                curve: "linear" as const,
                showMark: !isMobile,
              }))}
              grid={{ horizontal: true }}
              margin={{ left: 0, right: 8, top: 8, bottom: 0 }}
              slotProps={{
                legend: {
                  direction: "horizontal",
                  position: { vertical: "bottom", horizontal: "center" },
                },
              }}
            />
          </Box>
          <Box sx={{ mt: 1.5 }}>
            <SimpleTable rows={tableRows} columns={columns} getKey={(r) => r.key} emptyText="No data." />
          </Box>
        </>
      ) : data && !loading ? (
        <Typography variant="body2" color="text.secondary">
          No data.
        </Typography>
      ) : null}
    </Paper>
  );
}

// ─── Tab ─────────────────────────────────────────────────────────────

export default function ReportsTab({ coId, branchId, branches, setup, onNotify }: LaTabProps) {
  const isMobile = useIsMobile();
  const [localToday] = React.useState(() => localTodayISO());
  const today = setup?.today ?? localToday;
  const exportHeader = useExportHeader(branchId, branches);

  if (branchId == null) {
    return <Alert severity="info">Select a branch to see its reports.</Alert>;
  }

  return (
    <Stack spacing={2}>
      <StageSummarySection coId={coId} branchId={branchId} setup={setup} />
      <StruckOffRegisterSection
        coId={coId}
        branchId={branchId}
        setup={setup}
        today={today}
        isMobile={isMobile}
        exportHeader={exportHeader}
        onNotify={onNotify}
      />
      <MonthlyTrendSection coId={coId} branchId={branchId} isMobile={isMobile} />
    </Stack>
  );
}
