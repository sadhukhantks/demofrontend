"use client";
import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import { GridColDef, GridValidRowModel } from "@mui/x-data-grid";
import ReportGrid, { numCol } from "@/components/reports/ReportGrid";
import { useReportBranches } from "@/components/reports/useReportBranches";
import { todayIso } from "@/components/reports/reportDates";
import { fetchJuteIssuePlanner } from "@/utils/juteReportService";
import type {
  IssuePlannerBatchPlanRow,
  IssuePlannerCoverageRow,
  IssuePlannerReferenceRow,
  IssuePlannerReport,
  IssuePlannerRequiredIssueRow,
} from "../types/reportTypes";

/** Batch daily assign workflow states shown in the plan window section. */
const ASSIGN_STATUS_LABELS: Record<number, string> = {
  21: "Draft",
  1: "Open",
  3: "Approved",
};

type PivotRow = Record<string, string | number>;

const requiredIssueColumns: GridColDef<IssuePlannerRequiredIssueRow>[] = [
  { field: "quality_name", headerName: "Jute Quality", flex: 1, minWidth: 160 },
  numCol("maturity_hours", "Maturity (hrs)", 110),
  {
    field: "target_stock_date",
    headerName: "Target Stock Date",
    width: 140,
    renderCell: (params) =>
      `${params.row.target_stock_date}${params.row.target_date_clamped ? " *" : ""}`,
  },
  numCol("target_stock_mt", "Target Stock (MT)", 140),
  numCol("current_roll_stock_mt", "Roll Stock (MT)", 130),
  numCol("plan_issue_mt", "Plan Issue (MT)", 130),
  numCol("required_issue_mt", "Required Issue (MT)", 150),
  numCol("required_issue_bales", "Required Issue (Bales)", 160),
];

const coverageColumns: GridColDef<IssuePlannerCoverageRow>[] = [
  { field: "quality_name", headerName: "Jute Quality", flex: 1, minWidth: 160 },
  numCol("godown_stock_mt", "Godown Stock (MT)", 150),
  numCol("avg_daily_requirement_mt", "Avg Daily Requirement (MT)", 190),
  numCol("days_of_stock", "Days of Stock", 120),
];

const referenceColumns: GridColDef<IssuePlannerReferenceRow>[] = [
  { field: "yarn_name", headerName: "Yarn", flex: 1, minWidth: 160 },
  numCol("production_kg", "Previous-Day Production (kg)", 200),
  numCol("reference_kg", "Reference (kg)", 130),
  {
    field: "reference_source",
    headerName: "Source",
    width: 130,
    valueFormatter: (value: unknown) =>
      value === "default" ? "Default (1 MT)" : "Actual",
  },
  {
    field: "planned",
    headerName: "In Plan",
    width: 90,
    valueFormatter: (value: unknown) => (value ? "Yes" : "No"),
  },
];

const batchPlanColumns: GridColDef<IssuePlannerBatchPlanRow>[] = [
  { field: "assign_date", headerName: "Date", width: 120 },
  { field: "yarn_name", headerName: "Yarn", flex: 1, minWidth: 160 },
  { field: "plan_name", headerName: "Batch Plan", flex: 1, minWidth: 160 },
  {
    field: "status_id",
    headerName: "Status",
    width: 110,
    valueFormatter: (value: unknown) =>
      ASSIGN_STATUS_LABELS[Number(value)] ?? String(value ?? ""),
  },
];

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <Paper elevation={1} sx={{ p: 1.5, minWidth: 170, flex: "1 1 170px" }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h6" sx={{ color: "#0C3C60", fontWeight: 700 }}>
        {value}
      </Typography>
    </Paper>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      variant="subtitle1"
      sx={{ color: "#0C3C60", fontWeight: 700, mt: 3, mb: 1 }}
    >
      {children}
    </Typography>
  );
}

