"use client";

/**
 * @hook useJutePOApproval
 * @description Manages approval workflow state and actions for Jute PO, including
 * the settlement actions (short close, reopen from CLOSED).
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import type {
  MuiFormMode,
  ApprovalStatusId,
  ApprovalInfo,
  ApprovalActionPermissions,
  JutePODetails,
} from "../types/jutePOTypes";
import {
  JUTE_PO_STATUS_IDS,
  JUTE_PO_STATUS_LABELS,
  JUTE_PO_STATUS_COLORS,
} from "../utils/jutePOConstants";
import { canShowClosePO, canShowReopenClosed } from "../utils/jutePOSettlement";
import { apiRoutesPortalMasters } from "@/utils/api";
import { fetchWithCookie } from "@/utils/apiClient2";
import { closeJutePo, reopenJutePo } from "@/utils/jutePOService";

export type JutePONotify = (severity: "success" | "error", message: string) => void;

type UseJutePOApprovalParams = {
  mode: MuiFormMode;
  jutePOId: string | null;
  coId: string;
  details: JutePODetails | null;
  setDetails: React.Dispatch<React.SetStateAction<JutePODetails | null>>;
  /** Edit access on the PO menu (sidebar `hasMenuAccess(pathname, "edit")`). Gates Close / Reopen-closed. */
  canEdit?: boolean;
  /** Called after a close / reopen-from-closed so the page can reload the PO and its status log. */
  onSettlementChange?: () => void | Promise<void>;
  /** Toast sink for the settlement actions. */
  notify?: JutePONotify;
};

type UseJutePOApprovalReturn = {
  statusId: ApprovalStatusId;
  approvalInfo: ApprovalInfo;
  approvalPermissions: ApprovalActionPermissions;
  approvalLoading: boolean;
  handleOpen: () => Promise<void>;
  handleApprove: () => Promise<void>;
  handleReject: (reason: string) => Promise<void>;
  handleCancelDraft: () => Promise<void>;
  handleReopen: () => Promise<void>;
  handleClose: (remark: string) => Promise<void>;
};

