"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Chip, Snackbar } from "@mui/material";
import { GridColDef, GridPaginationModel, GridRenderCellParams } from "@mui/x-data-grid";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import IndexWrapper from "@/components/ui/IndexWrapper";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import CreateHolidayMasterPage from "./CreateHolidayMasterPage";
import { STATUS_APPROVED, type HolidayRow } from "./types";

/**
 * Holiday Master — the branch holiday calendar (table holiday_master). The
 * table has no company column, so the backend scopes the list through
 * branch_mst using the sidebar company/branch selection.
 */
export default function HolidayMasterPage() {
  const { selectedCompany, selectedBranches } = useSidebarContext();
  const coId = selectedCompany?.co_id;
  const branchId = selectedBranches.length > 0 ? selectedBranches[0] : undefined;

  const [rows, setRows] = useState<HolidayRow[]>([]);
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

  const fetchHolidays = useCallback(async () => {
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
        data: HolidayRow[];
        total: number;
      }>(`${apiRoutesPortalMasters.HOLIDAY_TABLE}?${params}`, "GET");
      if (error || !data) throw new Error(error || "Failed to fetch holidays");

      setRows((data.data || []).map((r) => ({ ...r, id: r.holiday_id })));
      setTotalRows(data.total || 0);
    } catch (err: unknown) {
      setSnackbar({
        open: true,
        message: err instanceof Error ? err.message : "Error fetching holidays",
        severity: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [coId, branchId, paginationModel.page, paginationModel.pageSize, searchQuery]);

  useEffect(() => {
    void fetchHolidays();
  }, [fetchHolidays]);

  const handleCreate = useCallback(() => {
    setSelectedId(undefined);
    setDialogOpen(true);
  }, []);

  const handleEdit = useCallback((row: HolidayRow) => {
    setSelectedId(row.holiday_id);
    setDialogOpen(true);
  }, []);

  const handleDialogClose = useCallback(() => {
    setDialogOpen(false);
    setSelectedId(undefined);
  }, []);

  const handleSaved = useCallback(
    (message: string) => {
      setSnackbar({ open: true, message, severity: "success" });
      void fetchHolidays();
    },
    [fetchHolidays],
  );

  /** Approved holidays open read-only behind the View (eye) icon. Approval is
   *  final: neither Approve nor Reject is offered once a holiday is approved. */
  const isRowEditable = useCallback(
    (row: HolidayRow) => row.status !== STATUS_APPROVED,
    [],
  );

  const columns = useMemo<GridColDef<HolidayRow>[]>(
    () => [
      { field: "holiday_date", headerName: "Holiday Date", width: 130 },
      { field: "holiday", headerName: "Holiday", flex: 2, minWidth: 200 },
      { field: "holiday_type_name", headerName: "Type", width: 120 },
      { field: "spell_name", headerName: "Spell", width: 100 },
      { field: "period_start_date", headerName: "Period From", width: 130 },
      { field: "period_end_date", headerName: "Period To", width: 130 },
      { field: "branch_name", headerName: "Branch", flex: 1, minWidth: 150 },
      {
        field: "status_name",
        headerName: "Status",
        width: 120,
        renderCell: (params: GridRenderCellParams<HolidayRow, string>) => (
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
      {
        field: "processed_count",
        headerName: "Processed",
        type: "number",
        width: 110,
      },
    ],
    [],
  );

  return (
    <IndexWrapper
      title="Holiday Master"
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
        placeholder: "Search by holiday name",
        debounceDelayMs: 500,
      }}
      createAction={{ label: "Create Holiday", onClick: handleCreate }}
      onEdit={handleEdit}
      onView={handleEdit}
      isRowEditable={isRowEditable}
    >
      <CreateHolidayMasterPage
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
