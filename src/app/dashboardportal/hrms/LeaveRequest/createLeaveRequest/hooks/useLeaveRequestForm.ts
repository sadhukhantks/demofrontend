"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchLeaveLedgerByEb,
  fetchLeaveRequestById,
  fetchLeaveTypeOptions,
  fetchWorkerByEbNo,
} from "@/utils/hrmsService";
import type {
  LeaveLedgerEntry,
  LeaveRequestDetail,
  LeaveTypeOption,
  WorkerLookupResult,
} from "../../types/leaveRequestTypes";
import type { LeaveRequestFormValues } from "../utils/schema";

export type FormMode = "create" | "edit" | "view";

const ACTIVE_EMP_STATUS = 35;

const blankValues: LeaveRequestFormValues = {
  branch_id: 0,
  eb_no: "",
  eb_id: 0,
  leave_type_id: 0,
  leave_from_date: "",
  leave_to_date: "",
  leave_purpose: "",
};

export function useLeaveRequestForm(params: {
  coId: string;
  defaultBranchId: number;
  mode: FormMode;
  id: string | null;
}) {
  const { coId, defaultBranchId, mode, id } = params;

  const [values, setValues] = useState<LeaveRequestFormValues>(() => ({
    ...blankValues,
    branch_id: defaultBranchId,
  }));
  const [statusId, setStatusId] = useState<number>(21);
  const [workerName, setWorkerName] = useState<string>("");
  const [empStatus, setEmpStatus] = useState<number | null>(null);
  const [leaveTypeOptions, setLeaveTypeOptions] = useState<LeaveTypeOption[]>([]);
  const [ledger, setLedger] = useState<LeaveLedgerEntry[]>([]);
  const [approveButton, setApproveButton] = useState(false);
  const [rejectButton, setRejectButton] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateField = useCallback(
    <K extends keyof LeaveRequestFormValues>(
      field: K,
      value: LeaveRequestFormValues[K],
    ) => setValues((prev) => ({ ...prev, [field]: value })),
    [],
  );

  // Load leave types
  useEffect(() => {
    if (!coId) return;
    let cancelled = false;
    (async () => {
      const { data, error: err } = await fetchLeaveTypeOptions(coId);
      if (cancelled) return;
      if (err || !data) return;
      const options = ((data.data ?? []) as Record<string, unknown>[]).map(
        (r) => ({
          leave_type_id: Number(r.leave_type_id),
          leave_type_code: String(r.leave_type_code ?? ""),
          leave_type_description: String(r.leave_type_description ?? ""),
        }),
      );
      setLeaveTypeOptions(options);
    })();
    return () => {
      cancelled = true;
    };
  }, [coId]);

  // Load existing detail for edit/view
  useEffect(() => {
    if (!coId || !id || mode === "create") return;
    let cancelled = false;
    setLoadingDetail(true);
    (async () => {
      try {
        const { data, error: err } = await fetchLeaveRequestById(id);
        if (cancelled) return;
        if (err || !data?.data) {
          setError(err || "Failed to load leave request");
          return;
        }
        const detail = data.data as LeaveRequestDetail;
        const h = detail.header;
        setValues({
          branch_id: h.branch_id ?? defaultBranchId,
          eb_no: h.eb_no ?? "",
          eb_id: h.eb_id,
          leave_type_id: h.leave_type_id,
          leave_from_date: h.leave_from_date ?? "",
          leave_to_date: h.leave_to_date ?? "",
          leave_purpose: h.leave_purpose ?? "",
        });
        setStatusId(Number(h.status));
        setWorkerName(h.worker_name ?? "");
        setApproveButton(Boolean(detail.approve_button));
        setRejectButton(Boolean(detail.reject_button));
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Load failed");
        }
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [coId, id, mode]);

  const lookupWorker = useCallback(async () => {
    if (!values.branch_id) {
      setError("Select a branch first");
      return;
    }
    if (!values.eb_no) return;
    try {
      const { data, error: err } = await fetchWorkerByEbNo(
        values.branch_id,
        values.eb_no,
      );
      if (err || !data?.data) {
        setError(err || "Employee not found in the selected branch");
        return;
      }
      const w = data.data as WorkerLookupResult;
      if (w.emp_status !== ACTIVE_EMP_STATUS) {
        setError("Employee is not active");
        return;
      }
      setWorkerName(w.worker_name);
      setEmpStatus(w.emp_status);
      setValues((prev) => ({ ...prev, eb_id: w.eb_id }));
      setError(null);

      const ledgerRes = await fetchLeaveLedgerByEb(
        values.branch_id,
        values.eb_no,
      );
      if (!ledgerRes.error && ledgerRes.data) {
        const ledgerData =
          ((ledgerRes.data.data as { ledgers?: LeaveLedgerEntry[] })
            ?.ledgers ?? []) as LeaveLedgerEntry[];
        setLedger(ledgerData);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    }
  }, [values.branch_id, values.eb_no]);

  const reset = useCallback(() => {
    setValues({ ...blankValues, branch_id: defaultBranchId });
    setStatusId(21);
    setWorkerName("");
    setEmpStatus(null);
    setLedger([]);
    setApproveButton(false);
    setRejectButton(false);
    setError(null);
  }, [defaultBranchId]);

  // Apply the sidebar's default branch once it becomes available (create mode).
  useEffect(() => {
    if (mode !== "create" || !defaultBranchId) return;
    setValues((prev) =>
      prev.branch_id ? prev : { ...prev, branch_id: defaultBranchId },
    );
  }, [defaultBranchId, mode]);

  return {
    values,
    setValues,
    updateField,
    statusId,
    workerName,
    empStatus,
    leaveTypeOptions,
    ledger,
    approveButton,
    rejectButton,
    loadingDetail,
    error,
    setError,
    lookupWorker,
    reset,
  };
}
