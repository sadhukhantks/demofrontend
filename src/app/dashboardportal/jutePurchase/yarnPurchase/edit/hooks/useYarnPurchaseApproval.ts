/**
 * @file useYarnPurchaseApproval.ts
 * @description Approval-state derivation and the status-change handlers for a Yarn
 * Purchase (open / cancel draft / send for approval / approve / reject / reopen).
 * Mirrors `procurement/indent/createIndent/hooks/useIndentApproval.ts`.
 *
 * Permissions come straight from the GET response; the hook never invents them
 * (a fresh, unsaved document only gets `canSave`).
 */
import React from "react";
import { toast } from "@/hooks/use-toast";
import type { ApprovalActionPermissions, ApprovalInfo, ApprovalStatusId } from "@/components/ui/transaction";
import {
	approveYarnPurchase,
	cancelDraftYarnPurchase,
	openYarnPurchase,
	rejectYarnPurchase,
	reopenYarnPurchase,
	sendYarnPurchaseForApproval,
	type YarnPurchaseHeader,
	type YarnPurchasePermissions,
	type YarnPurchaseStatusChangeResponse,
} from "@/utils/yarnPurchaseService";
import {
	YARN_PURCHASE_STATUS_IDS,
	YARN_PURCHASE_STATUS_LABELS,
	getStatusChipColor,
	getStatusLabel,
	toApprovalStatusId,
	type StatusChipColor,
} from "../../utils/yarnPurchaseConstants";

type UseYarnPurchaseApprovalParams = {
	yarnPurchaseId: number | null;
	header: YarnPurchaseHeader | null;
	permissions: YarnPurchasePermissions | null;
	coId: number | null;
	branchId: number | null;
	/** Sidebar menu id (falls back to `setup.menu_id` in the page). */
	getMenuId: () => string;
	/** Re-fetch the document after a successful action. */
	onRefresh: () => Promise<void>;
};

type ActionContext = { id: number; branchId: number; menuId: string };

type RunActionArgs = {
	successTitle: string;
	failTitle: string;
	action: (ctx: ActionContext) => Promise<YarnPurchaseStatusChangeResponse>;
	describe?: (result: YarnPurchaseStatusChangeResponse) => string | undefined;
};

export const useYarnPurchaseApproval = ({
	yarnPurchaseId,
	header,
	permissions,
	coId,
	branchId,
	getMenuId,
	onRefresh,
}: UseYarnPurchaseApprovalParams) => {
	const [approvalLoading, setApprovalLoading] = React.useState(false);

	/** Status id from the header, defaulting to Draft (21) for an unsaved document. */
	const statusId = React.useMemo<ApprovalStatusId>(
		() => toApprovalStatusId(header?.status_id) ?? YARN_PURCHASE_STATUS_IDS.DRAFT,
		[header?.status_id],
	);

	const approvalPermissions = React.useMemo<ApprovalActionPermissions>(() => {
		if (!header) return { canSave: true };
		return permissions ?? {};
	}, [header, permissions]);

	const approvalInfo = React.useMemo<ApprovalInfo>(
		() => ({
			statusId,
			statusLabel: header?.status_name?.trim() || YARN_PURCHASE_STATUS_LABELS[statusId],
			approvalLevel: header?.approval_level ?? null,
			maxApprovalLevel: null,
			isFinalLevel: false,
		}),
		[statusId, header?.status_name, header?.approval_level],
	);

	const statusChipProps = React.useMemo<{ label: string; color: StatusChipColor }>(
		() => ({
			label: getStatusLabel(statusId, header?.status_name, header?.approval_level),
			color: getStatusChipColor(statusId),
		}),
		[statusId, header?.status_name, header?.approval_level],
	);

	const runAction = React.useCallback(
		async ({ successTitle, failTitle, action, describe }: RunActionArgs) => {
			if (yarnPurchaseId == null) return;
			if (branchId == null) {
				toast({ variant: "destructive", title: "Branch required", description: "Branch is required for this action." });
				return;
			}
			const menuId = getMenuId();
			if (!menuId) {
				toast({ variant: "destructive", title: "Menu ID required", description: "Could not resolve the Yarn Purchase menu." });
				return;
			}

			setApprovalLoading(true);
			try {
				const result = await action({ id: yarnPurchaseId, branchId, menuId });
				toast({ title: result.message || successTitle, description: describe?.(result) });
				await onRefresh();
			} catch (error) {
				toast({
					variant: "destructive",
					title: failTitle,
					description: error instanceof Error ? error.message : "Please try again.",
				});
			} finally {
				setApprovalLoading(false);
			}
		},
		[yarnPurchaseId, branchId, getMenuId, onRefresh],
	);

	const handleOpen = React.useCallback(
		() =>
			runAction({
				successTitle: "Yarn purchase opened",
				failTitle: "Unable to open yarn purchase",
				action: ({ id, branchId: b, menuId }) => openYarnPurchase(id, b, menuId),
				describe: () => "Purchase number generated.",
			}),
		[runAction],
	);

	const handleCancelDraft = React.useCallback(
		() =>
			runAction({
				successTitle: "Draft cancelled",
				failTitle: "Unable to cancel draft",
				action: ({ id, branchId: b, menuId }) => cancelDraftYarnPurchase(id, b, menuId),
			}),
		[runAction],
	);

	const handleReopen = React.useCallback(
		() =>
			runAction({
				successTitle: "Yarn purchase reopened",
				failTitle: "Unable to reopen yarn purchase",
				action: ({ id, branchId: b, menuId }) => reopenYarnPurchase(id, b, menuId),
			}),
		[runAction],
	);

	const handleSendForApproval = React.useCallback(
		() =>
			runAction({
				successTitle: "Sent for approval",
				failTitle: "Unable to send for approval",
				action: ({ id, branchId: b, menuId }) => sendYarnPurchaseForApproval(id, b, menuId),
				describe: (result) => (result.new_approval_level ? `Approval level: ${result.new_approval_level}` : undefined),
			}),
		[runAction],
	);

	const handleApprove = React.useCallback(
		() =>
			runAction({
				successTitle: "Yarn purchase approved",
				failTitle: "Unable to approve yarn purchase",
				action: ({ id, branchId: b, menuId }) => approveYarnPurchase(id, b, menuId),
				describe: (result) =>
					result.new_status_id === YARN_PURCHASE_STATUS_IDS.APPROVED
						? "Yarn purchase has been fully approved; the yarn now counts as stock."
						: result.new_approval_level
							? `Moved to approval level ${result.new_approval_level}.`
							: undefined,
			}),
		[runAction],
	);

	const handleReject = React.useCallback(
		(reason: string) => {
			if (coId == null) {
				toast({ variant: "destructive", title: "Company required", description: "Company is required to reject." });
				return Promise.resolve();
			}
			return runAction({
				successTitle: "Yarn purchase rejected",
				failTitle: "Unable to reject yarn purchase",
				action: ({ id, menuId }) => rejectYarnPurchase(id, coId, menuId, reason),
			});
		},
		[runAction, coId],
	);

	const handleViewApprovalLog = React.useCallback(() => {
		if (yarnPurchaseId == null) return;
		toast({ title: "Opening approval log...", description: "Feature coming soon" });
	}, [yarnPurchaseId]);

	return {
		approvalLoading,
		statusId,
		approvalInfo,
		approvalPermissions,
		statusChipProps,
		handleOpen,
		handleCancelDraft,
		handleReopen,
		handleSendForApproval,
		handleApprove,
		handleReject,
		handleViewApprovalLog,
	};
};

export default useYarnPurchaseApproval;
