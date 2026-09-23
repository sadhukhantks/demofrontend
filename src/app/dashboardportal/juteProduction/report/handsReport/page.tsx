"use client";

/**
 * Hands Report — actual manning against the norms, per designation.
 *
 * Port of the legacy MIS "Daily Hands Comparison". The four views (Detailed /
 * By Date / By Occupation / By Department) are grains of the same detail grid
 * and are rolled up server-side, so switching the view refetches rather than
 * regrouping here: two code paths computing the same totals is exactly how the
 * legacy sheets ended up disagreeing with each other.
 *
 * The shift-wise columns are a client-side toggle only — the endpoint always
 * returns them, and hiding them is a reading preference, not a different query.
 *
 * MTD Actual / Target / Excess / Short (TKT-000154) come from the endpoint too:
 * month-to-date as at the To Date on the rollup views, a running figure up to
 * each row's date on Detailed and By Date.
 *
 * "Machines Run" is the fifth view: the machine-wise sheet behind the variable
 * targets. One row per date x shift x machine from every machine-keyed entry
 * (deduplicated server-side), a per-type summary block above it, and a
 * "Counted" flag that is No when the only evidence is a stoppage / breakdown.
 */

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  FormControlLabel,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { usePathname } from "next/navigation";
import { GridColDef } from "@mui/x-data-grid";
import ReportGrid, { fmtNum, numCol } from "@/components/reports/ReportGrid";
import { useReportBranches } from "@/components/reports/useReportBranches";
import { useMounted } from "@/components/reports/useMounted";
import { currentMonthRange } from "@/components/reports/reportDates";
import { exportRowsToExcel, type ReportExportHeader } from "@/components/reports/exportExcel";
import { resolveReportMenuId } from "@/utils/reportMenuService";
import type { BranchOption } from "@/components/reports/types";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import {
  fetchHandsReport,
  HANDS_VIEWS,
  isMachineRunRow,
  splitSources,
  type HandsReport,
  type HandsRow,
  type HandsView,
  type MachineRunRow,
  type MachineTypeSummaryRow,
} from "./_service";

const TITLE = "Hands Report";

/** Short hours above this are called out in red. Zero means any shortfall at
 * all is flagged; raise it if rounding noise starts crying wolf. The sibling
 * low-producer reports flag efficiency under 75% — a manning report has no
 * efficiency, so the shortfall is what gets the same treatment. */
const SHORT_RED_ABOVE = 0;

const DIRECT_INDIRECT = [
  { value: "D", label: "Direct" },
  { value: "I", label: "Indirect" },
];

/** Row plus a grid key — the endpoint returns no row id, and the natural key
 * differs per view (date / designation / dept / machine-shift), with the GRAND
 * TOTAL line having none at all. */
type Row = (HandsRow | MachineRunRow) & { row_id: number };
type SummaryRow = MachineTypeSummaryRow & { row_id: number };

/** Stoppage / breakdown entries are negative evidence — a machine seen only
 * there is listed so the sheet is complete, and tinted so nobody reads it as a
 * running machine. */
const STOP_SOURCES = new Set(["Stoppage", "Breakdown"]);

/** Hours short of the norm, called out in red. Never fired on a null target
 * (norm unresolved) — a blank cell there is the honest answer. */
function shortCol(field: "short" | "mtd_short" = "short", header = "Short"): GridColDef<Row> {
  return {
    ...numCol<Row>(field, header, 100),
    renderCell: (params) => {
      const n = Number(params.value);
      if (params.value == null || !Number.isFinite(n)) return "";
      return (
        <Box
          component="span"
          sx={n > SHORT_RED_ABOVE ? { color: "error.main", fontWeight: 600 } : undefined}
        >
          {fmtNum(n)}
        </Box>
      );
    },
  };
}

const shiftCols: GridColDef<Row>[] = [
  numCol("shift_a", "Shift A", 95),
  numCol("shift_b", "Shift B", 95),
  numCol("shift_c", "Shift C", 95),
  numCol("shift_g", "Shift G", 95),
  numCol("target_a", "Target A", 100),
  numCol("target_b", "Target B", 100),
  numCol("target_c", "Target C", 100),
  numCol("target_g", "Target G", 100),
];

