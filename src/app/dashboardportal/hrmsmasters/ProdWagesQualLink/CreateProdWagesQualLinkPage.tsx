"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button as MuiButton,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Snackbar,
  Stack,
  Typography,
} from "@mui/material";
import { X } from "lucide-react";
import { MuiForm } from "@/components/ui/muiform";
import type { Field, MuiFormHandle, MuiFormMode, Schema } from "@/components/ui/muiform";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import type {
  DepartmentOption,
  LinkRecord,
  LinkSetup,
  Option,
  ProdQualities,
  WagesQualityOption,
} from "./types";

const EMPTY_DEPTS: DepartmentOption[] = Object.freeze([]) as unknown as DepartmentOption[];
const EMPTY_WAGES: WagesQualityOption[] = Object.freeze([]) as unknown as WagesQualityOption[];
const EMPTY_OPTIONS: Option[] = Object.freeze([]) as unknown as Option[];

const QUALITY_LABEL: Record<string, string> = {
  weaving: "Weaving Quality",
  winding: "Winding Quality",
  finishing: "Finishing Quality",
  beaming: "Beaming Quality",
};

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved?: (message: string) => void;
  editId?: number;
}

/**
 * Create / edit dialog for one production-quality -> wages-quality link. The
 * production quality dropdown is re-sourced whenever the department changes:
 * the backend picks weaving / winding / finishing / beaming from the
 * department's name. Wages qualities are those rated for that department.
 */