function IssuePlannerPageContent() {
  const { branches, initialBranchId, dateParam } = useReportBranches();

  const [branchId, setBranchId] = useState<number | null>(initialBranchId);
  const [date, setDate] = useState<string>(dateParam || todayIso());
  const [report, setReport] = useState<IssuePlannerReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Branch options come from the localStorage-backed sidebar context; gate the
  // filters behind mount so the first client render matches the server HTML.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const runFetch = useCallback(async () => {
    if (branchId == null || !date) return;
    setLoading(true);
    setError(null);
    try {
      setReport(await fetchJuteIssuePlanner(branchId, date));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load report");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [branchId, date]);

  const didInit = useRef(false);
  useEffect(() => {
    if (!didInit.current && branchId != null) {
      didInit.current = true;
      void runFetch();
    }
  }, [branchId, runFetch]);

  const branch = branches.find((b) => b.branch_id === branchId) ?? null;

  // Quality requirement pivot: one row per quality, one column per window day.
  const { pivotRows, pivotColumns } = useMemo(() => {
    if (!report) {
      return {
        pivotRows: [] as PivotRow[],
        pivotColumns: [] as GridColDef<PivotRow>[],
      };
    }
    const dates = Array.from(
      new Set(report.quality_requirement.map((r) => r.assign_date)),
    ).sort();
    const byQuality = new Map<number, PivotRow>();
    for (const r of report.quality_requirement) {
      let row = byQuality.get(r.item_id);
      if (!row) {
        row = {
          item_id: r.item_id,
          quality_name: r.quality_name ?? String(r.item_id),
          total_mt: 0,
        };
        byQuality.set(r.item_id, row);
      }
      row[r.assign_date] = Number(row[r.assign_date] ?? 0) + r.requirement_mt;
      row.total_mt = Number(row.total_mt) + r.requirement_mt;
    }
    const columns: GridColDef<PivotRow>[] = [
      { field: "quality_name", headerName: "Jute Quality", flex: 1, minWidth: 160 },
      ...dates.map((d) => numCol<PivotRow>(d, `${d} (MT)`, 130)),
      numCol<PivotRow>("total_mt", "Total (MT)", 120),
    ];
    return { pivotRows: Array.from(byQuality.values()), pivotColumns: columns };
  }, [report]);

  const summary = report?.summary ?? null;
  const hasClampedTarget =
    report?.required_issue.some((r) => r.target_date_clamped) ?? false;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" sx={{ color: "#0C3C60", fontWeight: "bold", mb: 2 }}>
        Jute Issue Planner
      </Typography>

      {mounted && (
        <>
          <Paper elevation={1} sx={{ mb: 2, p: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
              <Autocomplete
                options={branches}
                getOptionLabel={(option) => option.branch_name}
                isOptionEqualToValue={(option, value) =>
                  option.branch_id === value.branch_id
                }
                value={branch}
                onChange={(_, newValue) => setBranchId(newValue?.branch_id ?? null)}
                renderInput={(params) => (
                  <TextField {...params} label="Branch" size="small" />
                )}
                sx={{ minWidth: 240 }}
              />
              <TextField
                type="date"
                label="Issue Date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                size="small"
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ width: 180 }}
              />
              <Button
                variant="contained"
                disabled={branchId == null || loading}
                onClick={() => {
                  void runFetch();
                }}
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

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {loading && (
            <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
              <CircularProgress />
            </Box>
          )}

          {branchId == null && (
            <Box sx={{ p: 4, textAlign: "center" }}>
              <Typography color="text.secondary">
                Select a branch to view the report
              </Typography>
            </Box>
          )}

          {!loading && report && summary && (
            <>
              <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 1 }}>
                <KpiCard
                  label={`Production on ${summary.production_date} (MT)`}
                  value={(summary.total_reference_production_kg / 1000).toFixed(2)}
                />
                <KpiCard
                  label="Required Issue (MT)"
                  value={summary.total_required_issue_mt.toFixed(2)}
                />
                <KpiCard
                  label="Required Issue (Bales)"
                  value={summary.total_required_issue_bales.toFixed(0)}
                />
                <KpiCard label="Roll Stock as of" value={summary.snapshot_at} />
                <KpiCard
                  label="Plan Window"
                  value={`${summary.window_from} → ${summary.window_to}`}
                />
              </Box>

              <SectionTitle>Required Issue per Jute Quality</SectionTitle>
              <ReportGrid
                rows={report.required_issue}
                columns={requiredIssueColumns}
                getRowId={(r) => r.item_id}
                loading={false}
                error={null}
                height={400}
                sortField="required_issue_mt"
                sortDir="desc"
              />
              {hasClampedTarget && (
                <Typography variant="caption" color="text.secondary">
                  * Maturity extends past the plan window; target taken from the
                  last planned day.
                </Typography>
              )}

              <SectionTitle>Godown Stock Coverage (Days)</SectionTitle>
              <ReportGrid
                rows={report.stock_coverage}
                columns={coverageColumns}
                getRowId={(r) => r.item_id}
                loading={false}
                error={null}
                height={360}
                sortField="days_of_stock"
                sortDir="asc"
              />

              <SectionTitle>
                Reference Production by Yarn ({summary.production_date})
              </SectionTitle>
              <ReportGrid
                rows={report.reference_production}
                columns={referenceColumns}
                getRowId={(r) => `${r.item_id ?? "x"}-${r.yarn_name ?? ""}`}
                loading={false}
                error={null}
                height={320}
              />

              <SectionTitle>
                Batch Plan ({summary.window_from} → {summary.window_to})
              </SectionTitle>
              <ReportGrid
                rows={report.batch_plan}
                columns={batchPlanColumns}
                getRowId={(r) => `${r.assign_date}-${r.jute_yarn_id}`}
                loading={false}
                error={null}
                height={320}
                sortField="assign_date"
              />

              <SectionTitle>Daily Quality Requirement (MT)</SectionTitle>
              <ReportGrid<GridValidRowModel>
                rows={pivotRows}
                columns={pivotColumns as GridColDef<GridValidRowModel>[]}
                getRowId={(r) => Number(r.item_id)}
                loading={false}
                error={null}
                height={320}
              />
            </>
          )}
        </>
      )}
    </Box>
  );
}

export default function IssuePlannerPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      }
    >
      <IssuePlannerPageContent />
    </Suspense>
  );
}
