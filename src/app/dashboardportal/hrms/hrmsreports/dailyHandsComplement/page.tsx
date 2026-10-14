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
type Row = DailyHandsComplementRow & {
  total: number;
  mtd_shift: number;
  mtd_ot: number;
  mtd_total: number;
};

const NUM_FIELDS = [
  "shift_a",
  "shift_b",
  "shift_c",
  "shift_total",
  "ot_a",
  "ot_b",
  "ot_c",
  "ot_total",
  "total",
  "mtd_shift",
  "mtd_ot",
  "mtd_total",
] as const;

const DAY_FIELDS = NUM_FIELDS.slice(0, 8) as (keyof DailyHandsComplementRow & (typeof NUM_FIELDS)[number])[];

/** Backend order: dept_code (blank last), department, occupation. */
const cmp = (a: Row, b: Row) =>
  Number(!a.dept_code) - Number(!b.dept_code) ||
  (a.dept_code ?? "").localeCompare(b.dept_code ?? "") ||
  (a.department ?? "").localeCompare(b.department ?? "") ||
  (a.occupation ?? "").localeCompare(b.occupation ?? "");

const r2 = (n: number) => Math.round(n * 100) / 100;

function Content() {
  const { coId, branches, initialBranchId, dateParam } = useReportBranches();

  const fetcher = useCallback(
    async (f: ReportFilters): Promise<Row[]> => {
      if (coId == null) return [];
      // Single-date report (legacy "Hands Complement for <date>") plus
      // month-to-date: one fetch from the 1st, split client-side.
      const raw = await fetchDailyHandsComplement({
        coId,
        branchId: f.branchId,
        dateFrom: f.dateTo.slice(0, 8) + "01",
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

      const byKey = new Map<string, Row>();
      for (const d of raw) {
        const key = `${d.dept_code}|${d.department}|${d.occupation}`;
        let r = byKey.get(key);
        if (!r) {
          r = blank(byKey.size, d.department ?? "", d.occupation ?? "");
          r.dept_code = d.dept_code;
          byKey.set(key, r);
        }
        if (d.attendance_date === f.dateTo) {
          for (const k of DAY_FIELDS) r[k] = r2(r[k] + d[k]);
        }
        r.mtd_shift = r2(r.mtd_shift + d.shift_total);
        r.mtd_ot = r2(r.mtd_ot + d.ot_total);
      }
      const rows = [...byKey.values()].sort(cmp);
      for (const r of rows) {
        r.total = r2(r.shift_total + r.ot_total);
        r.mtd_total = r2(r.mtd_shift + r.mtd_ot);
      }

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
      numCol<Row>("total", "Total Hands", 110),
      numCol<Row>("mtd_shift", "MTD Shift Hands", 130),
      numCol<Row>("mtd_ot", "MTD OT Hands", 120),
      numCol<Row>("mtd_total", "MTD Total Hands", 130),
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
