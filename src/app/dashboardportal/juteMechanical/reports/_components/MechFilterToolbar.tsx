"use client";
import React from "react";
import { Alert, Box, Button, Paper, TextField, Typography } from "@mui/material";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import type {
  MechEnumOption,
  MechMachineOption,
  MechMachineTypeOption,
} from "@/utils/juteMechanicalService";
import type { BranchOption } from "@/components/reports/types";
import type { MechReportFilters } from "./useMechReportFilters";
import { tokens } from "@/styles/tokens";

/** Which filter controls a given report shows. Branch is always rendered. */
export interface MechToolbarControls {
  dates?: boolean;
  machine?: boolean;
  machineType?: boolean;
  discipline?: boolean;
}

interface MechFilterToolbarProps {
  filters: MechReportFilters;
  show?: MechToolbarControls;
  /** Marks the machine picker required (the machine-history report needs one). */
  machineRequired?: boolean;
  onSubmit: () => void;
  onExport: () => void;
  loading: boolean;
  /** Disables Export (no rows loaded, or no branch chosen). */
  exportDisabled: boolean;
  submitLabel?: string;
  /** Extra controls (Top N, Due Within, Refresh) rendered before the buttons. */
  children?: React.ReactNode;
}

/**
 * The shared filter toolbar for every Jute Mechanical report: a `Paper`
 * flex-wrap row of searchable pickers and date fields, then Submit + Export.
 *
 * Every dropdown is a `SearchableSelect` — the repo standard is that a user can
 * always click a dropdown and type to filter it, and the machine list here runs
 * to hundreds of rows per branch.
 */
export default function MechFilterToolbar({
  filters,
  show = { dates: true },
  machineRequired = false,
  onSubmit,
  onExport,
  loading,
  exportDisabled,
  submitLabel = "Submit",
  children,
}: MechFilterToolbarProps) {
  const {
    branches,
    branch,
    setBranchId,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    machines,
    machineTypes,
    disciplines,
    selectedMachine,
    selectedMachineType,
    selectedDiscipline,
    setMachineId,
    setMachineTypeId,
    setDiscipline,
    setupError,
    branchId,
  } = filters;

  return (
    <>
      {setupError && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {setupError}
        </Alert>
      )}

      <Paper elevation={1} sx={{ mb: 2, p: 2 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            flexWrap: "wrap",
          }}
        >
          <Box sx={{ minWidth: 220 }}>
            <SearchableSelect<BranchOption>
              variant="outlined"
              label="Branch"
              size="small"
              options={branches}
              value={branch}
              onChange={(option) => setBranchId(option?.branch_id ?? null)}
              getOptionLabel={(option) => option.branch_name}
              getOptionKey={(option) => option.branch_id}
              isOptionEqualToValue={(option, value) =>
                option.branch_id === value.branch_id
              }
            />
          </Box>

          {show.machineType && (
            <Box sx={{ minWidth: 200 }}>
              <SearchableSelect<MechMachineTypeOption>
                variant="outlined"
                label="Machine Type"
                size="small"
                options={machineTypes}
                value={selectedMachineType}
                onChange={(option) =>
                  setMachineTypeId(option?.machine_type_id ?? null)
                }
                getOptionLabel={(option) => option.machine_type_name}
                getOptionKey={(option) => option.machine_type_id}
                isOptionEqualToValue={(option, value) =>
                  option.machine_type_id === value.machine_type_id
                }
              />
            </Box>
          )}

          {show.machine && (
            <Box sx={{ minWidth: 240 }}>
              <SearchableSelect<MechMachineOption>
                variant="outlined"
                label="Machine"
                size="small"
                required={machineRequired}
                options={machines}
                value={selectedMachine}
                onChange={(option) => setMachineId(option?.machine_id ?? null)}
                getOptionLabel={(option) =>
                  option.mech_code
                    ? `${option.machine_name} (${option.mech_code})`
                    : option.machine_name
                }
                getOptionKey={(option) => option.machine_id}
                isOptionEqualToValue={(option, value) =>
                  option.machine_id === value.machine_id
                }
              />
            </Box>
          )}

          {show.discipline && (
            <Box sx={{ minWidth: 180 }}>
              <SearchableSelect<MechEnumOption>
                variant="outlined"
                label="Discipline"
                size="small"
                options={disciplines}
                value={selectedDiscipline}
                onChange={(option) => setDiscipline(option?.code ?? null)}
                getOptionLabel={(option) => option.label}
                getOptionKey={(option) => option.code}
                isOptionEqualToValue={(option, value) =>
                  option.code === value.code
                }
              />
            </Box>
          )}

          {show.dates && (
            <>
              <TextField
                type="date"
                label="From Date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                size="small"
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ width: 170 }}
              />
              <TextField
                type="date"
                label="To Date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                size="small"
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ width: 170 }}
              />
            </>
          )}

          {children}

          <Button
            variant="contained"
            disabled={branchId == null || loading}
            onClick={onSubmit}
            sx={{
              backgroundColor: tokens.report.header,
              "&:hover": { backgroundColor: tokens.report.headerHover },
              textTransform: "none",
            }}
          >
            {submitLabel}
          </Button>

          <Button
            variant="outlined"
            disabled={exportDisabled}
            onClick={onExport}
            sx={{ textTransform: "none" }}
          >
            Export to Excel
          </Button>
        </Box>
      </Paper>
    </>
  );
}

/**
 * "12% of downtime unattributed" — the share of downtime logged against reason
 * code `NR` ("No Reason mentioned").
 *
 * Every summary-style report surfaces this: it is the metric that tells the
 * mill their reason data is degrading, and it must never be silently dropped.
 * Rendered in the theme's warning colour once it crosses a level worth acting
 * on, so nobody has to read the number to notice it.
 */
export function UnattributedCaption({
  value,
  label = "of downtime unattributed",
  warnAbovePct = 10,
}: {
  value: number | null;
  label?: string;
  warnAbovePct?: number;
}) {
  if (value === null || !Number.isFinite(value)) return null;
  const warn = value > warnAbovePct;
  return (
    <Typography
      variant="caption"
      sx={{
        display: "block",
        mb: 1,
        color: warn ? "warning.main" : "text.secondary",
        fontWeight: warn ? 700 : 400,
      }}
    >
      {value.toFixed(1)}% {label} (reason code &quot;NR&quot; — No Reason
      mentioned)
    </Typography>
  );
}

/** Page title in the house report style. */
export function MechReportTitle({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="h5" sx={{ color: tokens.report.header, fontWeight: "bold", mb: 1 }}>
      {children}
    </Typography>
  );
}