export default function CreateProdWagesQualLinkPage({ open, onClose, onSaved, editId }: Props) {
  const { selectedCompany, selectedBranches } = useSidebarContext();
  const coId = selectedCompany?.co_id;
  const branchId = selectedBranches.length > 0 ? selectedBranches[0] : undefined;

  const formRef = useRef<MuiFormHandle>(null);
  // Department the current prodQualities were loaded for; onValuesChange
  // compares against it so a re-render never re-fetches.
  const loadedDeptRef = useRef<string>("");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<MuiFormMode>("create");
  const [formKey, setFormKey] = useState(0);
  const [initialValues, setInitialValues] = useState<Record<string, unknown>>({});
  const [departments, setDepartments] = useState<DepartmentOption[]>(EMPTY_DEPTS);
  const [wagesQualities, setWagesQualities] = useState<WagesQualityOption[]>(EMPTY_WAGES);
  const [prodQualities, setProdQualities] = useState<Option[]>(EMPTY_OPTIONS);
  const [deptId, setDeptId] = useState("");
  const [qualityType, setQualityType] = useState("");
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });

  const notifyError = useCallback(
    (message: string) => setSnackbar({ open: true, message, severity: "error" }),
    [],
  );

  // Department + wages-quality options, refreshed whenever the dialog opens.
  useEffect(() => {
    if (!open || coId == null) return;
    let cancelled = false;
    (async () => {
      const params = new URLSearchParams({ co_id: String(coId) });
      if (branchId != null) params.append("branch_id", String(branchId));
      const { data, error } = await fetchWithCookie<{ data: LinkSetup }>(
        `${apiRoutesPortalMasters.PROD_WAGES_LINK_SETUP}?${params}`,
        "GET",
      );
      if (cancelled) return;
      if (error || !data) {
        notifyError(error || "Failed to load departments");
        return;
      }
      setDepartments(data.data?.departments ?? EMPTY_DEPTS);
      setWagesQualities(data.data?.wages_qualities ?? EMPTY_WAGES);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, coId, branchId, notifyError]);

  const loadProdQualities = useCallback(
    async (dept: string) => {
      loadedDeptRef.current = dept;
      setDeptId(dept);
      if (!dept) {
        setProdQualities(EMPTY_OPTIONS);
        setQualityType("");
        return;
      }
      const { data, error } = await fetchWithCookie<{ data: ProdQualities }>(
        `${apiRoutesPortalMasters.PROD_WAGES_LINK_QUALITIES}?dept_id=${dept}`,
        "GET",
      );
      if (error || !data) {
        notifyError(error || "Failed to load production qualities");
        setProdQualities(EMPTY_OPTIONS);
        return;
      }
      setProdQualities(data.data?.qualities ?? EMPTY_OPTIONS);
      setQualityType(data.data?.quality_type ?? "");
    },
    [notifyError],
  );

  const loadRecord = useCallback(async () => {
    if (editId === undefined) {
      await loadProdQualities("");
      setInitialValues({ dept_id: "", prod_quality_id: "", wages_quality_id: "" });
      setFormKey((k) => k + 1);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await fetchWithCookie<{ data: LinkRecord }>(
        `${apiRoutesPortalMasters.PROD_WAGES_LINK_BY_ID}/${editId}`,
        "GET",
      );
      if (error || !data) throw new Error(error || "Failed to load link");
      const rec = data.data;
      const dept = rec.dept_id != null ? String(rec.dept_id) : "";
      // Options must exist before the form mounts, or the select shows blank.
      await loadProdQualities(dept);
      setInitialValues({
        dept_id: dept,
        prod_quality_id: rec.prod_quality_id != null ? String(rec.prod_quality_id) : "",
        wages_quality_id: rec.wages_quality_id != null ? String(rec.wages_quality_id) : "",
      });
      setFormKey((k) => k + 1);
    } catch (err: unknown) {
      notifyError(err instanceof Error ? err.message : "Error loading link");
    } finally {
      setLoading(false);
    }
  }, [editId, loadProdQualities, notifyError]);

  useEffect(() => {
    if (open) {
      setMode(editId !== undefined ? "edit" : "create");
      void loadRecord();
    } else {
      setInitialValues({});
      setFormKey(0);
    }
  }, [open, editId, loadRecord]);

  // Department changed by the user: re-source the quality dropdowns and clear
  // the now-meaningless picks.
  const handleValuesChange = useCallback(
    (values: Record<string, unknown>) => {
      const dept = String(values.dept_id ?? "");
      if (dept === loadedDeptRef.current) return;
      formRef.current?.setValue("prod_quality_id", "");
      formRef.current?.setValue("wages_quality_id", "");
      void loadProdQualities(dept);
    },
    [loadProdQualities],
  );

  const wagesOptions = useMemo<Option[]>(
    () => wagesQualities.filter((w) => w.dept_id == null || w.dept_id === deptId),
    [wagesQualities, deptId],
  );

  const schema = useMemo<Schema>(
    () => ({
      fields: [
        {
          name: "dept_id",
          label: "Department",
          type: "select",
          options: departments,
          required: true,
          grid: { xs: 12 },
        },
        {
          name: "prod_quality_id",
          label: QUALITY_LABEL[qualityType] ?? "Production Quality",
          type: "select",
          options: prodQualities,
          required: true,
          disabled: (values) => !values.dept_id,
          helperText: deptId ? undefined : "Select a department first",
          grid: { xs: 12 },
        },
        {
          name: "wages_quality_id",
          label: "Wages Quality",
          type: "select",
          options: wagesOptions,
          required: true,
          disabled: (values) => !values.dept_id,
          grid: { xs: 12 },
        },
      ] satisfies Field[],
    }),
    [departments, prodQualities, wagesOptions, qualityType, deptId],
  );

  const handleSubmit = async (values: Record<string, unknown>) => {
    setSaving(true);
    try {
      const payload = {
        dept_id: values.dept_id,
        prod_quality_id: values.prod_quality_id,
        wages_quality_id: values.wages_quality_id,
      };
      const isEdit = editId !== undefined;
      const { error } = await fetchWithCookie(
        isEdit
          ? `${apiRoutesPortalMasters.PROD_WAGES_LINK_EDIT}/${editId}`
          : apiRoutesPortalMasters.PROD_WAGES_LINK_CREATE,
        isEdit ? "PUT" : "POST",
        payload,
      );
      if (error) throw new Error(error);

      onSaved?.(isEdit ? "Link updated successfully" : "Link created successfully");
      onClose();
    } catch (err: unknown) {
      notifyError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = useCallback(async () => {
    if (editId === undefined) return;
    if (!window.confirm("Delete this link?")) return;
    setSaving(true);
    try {
      const { data, error } = await fetchWithCookie<{ message: string }>(
        `${apiRoutesPortalMasters.PROD_WAGES_LINK_DELETE}/${editId}`,
        "DELETE",
      );
      if (error || !data) throw new Error(error || "Failed to delete link");
      onSaved?.(data.message);
      onClose();
    } catch (err: unknown) {
      notifyError(err instanceof Error ? err.message : "Failed to delete link");
    } finally {
      setSaving(false);
    }
  }, [editId, notifyError, onClose, onSaved]);

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
            {editId === undefined ? "Create Link" : "Edit Link"}
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
                ref={formRef}
                key={formKey}
                schema={schema}
                mode={mode}
                initialValues={initialValues}
                onSubmit={handleSubmit}
                onValuesChange={handleValuesChange}
                submitLabel={saving ? "Saving..." : "Save"}
                cancelLabel="Cancel"
                onCancel={onClose}
                hideModeToggle
              />
              {editId !== undefined && (
                <Stack direction="row" sx={{ mt: 2 }} justifyContent="flex-end">
                  <MuiButton
                    variant="outlined"
                    color="error"
                    disabled={saving}
                    onClick={() => void handleDelete()}
                  >
                    Delete
                  </MuiButton>
                </Stack>
              )}
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
