"use client";
import React, { Suspense, useCallback, useMemo, useState } from "react";
import { Box, CircularProgress } from "@mui/material";
import { usePathname } from "next/navigation";
import type { GridColDef } from "@mui/x-data-grid";
import ReportGrid, { numCol } from "@/components/reports/ReportGrid";
import { exportRowsToExcel } from "@/components/reports/exportExcel";
import { resolveReportMenuId } from "@/utils/reportMenuService";
import { fetchDateMachineGridReport } from "@/utils/juteMechanicalService";
import MechFilterToolbar, {
  MechReportTitle,
  UnattributedCaption,
} from "../_components/MechFilterToolbar";
import {
  useMechReportFilters,
  useMechReportRun,
} from "../_components/useMechReportFilters";
import {
  NR_REASON_CODE,
  asRecord,
  dmy,
  pickNum,
  pickStr,
  pickText,
} from "../_components/mechReportUtils";

/**
 * R4 — Date × Machine Grid: a matrix whose cells hold the reason codes logged
 * for that machine on that date, multiple codes joined with "/".
 *
 * This deliberately replicates the sheet the mill keys today ("RF/DRJ",
 * "DRJ/PB/BJ" written into one Excel cell), so it should look familiar the
 * moment they open it.
 *
 * The machine columns are DYNAMIC — machines differ per branch and per machine
 * type — so they are built from the `columns` array the backend returns
 * alongside the rows, never from a hardcoded list. Row cells are keyed by the
 * stringified `machine_id`.
 */
type GridRow = { id: string } & Record<string, string | number | null>;

/** Fixed leading/trailing columns that frame the dynamic machine block. */
const DATE_COLUMN: GridColDef<GridRow> = {
  field: "tran_date",
  headerName: "Date",
  width: 110,
};
const TAIL_COLUMNS: GridColDef<GridRow>[] = [
  numCol<GridRow>("breakdown_count", "Breakdowns", 110),
  numCol<GridRow>("total_downtime_min", "Downtime (Min)", 130),
];

function DateMachineGridContent() {
  const filters = useMechReportFilters();
  const pathname = usePathname();
  const { reportParams, companyName, branch, dateFrom, dateTo, ready } = filters;

  // Machine columns come back with the data, so they are state rather than a
  // module constant.
  const [machineColumns, setMachineColumns] = useState<GridColDef<GridRow>[]>([]);

  const fetcher = useCallback(async () => {
    if (!reportParams) return { rows: [], unattributed: null };
    const result = await fetchDateMachineGridReport(reportParams);

    // Build one column per machine the backend reported for this filter set.
    const dynamicColumns: GridColDef<GridRow>[] = result.columns.map((col) => {
      const colRec = asRecord(col);
      const mechCode = pickStr(colRec, "mech_code");
      const name = pickText(colRec, "machine_name", `Machine ${col.machine_id}`);
      return {
        field: String(col.machine_id),
        headerName: mechCode ? `${name} (${mechCode})` : name,
        width: 120,
        sortable: false,
      };
    });
    setMachineColumns(dynamicColumns);

    let codeCount = 0;
    let nrCount = 0;

    const rows: GridRow[] = result.data.map((row, index) => {
      const rec = asRecord(row);
      const tranDate = pickStr(rec, "tran_date");
      const gridRow: GridRow = {
        id: tranDate ?? `row-${index}`,
        tran_date: dmy(tranDate),
        breakdown_count: pickNum(rec, "breakdown_count"),
        total_downtime_min: pickNum(rec, "total_downtime_min"),
      };
      for (const col of result.columns) {
        const key = String(col.machine_id);
        const cell = pickStr(rec, key);
        gridRow[key] = cell ?? "";
        if (!cell) continue;
        // Cells hold "RF/DRJ" — count each code so the unattributed share below
        // reflects codes logged, not cells filled.
        for (const code of cell.split("/")) {
          if (!code.trim()) continue;
          codeCount += 1;
          if (code.trim() === NR_REASON_CODE) nrCount += 1;
        }
      }
      return gridRow;
    });

    return {
      rows,
      // This report pivots reason CODES, not durations, so the share here is by
      // code count. Labelled accordingly on screen.
      unattributed: codeCount > 0 ? (nrCount * 100) / codeCount : null,
    };
  }, [reportParams]);

  const { rows, unattributed, loading, error, run } = useMechReportRun<GridRow>(
    fetcher,
    ready,
  );

  const columns = useMemo<GridColDef<GridRow>[]>(
    () => [DATE_COLUMN, ...machineColumns, ...TAIL_COLUMNS],
    [machineColumns],
  );

  const handleExport = useCallback(() => {
    void (async () => {
      await exportRowsToExcel(columns, rows, "mech-date-machine-grid", {
        companyName,
        branchName: branch?.branch_name,
        reportName: "Date × Machine Breakdown Grid",
        reportNo: await resolveReportMenuId(pathname),
        reportFor: [dateFrom, dateTo].filter(Boolean).join(" To "),
      });
    })();
  }, [columns, rows, companyName, branch?.branch_name, pathname, dateFrom, dateTo]);

  const handleSubmit = useCallback(() => {
    void run();
  }, [run]);

  const exportDisabled = useMemo(
    () => rows.length === 0 || filters.branchId == null,
    [rows.length, filters.branchId],
  );

  return (
    <Box sx={{ p: 3 }}>
      <MechReportTitle>Date × Machine Breakdown Grid</MechReportTitle>
      <UnattributedCaption
        value={unattributed}
        label="of logged reason codes are unattributed"
      />

      {filters.mounted && (
        <MechFilterToolbar
          filters={filters}
          show={{ dates: true, machine: true, machineType: true, discipline: true }}
          onSubmit={handleSubmit}
          onExport={handleExport}
          loading={loading}
          exportDisabled={exportDisabled}
        />
      )}

      <ReportGrid
        rows={rows}
        columns={columns}
        getRowId={(row) => row.id}
        loading={loading}
        error={error}
        branchId={filters.branchId}
      />
    </Box>
  );
}

export default function DateMachineGridPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      }
    >
      <DateMachineGridContent />
    </Suspense>
  );
}
