"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Snackbar } from "@mui/material";
import { GridColDef, GridPaginationModel } from "@mui/x-data-grid";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import IndexWrapper from "@/components/ui/IndexWrapper";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import CreateProdWagesQualLinkPage from "./CreateProdWagesQualLinkPage";
import type { LinkRow } from "./types";

/**
 * Production Quality <-> Wages Quality link — which wages rate card each
 * production quality of a department is paid on
 * (link_prodquality_wagequality_mst). Scoped by the sidebar company/branch
 * through the link row's branch.
 */
export default function ProdWagesQualLinkPage() {
  const { selectedCompany, selectedBranches } = useSidebarContext();
  const coId = selectedCompany?.co_id;
  const branchId = selectedBranches.length > 0 ? selectedBranches[0] : undefined;

  const [rows, setRows] = useState<LinkRow[]>([]);
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

  const fetchLinks = useCallback(async () => {
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

      const { data, error } = await fetchWithCookie<{ data: LinkRow[]; total: number }>(
        `${apiRoutesPortalMasters.PROD_WAGES_LINK_TABLE}?${params}`,
        "GET",
      );
      if (error || !data) throw new Error(error || "Failed to fetch links");

      setRows((data.data || []).map((r) => ({ ...r, id: r.link_prod_wages_id })));
      setTotalRows(data.total || 0);
    } catch (err: unknown) {
      setSnackbar({
        open: true,
        message: err instanceof Error ? err.message : "Error fetching links",
        severity: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [coId, branchId, paginationModel.page, paginationModel.pageSize, searchQuery]);

  useEffect(() => {
    void fetchLinks();
  }, [fetchLinks]);

  const handleCreate = useCallback(() => {
    setSelectedId(undefined);
    setDialogOpen(true);
  }, []);

  const handleEdit = useCallback((row: LinkRow) => {
    setSelectedId(row.link_prod_wages_id);
    setDialogOpen(true);
  }, []);

  const handleDialogClose = useCallback(() => {
    setDialogOpen(false);
    setSelectedId(undefined);
  }, []);

  const handleSaved = useCallback(
    (message: string) => {
      setSnackbar({ open: true, message, severity: "success" });
      void fetchLinks();
    },
    [fetchLinks],
  );

  const columns = useMemo<GridColDef<LinkRow>[]>(
    () => [
      { field: "dept_desc", headerName: "Department", flex: 1, minWidth: 180 },
      { field: "prod_quality_name", headerName: "Production Quality", flex: 2, minWidth: 220 },
      { field: "wages_quality_name", headerName: "Wages Quality", flex: 2, minWidth: 220 },
      { field: "process", headerName: "Process", flex: 1, minWidth: 120 },
      { field: "branch_name", headerName: "Branch", flex: 1, minWidth: 140 },
    ],
    [],
  );

  return (
    <IndexWrapper
      title="Production - Wages Quality Link"
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
        placeholder: "Search by department or quality",
        debounceDelayMs: 500,
      }}
      createAction={{ label: "Create Link", onClick: handleCreate }}
      onEdit={handleEdit}
      onView={handleEdit}
    >
      <CreateProdWagesQualLinkPage
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
