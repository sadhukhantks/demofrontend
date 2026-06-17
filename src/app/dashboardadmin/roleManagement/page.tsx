"use client";

import React, { useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Checkbox,
  FormControlLabel,
  Typography,
} from "@mui/material";
import { PencilIcon } from "lucide-react";
import { SearchablePaginatedTable } from "@/components/ui/searchablePaginatedTable";
import { Column } from "@/components/ui/datatablewithedit";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutes } from "@/utils/api";

type Role = {
  role_id: number;
  role_name: string;
  active: boolean;
};

const fetchRoles = async (page: number, search?: string) => {
  const limit = 20;
  const queryParams = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
    user_id: localStorage.getItem("user_id") || "",
  });
  if (search) queryParams.append("search", search);

  const { data, error } = await fetchWithCookie(
    `${apiRoutes.ROLES_PORTAL}?${queryParams}`,
    "GET"
  );

  if (error || !data) throw new Error(error || "Failed to fetch roles");
  return data;
};

export default function PortalRoleTablePage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);

  const handleEditClick = (role: Role) => {
    setSelectedRole(role);
    setIsModalOpen(true);
  };

  const handleClose = () => {
    setIsModalOpen(false);
    setSelectedRole(null);
  };

  const handleSave = () => {
    // TODO: API call to update the role
    console.log("Saving role:", selectedRole);
    setIsModalOpen(false);
  };

  const columns: Column<Role>[] = [
    {
      key: "role_name",
      label: "Role Name",
    },
    {
      key: "active",
      label: "Active",
      render: (val) => (val ? "Yes" : "No"),
    },
    {
      key: "actions",
      label: "Actions",
      render: (_val, row) => (
        <Button
          variant="outlined"
          color="primary"
          size="small"
          startIcon={<PencilIcon size={16} />}
          onClick={() => handleEditClick(row)}
        >
          Edit
        </Button>
      ),
    },
  ];

  return (
    <Box sx={{ p: 4, bgcolor: "#f5f5f5", minHeight: "100vh" }}>
      <Box sx={{ maxWidth: "1200px", mx: "auto" }}>
        <Box sx={{ mb: 3, display: "flex", justifyContent: "space-between" }}>
          <Typography variant="h5" fontWeight={600} color="#0C3C60">
            Portal Role Management
          </Typography>
          <Button
            variant="contained"
            sx={{ bgcolor: "#95C11F", "&:hover": { bgcolor: "#85ad1b" } }}
            onClick={() =>
              (window.location.href = "/dashboardadmin/roleManagement/createRole")
            }
          >
            + Create Role
          </Button>
        </Box>

        <SearchablePaginatedTable columns={columns} fetchFn={fetchRoles} />
      </Box>

      {/* MUI Modal Dialog */}
      <Dialog open={isModalOpen} onClose={handleClose}>
        <DialogTitle>Edit Role</DialogTitle>
        <DialogContent sx={{ minWidth: 400, mt: 1 }}>
          <TextField
            label="Role Name"
            fullWidth
            margin="dense"
            value={selectedRole?.role_name || ""}
            onChange={(e) =>
              setSelectedRole((prev) =>
                prev ? { ...prev, role_name: e.target.value } : prev
              )
            }
          />

          <FormControlLabel
            control={
              <Checkbox
                checked={selectedRole?.active ?? false}
                onChange={(e) =>
                  setSelectedRole((prev) =>
                    prev ? { ...prev, active: e.target.checked } : prev
                  )
                }
              />
            }
            label="Active"
          />
        </DialogContent>

        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} color="primary">
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
