/**
 * @file yarnIssueConstants.ts
 * @description Status ids, labels, issue types and route paths shared by the Yarn
 * Issue list and edit pages. Status ids follow the fixed approval contract
 * (`instructions.md`).
 */
import type { ApprovalStatusId } from "@/components/ui/transaction";
import type { YarnIssueType } from "@/utils/yarnIssueService";

export const YARN_ISSUE_LIST_PATH = "/dashboardportal/jutePurchase/yarnIssue";
/** Sidebar `menu_path` of the Yarn Issue menu (no `/dashboardportal/` prefix). */
export const YARN_ISSUE_MENU_PATH = "jutePurchase/yarnIssue";

export const YARN_ISSUE_TYPES = {
	ISSUE: "ISSUE",
	RETURN: "RETURN",
} as const satisfies Record<string, YarnIssueType>;

export type YarnIssueTypeOption = { value: YarnIssueType; label: string };

/** ISSUE moves kg godown → department floor; RETURN moves it back. */
export const YARN_ISSUE_TYPE_OPTIONS: ReadonlyArray<YarnIssueTypeOption> = [
	{ value: YARN_ISSUE_TYPES.ISSUE, label: "Issue (godown → floor)" },
	{ value: YARN_ISSUE_TYPES.RETURN, label: "Return (floor → godown)" },
];

export const getIssueTypeLabel = (value: YarnIssueType | null | undefined): string =>
	value === YARN_ISSUE_TYPES.RETURN ? "Return" : value === YARN_ISSUE_TYPES.ISSUE ? "Issue" : "-";

export const YARN_ISSUE_STATUS_IDS = {
	DRAFT: 21,
	OPEN: 1,
	PENDING_APPROVAL: 20,
	APPROVED: 3,
	REJECTED: 4,
	CANCELLED: 6,
} as const satisfies Record<string, ApprovalStatusId>;

export const YARN_ISSUE_STATUS_LABELS: Record<ApprovalStatusId, string> = {
	21: "Draft",
	1: "Open",
	20: "Pending Approval",
	3: "Approved",
	4: "Rejected",
	5: "Closed",
	6: "Cancelled",
};

/** Statuses a user can filter the list by (Closed is not part of this lifecycle). */
export const YARN_ISSUE_STATUS_FILTER_OPTIONS: ReadonlyArray<{ value: ApprovalStatusId; label: string }> = [
	{ value: YARN_ISSUE_STATUS_IDS.DRAFT, label: "Draft" },
	{ value: YARN_ISSUE_STATUS_IDS.OPEN, label: "Open" },
	{ value: YARN_ISSUE_STATUS_IDS.PENDING_APPROVAL, label: "Pending Approval" },
	{ value: YARN_ISSUE_STATUS_IDS.APPROVED, label: "Approved" },
	{ value: YARN_ISSUE_STATUS_IDS.REJECTED, label: "Rejected" },
	{ value: YARN_ISSUE_STATUS_IDS.CANCELLED, label: "Cancelled" },
];

const APPROVAL_STATUS_ID_SET: ReadonlySet<number> = new Set<number>([1, 3, 4, 5, 6, 20, 21]);

/** Narrow an arbitrary backend status id to the approval-bar union, or null. */
export const toApprovalStatusId = (value: number | null | undefined): ApprovalStatusId | null =>
	value != null && APPROVAL_STATUS_ID_SET.has(value) ? (value as ApprovalStatusId) : null;

/** Header and lines are editable only in Draft (21) or Open (1). */
export const isEditableStatus = (value: number | null | undefined): boolean =>
	value === YARN_ISSUE_STATUS_IDS.DRAFT || value === YARN_ISSUE_STATUS_IDS.OPEN;

export type StatusChipColor = "default" | "primary" | "secondary" | "success" | "error" | "warning" | "info";

export const getStatusChipColor = (statusId: number | null | undefined): StatusChipColor => {
	switch (statusId) {
		case YARN_ISSUE_STATUS_IDS.APPROVED:
			return "success";
		case YARN_ISSUE_STATUS_IDS.REJECTED:
		case YARN_ISSUE_STATUS_IDS.CANCELLED:
			return "error";
		case YARN_ISSUE_STATUS_IDS.PENDING_APPROVAL:
			return "warning";
		case YARN_ISSUE_STATUS_IDS.OPEN:
			return "primary";
		case YARN_ISSUE_STATUS_IDS.DRAFT:
			return "info";
		default:
			return "default";
	}
};

/** Chip colour for the type column: issues primary, returns secondary. */
export const getIssueTypeChipColor = (value: YarnIssueType | null | undefined): StatusChipColor =>
	value === YARN_ISSUE_TYPES.RETURN ? "secondary" : "primary";

/** Chip label: backend name when present, else the contract label; pending shows its level. */
export const getStatusLabel = (statusId: number | null | undefined, statusName?: string | null, approvalLevel?: number | null): string => {
	const known = toApprovalStatusId(statusId);
	const base = statusName?.trim() || (known != null ? YARN_ISSUE_STATUS_LABELS[known] : "Draft");
	if (known === YARN_ISSUE_STATUS_IDS.PENDING_APPROVAL && approvalLevel != null && !/L\d+$/.test(base)) {
		return `${base} L${approvalLevel}`;
	}
	return base;
};
