"use client";
import React, { Suspense } from "react";
import { Box, CircularProgress } from "@mui/material";
import { GridColDef } from "@mui/x-data-grid";
import ReportPanel from "@/components/reports/ReportPanel";
import { numCol } from "@/components/reports/ReportGrid";
import { useReportBranches } from "@/components/reports/useReportBranches";
import { yesterdayIso } from "@/components/reports/reportDates";
import {
  fetchAbsenteeism,
  parseAbsentRange,
  type AbsenteeismRow,
} from "@/utils/hrmsReportService";

const columns: GridColDef<AbsenteeismRow>[] = [
  { field: "emp_code", headerName: "EB No", width: 110 },
  { field: "emp_name", headerName: "Name", flex: 1, minWidth: 200 },
  { field: "department", headerName: "Department", flex: 1, minWidth: 170 },
  { field: "sub_department", headerName: "Sub Department", flex: 1, minWidth: 150 },
  { field: "category", headerName: "Category", flex: 1, minWidth: 140 },
  { field: "last_seen", headerName: "Last Seen", width: 120 },
  numCol("absent_for", "Absent For (Days)", 150),
];

/** "min-max" day windows; an open upper bound ("90-") means no cap. The report
 * is bounded on BOTH sides on purpose: employees are rarely marked as having
 * left, so an open-ended list drowns this month's absentees in staff last seen
 * years ago (TKT-000151). The last option is the deliberate "who is gone"
 * query. */
const ABSENT_RANGES = [
  { value: "1-30", label: "1 to 30 days" },
  { value: "7-30", label: "7 to 30 days" },
  { value: "15-60", label: "15 to 60 days" },
  { value: "30-90", label: "30 to 90 days" },
  { value: "90-", label: "90+ days (likely left)" },
];

function Content() {
  const { coId, branches, initialBranchId, dateParam } = useReportBranches();
  return (
    <ReportPanel
      title="Absenteeism"
      branches={branches}
      initialBranchId={initialBranchId}
      dates="single"
      singleLabel="As On"
      initialDateTo={dateParam || yesterdayIso()}
      extra={{
        label: "Absent For",
        options: ABSENT_RANGES,
      }}
      initialExtra="7-30"
      fetcher={(f) => {
        const [min, max] = parseAbsentRange(f.extra);
        return coId == null
          ? Promise.resolve([])
          : fetchAbsenteeism({
              coId,
              branchId: f.branchId,
              asOn: f.dateTo,
              minDays: min,
              maxDays: max,
            });
      }}
      columns={columns}
      getRowId={(r) => r.id}
      sortField="absent_for"
      sortDir="desc"
      exportName="absenteeism"
    />
  );
}

export default function AbsenteeismPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      }
    >
      <Content />
    </Suspense>
  );
}
