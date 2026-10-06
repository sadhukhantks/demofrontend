"use client";

/**
 * Add machines — counts machines that attendance missed as worked for one date
 * and shift (spec §12.4 of vowerp3be
 * docs/superpowers/specs/2026-09-30-hands-norms-v2-machine-groups.md).
 *
 * A Department choice (optional) narrows both lists below — on a phone the
 * branch's machine list is too long to scroll.
 *
 * Two ways to pick, both optional, at least one machine in total:
 *   - Suggested: the loaded machine-shifts of that date and shift that have
 *     production entered but no worker marked — tick them, or "Select all".
 *   - Other machines: a searchable multi-select of every active machine of the
 *     branch, optionally narrowed by machine type and group.
 * A machine picked in both is sent once. The reason is required.
 *
 * Presentational: it owns its form state (re-seeded each time it opens),
 * validates with the Zod schema in ../_service and hands the parsed form back
 * through `onSave`; the page does the API call and the toast. It stays open on
 * a failed save so nothing typed is lost.
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormHelperText,
  LinearProgress,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { DIALOG_ACTIONS_SX } from "@/components/ui/responsiveEntry";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import { SearchableMultiSelect } from "@/components/ui/SearchableSelect";
import { todayIso } from "@/components/reports/reportDates";
import {
  branchMachineDepartmentOptions,
  branchMachineFilterOptions,
  branchMachineLabel,
  filterBranchMachines,
  isOverrideShift,
  OVERRIDE_REASON_MAX,
  OVERRIDE_SHIFT_OPTIONS,
  overrideDateBounds,
  suggestedMachines,
  uniqueMachineIds,
  validateMachineOverride,
  type BranchMachine,
  type MachineOverrideErrors,
  type MachineOverrideForm,
  type MachineWorkedRow,
} from "../_service";

export interface AddMachinesDialogProps {
  open: boolean;
  /** Every loaded machine-shift (not the filtered grid) — the Suggested list is read off these. */
  rows: MachineWorkedRow[];
  /** The loaded From–To window; the date is limited to it and opens on From. */
  dateFrom: string;
  dateTo: string;
  /** Shift the dialog opens on ("" = none picked) — the tab's Shift filter. */
  defaultShift: string;
  /** Every active machine of the branch; loaded lazily by the page on first open. */
  machines: ReadonlyArray<BranchMachine>;
  machinesLoading: boolean;
  machinesError: string | null;
  saving: boolean;
  onClose: () => void;
  onSave: (form: MachineOverrideForm) => void;
}

const NO_IDS: readonly number[] = Object.freeze([]);
const NO_ERRORS: MachineOverrideErrors = Object.freeze({});

