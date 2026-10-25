"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Snackbar } from "@mui/material";
import { GridColDef, GridPaginationModel } from "@mui/x-data-grid";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import IndexWrapper from "@/components/ui/IndexWrapper";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import PeriodTypeDialog from "./PeriodTypeDialog";
import PeriodsDialog from "./PeriodsDialog";
import type { PeriodTypeRow } from "./types";

const FREQ_LABEL: Record<string, string> = {
  FORTNIGHTLY: "Fortnightly",
  MONTHLY: "Monthly",
  WEEKLY: "Weekly",
  CUSTOM: "Custom",
};

/**
 * Period Master — period types (Wages Fortnight, Monthly, Weekly, Custom) and
 * the dated periods generated from them, used as references by reports and
 * wages. Scoped by the sidebar company and first selected branch.
 */
export default function PeriodMasterPage() {
  const { selectedCompany, selectedBranches } = useSidebarContext();
  const coId = selectedCompany?.co_id;
  const branchId = selectedBranches.length > 0 ? selectedBranches[0] : undefined;

  const [rows, setRows] = useState<PeriodTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalRows, setTotalRows] = useState(0);
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({ pageSize: 10, page: 0 });
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewOnly, setViewOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<number | undefined>(undefined);
  const [periods, setPeriods] = useState<{ id: number; name: string } | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({
    open: false,
    message: "",
    severity: "success",
  });

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
      const { data, error } = await fetchWithCookie<{ data: PeriodTypeRow[]; total: number }>(
        `${apiRoutesPortalMasters.PERIOD_TYPE_TABLE}?${params}`,
        "GET",
      );
      if (error || !data) throw new Error(error || "Failed to fetch period types");
      setRows((data.data || []).map((r) => ({ ...r, id: r.period_type_id })));
      setTotalRows(data.total || 0);
    } catch (err: unknown) {
      setSnackbar({
        open: true,
        message: err instanceof Error ? err.message : "Error fetching period types",
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
    setViewOnly(false);
    setDialogOpen(true);
  }, []);

  const handleEdit = useCallback((row: PeriodTypeRow) => {
    setSelectedId(row.period_type_id);
    setViewOnly(false);
    setDialogOpen(true);
  }, []);

  const handleView = useCallback((row: PeriodTypeRow) => {
    setSelectedId(row.period_type_id);
    setViewOnly(true);
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

  const columns = useMemo<GridColDef<PeriodTypeRow>[]>(
    () => [
      { field: "period_type_name", headerName: "Name", flex: 1, minWidth: 160 },
      { field: "branch_name", headerName: "Branch", flex: 1, minWidth: 140 },
      {
        field: "frequency",
        headerName: "Frequency",
        width: 120,
        valueFormatter: (value: string) => FREQ_LABEL[value] ?? value,
      },
      { field: "slot_summary", headerName: "Rule", flex: 1, minWidth: 180 },
      {
        field: "period_count",
        headerName: "Periods",
        width: 110,
        sortable: false,
        renderCell: (p) => (
          <Button
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              setPeriods({ id: p.row.period_type_id, name: p.row.period_type_name });
            }}
          >
            {p.row.period_count} · Open
          </Button>
        ),
      },
      {
        field: "active",
        headerName: "Active",
        width: 90,
        valueFormatter: (value: unknown) => (value ? "Yes" : "No"),
      },
    ],
    [],
  );

  return (
    <IndexWrapper
      title="Period Master"
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
        placeholder: "Search by period type name",
        debounceDelayMs: 500,
      }}
      createAction={{ label: "Add Period Type", onClick: handleCreate }}
      onEdit={handleEdit}
      onView={handleView}
    >
      <PeriodTypeDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        onSaved={handleSaved}
        editId={selectedId}
        viewOnly={viewOnly}
        onOpenPeriods={(id, name) => {
          handleDialogClose();
          setPeriods({ id, name });
        }}
      />
      <PeriodsDialog
        open={periods !== null}
        onClose={() => setPeriods(null)}
        periodTypeId={periods?.id ?? null}
        periodTypeName={periods?.name ?? ""}
        onChanged={() => void fetchRows()}
      />
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))} sx={{ width: "100%" }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </IndexWrapper>
  );
}
