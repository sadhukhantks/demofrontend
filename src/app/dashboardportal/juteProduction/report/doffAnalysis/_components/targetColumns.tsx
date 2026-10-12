"use client";

/**
 * Target / Diff columns shared by the Doff Summary, Spell Totals and per-frame
 * drill grids. A row with no target (standards not entered) renders both
 * blank. Diff is target - actual: a shortfall (positive) is red, on-or-over
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
  { suffix = "", description = "Target - Actual (positive = short of target)" }: {
    /** Appended to the on-screen figure, e.g. "%" for a percentage diff. */
    suffix?: string;
    description?: string;
  } = {},
): GridColDef<T> {
  return {
    ...numCol<T>(field, headerName, width),
    description,
    renderCell: (params) => {
      const n = Number(params.value);
      if (params.value == null || !Number.isFinite(n)) return "";
      return (
        <Box
          component="span"
          sx={{ color: n > 0 ? "error.main" : "success.main", fontWeight: 600 }}
        >
          {n > 0 ? `+${fmtNum(n)}` : fmtNum(n)}
          {suffix}
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
        "Std Prod of the Spinning Production grid: 100% production x Std Eff % (Spinning Standards). Blank until the standards are entered.",
    },
    diffCol<T>(),
  ];
}
