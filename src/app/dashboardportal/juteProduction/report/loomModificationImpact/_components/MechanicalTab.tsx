"use client";

/**
 * Breakdown & mechanical context per study loom, before | after — mechanical
 * stoppage hours (jute_prod_stoppage_hours, reason 'mechanical'), breakdown
 * count and minutes (jute_mech_breakdown failures), plus the endpoint's total
 * row. Explains a verdict that a mechanical problem would otherwise hide.
 */

import React from "react";
import type { GridColDef } from "@mui/x-data-grid";
import { numCol } from "@/components/reports/ReportGrid";
import type { ReportExportHeader } from "@/components/reports/exportExcel";
import type { ImpactMechanicalRow } from "../_service";
import { mechanicalRows, type MechanicalRow } from "../impactRows";
import TabGrid from "./TabGrid";

const columns: GridColDef<MechanicalRow>[] = [
  { field: "loom_label", headerName: "Loom", minWidth: 120 },
  { field: "side", headerName: "Side", width: 90 },
  numCol("mech_stoppage_hours", "Mechanical stoppage h", 150),
  numCol("breakdown_count", "Breakdowns", 100, 0),
  numCol("breakdown_minutes", "Breakdown min", 115, 0),
];

export default function MechanicalTab({
  rows,
  branchId,
  loading,
  error,
  header,
}: {
  rows: ImpactMechanicalRow[];
  branchId: number | null;
  loading: boolean;
  error: string | null;
  header: ReportExportHeader;
}) {
  const gridRows = React.useMemo(() => mechanicalRows(rows), [rows]);
  return (
    <TabGrid
      rows={gridRows}
      columns={columns}
      loading={loading}
      error={error}
      branchId={branchId}
      exportName="loom-modification-impact-mechanical"
      header={header}
      isTotalRow={(r) => r.row_kind === "total"}
    />
  );
}
