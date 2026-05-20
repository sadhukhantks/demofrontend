"use client";

import React, {
  Suspense,
  useCallback,
  useMemo,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  Box,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSelectedCompanyCoId } from "@/hooks/use-selected-company-coid";
import {
  approveLeaveRequest,
  createLeaveRequest,
  rejectLeaveRequest,
  updateLeaveRequest,
} from "@/utils/hrmsService";
import LeaveBalancePanel from "./_components/LeaveBalancePanel";
import {
  type FormMode,
  useLeaveRequestForm,
} from "./hooks/useLeaveRequestForm";
import { leaveRequestFormSchema } from "./utils/schema";
import { STATUS_COLOR, STATUS_LABELS } from "../types/leaveRequestTypes";

const LIST_PATH = "/dashboardportal/hrms/hrmsmasters/leaveRequest";

function CreateLeaveRequestContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { coId } = useSelectedCompanyCoId();

  const mode = (searchParams.get("mode") ?? "create") as FormMode;
  const id = searchParams.get("id");

  const {
    values,
    updateField,
    statusId,
    workerName,
    leaveTypeOptions,
    ledger,
    approveButton,
    rejectButton,
    loadingDetail,
    error,
    setError,
    lookupWorker,
  } = useLeaveRequestForm({ coId: coId ?? "", mode, id });

  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });

  const isView = mode === "view";
  const canEdit =
    mode !== "view" && statusId !== 3 && statusId !== 4 && !loadingDetail;
  const canApprove = mode !== "create" && approveButton && !isView;
  const canReject = mode !== "create" && rejectButton && !isView;

  const showSnack = useCallback(
    (message: string, severity: "success" | "error") =>
      setSnackbar({ open: true, message, severity }),
    [],
  );

  const validateAndGetPayload = useCallback(() => {
    const parsed = leaveRequestFormSchema.safeParse(values);
    if (!parsed.success) {
      const firstError =
        parsed.error.issues[0]?.message ?? "Validation failed";
      showSnack(firstError, "error");
      return null;
    }
    if (!coId) {
      showSnack("Company not selected", "error");
      return null;
    }
    return {
      co_id: coId,
      eb_id: parsed.data.eb_id,
      leave_type_id: parsed.data.leave_type_id,
      leave_from_date: parsed.data.leave_from_date,
      leave_to_date: parsed.data.leave_to_date,
      leave_purpose: parsed.data.leave_purpose,
    };
  }, [coId, values, showSnack]);

  const handleSave = useCallback(async () => {
    const payload = validateAndGetPayload();
    if (!payload) return;
    setSaving(true);
    try {
      if (mode === "create") {
        const res = await createLeaveRequest(payload);
        if (res?.error) throw new Error(res.error);
        showSnack("Leave request created", "success");
        router.push(LIST_PATH);
      } else if (mode === "edit" && id) {
        const res = await updateLeaveRequest(id, payload);
        if (res?.error) throw new Error(res.error);
        showSnack("Leave request updated", "success");
        router.push(LIST_PATH);
      }
    } catch (err: unknown) {
      showSnack(err instanceof Error ? err.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  }, [validateAndGetPayload, mode, id, router, showSnack]);

  const handleApprove = useCallback(async () => {
    if (!coId || !id) return;
    setSaving(true);
    try {
      const res = await approveLeaveRequest(id, { co_id: coId });
      if (res?.error) throw new Error(res.error);
      showSnack("Leave request approved", "success");
      router.push(LIST_PATH);
    } catch (err: unknown) {
      showSnack(err instanceof Error ? err.message : "Approval failed", "error");
    } finally {
      setSaving(false);
    }
  }, [coId, id, router, showSnack]);

  const handleReject = useCallback(async () => {
    if (!coId || !id) return;
    setSaving(true);
    try {
      const res = await rejectLeaveRequest(id, { co_id: coId });
      if (res?.error) throw new Error(res.error);
      showSnack("Leave request rejected", "success");
      router.push(LIST_PATH);
    } catch (err: unknown) {
      showSnack(err instanceof Error ? err.message : "Rejection failed", "error");
    } finally {
      setSaving(false);
    }
  }, [coId, id, router, showSnack]);

  const titleText = useMemo(() => {
    if (mode === "view") return "View Leave Request";
    if (mode === "edit") return "Edit Leave Request";
    return "Apply Leave";
  }, [mode]);

  return (
    <Box className="flex flex-col gap-6 p-4">
      <Box className="flex items-center justify-between">
        <Stack direction="row" spacing={2} alignItems="center">
          <Typography variant="h5">{titleText}</Typography>
          {mode !== "create" ? (
            <Box
              component="span"
              sx={{
                px: 1.5,
                py: 0.25,
                borderRadius: 1,
                fontSize: 12,
                fontWeight: 500,
                bgcolor: `${STATUS_COLOR[statusId] ?? "default"}.light`,
                color: `${STATUS_COLOR[statusId] ?? "default"}.contrastText`,
                border: "1px solid",
                borderColor: `${STATUS_COLOR[statusId] ?? "default"}.main`,
              }}
            >
              {STATUS_LABELS[statusId] ?? "Unknown"}
            </Box>
          ) : null}
        </Stack>
        <Box className="flex gap-2">
          <Button variant="outline" onClick={() => router.push(LIST_PATH)}>
            Back
          </Button>
          {canEdit ? (
            <Button onClick={handleSave} disabled={saving}>
              {saving
                ? "Saving..."
                : mode === "create"
                  ? "Create"
                  : "Update"}
            </Button>
          ) : null}
          {canApprove ? (
            <Button onClick={handleApprove} disabled={saving}>
              Approve
            </Button>
          ) : null}
          {canReject ? (
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={saving}
            >
              Reject
            </Button>
          ) : null}
        </Box>
      </Box>

      {error ? <Alert severity="error">{error}</Alert> : null}

      <Paper className="p-4">
        <Typography variant="subtitle1" className="mb-3 font-semibold">
          Leave Details
        </Typography>
        <Box
          className="grid gap-4"
          sx={{ gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(3, 1fr)" } }}
        >
          <TextField
            label="Employee Code"
            size="small"
            value={values.eb_no}
            onChange={(e) => updateField("eb_no", e.target.value.toUpperCase())}
            disabled={isView || mode === "edit"}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    onClick={lookupWorker}
                    disabled={isView || mode === "edit" || !values.eb_no}
                    aria-label="Lookup employee"
                  >
                    <Search size={16} />
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          <TextField
            label="Worker Name"
            size="small"
            value={workerName}
            disabled
          />
          <TextField
            select
            label="Leave Type"
            size="small"
            value={values.leave_type_id ? String(values.leave_type_id) : ""}
            onChange={(e) =>
              updateField("leave_type_id", Number(e.target.value))
            }
            disabled={isView || !canEdit}
            required
          >
            <MenuItem value="">Select leave type</MenuItem>
            {leaveTypeOptions.map((opt) => (
              <MenuItem
                key={opt.leave_type_id}
                value={String(opt.leave_type_id)}
              >
                {opt.leave_type_description || opt.leave_type_code}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="From Date"
            type="date"
            size="small"
            value={values.leave_from_date}
            onChange={(e) => updateField("leave_from_date", e.target.value)}
            disabled={isView || !canEdit}
            InputLabelProps={{ shrink: true }}
            required
          />
          <TextField
            label="To Date"
            type="date"
            size="small"
            value={values.leave_to_date}
            onChange={(e) => updateField("leave_to_date", e.target.value)}
            disabled={isView || !canEdit}
            InputLabelProps={{ shrink: true }}
            required
          />
          <TextField
            label="Reason"
            size="small"
            multiline
            minRows={2}
            value={values.leave_purpose}
            onChange={(e) => updateField("leave_purpose", e.target.value)}
            disabled={isView || !canEdit}
            sx={{ gridColumn: { md: "span 3" } }}
            required
          />
        </Box>
      </Paper>

      <LeaveBalancePanel
        ledger={ledger}
        selectedLeaveTypeId={values.leave_type_id}
      />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => {
          setSnackbar((s) => ({ ...s, open: false }));
          setError(null);
        }}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity={snackbar.severity} variant="filled">
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default function CreateLeaveRequestPage() {
  return (
    <Suspense
      fallback={
        <Box className="p-4">
          <Typography>Loading...</Typography>
        </Box>
      }
    >
      <CreateLeaveRequestContent />
    </Suspense>
  );
}
