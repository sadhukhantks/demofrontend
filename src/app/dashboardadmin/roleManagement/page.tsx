"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Snackbar, Alert } from "@mui/material";
import { GridColDef, GridPaginationModel } from "@mui/x-data-grid";
import IndexWrapper from "@/components/ui/IndexWrapper";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutes } from "@/utils/api";
import { handleAuthError } from "@/utils/auth";

type Role = {
  id: number;
  role_id: number;
  role_name: string;
  active: number;
};

export default function PortalRoleTablePage() {
  const router = useRouter();

  const [rows, setRows] = useState<Role[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    pageSize: 20,
    page: 0,
  });

  const fetchRoles = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const queryParams = new URLSearchParams({
        page: (paginationModel.page + 1).toString(),
        limit: paginationModel.pageSize.toString(),
        user_id: localStorage.getItem("user_id") || "",
      });

      const trimmedSearch = searchValue.trim();
      if (trimmedSearch) queryParams.append("search", trimmedSearch);

      const { data, error: apiError, status } = await fetchWithCookie(
        `${apiRoutes.ROLES_PORTAL}?${queryParams}`,
        "GET"
      );

      if (handleAuthError(status)) return;
      if (apiError || !data) throw new Error(apiError || "Failed to fetch roles");

      const rolesData = Array.isArray(data) ? data : data.data || [];
      setRows(
        rolesData.map((row: any) => ({
          id: row.role_id,
          role_id: row.role_id,
          role_name: row.role_name ?? "",
          active: row.active ?? 0,
        }))
      );
      setTotalRows(data.total ?? rolesData.length);
    } catch (err: any) {
      setError(err.message || "Error fetching roles");
      setRows([]);
      setTotalRows(0);
    } finally {
      setLoading(false);
    }
  }, [paginationModel.page, paginationModel.pageSize, searchValue]);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  const handleSearchChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setPaginationModel((prev) => ({ ...prev, page: 0 }));
    setSearchValue(event.target.value);
  }, []);

  const handleEdit = useCallback(
    (row: Role) => {
      router.push(`/dashboardadmin/roleManagement/createRole?roleId=${row.role_id}`);
    },
    [router]
  );

  const handleCreate = useCallback(() => {
    router.push("/dashboardadmin/roleManagement/createRole");
  }, [router]);

  const columns = useMemo<GridColDef<Role>[]>(
    () => [
      {
        field: "role_name",
        headerName: "Role Name",
        flex: 1,
        minWidth: 200,
      },
      {
        field: "active",
        headerName: "Active",
        width: 100,
        valueGetter: (value: number) => (value ? "Yes" : "No"),
      },
    ],
    []
  );

  return (
    <IndexWrapper
      title="Portal Role Management"
      subtitle="Manage portal roles and their menu access"
      rows={rows}
      columns={columns}
      rowCount={totalRows}
      paginationModel={paginationModel}
      onPaginationModelChange={setPaginationModel}
      loading={loading}
      showLoadingUntilLoaded
      search={{
        value: searchValue,
        onChange: handleSearchChange,
        placeholder: "Search roles...",
        debounceDelayMs: 1000,
      }}
      createAction={{
        label: "+ Create Role",
        onClick: handleCreate,
      }}
      onEdit={handleEdit}
    >
      <Snackbar
        open={Boolean(error)}
        autoHideDuration={4000}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert severity="error" onClose={() => setError(null)} sx={{ width: "100%" }}>
          {error}
        </Alert>
      </Snackbar>
    </IndexWrapper>
  );
}
