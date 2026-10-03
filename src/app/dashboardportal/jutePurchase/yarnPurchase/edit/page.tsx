"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Box, CircularProgress, Stack, Typography } from "@mui/material";
import TransactionWrapper, { type TransactionAction } from "@/components/ui/TransactionWrapper";
import { ApprovalActionsBar, useLineItems } from "@/components/ui/transaction";
import { useReportBranches } from "@/components/reports/useReportBranches";
import { useMenuId } from "@/hooks/useMenuId";
import { toast } from "@/hooks/use-toast";
import {
	createYarnPurchase,
	fetchYarnPurchaseSetup,
	getYarnPurchaseById,
	updateYarnPurchase,
	type YarnPurchaseHeader,
	type YarnPurchasePermissions,
	type YarnPurchaseSetup,
} from "@/utils/yarnPurchaseService";
import { YARN_PURCHASE_LIST_PATH, isEditableStatus } from "../utils/yarnPurchaseConstants";
import { formatNumber } from "../utils/yarnPurchaseFormat";
import { YarnPurchaseHeaderForm } from "./_components/YarnPurchaseHeaderForm";
import { YarnPurchaseTotals } from "./_components/YarnPurchaseTotals";
import { useYarnPurchaseApproval } from "./hooks/useYarnPurchaseApproval";
import { useYarnPurchaseLineColumns } from "./hooks/useYarnPurchaseLineColumns";
import { applyLineChange, lineHasAnyData, sumLines } from "./utils/yarnPurchaseCalc";
import {
	buildDefaultHeaderForm,
	buildSaveInput,
	createBlankLine,
	getLineId,
	mapApiLinesToEditable,
	mapHeaderToForm,
} from "./utils/yarnPurchaseMappers";
import { collectFieldErrors, formatIssues, yarnPurchaseSchema } from "./utils/yarnPurchaseSchema";
import type { EditableLineField, EditableYarnPurchaseLine, YarnPurchaseHeaderFormValues } from "./types/yarnPurchaseTypes";

/**
 * @component YarnPurchaseEditPage
 * @description Create / edit / view one Yarn Purchase. `?id=` opens an existing
 * document (editable only in Draft 21 / Open 1 when the backend grants `canSave`);
 * without `id` it is a new draft for the sidebar company + a branch in scope.
 * Approval actions come from `ApprovalActionsBar`, driven by the GET `permissions`.
 */

const EMPTY_YARN_ITEMS: ReadonlyArray<YarnPurchaseSetup["yarn_items"][number]> = Object.freeze([]);
const EMPTY_PARTIES: ReadonlyArray<YarnPurchaseSetup["parties"][number]> = Object.freeze([]);
const EMPTY_PACKAGE_TYPES: ReadonlyArray<string> = Object.freeze([]);

