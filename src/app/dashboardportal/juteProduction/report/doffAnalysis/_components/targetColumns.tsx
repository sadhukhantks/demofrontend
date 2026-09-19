"use client";

/**
 * Target / Diff / Achv % columns shared by the Doff Summary, Spell Totals and
 * per-frame drill grids. A row with no target (standards not entered) renders
 * all three blank. Diff is actual - target: a shortfall is red, at-or-above
 * target green — theme palette only, no literal colours.
 */

import React from "react";
import { Box } from "@mui/material";
import type { GridColDef, GridValidRowModel } from "@mui/x-data-grid";
import { fmtNum, numCol } from "@/components/reports/ReportGrid";

export function diffCol<T extends GridValidRowModel>(
  field = "diff_wt",
  headerName = "Diff (kg)",
  width = 110,
): GridColDef<T> {
  return {
    ...numCol<T>(field, headerName, width),
    description: "Actual - Target (negative = short of target)",
    renderCell: (params) => {
      const n = Number(params.value);
      if (params.value == null || !Number.isFinite(n)) return "";
      return (
        <Box
          component="span"
          sx={{ color: n < 0 ? "error.main" : "success.main", fontWeight: 600 }}
        >
          {n > 0 ? `+${fmtNum(n)}` : fmtNum(n)}
        </Box>
      );
    },
  };
}

export function targetColumns<T extends GridValidRowModel>(): GridColDef<T>[] {
  return [
    {
      ...numCol<T>("target_wt", "Target (kg)", 120),
      description:
        "Tgt Prod of the Spinning Production grid: 100% production x Target Eff % (Spinning Standards). Blank until the standards are entered.",
    },
    diffCol<T>(),
    {
      field: "achv_pct",
      headerName: "Achv %",
      description: "Actual / Target x 100",
      type: "number",
      width: 90,
      valueFormatter: (value: unknown) =>
        value == null || !Number.isFinite(Number(value)) ? "" : Number(value).toFixed(1),
    },
  ];
}