export function useJutePOApproval({
  mode,
  jutePOId,
  coId,
  details,
  setDetails,
  canEdit = false,
  onSettlementChange,
  notify,
}: UseJutePOApprovalParams): UseJutePOApprovalReturn {
  const router = useRouter();
  const [approvalLoading, setApprovalLoading] = React.useState(false);

  // Derive status from details
  const statusId = React.useMemo<ApprovalStatusId>(() => {
    if (!details) return JUTE_PO_STATUS_IDS.DRAFT;
    return (details.status_id as ApprovalStatusId) ?? JUTE_PO_STATUS_IDS.DRAFT;
  }, [details]);

  // Build approval info for display
  const approvalInfo = React.useMemo<ApprovalInfo>(() => {
    return {
      statusId,
      statusLabel: JUTE_PO_STATUS_LABELS[statusId] ?? "Unknown",
      statusColor: JUTE_PO_STATUS_COLORS[statusId] ?? "default",
    };
  }, [statusId]);

  // Derive permissions based on status and mode
  const approvalPermissions = React.useMemo<ApprovalActionPermissions>(() => {
    if (mode === "create") {
      return { canSave: true };
    }

    // Settlement actions — only once the PO has actually loaded.
    const loaded = details !== null;
    const canClose = loaded && canShowClosePO({ mode, statusId, canEdit });
    const canReopenClosed = loaded && canShowReopenClosed({ mode, statusId, canEdit });

    if (mode === "view") {
      return {
        canViewApprovalLog: true,
        canClone: statusId === JUTE_PO_STATUS_IDS.APPROVED,
        canClose,
        canReopen: canReopenClosed,
      };
    }

    // Edit mode permissions by status
    switch (statusId) {
      case JUTE_PO_STATUS_IDS.DRAFT:
        return { canSave: true, canOpen: true, canCancelDraft: true };
      case JUTE_PO_STATUS_IDS.OPEN:
        return { canSave: true, canApprove: true, canReject: true };
      case JUTE_PO_STATUS_IDS.PENDING_APPROVAL:
        return { canViewApprovalLog: true };
      case JUTE_PO_STATUS_IDS.APPROVED:
        return { canViewApprovalLog: true, canClone: true, canClose };
      case JUTE_PO_STATUS_IDS.REJECTED:
      case JUTE_PO_STATUS_IDS.CANCELLED:
        return { canReopen: true, canClone: true, canViewApprovalLog: true };
      case JUTE_PO_STATUS_IDS.CLOSED:
        return { canViewApprovalLog: true, canReopen: canReopenClosed };
      default:
        return {};
    }
  }, [mode, statusId, canEdit, details]);

  // Approval action handlers
  const handleOpen = React.useCallback(async () => {
    if (!jutePOId || !coId) return;
    setApprovalLoading(true);
    try {
      const response = await fetchWithCookie(
        `${apiRoutesPortalMasters.JUTE_PO_OPEN}/${jutePOId}?co_id=${coId}`,
        "POST"
      );
      if (response?.data && !response.error) {
        setDetails((prev) => (prev ? { ...prev, status_id: JUTE_PO_STATUS_IDS.OPEN } : prev));
      }
    } catch (error) {
      console.error("Error opening Jute PO:", error);
    } finally {
      setApprovalLoading(false);
    }
  }, [jutePOId, coId, setDetails]);

  const handleApprove = React.useCallback(async () => {
    if (!jutePOId || !coId) return;
    setApprovalLoading(true);
    try {
      const response = await fetchWithCookie(
        `${apiRoutesPortalMasters.JUTE_PO_APPROVE}/${jutePOId}?co_id=${coId}`,
        "POST"
      );
      if (response?.data && !response.error) {
        setDetails((prev) => (prev ? { ...prev, status_id: JUTE_PO_STATUS_IDS.APPROVED } : prev));
        // Redirect to view mode after approval
        router.push(`/dashboardportal/jutePurchase/po/createPO?mode=view&id=${jutePOId}`);
      }
    } catch (error) {
      console.error("Error approving Jute PO:", error);
    } finally {
      setApprovalLoading(false);
    }
  }, [jutePOId, coId, setDetails, router]);

  const handleReject = React.useCallback(
    async (reason: string) => {
      if (!jutePOId || !coId) return;
      setApprovalLoading(true);
      try {
        const response = await fetchWithCookie(
          `${apiRoutesPortalMasters.JUTE_PO_REJECT}/${jutePOId}?co_id=${coId}`,
          "POST",
          { reason }
        );
        if (response?.data && !response.error) {
          setDetails((prev) => (prev ? { ...prev, status_id: JUTE_PO_STATUS_IDS.REJECTED } : prev));
        }
      } catch (error) {
        console.error("Error rejecting Jute PO:", error);
      } finally {
        setApprovalLoading(false);
      }
    },
    [jutePOId, coId, setDetails]
  );

  const handleCancelDraft = React.useCallback(async () => {
    if (!jutePOId || !coId) return;
    setApprovalLoading(true);
    try {
      const response = await fetchWithCookie(
        `${apiRoutesPortalMasters.JUTE_PO_CANCEL_DRAFT}/${jutePOId}?co_id=${coId}`,
        "POST"
      );
      if (response?.data && !response.error) {
        setDetails((prev) => (prev ? { ...prev, status_id: JUTE_PO_STATUS_IDS.CANCELLED } : prev));
        // Redirect back to list
        router.push("/dashboardportal/jutePurchase/po");
      }
    } catch (error) {
      console.error("Error cancelling Jute PO:", error);
    } finally {
      setApprovalLoading(false);
    }
  }, [jutePOId, coId, setDetails, router]);

  const handleReopen = React.useCallback(async () => {
    if (!jutePOId || !coId) return;
    setApprovalLoading(true);

    // CLOSED → back to the pre-close status (OPEN / APPROVED). Stay on the page and
    // reload: the restored status is usually APPROVED, which is not editable.
    if (statusId === JUTE_PO_STATUS_IDS.CLOSED) {
      try {
        await reopenJutePo({ jutePoId: jutePOId, coId });
        notify?.("success", "PO reopened");
        await onSettlementChange?.();
      } catch (error) {
        notify?.("error", error instanceof Error ? error.message : "Failed to reopen PO");
      } finally {
        setApprovalLoading(false);
      }
      return;
    }

    // Rejected / cancelled → Draft (legacy behaviour): go to edit mode.
    try {
      const response = await fetchWithCookie(
        `${apiRoutesPortalMasters.JUTE_PO_REOPEN}/${jutePOId}?co_id=${coId}`,
        "POST"
      );
      if (response?.data && !response.error) {
        setDetails((prev) => (prev ? { ...prev, status_id: JUTE_PO_STATUS_IDS.DRAFT } : prev));
        // Redirect to edit mode
        router.push(`/dashboardportal/jutePurchase/po/createPO?mode=edit&id=${jutePOId}`);
      }
    } catch (error) {
      console.error("Error reopening Jute PO:", error);
    } finally {
      setApprovalLoading(false);
    }
  }, [jutePOId, coId, statusId, setDetails, router, notify, onSettlementChange]);

  const handleClose = React.useCallback(
    async (remark: string) => {
      if (!jutePOId || !coId) return;
      setApprovalLoading(true);
      try {
        await closeJutePo({ jutePoId: jutePOId, coId, remark });
        notify?.("success", "PO closed");
        await onSettlementChange?.();
      } catch (error) {
        notify?.("error", error instanceof Error ? error.message : "Failed to close PO");
        throw error; // keep the dialog open so the user can retry / read the message
      } finally {
        setApprovalLoading(false);
      }
    },
    [jutePOId, coId, notify, onSettlementChange]
  );

  return {
    statusId,
    approvalInfo,
    approvalPermissions,
    approvalLoading,
    handleOpen,
    handleApprove,
    handleReject,
    handleCancelDraft,
    handleReopen,
    handleClose,
  };
}