const parseId = (raw: string | null): number | null => {
	if (!raw) return null;
	const parsed = Number(raw);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

function YarnPurchaseEditPageContent() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const idParam = searchParams.get("id");
	const yarnPurchaseId = React.useMemo(() => parseId(idParam), [idParam]);
	const isCreate = yarnPurchaseId == null;

	// Sidebar scope (company + branches); a new document picks its branch from here.
	const { branches, coId, initialBranchId } = useReportBranches();

	// menu_id: sidebar menu tree by path `jutePurchase/yarnPurchase` (URL override
	// first), falling back to `setup.menu_id` below.
	const menuIdFromUrl = searchParams.get("menu_id") || "";
	const { getMenuId } = useMenuId({ transactionType: "yarnPurchase", menuIdFromUrl });

	const [loading, setLoading] = React.useState(!isCreate);
	const [pageError, setPageError] = React.useState<string | null>(null);
	const [setup, setSetup] = React.useState<YarnPurchaseSetup | null>(null);
	const [setupLoading, setSetupLoading] = React.useState(false);
	const [header, setHeader] = React.useState<YarnPurchaseHeader | null>(null);
	const [permissions, setPermissions] = React.useState<YarnPurchasePermissions | null>(null);
	const [form, setForm] = React.useState<YarnPurchaseHeaderFormValues>(buildDefaultHeaderForm);
	const [createBranchId, setCreateBranchId] = React.useState<number | null>(null);
	const [saving, setSaving] = React.useState(false);
	// Unsaved edits hide the approval bar until Save persists them (MR pattern).
	const [isDirty, setIsDirty] = React.useState(false);
	const [validationErrors, setValidationErrors] = React.useState<string[]>([]);
	const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

	// New document: auto-pick the only branch in scope, else the sidebar's first.
	React.useEffect(() => {
		if (!isCreate || branches.length === 0) return;
		setCreateBranchId((prev) => {
			if (prev != null && branches.some((branch) => branch.branch_id === prev)) return prev;
			if (initialBranchId != null && branches.some((branch) => branch.branch_id === initialBranchId)) return initialBranchId;
			return branches[0].branch_id;
		});
	}, [isCreate, branches, initialBranchId]);

	const branchId = header?.branch_id ?? createBranchId;
	const statusId = header?.status_id ?? null;
	const canEdit = isCreate ? true : isEditableStatus(statusId) && Boolean(permissions?.canSave);

	const { items: lines, setItems: setLines, replaceItems, removeItems } = useLineItems<EditableYarnPurchaseLine>({
		createBlankItem: createBlankLine,
		hasData: lineHasAnyData,
		getItemId: getLineId,
		maintainTrailingBlank: canEdit,
	});
	// `replaceItems` changes identity when `canEdit` flips after load; read it through
	// a ref so `loadRecord` stays stable and does not refetch on that flip.
	const replaceItemsRef = React.useRef(replaceItems);
	React.useEffect(() => {
		replaceItemsRef.current = replaceItems;
	}, [replaceItems]);

	const resolveMenuId = React.useCallback(
		() => getMenuId() || (setup?.menu_id != null ? String(setup.menu_id) : ""),
		[getMenuId, setup?.menu_id],
	);

	const loadSetup = React.useCallback(async () => {
		if (coId == null || branchId == null) return;
		setSetupLoading(true);
		try {
			setSetup(await fetchYarnPurchaseSetup({ coId, branchId }));
		} catch (err) {
			setPageError(err instanceof Error ? err.message : "Failed to load yarn purchase setup");
		} finally {
			setSetupLoading(false);
		}
	}, [coId, branchId]);

	React.useEffect(() => {
		void loadSetup();
	}, [loadSetup]);

	const loadRecord = React.useCallback(async () => {
		if (yarnPurchaseId == null) return;
		setLoading(true);
		setPageError(null);
		try {
			const detail = await getYarnPurchaseById(yarnPurchaseId);
			setHeader(detail.header);
			setPermissions(detail.permissions);
			setForm(mapHeaderToForm(detail.header));
			replaceItemsRef.current(mapApiLinesToEditable(detail.lines));
			setIsDirty(false);
			setValidationErrors([]);
			setFieldErrors({});
		} catch (err) {
			setPageError(err instanceof Error ? err.message : "Failed to load yarn purchase");
		} finally {
			setLoading(false);
		}
	}, [yarnPurchaseId]);

	React.useEffect(() => {
		void loadRecord();
	}, [loadRecord]);

	const handleFormChange = React.useCallback(
		<K extends keyof YarnPurchaseHeaderFormValues>(field: K, value: YarnPurchaseHeaderFormValues[K]) => {
			setIsDirty(true);
			setForm((prev) => ({ ...prev, [field]: value }));
		},
		[],
	);

	const handleBranchChange = React.useCallback((next: number | null) => {
		setIsDirty(true);
		setCreateBranchId(next);
	}, []);

	const handleLineChange = React.useCallback(
		(id: string, field: EditableLineField, value: string) => {
			setIsDirty(true);
			setLines((prev) => prev.map((line) => (line.id === id ? applyLineChange(line, field, value) : line)));
		},
		[setLines],
	);

	const handleLineItemChange = React.useCallback(
		(id: string, itemId: number | null) => {
			setIsDirty(true);
			setLines((prev) => prev.map((line) => (line.id === id ? { ...line, itemId } : line)));
		},
		[setLines],
	);

	const handleRemoveLines = React.useCallback(
		(ids: string[]) => {
			setIsDirty(true);
			removeItems(ids);
		},
		[removeItems],
	);

	const lineColumns = useYarnPurchaseLineColumns({
		canEdit,
		yarnItems: setup?.yarn_items ?? EMPTY_YARN_ITEMS,
		packageTypes: setup?.package_types ?? EMPTY_PACKAGE_TYPES,
		onLineChange: handleLineChange,
		onItemChange: handleLineItemChange,
	});

	const totals = React.useMemo(() => sumLines(lines), [lines]);
	const realLineCount = React.useMemo(() => lines.filter(lineHasAnyData).length, [lines]);

	const handleSave = React.useCallback(async () => {
		if (coId == null || branchId == null) {
			toast({ variant: "destructive", title: "Branch required", description: "Select a branch before saving." });
			return;
		}
		const parsed = yarnPurchaseSchema.safeParse(buildSaveInput({ coId, branchId, form, lines }));
		if (!parsed.success) {
			const issues = formatIssues(parsed.error);
			setValidationErrors(issues);
			// The alert renders at the top of the page; on a phone it is off screen, so say it in a toast too.
			toast({
				variant: "destructive",
				title: "Not saved",
				description: issues.length > 1 ? `${issues[0]} (+${issues.length - 1} more)` : issues[0],
			});
			setFieldErrors(collectFieldErrors(parsed.error));
			return;
		}
		setValidationErrors([]);
		setFieldErrors({});
		setSaving(true);
		setPageError(null);
		try {
			if (yarnPurchaseId == null) {
				const created = await createYarnPurchase(parsed.data);
				toast({ title: "Yarn purchase saved as draft" });
				setIsDirty(false);
				router.replace(`${YARN_PURCHASE_LIST_PATH}/edit?id=${created.yarn_purchase_id}`);
			} else {
				await updateYarnPurchase(yarnPurchaseId, parsed.data);
				toast({ title: "Yarn purchase saved" });
				await loadRecord();
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to save yarn purchase";
			setPageError(message);
			toast({ variant: "destructive", title: "Not saved", description: message });
		} finally {
			setSaving(false);
		}
	}, [coId, branchId, form, lines, yarnPurchaseId, router, loadRecord]);

	const {
		approvalLoading,
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
	} = useYarnPurchaseApproval({
		yarnPurchaseId,
		header,
		permissions,
		coId,
		branchId,
		getMenuId: resolveMenuId,
		onRefresh: loadRecord,
	});

	if (idParam && yarnPurchaseId == null) {
		return <Alert severity="error">Invalid yarn purchase id in URL.</Alert>;
	}

	if (!isCreate && (loading && !header)) {
		return (
			<div className="flex h-64 items-center justify-center">
				<CircularProgress />
			</div>
		);
	}

	const busy = saving || approvalLoading || setupLoading;
	const actions: TransactionAction[] = [
		{ label: "Back", onClick: () => router.push(YARN_PURCHASE_LIST_PATH), variant: "outline" },
	];
	if (canEdit) {
		actions.push({
			label: isCreate ? "Save Draft" : "Save",
			onClick: () => void handleSave(),
			disabled: busy || loading,
			loading: saving,
			variant: "default",
		});
	}

	const title = header?.purchase_no
		? `Yarn Purchase - ${header.purchase_no}`
		: isCreate
			? "Yarn Purchase - New"
			: `Yarn Purchase - Draft #${yarnPurchaseId}`;

	return (
		<TransactionWrapper<EditableYarnPurchaseLine>
			title={title}
			subtitle="Receipt of purchased yarn at the mill. Weight (kg) is the authoritative figure."
			loading={loading}
			statusChip={isCreate ? undefined : statusChipProps}
			primaryActions={actions}
			lineItems={{
				items: lines,
				columns: lineColumns,
				getItemId: getLineId,
				canEdit,
				onRemoveSelected: canEdit ? handleRemoveLines : undefined,
				title: "Yarn Lines",
				subtitle: `${realLineCount} line${realLineCount === 1 ? "" : "s"} | Total ${formatNumber(totals.weightKg)} kg`,
				placeholder: canEdit ? "Pick a yarn item on the blank row to add a line." : "No yarn lines.",
			}}
			alerts={
				<Stack spacing={1.5} sx={{ mb: 2 }}>
					{pageError ? (
						<Alert severity="error" onClose={() => setPageError(null)}>
							{pageError}
						</Alert>
					) : null}
					{validationErrors.length > 0 ? (
						<Alert severity="warning" onClose={() => setValidationErrors([])}>
							<Typography variant="body2" sx={{ fontWeight: 600 }}>
								Please fix the following before saving:
							</Typography>
							<Box component="ul" sx={{ m: 0, pl: 2.5 }}>
								{validationErrors.map((message) => (
									<li key={message}>{message}</li>
								))}
							</Box>
						</Alert>
					) : null}
					{!canEdit && !isCreate && header ? (
						<Alert severity="info">
							{isEditableStatus(statusId)
								? "You do not have permission to edit this yarn purchase."
								: "This yarn purchase is read-only in its current status."}
						</Alert>
					) : null}
				</Stack>
			}
			contentClassName="max-w-full"
			footer={
				<Stack spacing={2}>
					<YarnPurchaseTotals totals={totals} />
					{isCreate ? null : isDirty ? (
						<Alert severity="info">
							<Typography variant="body2">
								You have unsaved changes. Press <strong>Save</strong> to enable approval actions
								(Open / Cancel Draft / Send for Approval / Approve / Reject / Re-Open).
							</Typography>
						</Alert>
					) : (
						<ApprovalActionsBar
							approvalInfo={approvalInfo}
							permissions={approvalPermissions}
							menuCode="YARN_PURCHASE"
							onOpen={handleOpen}
							onCancelDraft={handleCancelDraft}
							onReopen={handleReopen}
							onSendForApproval={handleSendForApproval}
							onApprove={handleApprove}
							onReject={handleReject}
							onViewApprovalLog={handleViewApprovalLog}
							loading={approvalLoading}
							disabled={saving || loading}
						/>
					)}
				</Stack>
			}
		>
			<YarnPurchaseHeaderForm
				values={form}
				readOnly={!canEdit}
				onChange={handleFormChange}
				parties={setup?.parties ?? EMPTY_PARTIES}
				partiesLoading={setupLoading}
				branches={branches}
				branchId={branchId}
				onBranchChange={handleBranchChange}
				isNew={isCreate}
				purchaseNo={header?.purchase_no ?? null}
				fieldErrors={fieldErrors}
			/>
		</TransactionWrapper>
	);
}

export default function YarnPurchaseEditPage() {
	return (
		<Suspense
			fallback={
				<Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
					<CircularProgress />
				</Box>
			}
		>
			<YarnPurchaseEditPageContent />
		</Suspense>
	);
}
