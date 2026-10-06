"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Snackbar,
  Typography,
} from "@mui/material";
import { X } from "lucide-react";
import { MuiForm } from "@/components/ui/muiform";
import type { Field, MuiFormMode, Schema } from "@/components/ui/muiform";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import { todayIso } from "@/components/reports/reportDates";
import type { NonWorkingDayRecord } from "./types";

const YES_NO_OPTIONS = Object.freeze([
  { label: "Yes", value: "1" },
  { label: "No", value: "0" },
]);

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved?: (message: string) => void;
  editId?: number;
}

/**
 * Create / edit dialog for one non-working day. Company and branch come from
 * the sidebar on create and are fixed after; switch a date off with Active = No.
 */
export default function CreateNonWorkingDayPage({ open, onClose, onSaved, editId }: Props) {
  const { selectedCompany, selectedBranches } = useSidebarContext();
  const coId = selectedCompany?.co_id;
  const branchId = selectedBranches.length > 0 ? selectedBranches[0] : undefined;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<MuiFormMode>("create");
  const [formKey, setFormKey] = useState(0);
  const [initialValues, setInitialValues] = useState<Record<string, unknown>>({});
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });

  const notifyError = useCallback(
    (message: string) => setSnackbar({ open: true, message, severity: "error" }),
    [],
  );

  const loadRecord = useCallback(async () => {
    if (editId === undefined) {
      setInitialValues({ non_working_date: todayIso(), offday_leave: "1", is_active: "1" });
      setFormKey((k) => k + 1);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await fetchWithCookie<{ data: NonWorkingDayRecord }>(
        `${apiRoutesPortalMasters.NON_WORKING_DAY_BY_ID}/${editId}`,
        "GET",
      );
      if (error || !data) throw new Error(error || "Failed to load non-working day");
      const rec = data.data;
      setInitialValues({
        non_working_date: rec.non_working_date ?? "",
        offday_leave: String(rec.offday_leave ?? 1),
        is_active: String(rec.is_active ?? 1),
      });
      setFormKey((k) => k + 1);
    } catch (err: unknown) {
      notifyError(err instanceof Error ? err.message : "Error loading non-working day");
    } finally {
      setLoading(false);
    }
  }, [editId, notifyError]);

  useEffect(() => {
    if (open) {
      setMode(editId !== undefined ? "edit" : "create");
      void loadRecord();
    } else {
      setInitialValues({});
      setFormKey(0);
    }
  }, [open, editId, loadRecord]);

  const schema = useMemo<Schema>(
    () => ({
      fields: [
        {
          name: "non_working_date",
          label: "Non Working Date",
          type: "date",
          required: true,
          grid: { xs: 12 },
        },
        {
          name: "offday_leave",
          label: "Off-day Leave",
          type: "select",
          options: [...YES_NO_OPTIONS],
          required: true,
          grid: { xs: 12, sm: 6 },
        },
        {
          name: "is_active",
          label: "Active",
          type: "select",
          options: [...YES_NO_OPTIONS],
          required: true,
          grid: { xs: 12, sm: 6 },
        },
      ] satisfies Field[],
    }),
    [],
  );

  const handleSubmit = async (values: Record<string, unknown>) => {
    const isEdit = editId !== undefined;
    if (!isEdit && (coId == null || branchId == null)) {
      notifyError("Select a company and branch in the sidebar before saving");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        co_id: coId,
        branch_id: branchId,
        non_working_date: values.non_working_date,
        offday_leave: values.offday_leave,
        is_active: values.is_active,
      };
      const { error } = await fetchWithCookie(
        isEdit
          ? `${apiRoutesPortalMasters.NON_WORKING_DAY_EDIT}/${editId}`
          : apiRoutesPortalMasters.NON_WORKING_DAY_CREATE,
        isEdit ? "PUT" : "POST",
        payload,
      );
      if (error) throw new Error(error);

      onSaved?.(isEdit ? "Non-working day updated successfully" : "Non-working day created successfully");
      onClose();
    } catch (err: unknown) {
      notifyError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        fullWidth
        maxWidth="sm"
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle
          sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", pb: 1 }}
        >
          <Typography variant="h6" component="span">
            {editId === undefined ? "Add Non Working Day" : "Edit Non Working Day"}
          </Typography>
          <IconButton onClick={onClose} size="small" aria-label="Close dialog">
            <X size={20} />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers>
          {loading ? (
            <Box
              sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 200 }}
            >
              <CircularProgress />
            </Box>
          ) : (
            <Box sx={{ pt: 1 }}>
              <MuiForm
                key={formKey}
                schema={schema}
                mode={mode}
                initialValues={initialValues}
                onSubmit={handleSubmit}
                submitLabel={saving ? "Saving..." : "Save"}
                cancelLabel="Cancel"
                onCancel={onClose}
                hideModeToggle
              />
            </Box>
          )}
        </DialogContent>
      </Dialog>

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
    </>
  );
}
