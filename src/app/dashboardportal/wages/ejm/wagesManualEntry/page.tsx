"use client";

import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Box,
  IconButton,
  Paper,
  Snackbar,
  TextField,
  Typography,
} from "@mui/material";
import { Pencil, Trash2 } from "lucide-react";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { BranchScopePicker } from "@/components/reports/BranchScopePicker";
import { useReportBranches } from "@/components/reports/useReportBranches";
import { useMounted } from "@/components/reports/useMounted";
import { fetchPaySchemeList } from "@/utils/hrmsService";
import type { ForthnightPeriod } from "../efffneCodeEntry/types";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";

/** Rows this page owns — tbl_ejm_wages_data_collection.update_for. */
const MANUAL_UPDATE_FOR = "Manual";

/** Hand-entered columns — must match the backend's MANUAL_FIELDS (ejmWagesData.py). */
const MANUAL_FIELDS = [
  ["working_hours", "Work Hrs"],
  ["ot_hours", "OT Hrs"],
  ["ns_hours", "NS Hrs"],
  ["fest_hours", "Fest Hrs"],
  ["stl_days", "STL Days"],
  ["working_hours_eff", "Work Hrs Eff"],
  ["ot_hours_eff", "OT Hrs Eff"],
  ["ot_ns_hours", "OT NS Hrs"],
  ["ns_hrs_eff", "NS Hrs Eff"],
  ["puja_advance", "Puja Adv"],
  ["ot_advance", "OT Adv"],
  ["stl_advance", "STL Adv"],
  ["co_loan", "CO Loan"],
  ["misc_earn", "Misc Earn"],
  ["misc_ded", "Misc Ded"],
  ["misc_ot_earn", "Misc OT Earn"],
  ["misc_ot_ded", "Misc OT Ded"],
] as const;

type ManualField = (typeof MANUAL_FIELDS)[number][0];

type WagesRow = {
  data_collection_id: number;
  eb_id: number;
  eb_no: string;
  emp_name: string;
} & Record<ManualField, number | null>;

interface Employee {
  eb_id: number;
  eb_no: string;
  emp_name: string;
}

const EMPTY_AMOUNTS = Object.freeze(
  Object.fromEntries(MANUAL_FIELDS.map(([f]) => [f, ""])) as Record<
    ManualField,
    string
  >,
);

const filterSchema = z.object({
  date_from: z.string().min(1, "Please select the Fortnight Period"),
  date_to: z.string().min(1, "Please select the Fortnight Period"),
  pay_scheme_id: z.string().min(1, "Please select the Pay Scheme"),
});

type Filters = z.infer<typeof filterSchema>;

interface PaySchemeOption {
  label: string;
  value: string;
}

const formatPeriod = (p: ForthnightPeriod) =>
  `${p.start_date} → ${p.end_date}${p.type_of_period === 1 ? " (1st half)" : " (2nd half)"}`;

const amountSchema = z.record(
  z.string(),
  z
    .string()
    .refine(
      (v) => v === "" || !Number.isNaN(Number(v)),
      "Values must be numbers",
    ),
);

/** Manual wages entries for one wage period + pay scheme: pick an employee of
 *  the scheme, key in hours / efficiency / advances, and the row is saved with
 *  update_for 'Manual'. Only those rows are listed here; the Wages Data Process
 *  never touches them. */
