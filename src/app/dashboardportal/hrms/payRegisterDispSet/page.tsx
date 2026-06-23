"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Snackbar, Alert, Chip } from "@mui/material";
import { GridColDef, GridPaginationModel } from "@mui/x-data-grid";
import IndexWrapper from "@/components/ui/IndexWrapper";
import { useSelectedCompanyCoId } from "@/hooks/use-selected-company-coid";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import { fetchPayslipPrintComponentList } from "@/utils/hrmsService";
import PayRegisterDispSetDialog from "./_components/PayRegisterDispSetDialog";
import type { PayslipPrintComponentRow } from "./types/payRegisterDispSetTypes";

export default function PayRegisterDispSetPage() {
  const { coId } = useSelectedCompanyCoId();
  const { selectedBranches } = useSidebarContext();

  const [rows, setRows] = useState<PayslipPrintComponentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalRows, setTotalRows] = useState(0);
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({ pageSize: 10, page: 0 });
  const [searchQuery, setSearchQuery] = useState("");
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: "success" | "error" }>(
    { open: false, message: "", severity: "success" },
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | undefined>(undefined);

  const fetchRows = useCallback(async () => {
    if (!coId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await fetchPayslipPrintComponentList(coId, {
        page: (paginationModel.page ?? 0) + 1,
        limit: paginationModel.pageSize ?? 10,
        search: searchQuery || undefined,
        branch_id: selectedBranches.length > 0 ? selectedBranches.join(",") : undefined,
      });
      if (error || !data) throw new Error(error || "Failed to load configurations");
      const list = (data.data ?? []) as Array<Record<string, unknown>>;
      setRows(
        list.map((r) => ({
          ...(r as PayslipPrintComponentRow),
          id: r.pay_id as number,
        })),
      );
      setTotalRows((data.total as number) ?? 0);
    } catch (err: unknown) {
      setSnackbar({ open: true, message: err instanceof Error ? err.message : "Error loading data", severity: "error" });
    } finally {
      setLoading(false);
    }
  }, [coId, paginationModel.page, paginationModel.pageSize, searchQuery, selectedBranches]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setPaginationModel((prev) => ({ ...prev, page: 0 }));
  };

  const handleCreate = useCallback(() => {
    setSelectedId(undefined);
    setDialogOpen(true);
  }, []);

  const handleEdit = useCallback((row: PayslipPrintComponentRow) => {
    setSelectedId(row.pay_id);
    setDialogOpen(true);
  }, []);

  const handleDialogClose = useCallback(() => {
    setDialogOpen(false);
    setSelectedId(undefined);
  }, []);

  const yesNo = (v: number) => (
    <Chip label={v === 1 ? "Yes" : "No"} size="small" color={v === 1 ? "success" : "default"} variant={v === 1 ? "filled" : "outlined"} />
  );

  const columns = useMemo<GridColDef<PayslipPrintComponentRow>[]>(
    () => [
      { field: "payscheme_name", headerName: "Pay Scheme", flex: 1.4, minWidth: 160 },
      { field: "component_name", headerName: "Component", flex: 1.4, minWidth: 160 },
      { field: "desc_print", headerName: "Print Label", flex: 1.2, minWidth: 140 },
      { field: "payslip_order", headerName: "Order", width: 80, type: "number" },
      {
        field: "fixed_var_cols",
        headerName: "Fixed/Var",
        width: 110,
        valueGetter: (value) => (value === "F" ? "Fixed" : value === "V" ? "Variable" : value),
      },
      { field: "total_print", headerName: "Total Print", width: 110, renderCell: (p) => yesNo(p.row.total_print) },
      { field: "payslip_print", headerName: "Payslip Print", width: 120, renderCell: (p) => yesNo(p.row.payslip_print) },
      { field: "is_active", headerName: "Active", width: 90, renderCell: (p) => yesNo(p.row.is_active) },
    ],
    [],
  );

  return (
    <IndexWrapper
      title="Pay Register Display Setup"
      rows={rows}
      columns={columns}
      rowCount={totalRows}
      paginationModel={paginationModel}
      onPaginationModelChange={setPaginationModel}
      loading={loading}
      showLoadingUntilLoaded
      search={{
        value: searchQuery,
        onChange: handleSearchChange,
        placeholder: "Search by component or print label",
        debounceDelayMs: 500,
      }}
      createAction={{ label: "Add Setup", onClick: handleCreate }}
      onView={handleEdit}
      onEdit={handleEdit}
    >
      <PayRegisterDispSetDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        onSaved={fetchRows}
        editId={selectedId}
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
