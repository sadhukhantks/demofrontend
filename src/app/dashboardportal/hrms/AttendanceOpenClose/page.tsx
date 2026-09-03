"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Snackbar,
  TextField,
  Typography,
} from "@mui/material";
import type { GridColDef, GridPaginationModel } from "@mui/x-data-grid";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import MuiDataGrid from "@/components/ui/muiDataGrid";
import MuiForm, {
  type Field,
  type MuiFormHandle,
  type Option,
  type Schema,
} from "@/components/ui/muiform";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import { todayIso } from "@/components/reports/reportDates";
import {
  fetchAttendanceOpenCloseStatus,
  submitAttendanceOpenClose,
  type AttendanceOpenCloseRow,
} from "@/utils/hrmsService";

/**
 * HRMS Attendance Open/Close — bulk-toggles a whole
 * (branch, date, spell, department) slice of `daily_attendance` between
 * Open (status 1) and Closed (status 3).
 *
 * Attendance is written Closed, so "Open" is what unlocks a day for
 * correction and "Close" locks it again. Opening prompts for the shared
 * password held in `attendance_open_close_password` — it unlocks finalised
 * records, so the menu permission alone isn't the only brake. Closing only
 * asks for confirmation: it restores the state attendance is written in.
 *
 * Department offers an "All Departments" entry for Close only, so a whole
 * spell can be locked in one shot. Opening stays one department at a time.
 *
 * Spell and Department are populated from the day's attendance itself, not from
 * spell_mst / sub_dept_mst — offering a spell or department that never marked
 * the date would just be a dead end. One fetch per branch + date backs both
 * lists and the grid.
 *
 * The grid below the form is a read-only roll-up of *every* department that has
 * attendance for the selected branch/date/spell, so you can see what is still
 * open without toggling anything.
 */

const ACTION_OPTIONS: Option[] = [
  { label: "Open", value: "open" },
  { label: "Close", value: "close" },
];

/** Department sentinel the backend reads as "every department of the spell". */
const DEPT_ALL = "all";

/** Mirrors OPEN_WINDOW_HOURS in vowerp3be/src/hrms/attendance.py — display only,
 *  the backend is the one that actually enforces it. */
const OPEN_WINDOW_HOURS = 96;

// Module-level so the grid receives the same identity on every render. Fresh
// object/function literals in JSX make it re-process its row and locale state
// each pass, which it has no way to tell apart from a real change.
const GRID_PAGE_SIZES = [25, 50, 100];
const GRID_LOCALE_TEXT = {
  noRowsLabel: "Select a branch, date and spell to see department status",
};

interface FilterValues {
  branch_id: string;
  attendance_date: string;
  /** The spell NAME — that is the key the day's attendance groups by, and the
   *  only one present on rows written before spell_id existed. The numeric
   *  spell_id the update needs is looked up from the selected group. */
  spell: string;
  worked_department_id: string;
  action: string;
}

const INITIAL_FILTERS: FilterValues = {
  branch_id: "",
  attendance_date: "",
  spell: "",
  worked_department_id: "",
  action: "",
};

const submitSchema = z.object({
  branch_id: z.string().min(1, "Please select the Branch"),
  attendance_date: z.string().min(1, "Please select the Date"),
  spell: z.string().min(1, "Please select the Spell"),
  worked_department_id: z.string().min(1, "Please select the Department"),
  action: z.enum(["open", "close"], { message: "Please select Open or Close" }),
});

