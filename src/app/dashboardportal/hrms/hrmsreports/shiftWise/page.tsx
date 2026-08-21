"use client";
import React, { Suspense, useCallback, useMemo, useState } from "react";
import { Box, CircularProgress } from "@mui/material";
import { GridColDef } from "@mui/x-data-grid";
import ReportPanel, {
  type ReportFilters,
} from "@/components/reports/ReportPanel";
import { numCol } from "@/components/reports/ReportGrid";
import { useReportBranches } from "@/components/reports/useReportBranches";
import { currentMonthRange } from "@/components/reports/reportDates";
import { fetchShiftWise } from "@/utils/hrmsReportService";

/** Pivoted row: department/designation plus one hands field per shift. */
type PivotRow = { id: string } & Record<string, string | number>;

const NONE = "(None)";
const r2 = (n: number) => Math.round(n * 100) / 100;

function Content() {
  const { coId, branches, initialBranchId, dateParam } = useReportBranches();
  const { from, to } = currentMonthRange();
  // Shift columns are tenant data — discovered from the fetched rows.
  const [shifts, setShifts] = useState<string[]>([]);

  const fetcher = useCallback(
    async (f: ReportFilters): Promise<PivotRow[]> => {
      if (coId == null) return [];
      const rows = await fetchShiftWise({
        coId,
        branchId: f.branchId,
        dateFrom: f.dateFrom,
        dateTo: f.dateTo,
      });
      const names = [...new Set(rows.map((r) => r.shift ?? NONE))].sort();
      const makeRow = (id: string, dept: string, desig: string): PivotRow => {
        const row: PivotRow = {
          id,
          department: dept,
          designation: desig,
          total: 0,
        };
        for (const s of names) row[s] = 0;
        return row;
      };
      const add = (row: PivotRow, shift: string, hands: number) => {
        row[shift] = r2((row[shift] as number) + hands);
        row.total = r2((row.total as number) + hands);
      };
      // Backend rows arrive ordered by department, so groups stay contiguous.
      const byDept = new Map<
        string,
        { rows: Map<string, PivotRow>; total: PivotRow }
      >();
      const grand = makeRow("__grand", "Grand Total", "");
      for (const r of rows) {
        const dept = r.department ?? "";
        const desig = r.designation ?? "";
        let g = byDept.get(dept);
        if (!g) {
          g = {
            rows: new Map(),
            total: makeRow(`${dept}|__total`, dept, "Total"),
          };
          byDept.set(dept, g);
        }
        let row = g.rows.get(desig);
        if (!row) {
          row = makeRow(`${dept}|${desig}`, dept, desig);
          g.rows.set(desig, row);
        }
        const shift = r.shift ?? NONE;
        add(row, shift, r.hands);
        add(g.total, shift, r.hands);
        add(grand, shift, r.hands);
      }
      setShifts(names);
      // Each department's rows, then its Total, then the Grand Total.
      const out: PivotRow[] = [];
      for (const g of byDept.values()) {
        out.push(...g.rows.values(), g.total);
      }
      if (out.length) out.push(grand);
      return out;
    },
    [coId],
  );

  const columns = useMemo<GridColDef<PivotRow>[]>(
    () => [
      { field: "department", headerName: "Department", flex: 1, minWidth: 180 },
      { field: "designation", headerName: "Designation", flex: 1, minWidth: 180 },
      ...shifts.map((s) => numCol<PivotRow>(s, s, 100)),
      numCol<PivotRow>("total", "Total Hands", 120),
    ],
    [shifts],
  );

  return (
    <ReportPanel
      title="Shift Wise Attendance"
      branches={branches}
      initialBranchId={initialBranchId}
      dates="range"
      initialDateFrom={from}
      initialDateTo={dateParam || to}
      fetcher={fetcher}
      columns={columns}
      getRowId={(r) => r.id}
      // No initial sort — keeps the interleaved department totals in place.
      exportName="shift-wise"
    />
  );
}

export default function ShiftWisePage() {
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