const totalCols: GridColDef<Row>[] = [
  numCol("total_actual", "Total Actual", 120),
  numCol("total_target", "Total Target", 120),
  numCol("excess", "Excess", 100),
  shortCol(),
];

/** Month-to-date block, after the day/window totals on every manning view. */
const mtdCols: GridColDef<Row>[] = [
  numCol("mtd_actual", "MTD Actual", 110),
  numCol("mtd_target", "MTD Target", 110),
  numCol("mtd_excess", "MTD Excess", 110),
  shortCol("mtd_short", "MTD Short"),
];

const dateCol: GridColDef<Row> = { field: "date", headerName: "Date", width: 110 };

/** Machines Run columns. `sources` stays a plain string on the row (export
 * and column sizing read it); the chips are only how it is drawn. */
const machineCols: GridColDef<Row>[] = [
  { field: "shift", headerName: "Shift", width: 70 },
  { field: "dept", headerName: "Department", flex: 1, minWidth: 150 },
  { field: "machine_type", headerName: "Machine Type", width: 130 },
  { field: "machine", headerName: "Machine", flex: 1, minWidth: 170 },
  {
    field: "sources",
    headerName: "Seen In",
    flex: 1.2,
    minWidth: 220,
    renderCell: (params) => (
      <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ py: 0.5 }}>
        {splitSources(String(params.value ?? "")).map((src) => (
          <Chip
            key={src}
            label={src}
            size="small"
            variant="outlined"
            color={STOP_SOURCES.has(src) ? "warning" : "default"}
          />
        ))}
      </Stack>
    ),
  },
  numCol("hands", "Hands on M/C", 115, 0),
  numCol("stoppage_hours", "Stoppage Hrs", 115),
  numCol("breakdown_min", "Breakdown Min", 125, 0),
  {
    field: "counted",
    headerName: "Counted",
    width: 90,
    valueFormatter: (v) => (v === true ? "Yes" : v === false ? "No" : ""),
  },
];

const summaryCols: GridColDef<SummaryRow>[] = [
  { field: "date", headerName: "Date", width: 110 },
  { field: "machine_type", headerName: "Machine Type", flex: 1, minWidth: 160 },
  numCol("run_a", "Shift A", 90, 0),
  numCol("run_b", "Shift B", 90, 0),
  numCol("run_c", "Shift C", 90, 0),
  numCol("run_g", "Shift G", 90, 0),
  numCol("machine_shifts", "Machine-Shifts", 130, 0),
  numCol("machines", "Machines (day)", 130, 0),
];
const deptCol: GridColDef<Row> = {
  field: "dept",
  headerName: "Department",
  flex: 1,
  minWidth: 160,
};
/** "Occupation" is what the shed calls it; designation is the master's name. */
const desigCols: GridColDef<Row>[] = [
  { field: "designation", headerName: "Occupation", flex: 1, minWidth: 170 },
  { field: "direct_indirect", headerName: "D/I", width: 70 },
  { field: "variable_fixed", headerName: "V/F", width: 70 },
  { field: "norms_text", headerName: "Norms", flex: 1, minWidth: 140 },
];

/** by_date carries its own direct/indirect split of the day's hands. */
const splitCols: GridColDef<Row>[] = [
  numCol("direct_actual", "Direct Actual", 125),
  numCol("direct_target", "Direct Target", 125),
  numCol("indirect_actual", "Indirect Actual", 130),
  numCol("indirect_target", "Indirect Target", 135),
  numCol("unclassified_actual", "Unclassified Actual", 150),
  numCol("unclassified_target", "Unclassified Target", 155),
];

/** Identity columns differ per view; the numeric block is the same throughout
 * the manning views. Machines Run has its own set. */
function buildColumns(view: HandsView, showShiftDetail: boolean): GridColDef<Row>[] {
  if (view === "machines_run") return [dateCol, ...machineCols];
  const lead: GridColDef<Row>[] =
    view === "detailed"
      ? [dateCol, deptCol, ...desigCols]
      : view === "by_date"
        ? [dateCol]
        : view === "by_occupation"
          ? [deptCol, ...desigCols]
          : [deptCol];
  return [
    ...lead,
    ...(showShiftDetail ? shiftCols : []),
    ...totalCols,
    ...mtdCols,
    ...(view === "by_date" ? splitCols : []),
  ];
}

