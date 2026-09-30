/**
 * @file useYarnIssueApproval.ts
 * @description Approval-state derivation and the status-change handlers for a Yarn
 * Issue / Return (open / cancel draft / send for approval / approve / reject /
 * reopen). Mirrors `jutePurchase/yarnPurchase/edit/hooks/useYarnPurchaseApproval.ts`.
 *
 * Permissions come straight from the GET response; the hook never invents them
 * (a fresh, unsaved document only gets `canSave`).
 */
import React from "react";
import { toast } from "@/hooks/use-toast";
import type { ApprovalActionPermissions, ApprovalInfo, ApprovalStatusId } from "@/components/ui/transaction";
import {
	approveYarnIssue,
	cancelDraftYarnIssue,
	openYarnIssue,
	rejectYarnIssue,
	reopenYarnIssue,
	sendYarnIssueForApproval,
	type YarnIssueHeader,
	type YarnIssuePermissions,
	type YarnIssueStatusChangeResponse,
} from "@/utils/yarnIssueService";
import {
	YARN_ISSUE_STATUS_IDS,
	YARN_ISSUE_STATUS_LABELS,
	getStatusChipColor,
	getStatusLabel,
	toApprovalStatusId,
	type StatusChipColor,
} from "../../utils/yarnIssueConstants";

type UseYarnIssueApprovalParams = {
	yarnIssueId: number | null;
	header: YarnIssueHeader | null;
	permissions: YarnIssuePermissions | null;
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
	action: (ctx: ActionContext) => Promise<YarnIssueStatusChangeResponse>;
	describe?: (result: YarnIssueStatusChangeResponse) => string | undefined;
};

export const useYarnIssueApproval = ({
	yarnIssueId,
	header,
	permissions,
	coId,
	branchId,
	getMenuId,
	onRefresh,
}: UseYarnIssueApprovalParams) => {
	const [approvalLoading, setApprovalLoading] = React.useState(false);

	/** Status id from the header, defaulting to Draft (21) for an unsaved document. */
	const statusId = React.useMemo<ApprovalStatusId>(
		() => toApprovalStatusId(header?.status_id) ?? YARN_ISSUE_STATUS_IDS.DRAFT,
		[header?.status_id],
	);

	const approvalPermissions = React.useMemo<ApprovalActionPermissions>(() => {
		if (!header) return { canSave: true };
		return permissions ?? {};
	}, [header, permissions]);

	const approvalInfo = React.useMemo<ApprovalInfo>(
		() => ({
			statusId,
			statusLabel: header?.status_name?.trim() || YARN_ISSUE_STATUS_LABELS[statusId],
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
			if (yarnIssueId == null) return;
			if (branchId == null) {
				toast({ variant: "destructive", title: "Branch required", description: "Branch is required for this action." });
				return;
			}
			const menuId = getMenuId();
			if (!menuId) {
				toast({ variant: "destructive", title: "Menu ID required", description: "Could not resolve the Yarn Issue menu." });
				return;
			}

			setApprovalLoading(true);
			try {
				const result = await action({ id: yarnIssueId, branchId, menuId });
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
		[yarnIssueId, branchId, getMenuId, onRefresh],
	);

	const handleOpen = React.useCallback(
		() =>
			runAction({
				successTitle: "Yarn issue opened",
				failTitle: "Unable to open yarn issue",
				action: ({ id, branchId: b, menuId }) => openYarnIssue(id, b, menuId),
				describe: () => "Issue number generated.",
			}),
		[runAction],
	);

	const handleCancelDraft = React.useCallback(
		() =>
			runAction({
				successTitle: "Draft cancelled",
				failTitle: "Unable to cancel draft",
				action: ({ id, branchId: b, menuId }) => cancelDraftYarnIssue(id, b, menuId),
			}),
		[runAction],
	);

	const handleReopen = React.useCallback(
		() =>
			runAction({
				successTitle: "Yarn issue reopened",
				failTitle: "Unable to reopen yarn issue",
				action: ({ id, branchId: b, menuId }) => reopenYarnIssue(id, b, menuId),
			}),
		[runAction],
	);

	const handleSendForApproval = React.useCallback(
		() =>
			runAction({
				successTitle: "Sent for approval",
				failTitle: "Unable to send for approval",
				action: ({ id, branchId: b, menuId }) => sendYarnIssueForApproval(id, b, menuId),
				describe: (result) => (result.new_approval_level ? `Approval level: ${result.new_approval_level}` : undefined),
			}),
		[runAction],
	);

	const handleApprove = React.useCallback(
		() =>
			runAction({
				successTitle: "Yarn issue approved",
				failTitle: "Unable to approve yarn issue",
				action: ({ id, branchId: b, menuId }) => approveYarnIssue(id, b, menuId),
				describe: (result) =>
					result.new_status_id === YARN_ISSUE_STATUS_IDS.APPROVED
						? "Fully approved; the yarn has moved between godown and floor."
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
				successTitle: "Yarn issue rejected",
				failTitle: "Unable to reject yarn issue",
				action: ({ id, menuId }) => rejectYarnIssue(id, coId, menuId, reason),
			});
		},
		[runAction, coId],
	);

	const handleViewApprovalLog = React.useCallback(() => {
		if (yarnIssueId == null) return;
		toast({ title: "Opening approval log...", description: "Feature coming soon" });
	}, [yarnIssueId]);

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

export default useYarnIssueApproval;
