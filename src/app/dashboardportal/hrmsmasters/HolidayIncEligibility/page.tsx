"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Chip, Snackbar } from "@mui/material";
import { GridColDef, GridPaginationModel, GridRenderCellParams } from "@mui/x-data-grid";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import IndexWrapper from "@/components/ui/IndexWrapper";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import CreateHolidayIncEligibilityPage from "./CreateHolidayIncEligibilityPage";
import { STATUS_APPROVED, type EligibilityRow } from "./types";

/**
 * Holiday & Attendance Incentive Eligibility — one row per employee saying
 * whether they draw holiday pay / the attendance incentive, and at what rates
 * (table tbl_holiday_att_inc_eligibility). The table has no company/branch
 * column, so the backend scopes the list through the employee's branch using
 * the sidebar company/branch selection.
 */
export default function HolidayIncEligibilityPage() {
  const { selectedCompany, selectedBranches } = useSidebarContext();
  const coId = selectedCompany?.co_id;
  const branchId = selectedBranches.length > 0 ? selectedBranches[0] : undefined;

  const [rows, setRows] = useState<EligibilityRow[]>([]);
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

  const fetchEligibility = useCallback(async () => {
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

      const { data, error } = await fetchWithCookie<{
        data: EligibilityRow[];
        total: number;
      }>(`${apiRoutesPortalMasters.HOL_INC_ELIG_TABLE}?${params}`, "GET");
      if (error || !data) throw new Error(error || "Failed to fetch eligibility");

      setRows((data.data || []).map((r) => ({ ...r, id: r.hl_att_inc_id })));
      setTotalRows(data.total || 0);
    } catch (err: unknown) {
      setSnackbar({
        open: true,
        message: err instanceof Error ? err.message : "Error fetching eligibility",
        severity: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [coId, branchId, paginationModel.page, paginationModel.pageSize, searchQuery]);

  useEffect(() => {
    void fetchEligibility();
  }, [fetchEligibility]);

  const handleCreate = useCallback(() => {
    setSelectedId(undefined);
    setDialogOpen(true);
  }, []);

  const handleEdit = useCallback((row: EligibilityRow) => {
    setSelectedId(row.hl_att_inc_id);
    setDialogOpen(true);
  }, []);

  const handleDialogClose = useCallback(() => {
    setDialogOpen(false);
    setSelectedId(undefined);
  }, []);

  const handleSaved = useCallback(
    (message: string) => {
      setSnackbar({ open: true, message, severity: "success" });
      void fetchEligibility();
    },
    [fetchEligibility],
  );

  /** Approved records open read-only behind the View (eye) icon. Approval is
   *  final: neither Approve nor Reject is offered once a record is approved. */
  const isRowEditable = useCallback(
    (row: EligibilityRow) => row.status !== STATUS_APPROVED,
    [],
  );

  const columns = useMemo<GridColDef<EligibilityRow>[]>(
    () => [
      { field: "emp_code", headerName: "EB No", width: 120 },
      { field: "emp_name", headerName: "Employee Name", flex: 2, minWidth: 200 },
      { field: "category", headerName: "Category", flex: 1, minWidth: 140 },
      {
        field: "holiday_eligibility",
        headerName: "Holiday",
        width: 100,
        valueFormatter: (value: string | null) => (value === "Y" ? "Yes" : "No"),
      },
      {
        field: "att_incn_eligibility",
        headerName: "Att. Incentive",
        width: 130,
        valueFormatter: (value: string | null) => (value === "Y" ? "Yes" : "No"),
      },
      {
        field: "fn_att_inc_rate",
        headerName: "Fortnightly Rate",
        type: "number",
        width: 150,
      },
      {
        field: "mn_att_inc_rate",
        headerName: "Monthly Rate",
        type: "number",
        width: 140,
      },
      {
        field: "status_name",
        headerName: "Status",
        width: 120,
        renderCell: (params: GridRenderCellParams<EligibilityRow, string>) => (
          <Chip
            size="small"
            color={
              params.value === "APPROVED"
                ? "success"
                : params.value === "REJECTED"
                  ? "error"
                  : "default"
            }
            label={params.value || "OPEN"}
          />
        ),
      },
    ],
    [],
  );

  return (
    <IndexWrapper
      title="Holiday & Attendance Incentive Eligibility"
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
        placeholder: "Search by EB no or employee name",
        debounceDelayMs: 500,
      }}
      createAction={{ label: "Create Eligibility", onClick: handleCreate }}
      onEdit={handleEdit}
      onView={handleEdit}
      isRowEditable={isRowEditable}
    >
      <CreateHolidayIncEligibilityPage
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