interface DeptOption {
  dept_id: number;
  dept: string;
}

/** The departments present in the loaded rows — no separate master fetch, and
 * no options for departments nobody in this branch worked in. by_date rows
 * carry no department, so its response simply contributes nothing. */
function deptsOf(rows: Array<HandsRow | MachineRunRow>): DeptOption[] {
  const seen = new Map<number, string>();
  for (const r of rows) {
    if (r.dept_id != null && !seen.has(r.dept_id)) {
      seen.set(r.dept_id, r.dept ?? String(r.dept_id));
    }
  }
  return [...seen]
    .map(([dept_id, dept]) => ({ dept_id, dept }))
    .sort((a, b) => a.dept.localeCompare(b.dept));
}

function Content() {
  const { branches, coId, companyName, initialBranchId, dateParam } = useReportBranches();
  // Branch/date seed from the localStorage-backed sidebar context, so the
  // server HTML and the first client render disagree unless the filters are
  // held back until mount.
  const mounted = useMounted();
  const pathname = usePathname();
  const month = currentMonthRange();

  const [branchId, setBranchId] = useState<number | null>(initialBranchId);
  const [dateFrom, setDateFrom] = useState(month.from);
  const [dateTo, setDateTo] = useState(dateParam || month.to);
  const [view, setView] = useState<HandsView>("detailed");
  const [deptId, setDeptId] = useState("");
  const [directIndirect, setDirectIndirect] = useState("");
  const [showShiftDetail, setShowShiftDetail] = useState(false);

  const [report, setReport] = useState<HandsReport | null>(null);
  const [deptOptions, setDeptOptions] = useState<DeptOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const didInit = useRef(false);
  const branchSeeded = useRef(false);
  const lastCoId = useRef<number | null>(null);

  const runFetch = useCallback(
    async (nextView: HandsView) => {
      if (coId == null || branchId == null || !dateFrom || !dateTo) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetchHandsReport({
          coId,
          branchId,
          dateFrom,
          dateTo,
          view: nextView,
          deptId,
          directIndirect,
        });
        setReport(res);
        // Only an unfiltered pull carries every department of the range —
        // refreshing the options from a filtered one would strand the user on
        // the department they just picked. by_date rows have no department, so
        // its (empty) list is ignored rather than clearing the options.
        if (!deptId) {
          const found = deptsOf(res.rows);
          if (found.length) setDeptOptions(found);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load the report");
        setReport(null);
      } finally {
        setLoading(false);
      }
    },
    [coId, branchId, dateFrom, dateTo, deptId, directIndirect],
  );

  // Seed the branch ONCE when the sidebar context resolves; the user owns it after that.
  useEffect(() => {
    if (!branchSeeded.current && initialBranchId != null) {
      branchSeeded.current = true;
      setBranchId(initialBranchId);
    }
  }, [initialBranchId]);

  // Sidebar company switch: the loaded report, the branch and the department
  // list all belong to the old company — drop them rather than show them
  // mislabeled.
  useEffect(() => {
    if (coId == null) return;
    if (lastCoId.current != null && lastCoId.current !== coId) {
      setReport(null);
      setDeptOptions([]);
      setDeptId("");
      setBranchId(null);
      branchSeeded.current = false;
      didInit.current = false;
    }
    lastCoId.current = coId;
  }, [coId]);

  // One automatic load once company + branch are known; afterwards only Submit
  // (or a view switch, which is a different grain of the same report).
  useEffect(() => {
    if (!didInit.current && coId != null && branchId != null) {
      didInit.current = true;
      void runFetch(view);
    }
  }, [coId, branchId, view, runFetch]);

  const onViewChange = (next: HandsView) => {
    setView(next);
    if (report || didInit.current) void runFetch(next);
  };

  const branch: BranchOption | null = branches.find((b) => b.branch_id === branchId) ?? null;

  // The GRAND TOTAL line rides at the end of the rows (by_department only);
  // ReportGrid picks it up by its "GRAND TOTAL" text and styles it as a total.
  const rows: Row[] = useMemo(() => {
    const base = report?.rows ?? [];
    const all = report?.grand_total ? [...base, report.grand_total] : base;
    return all.map((r, i) => ({ ...r, row_id: i }));
  }, [report]);
  const summaryRows: SummaryRow[] = useMemo(
    () => (report?.type_summary ?? []).map((r, i) => ({ ...r, row_id: i })),
    [report],
  );

  // Columns follow the LOADED view, not the selector: mid-fetch the selector is
  // already on the next view while the grid still holds the previous view's
  // rows, and columns for fields those rows lack would render a page of blanks.
  const loadedView = report?.view ?? view;
  const columns = useMemo(
    () => buildColumns(loadedView, showShiftDetail),
    [loadedView, showShiftDetail],
  );
  const machinesView = view === "machines_run";
  const summaryHeader = (h: ReportExportHeader): ReportExportHeader => ({
    ...h,
    reportName: `${TITLE} — Machines Run by Type`,
  });

  const header: ReportExportHeader = {
    companyName,
    branchName: branch?.branch_name,
    reportName: `${TITLE} — ${HANDS_VIEWS.find((v) => v.value === loadedView)?.label ?? loadedView}`,
    reportFor: [dateFrom, dateTo].filter(Boolean).join(" To "),
  };

  const meta = report?.meta;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" sx={{ color: "#0C3C60", fontWeight: "bold", mb: 2 }}>
        {TITLE}
      </Typography>

      {mounted && (
        <>
          <Paper elevation={1} sx={{ mb: 2, p: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
              <Autocomplete
                options={branches}
                getOptionLabel={(o) => o.branch_name}
                isOptionEqualToValue={(o, v) => o.branch_id === v.branch_id}
                value={branch}
                onChange={(_, v) => setBranchId(v?.branch_id ?? null)}
                renderInput={(p) => <TextField {...p} label="Branch" size="small" />}
                sx={{ minWidth: 220 }}
              />
              <TextField
                type="date"
                label="From Date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                size="small"
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ width: 170 }}
              />
              <TextField
                type="date"
                label="To Date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                size="small"
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ width: 170 }}
              />
              <SearchableOptionSelect<HandsView>
                label="View"
                size="small"
                clearable={false}
                options={HANDS_VIEWS}
                value={view}
                onChange={(v) => {
                  if (v !== "") onViewChange(v);
                }}
                sx={{ width: 190 }}
              />
              <Autocomplete
                options={deptOptions}
                getOptionLabel={(o) => o.dept}
                isOptionEqualToValue={(o, v) => o.dept_id === v.dept_id}
                value={deptOptions.find((o) => String(o.dept_id) === deptId) ?? null}
                onChange={(_, v) => setDeptId(v ? String(v.dept_id) : "")}
                renderInput={(p) => <TextField {...p} label="Department" size="small" />}
                sx={{ minWidth: 220 }}
              />
              {/* Machines have no direct/indirect side and no target columns,
                  so neither control applies on the Machines Run view. */}
              {!machinesView && (
                <>
                  <SearchableOptionSelect<string>
                    label="Direct / Indirect"
                    size="small"
                    placeholder="All"
                    options={DIRECT_INDIRECT}
                    value={directIndirect}
                    onChange={(v) => setDirectIndirect(v)}
                    sx={{ width: 170 }}
                  />
                  {/* Purely a reading preference — the endpoint always returns the
                      shift columns, so this never refetches. */}
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={showShiftDetail}
                        onChange={(e) => setShowShiftDetail(e.target.checked)}
                      />
                    }
                    label="Show shift-wise detail"
                  />
                </>
              )}
              <Box sx={{ flexGrow: 1 }} />
              {loadedView === "machines_run" && (
                <Button
                  variant="outlined"
                  size="small"
                  disabled={branchId == null || summaryRows.length === 0}
                  onClick={() => {
                    void (async () => {
                      await exportRowsToExcel(
                        summaryCols,
                        summaryRows,
                        "machines-run-by-type",
                        summaryHeader({
                          ...header,
                          reportNo: await resolveReportMenuId(pathname),
                        }),
                      );
                    })();
                  }}
                  sx={{ textTransform: "none" }}
                >
                  Export Summary
                </Button>
              )}
              <Button
                variant="outlined"
                size="small"
                disabled={branchId == null || rows.length === 0}
                onClick={() => {
                  void (async () => {
                    await exportRowsToExcel(
                      columns,
                      rows,
                      loadedView === "machines_run" ? "machines-run" : "hands-report",
                      {
                        ...header,
                        reportNo: await resolveReportMenuId(pathname),
                      },
                    );
                  })();
                }}
                sx={{ textTransform: "none" }}
              >
                Export to Excel
              </Button>
              <Button
                variant="contained"
                disabled={branchId == null || coId == null || loading}
                onClick={() => void runFetch(view)}
                sx={{
                  backgroundColor: "#0C3C60",
                  "&:hover": { backgroundColor: "#092d47" },
                  textTransform: "none",
                }}
              >
                Submit
              </Button>
            </Box>
          </Paper>

          {meta && loadedView === "machines_run" ? (
            <Stack direction="row" spacing={3} useFlexGap flexWrap="wrap" sx={{ mb: 1.5, px: 0.5 }}>
              <Typography variant="body2">
                <strong>Machine-shifts run:</strong> {meta.machine_shifts_run ?? "—"}
              </Typography>
              <Typography variant="body2">
                <strong>Machines run:</strong> {meta.machines_run ?? "—"}
              </Typography>
              <Typography variant="body2" color="warning.dark">
                <strong>Listed, not counted (stoppage / breakdown only):</strong>{" "}
                {meta.stopped_only_rows ?? "—"}
              </Typography>
            </Stack>
          ) : meta ? (
            <Stack direction="row" spacing={3} useFlexGap flexWrap="wrap" sx={{ mb: 1.5, px: 0.5 }}>
              <Typography variant="body2">
                <strong>Total actual hands:</strong> {fmtNum(meta.total_actual) || "—"}
              </Typography>
              <Typography variant="body2">
                <strong>Total target hands:</strong> {fmtNum(meta.total_target) || "—"}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                <strong>Excess:</strong> {fmtNum(meta.total_excess) || "—"}
              </Typography>
              <Typography variant="body2" color="error.main">
                <strong>Short:</strong> {fmtNum(meta.total_short) || "—"}
              </Typography>
              <Typography variant="body2">
                <strong>MTD actual{meta.mtd_from ? ` (from ${meta.mtd_from})` : ""}:</strong>{" "}
                {fmtNum(meta.mtd_actual) || "—"}
              </Typography>
              <Typography variant="body2">
                <strong>MTD target:</strong> {fmtNum(meta.mtd_target) || "—"}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                <strong>MTD excess:</strong> {fmtNum(meta.mtd_excess) || "—"}
              </Typography>
              <Typography variant="body2" color="error.main">
                <strong>MTD short:</strong> {fmtNum(meta.mtd_short) || "—"}
              </Typography>
            </Stack>
          ) : null}

          {meta?.notes?.length ? (
            <Alert severity="info" sx={{ mb: 2 }}>
              {meta.notes.join(" · ")}
            </Alert>
          ) : null}

          {loadedView === "machines_run" && (summaryRows.length > 0 || loading) ? (
            <>
              <Typography variant="subtitle1" sx={{ color: "#0C3C60", fontWeight: 600, mb: 0.5 }}>
                Machines run by type (counted machine-shifts)
              </Typography>
              <ReportGrid
                rows={summaryRows}
                columns={summaryCols}
                getRowId={(r) => r.row_id}
                loading={loading}
                error={null}
                height={Math.min(120 + summaryRows.length * 36, 360)}
              />
              <Typography variant="subtitle1" sx={{ color: "#0C3C60", fontWeight: 600, mt: 2, mb: 0.5 }}>
                Machine-wise detail
              </Typography>
            </>
          ) : null}

          <ReportGrid
            rows={rows}
            columns={columns}
            getRowId={(r) => r.row_id}
            loading={loading}
            error={error}
            branchId={branchId}
            getRowClass={(r) =>
              isMachineRunRow(r) && !r.counted ? "report-perf-watch" : ""
            }
          />
        </>
      )}
    </Box>
  );
}

export default function HandsReportPage() {
  // useReportBranches() reads useSearchParams() — `next build` fails without
  // a Suspense boundary above it.
  return (
    <Suspense
      fallback={
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      }
    >
      <Content />
    </Suspense>
  );
}
