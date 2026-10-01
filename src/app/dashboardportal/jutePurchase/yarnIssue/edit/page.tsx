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
	createYarnIssue,
	fetchYarnIssueDeptLots,
	fetchYarnIssueGodownLots,
	fetchYarnIssueSetup,
	getYarnIssueById,
	updateYarnIssue,
	type YarnIssueHeader,
	type YarnIssueLot,
	type YarnIssuePermissions,
	type YarnIssueSetup,
} from "@/utils/yarnIssueService";
import { YARN_ISSUE_LIST_PATH, YARN_ISSUE_TYPES, getIssueTypeLabel, isEditableStatus } from "../utils/yarnIssueConstants";
import { formatNumber } from "../utils/yarnIssueFormat";
import { YarnIssueHeaderForm } from "./_components/YarnIssueHeaderForm";
import { YarnIssueTotals } from "./_components/YarnIssueTotals";
import { useYarnIssueApproval } from "./hooks/useYarnIssueApproval";
import { lotLabel, useYarnIssueLineColumns } from "./hooks/useYarnIssueLineColumns";
import { buildLotBalanceMap, computeLineBalances, lineHasAnyData, sumLines } from "./utils/yarnIssueCalc";
import {
	applyLotToLine,
	buildDefaultHeaderForm,
	buildSaveInput,
	createBlankLine,
	getLineId,
	mapApiLinesToEditable,
	mapHeaderToForm,
} from "./utils/yarnIssueMappers";
import { buildYarnIssueSchema, collectFieldErrors, collectLineErrors, formatIssues } from "./utils/yarnIssueSchema";
import type { EditableLineField, EditableYarnIssueLine, YarnIssueHeaderFormValues } from "./types/yarnIssueTypes";

/**
 * @component YarnIssueEditPage
 * @description Create / edit / view one Yarn Issue (godown → floor) or Return
 * (floor → godown). `?id=` opens an existing document (editable only in Draft 21 /
 * Open 1 when the backend grants `canSave`); without `id` it is a new draft for the
 * sidebar company + a branch in scope. Approval actions come from
 * `ApprovalActionsBar`, driven by the GET `permissions`.
 *
 * Lots: every line must name the purchase lot the yarn comes from. ISSUE lists
 * the godown lots, RETURN the chosen department's floor lots — both oldest first
 * (FIFO). Lots reload when type / department change, and a saved document passes
 * `exclude_issue_id` so its own lines do not reduce the balances it checks against.
 */

const EMPTY_DEPARTMENTS: ReadonlyArray<YarnIssueSetup["departments"][number]> = Object.freeze([]);
const EMPTY_ISSUE_TYPES: ReadonlyArray<YarnIssueSetup["issue_types"][number]> = Object.freeze([]);
const EMPTY_LOTS: ReadonlyArray<YarnIssueLot> = Object.freeze([]);
const EMPTY_LINE_ERRORS: ReadonlyMap<string, Record<string, string>> = new Map();