function WagesManualEntry() {
  // DataGrid updates its own state while mounting; rendering it before the page
  // has mounted raises "Can't perform a React state update on a component that
  // hasn't mounted yet" (same guard as components/ui/muiDataGrid.tsx).
  const mounted = useMounted();
  // Branch scope comes from the sidebar; the picker only appears when more than
  // one branch is in scope (standing norm in CLAUDE.md).
  const { branches, coId, initialBranchId } = useReportBranches();
  const [branchId, setBranchId] = useState<number | null>(initialBranchId);
  useEffect(() => {
    if (branchId === null && initialBranchId !== null)
      setBranchId(initialBranchId);
  }, [initialBranchId, branchId]);

  const [periods, setPeriods] = useState<ForthnightPeriod[]>([]);
  const [period, setPeriod] = useState<ForthnightPeriod | null>(null);
  const [paySchemes, setPaySchemes] = useState<PaySchemeOption[]>([]);
  const [payScheme, setPayScheme] = useState<PaySchemeOption | null>(null);
  const filters = useMemo<Filters>(
    () => ({
      date_from: period?.start_date ?? "",
      date_to: period?.end_date ?? "",
      pay_scheme_id: payScheme?.value ?? "",
    }),
    [period, payScheme],
  );
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [amounts, setAmounts] =
    useState<Record<ManualField, string>>(EMPTY_AMOUNTS);
  const [rows, setRows] = useState<WagesRow[]>([]);
  const [busy, setBusy] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  // The row loaded into the form for editing; null = the form adds a new row.
  const [editing, setEditing] = useState<WagesRow | null>(null);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error" | "warning";
  }>({ open: false, message: "", severity: "success" });
  const notify = useCallback(
    (message: string, severity: "success" | "error" | "warning") =>
      setSnackbar({ open: true, message, severity }),
    [],
  );

  useEffect(() => {
    (async () => {
      const { data, error } = await fetchWithCookie<{
        data: ForthnightPeriod[];
      }>(apiRoutesPortalMasters.FORTHNIGHT_PERIODS, "GET");
      if (error || !data) {
        notify(error || "Failed to load fortnight periods", "error");
        return;
      }
      const list = data.data ?? [];
      setPeriods(list);
      setPeriod((current) => current ?? list[0] ?? null);
    })();
  }, [notify]);

  useEffect(() => {
    setPayScheme(null);
    if (coId === null) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await fetchPaySchemeList(String(coId), {
        page_size: 200,
      });
      if (cancelled) return;
      if (error || !data) {
        notify(error || "Failed to load pay schemes", "error");
        return;
      }
      setPaySchemes(
        (data.data ?? [])
          .filter((r: Record<string, unknown>) =>
            [1, 32].includes(Number(r.record_status)),
          )
          .map((r: Record<string, unknown>) => ({
            label: String(r.payscheme_name ?? r.payscheme_code ?? ""),
            value: String(r.payscheme_id),
          })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [coId, notify]);

  // EB No list follows the pay scheme (and sidebar branch — emp_code repeats across branches).
  useEffect(() => {
    setEmployee(null);
    setEditing(null);
    setAmounts(EMPTY_AMOUNTS);
    setEmployees([]);
    if (!filters.pay_scheme_id) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await fetchWithCookie<{ data: Employee[] }>(
        apiRoutesPortalMasters.EJM_WAGES_SCHEME_EMPLOYEES,
        "POST",
        { pay_scheme_id: filters.pay_scheme_id, branch_id: branchId ?? null },
      );
      if (cancelled) return;
      if (error) notify(error, "error");
      else setEmployees(data?.data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [filters.pay_scheme_id, branchId, notify]);

  const loadRows = useCallback(
    async (f: Filters) => {
      const { data, error } = await fetchWithCookie<{ data: WagesRow[] }>(
        apiRoutesPortalMasters.EJM_WAGES_DATA_LIST,
        "POST",
        { ...f, update_for: MANUAL_UPDATE_FOR },
      );
      if (error) notify(error, "error");
      else setRows(data?.data ?? []);
    },
    [notify],
  );

  // Re-list whenever the period / scheme is complete and valid.
  useEffect(() => {
    const parsed = filterSchema.safeParse(filters);
    if (parsed.success) void loadRows(parsed.data);
    else setRows([]);
  }, [filters, loadRows]);

  const resetForm = useCallback(() => {
    setEditing(null);
    setEmployee(null);
    setAmounts(EMPTY_AMOUNTS);
  }, []);

  const handleSave = useCallback(async () => {
    const parsed = filterSchema.safeParse(filters);
    if (!parsed.success) {
      notify(parsed.error.issues[0]?.message ?? "Invalid selection", "error");
      return;
    }
    if (!employee) {
      notify("Please select the EB No", "error");
      return;
    }
    const nums = amountSchema.safeParse(amounts);
    if (!nums.success) {
      notify(nums.error.issues[0]?.message ?? "Invalid values", "error");
      return;
    }
    const values = Object.fromEntries(
      MANUAL_FIELDS.map(([f]) => [f, Number(amounts[f] || 0)]),
    );
    setBusy(true);
    const { error } = editing
      ? await fetchWithCookie<{ message: string }>(
          `${apiRoutesPortalMasters.EJM_WAGES_DATA_UPDATE}/${editing.data_collection_id}`,
          "PUT",
          values,
        )
      : await fetchWithCookie<{ message: string }>(
          apiRoutesPortalMasters.EJM_WAGES_MANUAL_CREATE,
          "POST",
          { ...parsed.data, eb_id: employee.eb_id, ...values },
        );
    setBusy(false);
    if (error) {
      notify(error, "error");
      return;
    }
    notify(`${editing ? "Updated" : "Added"} ${employee.eb_no}`, "success");
    resetForm();
    await loadRows(parsed.data);
  }, [filters, employee, amounts, editing, notify, loadRows, resetForm]);

  /** Excel upload for the period: each row goes under the EB No's own pay
   *  scheme; EB Nos with no (or an ambiguous) scheme are skipped and named in
   *  the message. Re-uploading replaces an employee's earlier manual row. */
  const handleUpload = useCallback(
    async (file: File) => {
      if (!filters.date_from || !filters.date_to) {
        notify("Please select the Fortnight Period", "error");
        return;
      }
      const form = new FormData();
      form.append("file", file);
      form.append("date_from", filters.date_from);
      form.append("date_to", filters.date_to);
      if (branchId != null) form.append("branch_id", String(branchId));
      setBusy(true);
      const { data, error } = await fetchWithCookie<{
        message: string;
        no_scheme: string[];
        skipped: string[];
      }>(apiRoutesPortalMasters.EJM_WAGES_MANUAL_UPLOAD, "POST", form);
      setBusy(false);
      if (error || !data) {
        notify(error || "Upload failed", "error");
        return;
      }
      notify(
        data.message,
        data.no_scheme.length || data.skipped.length ? "warning" : "success",
      );
      resetForm();
      const parsed = filterSchema.safeParse(filters);
      if (parsed.success) await loadRows(parsed.data);
    },
    [filters, branchId, notify, loadRows, resetForm],
  );

  const handleEdit = useCallback((row: WagesRow) => {
    setEditing(row);
    setEmployee({ eb_id: row.eb_id, eb_no: row.eb_no, emp_name: row.emp_name });
    setAmounts(
      Object.fromEntries(
        MANUAL_FIELDS.map(([f]) => [f, row[f] == null ? "" : String(row[f])]),
      ) as Record<ManualField, string>,
    );
  }, []);

  // Persist an edited cell, or throw so the grid reverts it.
  const handleRowUpdate = useCallback(
    async (newRow: WagesRow) => {
      const payload: Record<string, number> = {};
      for (const [f] of MANUAL_FIELDS) payload[f] = Number(newRow[f] ?? 0);
      const { error } = await fetchWithCookie<{ message: string }>(
        `${apiRoutesPortalMasters.EJM_WAGES_DATA_UPDATE}/${newRow.data_collection_id}`,
        "PUT",
        payload,
      );
      if (error) {
        notify(error, "error");
        throw new Error(error);
      }
      notify(`Saved ${newRow.eb_no}`, "success");
      return newRow;
    },
    [notify],
  );

  const handleDelete = useCallback(
    async (row: WagesRow) => {
      if (!window.confirm(`Delete the manual entry for ${row.eb_no}?`)) return;
      const { error } = await fetchWithCookie<{ message: string }>(
        `${apiRoutesPortalMasters.EJM_WAGES_MANUAL_DELETE}/${row.data_collection_id}`,
        "DELETE",
      );
      if (error) {
        notify(error, "error");
        return;
      }
      setRows((prev) =>
        prev.filter((r) => r.data_collection_id !== row.data_collection_id),
      );
      if (editing?.data_collection_id === row.data_collection_id) resetForm();
      notify(`Deleted ${row.eb_no}`, "success");
    },
    [notify, editing, resetForm],
  );

  const columns = useMemo<GridColDef<WagesRow>[]>(
    () => [
      {
        field: "actions",
        headerName: "",
        width: 80,
        sortable: false,
        renderCell: ({ row }) => (
          <>
            <IconButton
              size="small"
              aria-label="Edit"
              onClick={() => handleEdit(row)}
            >
              <Pencil size={16} />
            </IconButton>
            <IconButton
              size="small"
              aria-label="Delete"
              onClick={() => void handleDelete(row)}
            >
              <Trash2 size={16} />
            </IconButton>
          </>
        ),
      },
      { field: "eb_no", headerName: "EB No", width: 90 },
      { field: "emp_name", headerName: "Name", width: 190 },
      ...MANUAL_FIELDS.map(([field, headerName]): GridColDef<WagesRow> => ({
        field,
        headerName,
        width: 100,
        type: "number",
        editable: true,
      })),
    ],
    [handleEdit, handleDelete],
  );

  return (
    <Box className="flex min-h-screen flex-col gap-6 bg-gray-50 p-8">
      <Box className="flex flex-col gap-1">
        <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
          Wages Manual Entries
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Pick the fortnight and pay scheme, then add an employee&apos;s hours,
          efficiency and advances
        </Typography>
      </Box>

      <Paper className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
        <BranchScopePicker
          branches={branches}
          value={branchId}
          onChange={setBranchId}
        />
        <Box className="w-full md:max-w-sm">
          <SearchableSelect<ForthnightPeriod>
            variant="outlined"
            label="Fortnight Period"
            options={periods}
            value={period}
            onChange={setPeriod}
            getOptionLabel={formatPeriod}
            isOptionEqualToValue={(o, v) => o.forthnight_id === v.forthnight_id}
            clearable={false}
          />
        </Box>
        <Box className="w-full md:max-w-sm">
          <SearchableSelect<PaySchemeOption>
            variant="outlined"
            label="Pay Scheme"
            options={paySchemes}
            value={payScheme}
            onChange={setPayScheme}
            getOptionLabel={(o) => o.label}
            isOptionEqualToValue={(o, v) => o.value === v.value}
          />
        </Box>
        <Button
          variant="outline"
          disabled={!filters.date_from || busy}
          title="Each EB No is saved under its own pay scheme. Excel (.xlsx) with an EB_NO column and WK_HRS, OT_HRS, NS_HRS, F_HRS, STL_DAYS, WRK_HRS_EFF, OT_HRS_EFF, OT_NS_HRS, NS_HRS_EFF, PUJA_AD, OT_AD, STL_AD, CO_LOAN, MISC_ER, MIS_DED, MIS_OT-ER, MIS_OT_DE columns"
          onClick={() => uploadRef.current?.click()}
        >
          Upload Excel
        </Button>
        <input
          ref={uploadRef}
          type="file"
          accept=".xlsx"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = ""; // allow re-picking the same file
            if (file) void handleUpload(file);
          }}
        />
      </Paper>

      <Paper className="p-4">
        <Box className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SearchableSelect<Employee>
            variant="outlined"
            size="small"
            label="EB No"
            required
            options={employees}
            value={employee}
            onChange={setEmployee}
            getOptionLabel={(o) => `${o.eb_no} — ${o.emp_name}`}
            isOptionEqualToValue={(o, v) => o.eb_id === v.eb_id}
            disabled={!filters.pay_scheme_id || editing !== null}
            noOptionsText={
              filters.pay_scheme_id
                ? "No employees on this pay scheme"
                : "Select a pay scheme first"
            }
          />
          <TextField
            size="small"
            label="Name"
            value={employee?.emp_name ?? ""}
            disabled
            className="sm:col-span-2"
          />
        </Box>
        <Box className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {MANUAL_FIELDS.map(([f, label]) => (
            <TextField
              key={f}
              size="small"
              type="number"
              label={label}
              value={amounts[f]}
              onChange={(e) =>
                setAmounts((prev) => ({ ...prev, [f]: e.target.value }))
              }
            />
          ))}
        </Box>
        <Box sx={{ mt: 2, display: "flex", gap: 1 }}>
          <Button onClick={() => void handleSave()} disabled={busy}>
            {busy ? "Saving..." : editing ? "Update" : "Add"}
          </Button>
          {editing && (
            <Button variant="outline" onClick={resetForm} disabled={busy}>
              Cancel
            </Button>
          )}
        </Box>
      </Paper>

      <Paper className="p-4">
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
          Manual entries — {rows.length} record{rows.length === 1 ? "" : "s"}
          {rows.length > 0 && " (double-click a cell to correct it)"}
        </Typography>
        {mounted && (
          <DataGrid
            rows={rows}
            columns={columns}
            getRowId={(row) => row.data_collection_id}
            autoHeight
            density="compact"
            pageSizeOptions={[25, 50, 100]}
            initialState={{ pagination: { paginationModel: { pageSize: 50 } } }}
            disableRowSelectionOnClick
            processRowUpdate={handleRowUpdate}
            onProcessRowUpdateError={() => undefined}
          />
        )}
      </Paper>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={snackbar.severity === "success" ? 3000 : 15000}
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

export default function WagesManualEntryPage() {
  // useReportBranches reads useSearchParams, so it needs a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <WagesManualEntry />
    </Suspense>
  );
}
