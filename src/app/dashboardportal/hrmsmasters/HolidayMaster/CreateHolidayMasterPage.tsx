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
import { todayIso } from "@/components/reports/reportDates";
import {
  HOLIDAY_TYPE_OPTIONS,
  STATUS_APPROVED,
  type HolidayRecord,
  type Option,
  type SpellRow,
} from "./types";

const EMPTY_OPTIONS: Option[] = Object.freeze([]) as unknown as Option[];

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved?: (message: string) => void;
  editId?: number;
}

/**
 * Create / edit dialog for a holiday. Branch comes from the sidebar selection,
 * not from the form — the table is branch-scoped and every portal page already
 * honours that selection. Spells are read from the Spell Master list endpoint.
 */
export default function CreateHolidayMasterPage({
  open,
  onClose,
  onSaved,
  editId,
}: Props) {
  const { selectedBranches } = useSidebarContext();
  const branchId = selectedBranches.length > 0 ? selectedBranches[0] : undefined;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<MuiFormMode>("create");
  const [formKey, setFormKey] = useState(0);
  const [initialValues, setInitialValues] = useState<Record<string, unknown>>({});
  const [spells, setSpells] = useState<Option[]>(EMPTY_OPTIONS);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });

  const notifyError = useCallback(
    (message: string) => setSnackbar({ open: true, message, severity: "error" }),
    [],
  );

  // Spell options, refreshed whenever the dialog opens for a new branch.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const params = new URLSearchParams({ limit: "500" });
      if (branchId != null) params.append("branch_id", String(branchId));
      const { data, error } = await fetchWithCookie<{ data: SpellRow[] }>(
        `${apiRoutesPortalMasters.SPELL_TABLE}?${params}`,
        "GET",
      );
      if (cancelled) return;
      if (error || !data) {
        notifyError(error || "Failed to load spells");
        return;
      }
      setSpells(
        (data.data || []).map((s) => ({
          value: String(s.spell_id),
          label: s.spell_name || s.spell_code || String(s.spell_id),
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [open, branchId, notifyError]);

  const loadRecord = useCallback(async () => {
    if (editId === undefined) {
      setInitialValues({
        holiday: "",
        holiday_date: todayIso(),
        holiday_type: "1",
        period_start_date: "",
        period_end_date: "",
        spell_id: "",
      });
      setFormKey((k) => k + 1);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await fetchWithCookie<{ data: HolidayRecord }>(
        `${apiRoutesPortalMasters.HOLIDAY_BY_ID}/${editId}`,
        "GET",
      );
      if (error || !data) throw new Error(error || "Failed to load holiday");
      const rec = data.data;
      // Approved holidays are read-only until they are reopened from the list.
      setMode(rec.status === STATUS_APPROVED ? "view" : "edit");
      setInitialValues({
        holiday: rec.holiday ?? "",
        holiday_date: rec.holiday_date ?? "",
        holiday_type: rec.holiday_type != null ? String(rec.holiday_type) : "1",
        period_start_date: rec.period_start_date ?? "",
        period_end_date: rec.period_end_date ?? "",
        spell_id: rec.spell_id != null ? String(rec.spell_id) : "",
      });
      setFormKey((k) => k + 1);
    } catch (err: unknown) {
      notifyError(err instanceof Error ? err.message : "Error loading holiday");
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
          name: "holiday",
          label: "Holiday Name",
          type: "text",
          required: true,
          grid: { xs: 12, sm: 6 },
        },
        {
          name: "holiday_date",
          label: "Holiday Date",
          type: "date",
          required: true,
          grid: { xs: 12, sm: 6 },
        },
        {
          name: "holiday_type",
          label: "Holiday Type",
          type: "select",
          options: [...HOLIDAY_TYPE_OPTIONS],
          required: true,
          grid: { xs: 12, sm: 6 },
        },
        {
          name: "spell_id",
          label: "Spell",
          type: "select",
          options: spells,
          grid: { xs: 12, sm: 6 },
        },
        {
          // The attendance period the holiday is paid in — optional, and left
          // blank when the holiday falls inside its own period.
          name: "period_start_date",
          label: "Period Start Date",
          type: "date",
          grid: { xs: 12, sm: 6 },
        },
        {
          name: "period_end_date",
          label: "Period End Date",
          type: "date",
          grid: { xs: 12, sm: 6 },
        },
      ] satisfies Field[],
    }),
    [spells],
  );

  const handleSubmit = async (values: Record<string, unknown>) => {
    if (branchId == null) {
      notifyError("Select a branch in the sidebar before saving");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        branch_id: branchId,
        holiday: values.holiday,
        holiday_date: values.holiday_date,
        holiday_type: values.holiday_type,
        period_start_date: values.period_start_date || null,
        period_end_date: values.period_end_date || null,
        spell_id: values.spell_id || null,
      };
      const isEdit = editId !== undefined;
      const { error } = await fetchWithCookie(
        isEdit
          ? `${apiRoutesPortalMasters.HOLIDAY_EDIT}/${editId}`
          : apiRoutesPortalMasters.HOLIDAY_CREATE,
        isEdit ? "PUT" : "POST",
        payload,
      );
      if (error) throw new Error(error);

      onSaved?.(
        isEdit ? "Holiday updated successfully" : "Holiday created successfully",
      );
      onClose();
    } catch (err: unknown) {
      notifyError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  /** Approve (which also processes the holiday) or Reject the saved record. */
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
      ? "Create Holiday"
      : mode === "view"
        ? "Holiday (Approved)"
        : "Edit Holiday";

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
                submitLabel={
                  saving ? "Saving..." : editId === undefined ? "Save" : "Update"
                }
                cancelLabel="Cancel"
                onCancel={onClose}
                hideModeToggle
              />
              {/* Approving processes the holiday into hrms_holiday_transactions.
                  Approval is final: an approved holiday opens read-only (mode
                  "view") with neither button — it can no longer be approved
                  again nor rejected. Both actions only exist while the holiday
                  is still Open or Rejected. */}
              {editId !== undefined && mode === "edit" && (
                <Stack direction="row" spacing={1} sx={{ mt: 2 }} justifyContent="flex-end">
                  <MuiButton
                    variant="outlined"
                    color="error"
                    disabled={saving}
                    onClick={() =>
                      void runStatusAction(
                        apiRoutesPortalMasters.HOLIDAY_REJECT,
                        "Reject this holiday?",
                        "Failed to reject holiday",
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
                        apiRoutesPortalMasters.HOLIDAY_APPROVE,
                        "Approve this holiday? Holiday hours are credited to every eligible employee. This cannot be undone.",
                        "Failed to approve holiday",
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