export default function AttendanceOpenClosePage() {
  const { selectedCompany, selectedBranches } = useSidebarContext();
  const formRef = useRef<MuiFormHandle>(null);

  const [filters, setFilters] = useState<FilterValues>(INITIAL_FILTERS);
  // Every (spell, department) with attendance on the selected branch + date.
  // Both dropdowns and the grid are views onto this one fetch.
  const [dayRows, setDayRows] = useState<AttendanceOpenCloseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 25,
  });
  const [pwdOpen, setPwdOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error" | "info";
  }>({ open: false, message: "", severity: "success" });

  const notify = useCallback(
    (message: string, severity: "success" | "error" | "info" = "info") =>
      setSnackbar({ open: true, message, severity }),
    [],
  );

  // Branch comes from the sidebar, not from a free list of the company's
  // branches — the grid and the update are both branch-scoped, so letting the
  // field drift away from the sidebar selection would show one branch's
  // attendance while every other page on screen talks about another.
  const branchOptions = useMemo<Option[]>(
    () =>
      (selectedCompany?.branches ?? [])
        .filter((b) => selectedBranches.includes(b.branch_id))
        .map((b) => ({ label: b.branch_name, value: String(b.branch_id) })),
    [selectedCompany, selectedBranches],
  );

  // Seed it once the option exists. The sidebar hydrates from localStorage
  // after mount, so this cannot run during the first render without risking an
  // SSR mismatch. Re-runs whenever the sidebar selection changes.
  const sidebarBranchId =
    selectedBranches.length > 0 ? String(selectedBranches[0]) : "";
  useEffect(() => {
    if (!sidebarBranchId) return;
    if (!branchOptions.some((o) => String(o.value) === sidebarBranchId)) return;
    formRef.current?.setValue("branch_id", sidebarBranchId);
  }, [sidebarBranchId, branchOptions]);

  // Default the date to today — set after mount, never during render: the
  // server and the browser can straddle midnight or sit in different
  // timezones, and baking "today" into the SSR output breaks hydration.
  useEffect(() => {
    formRef.current?.setValue("attendance_date", todayIso());
  }, []);

  /** One fetch per branch + date — picking a spell, department or Open/Close
   *  filters what is already loaded instead of going back to the server. */
  const { branch_id, attendance_date } = filters;
  const loadStatus = useCallback(async () => {
    if (!branch_id || !attendance_date) {
      setDayRows([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetchAttendanceOpenCloseStatus({
        branch_id,
        attendance_date,
      });
      if (res.error || !res.data) {
        throw new Error(res.error || "Failed to load attendance status");
      }
      setDayRows(res.data.data ?? []);
    } catch (err: unknown) {
      setDayRows([]);
      notify(
        err instanceof Error ? err.message : "Failed to load attendance status",
        "error",
      );
    } finally {
      setLoading(false);
    }
  }, [branch_id, attendance_date, notify]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  // Spells that actually have attendance on this date, in the order the query
  // returned them. Keyed by name, not id: rows written before spell_id existed
  // carry only the name, and both kinds group under the same label.
  const spellOptions = useMemo<Option[]>(() => {
    const names = new Set(dayRows.map((r) => r.spell_name));
    return [...names].map((name) => ({ label: name, value: name }));
  }, [dayRows]);

  /** Rows of the selected spell — drives both the Department list and the grid.
   *  The grid is already filtered to one spell, so the department is the unique
   *  row key; -1 is the "no department" bucket. */
  const spellRows = useMemo(
    () =>
      dayRows
        .filter((r) => r.spell_name === filters.spell)
        .map((r) => ({ ...r, id: r.dept_id ?? -1 })),
    [dayRows, filters.spell],
  );

  // Departments that marked this spell. dept_id is null for attendance with no
  // worked_department_id — it shows in the grid but cannot be picked on its own
  // (there is no id to send).
  //
  // "All Departments" is offered for Close only, and the backend refuses it on
  // open too: locking a whole spell down is safe, unlocking one wholesale is
  // what the per-department step exists to prevent.
  const deptOptions = useMemo<Option[]>(() => {
    if (spellRows.length === 0) return [];
    const individual = spellRows
      .filter((r) => r.dept_id != null)
      .map((r) => ({ label: r.dept_name, value: String(r.dept_id) }));
    return filters.action === "close"
      ? [{ label: "All Departments", value: DEPT_ALL }, ...individual]
      : individual;
  }, [spellRows, filters.action]);

  /** The numeric spell_id behind the selected name, or null when every row of
   *  the group predates spell_id and the backfill found the name ambiguous. */
  const selectedSpellId = useMemo(
    () => spellRows.find((r) => r.spell_id != null)?.spell_id ?? null,
    [spellRows],
  );

  const schema = useMemo<Schema>(
    () => ({
      fields: [
        // Read-only when the sidebar has a single branch selected — there is
        // nothing to choose between, and it should never disagree with it.
        { name: "branch_id", label: "Branch", type: "select", options: branchOptions, required: true, readOnly: branchOptions.length <= 1, grid: { xs: 12, sm: 6, md: 3 } },
        { name: "attendance_date", label: "Date", type: "date", required: true, grid: { xs: 12, sm: 6, md: 3 } },
        // Spell and Department come from the day's attendance, so the lists are
        // empty until a branch + date resolve to actual records.
        { name: "spell", label: "Spell", type: "select", options: spellOptions, required: true, grid: { xs: 12, sm: 6, md: 3 } },
        // Open/Close sits before Department because it decides what Department
        // offers — "All Departments" exists for Close only.
        { name: "action", label: "Open/Close", type: "select", options: ACTION_OPTIONS, required: true, grid: { xs: 12, sm: 6, md: 3 } },
        { name: "worked_department_id", label: "Department", type: "select", options: deptOptions, required: true, grid: { xs: 12, sm: 6, md: 3 } },
      ] satisfies Field[],
    }),
    // Deliberately NOT dependent on `loading`: MuiForm re-runs getInitialValues
    // whenever the serialised schema changes, so a schema that churns with
    // fetch state would reset the form's own values mid-fetch.
    [branchOptions, spellOptions, deptOptions],
  );

  const noAttendance =
    Boolean(attendance_date) && !loading && dayRows.length === 0;

  // MuiForm's onValuesChange fires with the FULL values object on every change,
  // so each cascade level only clears when its own key actually moved.
  const prevDayKeyRef = useRef("");
  const prevSpellRef = useRef("");
  const handleValuesChange = useCallback((vals: Record<string, unknown>) => {
    const incoming = vals as Partial<FilterValues>;
    setFilters((prev) => ({ ...prev, ...incoming }));

    // A new branch or date reloads the day, so the old spell/department are
    // meaningless — they may not even exist in the new day's attendance.
    const dayKey = `${incoming.branch_id ?? ""}|${incoming.attendance_date ?? ""}`;
    if (dayKey !== prevDayKeyRef.current) {
      prevDayKeyRef.current = dayKey;
      formRef.current?.setValue("spell", "");
      formRef.current?.setValue("worked_department_id", "");
    }
    if (
      typeof incoming.spell === "string" &&
      incoming.spell !== prevSpellRef.current
    ) {
      prevSpellRef.current = incoming.spell;
      formRef.current?.setValue("worked_department_id", "");
    }
    // "All Departments" only exists for Close — switching to Open drops it
    // rather than leaving a selection the option list no longer offers.
    if (
      incoming.action !== "close" &&
      incoming.worked_department_id === DEPT_ALL
    ) {
      formRef.current?.setValue("worked_department_id", "");
    }
  }, []);

  const handleSubmit = useCallback(() => {
    const parsed = submitSchema.safeParse(filters);
    if (!parsed.success) {
      notify(parsed.error.issues[0]?.message ?? "Invalid selection", "error");
      return;
    }
    if (selectedSpellId == null) {
      notify(
        `Spell "${filters.spell}" cannot be resolved to a spell master record, so its attendance cannot be opened or closed here`,
        "error",
      );
      return;
    }
    setPassword("");
    setPwdOpen(true);
  }, [filters, selectedSpellId, notify]);

  const handleConfirm = useCallback(async () => {
    const parsed = submitSchema.safeParse(filters);
    if (!parsed.success || selectedSpellId == null) return;
    const isOpen = parsed.data.action === "open";
    if (isOpen && !password) {
      notify("Please enter the password", "error");
      return;
    }
    setSubmitting(true);
    try {
      const res = await submitAttendanceOpenClose({
        branch_id: parsed.data.branch_id,
        attendance_date: parsed.data.attendance_date,
        worked_department_id: parsed.data.worked_department_id,
        action: parsed.data.action,
        // Both spell keys go up: the id catches modern rows, the name catches
        // the ones written before spell_id existed.
        spell_id: selectedSpellId,
        spell_name: parsed.data.spell,
        // Closing needs no password — the backend only checks it on open.
        ...(isOpen ? { password } : {}),
      });
      if (res.error || !res.data) {
        throw new Error(res.error || "Failed to update attendance status");
      }
      setPwdOpen(false);
      setPassword("");
      notify(res.data.message, "success");
      await loadStatus();
    } catch (err: unknown) {
      notify(
        err instanceof Error ? err.message : "Failed to update attendance status",
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  }, [filters, password, selectedSpellId, loadStatus, notify]);

  const confirmDeptLabel =
    deptOptions.find((o) => String(o.value) === filters.worked_department_id)
      ?.label ?? "";

  const columns = useMemo<GridColDef<AttendanceOpenCloseRow>[]>(
    () => [
      { field: "dept_name", headerName: "Department", flex: 2, minWidth: 220 },
      { field: "attendance_date", headerName: "Date", width: 130 },
      { field: "spell_name", headerName: "Spell", width: 150 },
      {
        field: "status",
        headerName: "Status",
        width: 130,
        renderCell: (params) => (
          <Chip
            size="small"
            label={params.row.status}
            color={params.row.status === "Open" ? "success" : "default"}
          />
        ),
      },
      {
        field: "total_count",
        headerName: "Records",
        type: "number",
        width: 110,
      },
    ],
    [],
  );

  return (
    // Same page shell as the other HRMS pages (payroll, attendance checklist).
    <Box className="flex min-h-screen flex-col gap-6 bg-gray-50 p-8">
      <Box className="flex flex-col gap-1">
        <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
          Attendance Open / Close
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Open a day&apos;s attendance for correction, or close it again
        </Typography>
      </Box>

      <Paper className="p-4">
        <MuiForm
          ref={formRef}
          schema={schema}
          mode="create"
          hideModeToggle
          hideSubmit
          onValuesChange={handleValuesChange}
        />
        <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 1 }}>
          <Button onClick={handleSubmit}>Submit</Button>
        </Box>
      </Paper>

      {noAttendance ? (
        <Alert severity="info">
          No attendance recorded for this branch on {attendance_date}.
        </Alert>
      ) : null}

      <Paper className="p-4">
        <MuiDataGrid
          rows={spellRows}
          columns={columns}
          rowCount={spellRows.length}
          paginationMode="client"
          paginationModel={paginationModel}
          onPaginationModelChange={setPaginationModel}
          pageSizeOptions={GRID_PAGE_SIZES}
          localeText={GRID_LOCALE_TEXT}
          loading={loading}
          showLoadingUntilLoaded
        />
      </Paper>

      <Dialog open={pwdOpen} onClose={() => setPwdOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>
          Confirm {filters.action === "open" ? "Open" : "Close"}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1 }}>
            {filters.action === "open" ? "Open" : "Close"} attendance for{" "}
            <b>{confirmDeptLabel}</b> — {filters.spell}, {filters.attendance_date}
            .
          </Typography>
          {/* Password gates the open direction only: it unlocks finalised
              records, while closing just puts them back as they were written. */}
          {filters.action === "open" && (
            <>
              <Alert severity="info" sx={{ mb: 1 }}>
                Only records created within the last {OPEN_WINDOW_HOURS} hours
                can be re-opened.
              </Alert>
              <TextField
                autoFocus
                fullWidth
                type="password"
                label="Password"
                margin="dense"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !submitting) void handleConfirm();
                }}
              />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button variant="outline" onClick={() => setPwdOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => void handleConfirm()} disabled={submitting}>
            {submitting ? "Updating..." : "Confirm"}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          sx={{ width: "100%" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
