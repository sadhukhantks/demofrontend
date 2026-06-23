"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Snackbar,
  Alert,
  IconButton,
  Typography,
  CircularProgress,
} from "@mui/material";
import { X } from "lucide-react";
import { MuiForm } from "@/components/ui/muiform";
import type { MuiFormMode, MuiFormHandle, Schema } from "@/components/ui/muiform";
import { useSelectedCompanyCoId } from "@/hooks/use-selected-company-coid";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import {
  fetchPayslipPrintComponentSetup,
  fetchPaySchemeComponents,
  fetchPayslipPrintComponentById,
  createPayslipPrintComponent,
  updatePayslipPrintComponent,
} from "@/utils/hrmsService";
import {
  type Option,
  type PayRegisterDispSetDialogProps,
  FIXED_VAR_OPTIONS,
  META_COMPONENT_OPTIONS,
} from "../types/payRegisterDispSetTypes";

export default function PayRegisterDispSetDialog({
  open,
  onClose,
  onSaved,
  editId,
}: PayRegisterDispSetDialogProps) {
  const { coId } = useSelectedCompanyCoId();
  const { selectedCompany, selectedBranches } = useSidebarContext();

  const [loadingSetup, setLoadingSetup] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<MuiFormMode>("create");
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: "success" | "error" }>(
    { open: false, message: "", severity: "success" },
  );

  const [schemeOptions, setSchemeOptions] = useState<Option[]>([]);
  const [branchOptions, setBranchOptions] = useState<Option[]>([]);
  const [componentOptions, setComponentOptions] = useState<Option[]>([]);
  const [initialValues, setInitialValues] = useState<Record<string, unknown>>({});
  const [formKey, setFormKey] = useState(0);

  const formRef = useRef<MuiFormHandle>(null);
  // The scheme id whose components are currently loaded; guards the cascade
  // from clearing the component on initial (edit) load.
  const loadedSchemeRef = useRef<string>("");

  const loadSchemeComponents = useCallback(
    async (payschemeId: string): Promise<Option[]> => {
      if (!coId || !payschemeId) {
        setComponentOptions([]);
        return [];
      }
      try {
        const res = await fetchPaySchemeComponents(coId, payschemeId);
        const list = (res?.data?.data ?? res?.data ?? []) as Array<Record<string, unknown>>;
        const schemeOpts: Option[] = list
          .filter((c) => c.component_id != null)
          .map((c) => ({
            label: `${String(c.component_code ?? "")} — ${String(c.component_name ?? "")}`,
            value: String(c.component_id),
          }));
        // Meta employee-info fields are available for every pay scheme.
        const opts: Option[] = [...META_COMPONENT_OPTIONS, ...schemeOpts];
        setComponentOptions(opts);
        return opts;
      } catch {
        // Meta options stay available even if the scheme's components fail to load.
        setComponentOptions([...META_COMPONENT_OPTIONS]);
        return [...META_COMPONENT_OPTIONS];
      }
    },
    [coId],
  );

  const loadSetup = useCallback(async () => {
    if (!coId) return;
    setLoadingSetup(true);
    try {
      // Pay schemes
      const setupRes = await fetchPayslipPrintComponentSetup(coId);
      // fetchWithCookie returns the raw body { data: { pay_schemes: [...] } } (no unwrap)
      const schemes = (setupRes?.data?.data?.pay_schemes ?? setupRes?.data?.pay_schemes ?? []) as Array<Record<string, unknown>>;
      setSchemeOptions(
        schemes.map((s) => ({
          label: `${String(s.payscheme_code ?? "")} — ${String(s.payscheme_name ?? "")}`,
          value: String(s.payscheme_id),
        })),
      );

      // Branches from the sidebar-selected company, narrowed to selected branch(es)
      const allBranches = selectedCompany?.branches ?? [];
      const selectedSet = new Set(selectedBranches.map(String));
      const branchOpts: Option[] = allBranches
        .filter((b) => selectedSet.size === 0 || selectedSet.has(String(b.branch_id)))
        .map((b) => ({ label: b.branch_name, value: String(b.branch_id) }));
      setBranchOptions(branchOpts);
      const defaultBranch = branchOpts.length > 0 ? branchOpts[0].value : "";

      if (editId !== undefined) {
        const detailRes = await fetchPayslipPrintComponentById(coId, editId);
        // Backend returns { data: { ...row } }; fetchWithCookie does not unwrap the envelope
        const rec = (detailRes?.data?.data ?? detailRes?.data ?? {}) as Record<string, unknown>;
        const schemeId = rec.payscheme_id != null ? String(rec.payscheme_id) : "";
        loadedSchemeRef.current = schemeId;
        await loadSchemeComponents(schemeId);
        setInitialValues({
          payscheme_id: schemeId,
          branch_id: rec.branch_id != null ? String(rec.branch_id) : defaultBranch,
          component_id: rec.component_id != null ? String(rec.component_id) : "",
          desc_print: rec.desc_print ?? "",
          payslip_order: rec.payslip_order ?? 1,
          fixed_var_cols: rec.fixed_var_cols ?? "F",
          total_print: Number(rec.total_print) === 1,
          payslip_print: Number(rec.payslip_print) === 1,
          is_active: Number(rec.is_active) === 1,
        });
      } else {
        loadedSchemeRef.current = "";
        setComponentOptions([]);
        setInitialValues({
          payscheme_id: "",
          branch_id: defaultBranch,
          component_id: "",
          desc_print: "",
          payslip_order: 1,
          fixed_var_cols: "F",
          total_print: false,
          payslip_print: false,
          is_active: true,
        });
      }
      setFormKey((k) => k + 1);
    } catch (err: unknown) {
      setSnackbar({ open: true, message: err instanceof Error ? err.message : "Failed to load setup", severity: "error" });
    } finally {
      setLoadingSetup(false);
    }
  }, [coId, editId, selectedCompany, selectedBranches, loadSchemeComponents]);

  useEffect(() => {
    if (open) {
      setMode(editId !== undefined ? "edit" : "create");
      loadSetup();
    } else {
      setInitialValues({});
      setComponentOptions([]);
      loadedSchemeRef.current = "";
      setFormKey(0);
    }
  }, [open, editId, loadSetup]);

  // Cascade: when the pay scheme changes, reload components and clear the picked component.
  const handleValuesChange = useCallback(
    (vals: Record<string, unknown>) => {
      const schemeId = vals.payscheme_id ? String(vals.payscheme_id) : "";
      if (schemeId && schemeId !== loadedSchemeRef.current) {
        loadedSchemeRef.current = schemeId;
        formRef.current?.setValue("component_id", "");
        void loadSchemeComponents(schemeId);
      }
    },
    [loadSchemeComponents],
  );

  const schema = useMemo<Schema>(
    () => ({
      fields: [
        { name: "payscheme_id", label: "Pay Scheme", type: "select", required: true, options: schemeOptions, grid: { xs: 12, sm: 6 } },
        { name: "branch_id", label: "Branch", type: "select", required: true, options: branchOptions, grid: { xs: 12, sm: 6 } },
        { name: "component_id", label: "Pay Component", type: "select", required: true, options: componentOptions, grid: { xs: 12, sm: 6 } },
        { name: "desc_print", label: "Print Description", type: "text", required: true, grid: { xs: 12, sm: 6 } },
        { name: "payslip_order", label: "Payslip Order", type: "number", grid: { xs: 12, sm: 6 } },
        { name: "fixed_var_cols", label: "Fixed / Variable", type: "select", required: true, options: FIXED_VAR_OPTIONS, grid: { xs: 12, sm: 6 } },
        { name: "total_print", label: "Total Print", type: "checkbox", grid: { xs: 12, sm: 4 } },
        { name: "payslip_print", label: "Payslip Print", type: "checkbox", grid: { xs: 12, sm: 4 } },
        { name: "is_active", label: "Active", type: "checkbox", grid: { xs: 12, sm: 4 } },
      ],
    }),
    [schemeOptions, branchOptions, componentOptions],
  );

  const handleSubmit = useCallback(
    async (values: Record<string, unknown>) => {
      if (!coId) {
        setSnackbar({ open: true, message: "No company selected", severity: "error" });
        return;
      }
      setSaving(true);
      try {
        const payload = {
          payscheme_id: values.payscheme_id ? Number(values.payscheme_id) : null,
          branch_id: values.branch_id ? Number(values.branch_id) : null,
          component_id: values.component_id ? Number(values.component_id) : null,
          desc_print: (values.desc_print as string) || null,
          payslip_order: values.payslip_order ? Number(values.payslip_order) : 1,
          fixed_var_cols: values.fixed_var_cols as string,
          total_print: values.total_print ? 1 : 0,
          payslip_print: values.payslip_print ? 1 : 0,
          is_active: values.is_active ? 1 : 0,
        };
        const res =
          editId !== undefined
            ? await updatePayslipPrintComponent(coId, editId, payload)
            : await createPayslipPrintComponent(coId, payload);
        if (res?.error) throw new Error(res.error);
        setSnackbar({
          open: true,
          message: editId !== undefined ? "Configuration updated" : "Configuration created",
          severity: "success",
        });
        onSaved?.();
        onClose();
      } catch (err: unknown) {
        setSnackbar({ open: true, message: err instanceof Error ? err.message : "Save failed", severity: "error" });
      } finally {
        setSaving(false);
      }
    },
    [coId, editId, onSaved, onClose],
  );

  const title = editId !== undefined ? "Edit Pay Register Display Setup" : "Add Pay Register Display Setup";

  return (
    <>
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", pb: 1 }}>
          <Typography variant="h6" component="span">{title}</Typography>
          <IconButton onClick={onClose} size="small" aria-label="Close dialog">
            <X size={20} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {loadingSetup ? (
            <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 200 }}>
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
                onValuesChange={handleValuesChange}
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
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))} sx={{ width: "100%" }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
}