/** "Loom · 120 kg · 4 cuts" — what tells two suggested machines apart. */
function suggestionDetail(row: MachineWorkedRow): string {
  return [
    row.machine_type,
    row.prod_kg != null ? `${Number(row.prod_kg.toFixed(2))} kg` : null,
    row.prod_cuts != null ? `${Number(row.prod_cuts.toFixed(2))} cuts` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export default function AddMachinesDialog({
  open,
  rows,
  dateFrom,
  dateTo,
  defaultShift,
  machines,
  machinesLoading,
  machinesError,
  saving,
  onClose,
  onSave,
}: AddMachinesDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));

  const [date, setDate] = useState(dateFrom);
  const [shift, setShift] = useState("");
  const [suggestedIds, setSuggestedIds] = useState<readonly number[]>(NO_IDS);
  const [pickedIds, setPickedIds] = useState<readonly number[]>(NO_IDS);
  const [deptFilter, setDeptFilter] = useState<number | "">("");
  const [typeFilter, setTypeFilter] = useState<number | "">("");
  const [groupFilter, setGroupFilter] = useState<number | "">("");
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);

  // Re-seed on every open: a dialog reopened for another shift must not carry
  // the previous one's ticks.
  useEffect(() => {
    if (!open) return;
    setDate(dateFrom);
    setShift(isOverrideShift(defaultShift) ? defaultShift : "");
    setSuggestedIds(NO_IDS);
    setPickedIds(NO_IDS);
    setDeptFilter("");
    setTypeFilter("");
    setGroupFilter("");
    setReason("");
    setSubmitted(false);
  }, [open, dateFrom, defaultShift]);

  const dateWindow = useMemo(() => ({ from: dateFrom, to: dateTo, today: todayIso() }), [dateFrom, dateTo]);
  const bounds = useMemo(() => overrideDateBounds(dateWindow), [dateWindow]);

  const departmentOptions = useMemo(() => branchMachineDepartmentOptions(machines, rows), [machines, rows]);
  const suggestions = useMemo(
    () =>
      suggestedMachines(rows, date, shift).filter((r) => deptFilter === "" || r.dept_id === deptFilter),
    [rows, date, shift, deptFilter],
  );
  const suggestedSet = useMemo(() => new Set(suggestedIds), [suggestedIds]);
  const allSuggested = suggestions.length > 0 && suggestions.every((r) => suggestedSet.has(r.machine_id));

  const pickedSet = useMemo(() => new Set(pickedIds), [pickedIds]);
  // Machine type and Group offer only what the chosen department has.
  const filterOptions = useMemo(
    () =>
      branchMachineFilterOptions(
        deptFilter === "" ? machines : machines.filter((m) => m.dept_id === deptFilter),
      ),
    [machines, deptFilter],
  );
  const machineOptions = useMemo(
    () =>
      filterBranchMachines(
        machines,
        { machineTypeId: typeFilter, groupId: groupFilter, deptId: deptFilter },
        pickedSet,
      ),
    [machines, typeFilter, groupFilter, deptFilter, pickedSet],
  );
  const pickedMachines = useMemo(
    () => machines.filter((m) => pickedSet.has(m.machine_id)),
    [machines, pickedSet],
  );

  const machineIds = useMemo(() => uniqueMachineIds(suggestedIds, pickedIds), [suggestedIds, pickedIds]);
  const input = useMemo(
    () => ({ tran_date: date, shift, machine_ids: machineIds, action: "ADD" as const, reason }),
    [date, shift, machineIds, reason],
  );
  const errors: MachineOverrideErrors = useMemo(() => {
    if (!submitted) return NO_ERRORS;
    const result = validateMachineOverride(input, dateWindow);
    return result.ok ? NO_ERRORS : result.errors;
  }, [submitted, input, dateWindow]);

  // The Suggested list belongs to one date and shift: changing either starts it over.
  const changeDate = (next: string) => {
    setDate(next);
    setSuggestedIds(NO_IDS);
  };
  const changeShift = (next: string) => {
    setShift(next);
    setSuggestedIds(NO_IDS);
  };
  // A new department shows another set of machines: the ticks of the hidden
  // suggestions go, and a type / group that department may not have is cleared.
  // Machines already picked under "Other machines" stay (they show as chips).
  const changeDept = (next: number | "") => {
    setDeptFilter(next);
    setSuggestedIds(NO_IDS);
    setTypeFilter("");
    setGroupFilter("");
  };
  const toggleSuggested = (machineId: number, checked: boolean) =>
    setSuggestedIds((ids) => (checked ? uniqueMachineIds(ids, [machineId]) : ids.filter((id) => id !== machineId)));
  const toggleAllSuggested = (checked: boolean) =>
    setSuggestedIds(checked ? suggestions.map((r) => r.machine_id) : NO_IDS);

  const handleSave = () => {
    setSubmitted(true);
    const result = validateMachineOverride(input, dateWindow);
    if (result.ok) onSave(result.data);
  };

  const count = machineIds.length;

  return (
    <Dialog
      open={open}
      onClose={saving ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      fullScreen={fullScreen}
      aria-labelledby="add-machines-title"
    >
      <DialogTitle id="add-machines-title">Add machines worked</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: "grid", gap: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Counts machines that worked but have no worker marked in attendance. Each one is kept with your
            reason and can be undone.
          </Typography>

          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" }}>
            <TextField
              type="date"
              label="Date"
              size="small"
              required
              value={date}
              onChange={(e) => changeDate(e.target.value)}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: bounds.min, max: bounds.max } }}
              error={!!errors.tran_date}
              helperText={errors.tran_date}
            />
            <SearchableOptionSelect<string>
              label="Shift"
              size="small"
              required
              fullWidth
              clearable={false}
              options={OVERRIDE_SHIFT_OPTIONS}
              value={shift}
              onChange={changeShift}
              error={!!errors.shift}
              helperText={errors.shift}
            />
          </Box>

          <SearchableOptionSelect<number>
            label="Department"
            size="small"
            fullWidth
            placeholder="All departments"
            noOptionsText="No departments"
            options={departmentOptions}
            value={deptFilter}
            onChange={changeDept}
            helperText="Narrows the suggested machines and the machine list below"
          />

          <Box>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
              <Typography variant="subtitle2">
                Suggested{suggestions.length ? ` (${suggestions.length})` : ""}
              </Typography>
              {suggestions.length > 0 ? (
                <FormControlLabel
                  sx={{ mr: 0 }}
                  control={
                    <Checkbox
                      size="small"
                      checked={allSuggested}
                      indeterminate={!allSuggested && suggestions.some((r) => suggestedSet.has(r.machine_id))}
                      onChange={(e) => toggleAllSuggested(e.target.checked)}
                    />
                  }
                  label="Select all"
                />
              ) : null}
            </Box>
            <Typography variant="caption" color="text.secondary">
              Production entered, no worker marked.
            </Typography>
            {suggestions.length > 0 ? (
              <Box
                role="group"
                aria-label="Suggested machines"
                sx={{
                  mt: 0.5,
                  maxHeight: { xs: 220, sm: 260 },
                  overflowY: "auto",
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1,
                  px: 1,
                }}
              >
                {suggestions.map((r) => (
                  <FormControlLabel
                    key={r.machine_id}
                    sx={{ display: "flex", mr: 0, py: 0.25, alignItems: "flex-start" }}
                    control={
                      <Checkbox
                        size="small"
                        checked={suggestedSet.has(r.machine_id)}
                        onChange={(e) => toggleSuggested(r.machine_id, e.target.checked)}
                      />
                    }
                    label={
                      <Box sx={{ pt: 0.75 }}>
                        <Typography variant="body2">
                          {r.machine}
                          {r.mech_code ? ` (${r.mech_code})` : ""}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {suggestionDetail(r)}
                        </Typography>
                      </Box>
                    }
                  />
                ))}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {shift
                  ? deptFilter === ""
                    ? "No suggestions for this date and shift."
                    : "No suggestions for this date, shift and department."
                  : "Pick a shift to see the machines suggested for it."}
              </Typography>
            )}
          </Box>

          <Box sx={{ borderTop: 1, borderColor: "divider", pt: 2, display: "grid", gap: 2 }}>
            <Typography variant="subtitle2">Other machines</Typography>
            {machinesLoading ? <LinearProgress /> : null}
            {machinesError ? <Alert severity="warning">{machinesError}</Alert> : null}
            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" }}>
              <SearchableOptionSelect<number>
                label="Machine type"
                size="small"
                fullWidth
                placeholder="All"
                options={filterOptions.machineTypes}
                value={typeFilter}
                onChange={setTypeFilter}
              />
              <SearchableOptionSelect<number>
                label="Group"
                size="small"
                fullWidth
                placeholder="All"
                noOptionsText="No machine groups in this branch"
                options={filterOptions.groups}
                value={groupFilter}
                onChange={setGroupFilter}
              />
            </Box>
            <SearchableMultiSelect<BranchMachine>
              variant="outlined"
              size="small"
              label="Machines"
              placeholder={pickedIds.length ? undefined : "Type to find a machine"}
              options={machineOptions}
              value={pickedMachines}
              onChange={(picked) => setPickedIds(picked.map((m) => m.machine_id))}
              getOptionLabel={branchMachineLabel}
              getOptionKey={(m) => m.machine_id}
              isOptionEqualToValue={(o, v) => o.machine_id === v.machine_id}
              loading={machinesLoading}
              noOptionsText={machinesLoading ? "Loading machines…" : "No matching machine"}
            />
          </Box>

          <Box>
            <Typography variant="body2" color={errors.machine_ids ? "error" : "text.secondary"}>
              {count} machine{count === 1 ? "" : "s"} selected
            </Typography>
            {errors.machine_ids ? <FormHelperText error>{errors.machine_ids}</FormHelperText> : null}
          </Box>

          <TextField
            label="Reason"
            size="small"
            required
            multiline
            minRows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            slotProps={{ htmlInput: { maxLength: OVERRIDE_REASON_MAX } }}
            error={!!errors.reason}
            helperText={errors.reason ?? "Why these machines count — kept with your name and the time"}
          />
        </Box>
      </DialogContent>
      <DialogActions sx={DIALOG_ACTIONS_SX}>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : count > 0 ? `Save (${count})` : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
