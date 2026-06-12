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
  Chip,
  Paper,
  Snackbar,
  Typography,
} from "@mui/material";
import {
  DataGrid,
  type GridColDef,
  type GridPaginationModel,
} from "@mui/x-data-grid";
import { Button } from "@/components/ui/button";
import MuiForm, {
  type Field,
  type MuiFormHandle,
  type Schema,
} from "@/components/ui/muiform";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import { fetchAttendanceRegister } from "@/utils/hrmsService";
import {
  checklistFilterSchema,
  mapReportRows,
} from "./utils/checklistUtils";
import type {
  AttendanceReportResponse,
  ChecklistFilterValues,
  ChecklistGridRow,
  Option,
} from "./types/attendanceChecklistTypes";

const EMPTY_OPTIONS: Option[] = Object.freeze([]) as unknown as Option[];

const INITIAL_FILTERS: ChecklistFilterValues = {
  from_date: "",
  to_date: "",
  branch_id: "",
  dept_id: "",
  designation_id: "",
  shift_name: "",
  att_type: "",
  emp_code: "",
  emp_name: "",
};

function AttendanceChecklistContent() {
  const { selectedBranches, selectedCompany } = useSidebarContext();
  const formRef = useRef<MuiFormHandle>(null);

  // Branch is pre-seeded from the branch selected in the left sidebar.
  const sidebarBranchId =
    selectedBranches.length > 0 ? String(selectedBranches[0]) : "";

  // Seed WITHOUT the sidebar branch so the first client render matches the
  // server-rendered HTML (sidebar context hydrates from localStorage after
  // mount). The post-mount effect below pushes the resolved branch in.
  const [filters, setFilters] = useState<ChecklistFilterValues>(INITIAL_FILTERS);
  const prevBranchRef = useRef<string>(sidebarBranchId);

  const [gridRows, setGridRows] = useState<ChecklistGridRow[]>([]);
  const [showGrid, setShowGrid] = useState(false);
  const [searching, setSearching] = useState(false);
  // The range actually searched — used for the result header (and later the
  // CSV filename), so it never drifts from the loaded rows when the form edits.
  const [searchedRange, setSearchedRange] = useState<{ from: string; to: string }>({
    from: "",
    to: "",
  });
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 25,
  });

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

  // Branch options limited to the sidebar-selected branch(es).
  const branchOptions = useMemo<Option[]>(
    () =>
      (selectedCompany?.branches ?? [])
        .filter((b) => selectedBranches.includes(b.branch_id))
        .map((b) => ({ label: b.branch_name, value: String(b.branch_id) })),
    [selectedCompany, selectedBranches],
  );

  const effectiveBranchId = useMemo<string>(() => {
    if (
      sidebarBranchId &&
      branchOptions.some((o) => String(o.value) === sidebarBranchId)
    ) {
      return sidebarBranchId;
    }
    return "";
  }, [sidebarBranchId, branchOptions]);

  // Push the resolved branch into the form once its option exists.
  useEffect(() => {
    if (!effectiveBranchId) return;
    formRef.current?.setValue("branch_id", effectiveBranchId);
    if (effectiveBranchId !== prevBranchRef.current) {
      prevBranchRef.current = effectiveBranchId;
    }
  }, [effectiveBranchId, branchOptions]);

  const filterSchema = useMemo<Schema>(
    () => ({
      fields: [
        {
          name: "from_date",
          label: "From Date",
          type: "date",
          required: true,
          grid: { xs: 12, sm: 6, md: 3 },
        },
        {
          name: "to_date",
          label: "To Date",
          type: "date",
          required: true,
          grid: { xs: 12, sm: 6, md: 3 },
        },
        {
          name: "branch_id",
          label: "Branch",
          type: "select",
          options: branchOptions,
          required: true,
          grid: { xs: 12, sm: 6, md: 3 },
        },
      ] satisfies Field[],
    }),
    [branchOptions],
  );

  const handleFilterChange = useCallback((vals: Record<string, unknown>) => {
    setFilters((prev) => ({ ...prev, ...(vals as Partial<ChecklistFilterValues>) }));
  }, []);

  const handleSearch = useCallback(async () => {
    const parsed = checklistFilterSchema.safeParse(filters);
    if (!parsed.success) {
      notify(parsed.error.issues[0]?.message ?? "Invalid filters", "error");
      return;
    }
    setSearching(true);
    try {
      const res = await fetchAttendanceRegister({
        from_date: filters.from_date,
        to_date: filters.to_date,
        branch_id: filters.branch_id,
      });
      if (res.error || !res.data) {
        throw new Error(res.error || "Failed to fetch attendance");
      }
      const body = res.data as AttendanceReportResponse;
      const rows = Array.isArray(body.data) ? body.data : [];
      setGridRows(mapReportRows(rows));
      setSearchedRange({ from: filters.from_date, to: filters.to_date });
      setShowGrid(true);
    } catch (err: unknown) {
      notify(
        err instanceof Error ? err.message : "Failed to fetch attendance",
        "error",
      );
    } finally {
      setSearching(false);
    }
  }, [filters, notify]);

  const gridColumns = useMemo<GridColDef[]>(
    () => [
      { field: "date", headerName: "Date", width: 110 },
      { field: "spell", headerName: "Spell", width: 90 },
      { field: "ebNo", headerName: "EB No", width: 100 },
      { field: "name", headerName: "Name", flex: 1, minWidth: 180 },
      { field: "department", headerName: "Department", width: 150 },
      { field: "designation", headerName: "Designation", width: 150 },
      {
        field: "source",
        headerName: "Source",
        width: 110,
        renderCell: (params) =>
          params.value ? (
            <Chip
              size="small"
              variant="outlined"
              label={String(params.value)}
              color={params.value === "Face" ? "success" : "default"}
            />
          ) : null,
      },
      { field: "attType", headerName: "Type", width: 100 },
      {
        field: "workingHours",
        headerName: "Working Hours",
        width: 130,
        type: "number",
      },
    ],
    [],
  );

  return (
    <Box className="flex min-h-screen flex-col gap-6 bg-gray-50 p-8">
      <Box className="flex flex-col gap-1">
        <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
          Attendance Checklist
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Daily attendance register
        </Typography>
      </Box>

      {/* Filters */}
      <Paper className="p-4">
        <MuiForm
          ref={formRef}
          schema={filterSchema}
          initialValues={filters as unknown as Record<string, unknown>}
          mode="edit"
          onValuesChange={handleFilterChange}
          hideModeToggle
          hideSubmit
        />
        <Box className="mt-4 flex flex-wrap items-center justify-center gap-4">
          <Button onClick={handleSearch} disabled={searching}>
            {searching ? "Searching..." : "Search"}
          </Button>
        </Box>
      </Paper>

      {/* Register grid */}
      {showGrid && (
        <Paper className="p-4">
          <Box className="mb-2 flex items-center justify-between">
            <Typography variant="subtitle1">
              {gridRows.length} record{gridRows.length === 1 ? "" : "s"} from{" "}
              {searchedRange.from} to {searchedRange.to}
            </Typography>
          </Box>
          <Box sx={{ width: "100%" }}>
            <DataGrid
              rows={gridRows}
              columns={gridColumns}
              getRowId={(row) => row.id}
              autoHeight
              paginationModel={paginationModel}
              onPaginationModelChange={setPaginationModel}
              pageSizeOptions={[25, 50, 100]}
              disableRowSelectionOnClick
            />
          </Box>
        </Paper>
      )}

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity={snackbar.severity} variant="filled">
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default function AttendanceChecklistPage() {
  return (
    <Suspense
      fallback={
        <Box className="p-4">
          <Typography>Loading...</Typography>
        </Box>
      }
    >
      <AttendanceChecklistContent />
    </Suspense>
  );
}
