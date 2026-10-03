"use client";

/**
 * Section D: the day-wise trend — date, phase, study looms run, study
 * efficiency % and 7-day rolling, control efficiency % and rolling, gap,
 * markers (event dates and standard-speed changes). Excluded (settling) rows
 * are greyed. No chart (D10).
 */

import React from "react";
import type { GridColDef } from "@mui/x-data-grid";
import { numCol } from "@/components/reports/ReportGrid";
import type { ReportExportHeader } from "@/components/reports/exportExcel";
import type { ImpactDayRow } from "../_service";
import { dayRowClass, markersText, type WithId, withIds } from "../impactRows";
import TabGrid from "./TabGrid";

type Row = WithId<ImpactDayRow> & { markers_text: string };

const columns: GridColDef<Row>[] = [
  { field: "tran_date", headerName: "Date", width: 110 },
  { field: "phase", headerName: "Phase", width: 100 },
  numCol("study_looms_run", "Study looms run", 110, 0),
  numCol("study_eff", "Study eff %", 105),
  numCol("study_rolling7", "Study 7-day", 105),
  numCol("control_eff", "Control eff %", 110),
  numCol("control_rolling7", "Control 7-day", 110),
  numCol("gap", "Gap pts", 90),
  { field: "markers_text", headerName: "Markers", flex: 1, minWidth: 220 },
];

export default function DaywiseTab({
  rows,
  branchId,
  loading,
  error,
  header,
}: {
  rows: ImpactDayRow[];
  branchId: number | null;
  loading: boolean;
  error: string | null;
  header: ReportExportHeader;
}) {
  const gridRows = React.useMemo<Row[]>(
    () => withIds(rows).map((r) => ({ ...r, markers_text: markersText(r.markers) })),
    [rows],
  );
  return (
    <TabGrid
      rows={gridRows}
      columns={columns}
      loading={loading}
      error={error}
      branchId={branchId}
      sortField="tran_date"
      exportName="loom-modification-impact-daywise"
      header={header}
      getRowClass={dayRowClass}
      isTotalRow={() => false}
    />
  );
}
