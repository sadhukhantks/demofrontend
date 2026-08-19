"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import type { Field, MuiFormMode, Schema } from "@/components/ui/muiform";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import {
  STATUS_APPROVED,
  YES_NO_OPTIONS,
  type EligibilityRecord,
  type EligibilitySetup,
  type Option,
} from "./types";

const EMPTY_OPTIONS: Option[] = Object.freeze([]) as unknown as Option[];

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved?: (message: string) => void;
  editId?: number;
}

/**
 * Create / edit dialog for one employee's holiday & attendance-incentive
 * eligibility. EB No is a `select`, which MuiForm renders as a searchable
 * Autocomplete — branches run to a few thousand employees. The backend rejects
 * rates without the incentive flag (and vice versa), same rule as the legacy
 * PHP screen.
 */
export default function CreateHolidayIncEligibilityPage({
  open,
  onClose,
  onSaved,
  editId,
}: Props) {
  const { selectedCompany, selectedBranches } = useSidebarContext();
  const coId = selectedCompany?.co_id;
  const branchId = selectedBranches.length > 0 ? selectedBranches[0] : undefined;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<MuiFormMode>("create");
  const [formKey, setFormKey] = useState(0);
  const [initialValues, setInitialValues] = useState<Record<string, unknown>>({});
  const [employees, setEmployees] = useState<Option[]>(EMPTY_OPTIONS);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });

  const notifyError = useCallback(
    (message: string) => setSnackbar({ open: true, message, severity: "error" }),
    [],
  );

  // Employee options, refreshed whenever the dialog opens for a new branch.
  useEffect(() => {
    if (!open || coId == null) return;
    let cancelled = false;
    (async () => {
      const params = new URLSearchParams({ co_id: String(coId) });
      if (branchId != null) params.append("branch_id", String(branchId));
      const { data, error } = await fetchWithCookie<{ data: EligibilitySetup }>(
        `${apiRoutesPortalMasters.HOL_INC_ELIG_SETUP}?${params}`,
        "GET",
      );
      if (cancelled) return;
      if (error || !data) {
        notifyError(error || "Failed to load employees");
        return;
      }
      setEmployees(data.data?.employees ?? EMPTY_OPTIONS);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, coId, branchId, notifyError]);

  const loadRecord = useCallback(async () => {
    if (editId === undefined) {
      setInitialValues({
        eb_id: "",
        holiday_eligibility: "N",
        att_incn_eligibility: "N",
        fn_att_inc_rate: 0,
        mn_att_inc_rate: 0,
      });
      setFormKey((k) => k + 1);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await fetchWithCookie<{ data: EligibilityRecord }>(
        `${apiRoutesPortalMasters.HOL_INC_ELIG_BY_ID}/${editId}`,
        "GET",
      );
      if (error || !data) throw new Error(error || "Failed to load eligibility");
      const rec = data.data;
      // Approved records are final — read-only, with no Approve/Reject offered.
      setMode(rec.status === STATUS_APPROVED ? "view" : "edit");
      setInitialValues({
        eb_id: rec.eb_id != null ? String(rec.eb_id) : "",
        holiday_eligibility: rec.holiday_eligibility ?? "N",
        att_incn_eligibility: rec.att_incn_eligibility ?? "N",
        fn_att_inc_rate: rec.fn_att_inc_rate ?? 0,
        mn_att_inc_rate: rec.mn_att_inc_rate ?? 0,
      });
      setFormKey((k) => k + 1);
    } catch (err: unknown) {
      notifyError(err instanceof Error ? err.message : "Error loading eligibility");
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
          name: "eb_id",
          label: "EB No",
          type: "select",
          options: employees,
          required: true,
          grid: { xs: 12 },
        },
        {
          name: "holiday_eligibility",
          label: "Holiday Eligibility",
          type: "select",
          options: [...YES_NO_OPTIONS],
          required: true,
          grid: { xs: 12, sm: 6 },
        },
        {
          name: "att_incn_eligibility",
          label: "Attendance Incentive",
          type: "select",
          options: [...YES_NO_OPTIONS],
          required: true,
          grid: { xs: 12, sm: 6 },
        },
        {
          // Rates are only meaningful when the incentive flag is Yes — the
          // backend rejects a non-zero rate against a No.
          name: "fn_att_inc_rate",
          label: "Fortnightly Incentive Rate",
          type: "number",
          grid: { xs: 12, sm: 6 },
        },
        {
          name: "mn_att_inc_rate",
          label: "Monthly Incentive Rate",
          type: "number",
          grid: { xs: 12, sm: 6 },
        },
      ] satisfies Field[],
    }),
    [employees],
  );

  const handleSubmit = async (values: Record<string, unknown>) => {
    setSaving(true);
    try {
      const payload = {
        eb_id: values.eb_id,
        holiday_eligibility: values.holiday_eligibility,
        att_incn_eligibility: values.att_incn_eligibility,
        fn_att_inc_rate: values.fn_att_inc_rate || 0,
        mn_att_inc_rate: values.mn_att_inc_rate || 0,
      };
      const isEdit = editId !== undefined;
      const { error } = await fetchWithCookie(
        isEdit
          ? `${apiRoutesPortalMasters.HOL_INC_ELIG_EDIT}/${editId}`
          : apiRoutesPortalMasters.HOL_INC_ELIG_CREATE,
        isEdit ? "PUT" : "POST",
        payload,
      );
      if (error) throw new Error(error);

      onSaved?.(
        isEdit
          ? "Eligibility updated successfully"
          : "Eligibility created successfully",
      );
      onClose();
    } catch (err: unknown) {
      notifyError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  /** Approve or Reject the saved record — mirrors the Holiday Master dialog. */
  const runStatusAction = useCallback(
    async (url: string, confirmMessage: string, fallbackError: string) => {
      if (editId === undefined) return;
      if (!window.confirm(confirmMessage)) return;
      setSaving(true);
      try {
        const { data, error } = await fetchWithCookie<{ message: string }>(
          `${url}/${editId}`,
          "POST",
        );
        if (error || !data) throw new Error(error || fallbackError);
        onSaved?.(data.message);
        onClose();
      } catch (err: unknown) {
        notifyError(err instanceof Error ? err.message : fallbackError);
      } finally {
        setSaving(false);
      }
    },
    [editId, notifyError, onClose, onSaved],
  );

  const title =
    editId === undefined
      ? "Create Eligibility"
      : mode === "view"
        ? "Eligibility (Approved)"
        : "Edit Eligibility";

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
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            pb: 1,
          }}
        >
          <Typography variant="h6" component="span">
            {title}
          </Typography>
          <IconButton onClick={onClose} size="small" aria-label="Close dialog">
            <X size={20} />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers>
          {loading ? (
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                minHeight: 200,
              }}
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
              {/* Approval is final: an approved record opens read-only (mode
                  "view") with neither button — it can no longer be approved
                  again nor rejected. Both actions only exist while the record
                  is still Open or Rejected. */}
              {editId !== undefined && mode === "edit" && (
                <Stack direction="row" spacing={1} sx={{ mt: 2 }} justifyContent="flex-end">
                  <MuiButton
                    variant="outlined"
                    color="error"
                    disabled={saving}
                    onClick={() =>
                      void runStatusAction(
                        apiRoutesPortalMasters.HOL_INC_ELIG_REJECT,
                        "Reject this eligibility record?",
                        "Failed to reject eligibility",
                      )
                    }
                  >
                    Reject
                  </MuiButton>
                  <MuiButton
                    variant="contained"
                    color="success"
                    disabled={saving}
                    onClick={() =>
                      void runStatusAction(
                        apiRoutesPortalMasters.HOL_INC_ELIG_APPROVE,
                        "Approve this eligibility record? It can no longer be edited or rejected.",
                        "Failed to approve eligibility",
                      )
                    }
                  >
                    Approve
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
