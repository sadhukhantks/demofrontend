/**
 * @file MRApprovalBar.tsx
 * @description Approval actions bar for Jute Material Receipt.
 * 
 * MR Workflow (MR arrives in Open status):
 * 1. Open → Approval levels → Approved/Rejected
 * 2. Open → Pending (terminal state, handled by external system)
 */

import React from "react";
import { Button } from "@mui/material";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { AutoResizeTextarea } from "@/components/ui/transaction/AutoResizeTextarea";
import { ApprovalActionsBar, type ApprovalInfo, type ApprovalActionPermissions } from "@/components/ui/transaction";

type MRApprovalBarProps = {
	approvalInfo: ApprovalInfo;
	permissions: ApprovalActionPermissions;
	loading: boolean;
	canSetOpen: boolean;
	canSetPending: boolean;
	canReopen: boolean;
	canReturnLorry: boolean;
	partyHasNoBranches: boolean;
	onOpen: () => Promise<void>;
	onApprove: () => void | Promise<void>;
	onReject: (reason: string) => Promise<void>;
	onPending: () => Promise<void>;
	onCancel: () => Promise<void>;
	onReopen: () => void;
	onReturn: (reason: string) => Promise<void>;
	onViewApprovalLog?: () => void;
};

/**
 * Wraps ApprovalActionsBar and adds MR-specific buttons: custom Pending,
 * Reopen (decision D2, opens MRReopenDialog in the caller), and Return lorry
 * (decision "Return lorry": status 48, no settlement — reason required).
 */
export function MRApprovalBar({
	approvalInfo,
	permissions,
	loading,
	canSetOpen,
	canSetPending,
	canReopen,
	canReturnLorry,
	partyHasNoBranches,
	onOpen,
	onApprove,
	onReject,
	onPending,
	onCancel,
	onReopen,
	onReturn,
	onViewApprovalLog,
}: MRApprovalBarProps) {
	const [returnDialogOpen, setReturnDialogOpen] = React.useState(false);
	const [returnReason, setReturnReason] = React.useState("");

	const handleReturnConfirm = React.useCallback(() => {
		onReturn(returnReason.trim());
		setReturnDialogOpen(false);
		setReturnReason("");
	}, [onReturn, returnReason]);

	return (
		<div className="flex items-center gap-2 flex-wrap">
			{/* Custom Pending Button - only shown when in Open status */}
			{canSetPending && (
				<Button
					variant="outlined"
					color="warning"
					size="small"
					disabled={loading}
					onClick={onPending}
					title="Set MR to Pending status (handled by external system)"
				>
					Pending
				</Button>
			)}

			{/* Reopen - Pending/Approved only, edit-access users only (decision D2) */}
			{canReopen && (
				<Button
					variant="outlined"
					color="secondary"
					size="small"
					disabled={loading}
					onClick={onReopen}
					title="Reopen this MR for editing or QC"
				>
					Reopen
				</Button>
			)}

			{/* Return lorry - lorry sent back to supplier without settlement */}
			{canReturnLorry && (
				<Button
					variant="outlined"
					color="error"
					size="small"
					disabled={loading}
					onClick={() => setReturnDialogOpen(true)}
					title="Mark this MR Returned (lorry sent back without settlement)"
				>
					Return lorry
				</Button>
			)}

			{/* Standard Approval Actions Bar */}
			<ApprovalActionsBar
				approvalInfo={approvalInfo}
				permissions={{
					...permissions,
					// Disable Approve if party has no branches
					canApprove: permissions.canApprove && !partyHasNoBranches,
				}}
				onOpen={onOpen}
				onApprove={onApprove}
				onReject={onReject}
				onCancelDraft={onCancel}
				onViewApprovalLog={onViewApprovalLog}
				loading={loading}
			/>

			{/* Return-lorry reason dialog */}
			<Dialog open={returnDialogOpen} onOpenChange={setReturnDialogOpen}>
				<DialogContent className="sm:max-w-125">
					<DialogHeader>
						<DialogTitle>Return Lorry</DialogTitle>
						<DialogDescription>
							The lorry is being sent back to the supplier without settlement. Please provide a reason.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 py-4">
						<div className="space-y-2">
							<label
								htmlFor="return-reason"
								className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
							>
								Reason *
							</label>
							<AutoResizeTextarea
								id="return-reason"
								placeholder="Enter reason for returning the lorry..."
								value={returnReason}
								onChange={(e) => setReturnReason(e.target.value)}
								className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
								minHeight={80}
								maxHeight={200}
							/>
						</div>
					</div>
					<DialogFooter>
						<Button variant="outlined" onClick={() => setReturnDialogOpen(false)}>
							Cancel
						</Button>
						<Button variant="contained" color="error" onClick={handleReturnConfirm} disabled={!returnReason.trim()}>
							Return
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

export default MRApprovalBar;
