"use client";

import * as React from "react";
import { Box, Button, Paper, Typography } from "@mui/material";
import { Plus, RefreshCw } from "lucide-react";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import type { BranchOption } from "@/components/reports/types";
import type { FollowupDeptCode } from "@/utils/lowPerformerFollowupService";
import { STATUS_FILTER_OPTIONS, type StatusFilter } from "../_utils";

export type DeptFilter = "ALL" | FollowupDeptCode;

export interface FollowupListFiltersProps {
  branches: ReadonlyArray<BranchOption>;
  branchId: number | null;
  onBranchChange: (branchId: number | null) => void;
  deptOptions: ReadonlyArray<{ value: FollowupDeptCode; label: string }>;
  dept: DeptFilter;
  onDeptChange: (dept: DeptFilter) => void;
  status: StatusFilter;
  onStatusChange: (status: StatusFilter) => void;
  /** Shows the "Add person" button. */
  canCreate: boolean;
  onAdd: () => void;
  onRefresh: () => void;
  loading: boolean;
}

/** Filter bar of the follow-up list: branch (only when several), department, status. */
export default function FollowupListFilters({
  branches,
  branchId,
  onBranchChange,
  deptOptions,
  dept,
  onDeptChange,
  status,
  onStatusChange,
  canCreate,
  onAdd,
  onRefresh,
  loading,
}: FollowupListFiltersProps) {
  const branchName = branches.find((b) => b.branch_id === branchId)?.branch_name;
  const deptChoices = React.useMemo(
    () => [{ value: "ALL" as const, label: "All" }, ...deptOptions],
    [deptOptions],
  );
  const branchChoices = React.useMemo(
    () => branches.map((b) => ({ value: b.branch_id, label: b.branch_name })),
    [branches],
  );

  return (
    <Paper elevation={1} sx={{ mb: 2, p: 2 }}>
      <Box
        sx={{
          display: "grid",
          gap: 2,
          alignItems: "center",
          gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, auto))" },
          justifyContent: "start",
        }}
      >
        {branches.length > 1 ? (
          <SearchableOptionSelect<number>
            label="Branch"
            options={branchChoices}
            value={branchId ?? ""}
            onChange={(v) => onBranchChange(v === "" ? null : v)}
            fullWidth
            sx={{ minWidth: { md: 220 } }}
          />
        ) : branchName ? (
          <Typography variant="body2" color="text.secondary">
            Branch: <strong>{branchName}</strong>
          </Typography>
        ) : null}
        <SearchableOptionSelect<DeptFilter>
          label="Department"
          options={deptChoices}
          value={dept}
          onChange={(v) => onDeptChange(v === "" ? "ALL" : v)}
          clearable={false}
          fullWidth
          sx={{ minWidth: { md: 180 } }}
        />
        <SearchableOptionSelect<StatusFilter>
          label="Status"
          options={STATUS_FILTER_OPTIONS}
          value={status}
          onChange={(v) => onStatusChange(v === "" ? "open" : v)}
          clearable={false}
          fullWidth
          sx={{ minWidth: { md: 150 } }}
        />
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button
            variant="outlined"
            startIcon={<RefreshCw size={16} />}
            onClick={onRefresh}
            disabled={loading || branchId == null}
            sx={{ minHeight: 40 }}
          >
            Refresh
          </Button>
          {canCreate ? (
            <Button
              variant="contained"
              startIcon={<Plus size={16} />}
              onClick={onAdd}
              disabled={branchId == null}
              sx={{ minHeight: 40 }}
            >
              Add person
            </Button>
          ) : null}
        </Box>
      </Box>
    </Paper>
  );
}