const parseId = (raw: string | null): number | null => {
	if (!raw) return null;
	const parsed = Number(raw);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

function YarnIssueEditPageContent() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const idParam = searchParams.get("id");
	const yarnIssueId = React.useMemo(() => parseId(idParam), [idParam]);
	const isCreate = yarnIssueId == null;

	// Sidebar scope (company + branches); a new document picks its branch from here.
	const { branches, coId, initialBranchId } = useReportBranches();

	// menu_id: sidebar menu tree by path `jutePurchase/yarnIssue` (URL override
	// first), falling back to `setup.menu_id` below.
	const menuIdFromUrl = searchParams.get("menu_id") || "";
	const { getMenuId } = useMenuId({ transactionType: "yarnIssue", menuIdFromUrl });

	const [loading, setLoading] = React.useState(!isCreate);
	const [pageError, setPageError] = React.useState<string | null>(null);
	const [setup, setSetup] = React.useState<YarnIssueSetup | null>(null);
	const [setupLoading, setSetupLoading] = React.useState(false);
	const [header, setHeader] = React.useState<YarnIssueHeader | null>(null);
	const [permissions, setPermissions] = React.useState<YarnIssuePermissions | null>(null);
	const [form, setForm] = React.useState<YarnIssueHeaderFormValues>(buildDefaultHeaderForm);
	const [createBranchId, setCreateBranchId] = React.useState<number | null>(null);
	const [saving, setSaving] = React.useState(false);
	// Unsaved edits hide the approval bar until Save persists them (MR pattern).
	const [isDirty, setIsDirty] = React.useState(false);
	const [validationErrors, setValidationErrors] = React.useState<string[]>([]);
	const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
	const [lineErrors, setLineErrors] = React.useState<ReadonlyMap<string, Record<string, string>>>(EMPTY_LINE_ERRORS);
	// Non-blocking notes from the last save (FIFO skip, return over floor balance).
	const [saveWarnings, setSaveWarnings] = React.useState<string[]>([]);
	const [lots, setLots] = React.useState<ReadonlyArray<YarnIssueLot>>(EMPTY_LOTS);
	const [lotsLoading, setLotsLoading] = React.useState(false);

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

	const { items: lines, setItems: setLines, replaceItems, removeItems } = useLineItems<EditableYarnIssueLine>({
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
			setSetup(await fetchYarnIssueSetup({ coId, branchId }));
		} catch (err) {
			setPageError(err instanceof Error ? err.message : "Failed to load yarn issue setup");
		} finally {
			setSetupLoading(false);
		}
	}, [coId, branchId]);

	React.useEffect(() => {
		void loadSetup();
	}, [loadSetup]);

	const loadRecord = React.useCallback(async () => {
		if (yarnIssueId == null) return;
		setLoading(true);
		setPageError(null);
		try {
			const detail = await getYarnIssueById(yarnIssueId);
			setHeader(detail.header);
			setPermissions(detail.permissions);
			setForm(mapHeaderToForm(detail.header));
			replaceItemsRef.current(mapApiLinesToEditable(detail.lines));
			setIsDirty(false);
			setValidationErrors([]);
			setFieldErrors({});
			setLineErrors(EMPTY_LINE_ERRORS);
		} catch (err) {
			setPageError(err instanceof Error ? err.message : "Failed to load yarn issue");
		} finally {
			setLoading(false);
		}
	}, [yarnIssueId]);

	React.useEffect(() => {
		void loadRecord();
	}, [loadRecord]);

	// Lot options follow the type (godown vs department floor), the department for
	// RETURN, and exclude this document's own lines once it is saved. A request
	// counter drops stale responses when the inputs change mid-flight.
	const issueType = form.issueType;
	const deptId = form.deptId;
	const lotsRequestRef = React.useRef(0);
	React.useEffect(() => {
		const requestId = ++lotsRequestRef.current;
		if (coId == null || branchId == null || issueType == null || (issueType === YARN_ISSUE_TYPES.RETURN && deptId == null)) {
			setLots(EMPTY_LOTS);
			setLotsLoading(false);
			return;
		}
		let cancelled = false;
		setLotsLoading(true);
		const request =
			issueType === YARN_ISSUE_TYPES.RETURN && deptId != null
				? fetchYarnIssueDeptLots({ coId, branchId, deptId, excludeIssueId: yarnIssueId })
				: fetchYarnIssueGodownLots({ coId, branchId, excludeIssueId: yarnIssueId });
		request
			.then((data) => {
				if (cancelled || requestId !== lotsRequestRef.current) return;
				setLots(data);
			})
			.catch((err: unknown) => {
				if (cancelled || requestId !== lotsRequestRef.current) return;
				setLots(EMPTY_LOTS);
				setPageError(err instanceof Error ? err.message : "Failed to load purchase lots");
			})
			.finally(() => {
				if (cancelled || requestId !== lotsRequestRef.current) return;
				setLotsLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [coId, branchId, issueType, deptId, yarnIssueId]);

	const handleFormChange = React.useCallback(
		<K extends keyof YarnIssueHeaderFormValues>(field: K, value: YarnIssueHeaderFormValues[K]) => {
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
			setLines((prev) => prev.map((line) => (line.id === id ? { ...line, [field]: value } : line)));
		},
		[setLines],
	);

	const handleLotChange = React.useCallback(
		(id: string, lot: YarnIssueLot | null) => {
			setIsDirty(true);
			setLines((prev) => prev.map((line) => (line.id === id ? applyLotToLine(line, lot) : line)));
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

	const lotBalances = React.useMemo(() => buildLotBalanceMap(lots, issueType), [lots, issueType]);
	const lineBalances = React.useMemo(() => computeLineBalances(lines, lotBalances, issueType), [lines, lotBalances, issueType]);

	const lineColumns = useYarnIssueLineColumns({
		canEdit,
		issueType,
		lots,
		lotsLoading,
		balances: lineBalances,
		lineErrors,
		onLineChange: handleLineChange,
		onLotChange: handleLotChange,
	});

	const totals = React.useMemo(() => sumLines(lines), [lines]);
	const realLines = React.useMemo(() => lines.filter(lineHasAnyData), [lines]);
	const realLineCount = realLines.length;
	// Type is fixed once lines exist or the document has been saved: the lot list
	// (and the direction of the stock movement) depends on it.
	const typeLocked = !isCreate || realLineCount > 0;

	const handleSave = React.useCallback(async () => {
		if (coId == null || branchId == null) {
			toast({ variant: "destructive", title: "Branch required", description: "Select a branch before saving." });
			return;
		}
		const lotLabels = new Map(lots.map((lot) => [lot.yarn_purchase_li_id, lotLabel(lot, issueType)]));
		const schema = buildYarnIssueSchema({ lotBalances, lotLabels });
		const parsed = schema.safeParse(buildSaveInput({ coId, branchId, form, lines }));
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
			// Zod indexes the filtered (non-blank) lines; map those indexes back to line ids.
			const byIndex = collectLineErrors(parsed.error);
			const byId = new Map<string, Record<string, string>>();
			for (const [index, errors] of byIndex) {
				const line = realLines[index];
				if (line) byId.set(line.id, errors);
			}
			setLineErrors(byId);
			return;
		}
		setValidationErrors([]);
		setFieldErrors({});
		setLineErrors(EMPTY_LINE_ERRORS);
		setSaveWarnings([]);
		setSaving(true);
		setPageError(null);
		try {
			if (yarnIssueId == null) {
				const created = await createYarnIssue(parsed.data);
				toast({ title: "Yarn issue saved as draft" });
				setSaveWarnings(created.warnings);
				setIsDirty(false);
				router.replace(`${YARN_ISSUE_LIST_PATH}/edit?id=${created.yarn_issue_id}`);
			} else {
				const updated = await updateYarnIssue(yarnIssueId, parsed.data);
				toast({ title: "Yarn issue saved" });
				setSaveWarnings(updated.warnings);
				await loadRecord();
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to save yarn issue";
			setPageError(message);
			toast({ variant: "destructive", title: "Not saved", description: message });
		} finally {
			setSaving(false);
		}
	}, [coId, branchId, form, lines, realLines, lots, lotBalances, issueType, yarnIssueId, router, loadRecord]);

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
	} = useYarnIssueApproval({
		yarnIssueId,
		header,
		permissions,
		coId,
		branchId,
		getMenuId: resolveMenuId,
		onRefresh: loadRecord,
	});

	if (idParam && yarnIssueId == null) {
		return <Alert severity="error">Invalid yarn issue id in URL.</Alert>;
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
		{ label: "Back", onClick: () => router.push(YARN_ISSUE_LIST_PATH), variant: "outline" },
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

	const typeWord = getIssueTypeLabel(issueType);
	const docWord = issueType === YARN_ISSUE_TYPES.RETURN ? "Yarn Return" : "Yarn Issue";
	const title = header?.issue_no
		? `${docWord} - ${header.issue_no}`
		: isCreate
			? `${docWord} - New`
			: `${docWord} - Draft #${yarnIssueId}`;

	const linePlaceholder =
		issueType == null
			? "Pick the type first."
			: issueType === YARN_ISSUE_TYPES.RETURN && deptId == null
				? "Pick the department to list the lots on its floor."
				: "Pick a purchase lot on the blank row to add a line.";

	return (
		<TransactionWrapper<EditableYarnIssueLine>
			title={title}
			subtitle={
				issueType === YARN_ISSUE_TYPES.RETURN
					? "Returns purchased yarn from the department floor to the godown. Weight (kg) is the authoritative figure."
					: "Issues purchased yarn from the godown to a department floor. Weight (kg) is the authoritative figure."
			}
			loading={loading}
			statusChip={isCreate ? undefined : statusChipProps}
			primaryActions={actions}
			lineItems={{
				items: lines,
				columns: lineColumns,
				getItemId: getLineId,
				canEdit,
				onRemoveSelected: canEdit ? handleRemoveLines : undefined,
				title: `${typeWord === "-" ? "Yarn" : typeWord} Lines`,
				subtitle: `${realLineCount} line${realLineCount === 1 ? "" : "s"} | Total ${formatNumber(totals.weightKg)} kg`,
				placeholder: canEdit ? linePlaceholder : "No yarn lines.",
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
					{saveWarnings.length > 0 ? (
						<Alert severity="warning" onClose={() => setSaveWarnings([])}>
							<Typography variant="body2" sx={{ fontWeight: 600 }}>
								Saved with warnings:
							</Typography>
							<Box component="ul" sx={{ m: 0, pl: 2.5 }}>
								{saveWarnings.map((message) => (
									<li key={message}>{message}</li>
								))}
							</Box>
						</Alert>
					) : null}
					{!canEdit && !isCreate && header ? (
						<Alert severity="info">
							{isEditableStatus(statusId)
								? "You do not have permission to edit this yarn issue."
								: "This yarn issue is read-only in its current status."}
						</Alert>
					) : null}
				</Stack>
			}
			contentClassName="max-w-full"
			footer={
				<Stack spacing={2}>
					<YarnIssueTotals totals={totals} />
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
							menuCode="YARN_ISSUE"
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
			<YarnIssueHeaderForm
				values={form}
				readOnly={!canEdit}
				onChange={handleFormChange}
				departments={setup?.departments ?? EMPTY_DEPARTMENTS}
				departmentsLoading={setupLoading}
				issueTypes={setup?.issue_types ?? EMPTY_ISSUE_TYPES}
				typeLocked={typeLocked}
				branches={branches}
				branchId={branchId}
				onBranchChange={handleBranchChange}
				isNew={isCreate}
				issueNo={header?.issue_no ?? null}
				fieldErrors={fieldErrors}
			/>
		</TransactionWrapper>
	);
}

export default function YarnIssueEditPage() {
	return (
		<Suspense
			fallback={
				<Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
					<CircularProgress />
				</Box>
			}
		>
			<YarnIssueEditPageContent />
		</Suspense>
	);
}
