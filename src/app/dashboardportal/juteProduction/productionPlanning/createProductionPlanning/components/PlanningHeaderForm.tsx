"use client";

import * as React from "react";
import { Box, Chip, TextField } from "@mui/material";
import type { PlanningDocUI } from "../types/productionPlanningTypes";

import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
export type BranchOption = {
  branch_id: number;
  branch_name: string;
};

export type PlanningHeaderFormProps = {
  doc: PlanningDocUI;
  branchOptions: readonly BranchOption[];
  disabled: boolean;
  onPatch: (
    patch: Partial<Pick<PlanningDocUI, "plan_date" | "plan_name" | "branch_id" | "remarks">>
  ) => void;
};

/** Header fields: plan no (read-only), date, name, branch, remarks. */
export default function PlanningHeaderForm({
  doc,
  branchOptions,
  disabled,
  onPatch,
}: PlanningHeaderFormProps) {
  return (
    <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2, flexWrap: "wrap" }}>
      <Chip
        label={doc.plan_no ? `Plan No: ${doc.plan_no}` : "New plan (no. on save)"}
        variant="outlined"
        sx={{ mt: 0.5 }}
      />
      <TextField
        type="date"
        size="small"
        label="Plan Date"
        value={doc.plan_date}
        onChange={(e) => onPatch({ plan_date: e.target.value })}
        disabled={disabled}
        InputLabelProps={{ shrink: true }}
        sx={{ width: 170 }}
      />
      <TextField
        size="small"
        label="Plan Name"
        value={doc.plan_name}
        onChange={(e) => onPatch({ plan_name: e.target.value })}
        disabled={disabled}
        sx={{ width: 220 }}
      />
      <SearchableOptionSelect
        label="Branch"
        size="small"
        disabled={disabled || branchOptions.length <= 1}
        options={branchOptions.map((b) => ({ value: b.branch_id, label: b.branch_name }))}
        value={doc.branch_id ?? ""}
        onChange={(selectedValue) => onPatch({ branch_id: selectedValue === "" ? null : Number(selectedValue) })}
        sx={{ minWidth: 200 }}
      />
      <TextField
        size="small"
        label="Remarks"
        value={doc.remarks}
        onChange={(e) => onPatch({ remarks: e.target.value })}
        disabled={disabled}
        sx={{ flexGrow: 1, minWidth: 240 }}
      />
    </Box>
  );
}
