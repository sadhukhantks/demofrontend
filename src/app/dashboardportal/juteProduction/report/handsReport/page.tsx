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
 */

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  MenuItem,
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
import {
  fetchHandsReport,
  HANDS_VIEWS,
  type HandsReport,
  type HandsRow,
  type HandsView,
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
 * differs per view (date / designation / dept), with the GRAND TOTAL line
 * having none at all. */
type Row = HandsRow & { row_id: number };

/** Hours short of the norm, called out in red. Never fired on a null target
 * (norm unresolved) — a blank cell there is the honest answer. */
function shortCol(): GridColDef<Row> {
  return {
    ...numCol<Row>("short", "Short", 100),
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

const dateCol: GridColDef<Row> = { field: "date", headerName: "Date", width: 110 };
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

/** Identity columns differ per view; the numeric block is the same throughout. */
function buildColumns(view: HandsView, showShiftDetail: boolean): GridColDef<Row>[] {
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
function deptsOf(rows: HandsRow[]): DeptOption[] {
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

  // Columns follow the LOADED view, not the selector: mid-fetch the selector is
  // already on the next view while the grid still holds the previous view's
  // rows, and columns for fields those rows lack would render a page of blanks.
  const loadedView = report?.view ?? view;
  const columns = useMemo(
    () => buildColumns(loadedView, showShiftDetail),
    [loadedView, showShiftDetail],
  );

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
              <TextField
                select
                label="View"
                value={view}
                onChange={(e) => onViewChange(e.target.value as HandsView)}
                size="small"
                sx={{ width: 170 }}
              >
                {HANDS_VIEWS.map((v) => (
                  <MenuItem key={v.value} value={v.value}>
                    {v.label}
                  </MenuItem>
                ))}
              </TextField>
              <Autocomplete
                options={deptOptions}
                getOptionLabel={(o) => o.dept}
                isOptionEqualToValue={(o, v) => o.dept_id === v.dept_id}
                value={deptOptions.find((o) => String(o.dept_id) === deptId) ?? null}
                onChange={(_, v) => setDeptId(v ? String(v.dept_id) : "")}
                renderInput={(p) => <TextField {...p} label="Department" size="small" />}
                sx={{ minWidth: 220 }}
              />
              <TextField
                select
                label="Direct / Indirect"
                value={directIndirect}
                onChange={(e) => setDirectIndirect(e.target.value)}
                size="small"
                sx={{ width: 160 }}
              >
                <MenuItem value="">All</MenuItem>
                {DIRECT_INDIRECT.map((d) => (
                  <MenuItem key={d.value} value={d.value}>
                    {d.label}
                  </MenuItem>
                ))}
              </TextField>
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
              <Box sx={{ flexGrow: 1 }} />
              <Button
                variant="outlined"
                size="small"
                disabled={branchId == null || rows.length === 0}
                onClick={() => {
                  void (async () => {
                    await exportRowsToExcel(columns, rows, "hands-report", {
                      ...header,
                      reportNo: await resolveReportMenuId(pathname),
                    });
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

          {meta ? (
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
            </Stack>
          ) : null}

          {meta?.notes?.length ? (
            <Alert severity="info" sx={{ mb: 2 }}>
              {meta.notes.join(" · ")}
            </Alert>
          ) : null}

          <ReportGrid
            rows={rows}
            columns={columns}
            getRowId={(r) => r.row_id}
            loading={loading}
            error={error}
            branchId={branchId}
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
