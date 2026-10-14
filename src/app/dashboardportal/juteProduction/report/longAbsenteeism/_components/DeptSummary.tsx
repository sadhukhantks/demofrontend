"use client";

import * as React from "react";
import { Chip, Paper, Stack, Typography } from "@mui/material";
import type { Theme } from "@mui/material/styles";
import { TOUCH_TARGET } from "@/components/ui/responsiveEntry";
import { NO_DEPT_FILTER, type DeptCount } from "../_utils";

/** Below `md` every chip gets a 44 px touch target; desktop keeps the compact chip. */
const touchTargetsSx = (theme: Theme) => ({
  [theme.breakpoints.down("md")]: {
    "& .MuiChip-root": { height: TOUCH_TARGET },
  },
});

export interface DeptSummaryProps {
  /** One entry per department, already sorted (see `countByDept`). */
  items: ReadonlyArray<DeptCount>;
  /** Rows counted: the figure on the "All" chip and in the title. */
  total: number;
  /** The Department filter currently applied; null = all departments, `NO_DEPT_FILTER` = no department. */
  selectedDeptId: number | null;
  /**
   * A chip was clicked: the department id, `NO_DEPT_FILTER` for the "No
   * department" chip, or null to clear the filter (all departments).
   */
  onSelectDept: (deptId: number | null) => void;
  /** Name of the watchlist view the counts belong to ("Due today", "Open", ...). */
  viewLabel: string;
}

/**
 * Department-wise summary of the rows the watchlist shows, under the filter
 * bar: an "All" chip and one chip per department ("Weaving 14"). The counts
 * cover every department of the view, also while one is selected (the
 * selected chip is highlighted). Clicking a department sets the Department
 * filter, clicking the selected one again clears it; the "No department"
 * chip filters on `NO_DEPT_FILTER`. Renders nothing when there are no rows.
 */
export default function DeptSummary({ items, total, selectedDeptId, onSelectDept, viewLabel }: DeptSummaryProps) {
  if (items.length === 0) return null;

  return (
    <Paper elevation={1} sx={[{ mb: 2, p: { xs: 1.5, md: 2 } }, touchTargetsSx]} role="group" aria-label="Summary by department">
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
        {`By department · ${viewLabel} · ${total}`}
      </Typography>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
        <Chip
          label={`All ${total}`}
          color={selectedDeptId == null ? "primary" : "default"}
          variant={selectedDeptId == null ? "filled" : "outlined"}
          aria-pressed={selectedDeptId == null}
          onClick={() => onSelectDept(null)}
        />
        {items.map((d) => {
          const filterId = d.dept_id ?? NO_DEPT_FILTER;
          const selected = filterId === selectedDeptId;
          return (
            <Chip
              key={d.dept_id ?? "none"}
              label={`${d.dept_desc} ${d.count}`}
              color={selected ? "primary" : "default"}
              variant={selected ? "filled" : "outlined"}
              aria-pressed={selected}
              onClick={() => onSelectDept(selected ? null : filterId)}
            />
          );
        })}
      </Stack>
    </Paper>
  );
}
