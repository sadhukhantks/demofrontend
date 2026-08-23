"use client";
import React, { Suspense, useCallback, useMemo } from "react";
import { Box, CircularProgress } from "@mui/material";
import { GridColDef } from "@mui/x-data-grid";
import ReportPanel, {
  type ReportFilters,
} from "@/components/reports/ReportPanel";
import { numCol } from "@/components/reports/ReportGrid";
import { useReportBranches } from "@/components/reports/useReportBranches";
import { yesterdayIso } from "@/components/reports/reportDates";
import {
  fetchDailyHandsComplement,
  type DailyHandsComplementRow,
} from "@/utils/hrmsReportService";

/** A data row, or one of the Total rows built below it. */
type Row = DailyHandsComplementRow;

const NUM_FIELDS = [
  "shift_a",
  "shift_b",
  "shift_c",
  "shift_total",
  "ot_a",
  "ot_b",
  "ot_c",
  "ot_total",
] as const;

const r2 = (n: number) => Math.round(n * 100) / 100;

function Content() {
  const { coId, branches, initialBranchId, dateParam } = useReportBranches();

  const fetcher = useCallback(
    async (f: ReportFilters): Promise<Row[]> => {
      if (coId == null) return [];
      // Single-date report (legacy "Hands Complement for <date>").
      const rows = await fetchDailyHandsComplement({
        coId,
        branchId: f.branchId,
        dateFrom: f.dateTo,
        dateTo: f.dateTo,
      });

      const blank = (id: number, department: string, occupation: string): Row => {
        const r = {
          id,
          attendance_date: f.dateTo,
          dept_code: "",
          department,
          occupation,
        } as Row;
        for (const k of NUM_FIELDS) r[k] = 0;
        return r;
      };
      const add = (target: Row, src: Row) => {
        for (const k of NUM_FIELDS) target[k] = r2(target[k] + src[k]);
      };

      // Rows arrive ordered by department, so each group is contiguous.
      let nextId = rows.length;
      const out: Row[] = [];
      const grand = blank(nextId++, "Grand Total", "");
      let group: Row | null = null;
      for (const row of rows) {
        if (group && group.department !== row.department) {
          out.push(group);
          group = null;
        }
        if (!group) group = blank(nextId++, row.department ?? "", "Total");
        out.push(row);
        add(group, row);
        add(grand, row);
      }
      if (group) out.push(group);
      if (out.length) out.push(grand);
      return out;
    },
    [coId],
  );

  const columns = useMemo<GridColDef<Row>[]>(
    () => [
      { field: "department", headerName: "Department", flex: 1, minWidth: 160 },
      { field: "dept_code", headerName: "Dept Code", width: 100 },
      { field: "occupation", headerName: "Occupation", flex: 1.6, minWidth: 200 },
      numCol<Row>("shift_a", "Shift A", 100),
      numCol<Row>("shift_b", "Shift B", 100),
      numCol<Row>("shift_c", "Shift C", 100),
      numCol<Row>("shift_total", "Shift Total", 110),
      numCol<Row>("ot_a", "OT A", 100),
      numCol<Row>("ot_b", "OT B", 100),
      numCol<Row>("ot_c", "OT C", 100),
      numCol<Row>("ot_total", "OT Total", 110),
    ],
    [],
  );

  return (
    <ReportPanel
      title="Daily Hands Complement"
      branches={branches}
      initialBranchId={initialBranchId}
      dates="single"
      singleLabel="Date"
      initialDateTo={dateParam || yesterdayIso()}
      fetcher={fetcher}
      columns={columns}
      getRowId={(r) => r.id}
      // No initial sort — keeps the interleaved department totals in place.
      exportName="daily-hands-complement"
    />
  );
}

export default function DailyHandsComplementPage() {
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
