"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Snackbar } from "@mui/material";
import { GridColDef, GridPaginationModel } from "@mui/x-data-grid";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import IndexWrapper from "@/components/ui/IndexWrapper";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import CreateNonWorkingDayPage from "./CreateNonWorkingDayPage";
import type { NonWorkingDayRow } from "./types";

const yesNo = (v: unknown) => (Number(v) === 1 ? "Yes" : "No");

/**
 * Non Working Days — dates a branch does not work (tbl_non_working_days).
 * Active dates are flagged in vw_leave_dates and left out of EJM STL days.
 * Scoped by the sidebar company/branch.
 */
export default function NonWorkingDaysPage() {
  const { selectedCompany, selectedBranches } = useSidebarContext();
  const coId = selectedCompany?.co_id;
  const branchId = selectedBranches.length > 0 ? selectedBranches[0] : undefined;

  const [rows, setRows] = useState<NonWorkingDayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalRows, setTotalRows] = useState(0);
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    pageSize: 10,
    page: 0,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | undefined>(undefined);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });

  const fetchRows = useCallback(async () => {
    if (coId == null) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        co_id: String(coId),
        page: String((paginationModel.page ?? 0) + 1),
        limit: String(paginationModel.pageSize ?? 10),
      });
      if (branchId != null) params.append("branch_id", String(branchId));
      if (searchQuery) params.append("search", searchQuery);

      const { data, error } = await fetchWithCookie<{ data: NonWorkingDayRow[]; total: number }>(
        `${apiRoutesPortalMasters.NON_WORKING_DAYS_TABLE}?${params}`,
        "GET",
      );
      if (error || !data) throw new Error(error || "Failed to fetch non-working days");

      setRows((data.data || []).map((r) => ({ ...r, id: r.non_working_days_id })));
      setTotalRows(data.total || 0);
    } catch (err: unknown) {
      setSnackbar({
        open: true,
        message: err instanceof Error ? err.message : "Error fetching non-working days",
        severity: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [coId, branchId, paginationModel.page, paginationModel.pageSize, searchQuery]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const handleCreate = useCallback(() => {
    setSelectedId(undefined);
    setDialogOpen(true);
  }, []);

  const handleEdit = useCallback((row: NonWorkingDayRow) => {
    setSelectedId(row.non_working_days_id);
    setDialogOpen(true);
  }, []);

  const handleDialogClose = useCallback(() => {
    setDialogOpen(false);
    setSelectedId(undefined);
  }, []);

  const handleSaved = useCallback(
    (message: string) => {
      setSnackbar({ open: true, message, severity: "success" });
      void fetchRows();
    },
    [fetchRows],
  );

  const columns = useMemo<GridColDef<NonWorkingDayRow>[]>(
    () => [
      { field: "non_working_date", headerName: "Date", flex: 1, minWidth: 130 },
      { field: "branch_name", headerName: "Branch", flex: 1, minWidth: 160 },
      {
        field: "offday_leave",
        headerName: "Off-day Leave",
        flex: 1,
        minWidth: 120,
        valueFormatter: (value) => yesNo(value),
      },
      {
        field: "is_active",
        headerName: "Active",
        flex: 1,
        minWidth: 100,
        valueFormatter: (value) => yesNo(value),
      },
    ],
    [],
  );

  return (
    <IndexWrapper
      title="Non Working Days"
      rows={rows}
      columns={columns}
      rowCount={totalRows}
      paginationModel={paginationModel}
      onPaginationModelChange={setPaginationModel}
      loading={loading}
      showLoadingUntilLoaded
      search={{
        value: searchQuery,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
          setSearchQuery(e.target.value);
          setPaginationModel((prev) => ({ ...prev, page: 0 }));
        },
        placeholder: "Search by date (YYYY-MM-DD) or branch",
        debounceDelayMs: 500,
      }}
      createAction={{ label: "Add Non Working Day", onClick: handleCreate }}
      onEdit={handleEdit}
      onView={handleEdit}
    >
      <CreateNonWorkingDayPage
        open={dialogOpen}
        onClose={handleDialogClose}
        onSaved={handleSaved}
        editId={selectedId}
      />
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
    </IndexWrapper>
  );
}
