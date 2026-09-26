"use client";

import * as React from "react";
import {
	Alert,
	Autocomplete,
	Box,
	Button,
	CircularProgress,
	Snackbar,
	TextField,
	Typography,
} from "@mui/material";
import { usePathname } from "next/navigation";
import useSelectedCompanyCoId from "@/hooks/use-selected-company-coid";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import {
	fetchWindingStockSetup,
	fetchWindingStockDay,
	fetchWtDefault,
	createWindingStockRow,
	editWindingStockRow,
	deleteWindingStockRow,
	copyPreviousDay,
	setWindingStockLock,
	type WindingStockSetup,
	type WindingStockDay,
	type WindingStockRow,
} from "@/utils/windingStockService";
import WindingStockForm from "./_components/WindingStockForm";
import WindingStockGrid from "./_components/WindingStockGrid";
import {
	bucketTotals,
	grandTotal,
	locationTotals,
	rowActionsDisabled,
	todayISO,
} from "./utils/stockCalc";
import { buildCreatePayload, buildEditPayload, type WindingStockFormValues } from "./utils/stockSchema";

/**
 * Winding Stock daily count (SPEC) — the mill counts every package of yarn on
 * the floor each morning; this page records that count, one row per (bucket,
 * yarn item, package label, area). Container component: it owns all state,
 * every API call and the company/branch scope; the components under
 * `_components/` render from props only.
 */
export default function WindingStockPage() {
	const [mounted, setMounted] = React.useState(false);
	React.useEffect(() => {
		setMounted(true);
	}, []);

	const { coId } = useSelectedCompanyCoId();
	const { selectedBranches, selectedCompany, hasMenuAccess } = useSidebarContext();
	// A locked day still accepts mutations from a user holding Edit on this
	// menu (mirrors WeavingProcessBar's lockedNoEdit) — see winding_stock_lock.py.
	const pathname = usePathname();
	const canEdit = hasMenuAccess(pathname, "edit");

	// Branch resolution: 1 sidebar branch → auto-use it; several → user must pick one.
	const sidebarBranchIds = React.useMemo(() => selectedBranches.map(Number), [selectedBranches]);
	const [pageBranchId, setPageBranchId] = React.useState<number | "">("");
	React.useEffect(() => {
		if (sidebarBranchIds.length === 1) {
			setPageBranchId(sidebarBranchIds[0]);
		} else if (sidebarBranchIds.length === 0) {
			setPageBranchId("");
		} else {
			setPageBranchId((prev) =>
				prev !== "" && sidebarBranchIds.includes(prev as number) ? prev : ""
			);
		}
	}, [sidebarBranchIds]);
	const branchId = pageBranchId === "" ? null : (pageBranchId as number);
	const branchOptions = React.useMemo(
		() =>
			(selectedCompany?.branches ?? []).filter((b) =>
				sidebarBranchIds.includes(Number(b.branch_id))
			),
		[selectedCompany, sidebarBranchIds]
	);
	const selectedBranchName = branchOptions.find(
		(b) => Number(b.branch_id) === branchId
	)?.branch_name;

	const [tranDate, setTranDate] = React.useState<string>(todayISO());
	const [editingEntry, setEditingEntry] = React.useState<WindingStockRow | null>(null);
	const [submitError, setSubmitError] = React.useState<string | null>(null);
	const [actionError, setActionError] = React.useState<string | null>(null);
	const [snack, setSnack] = React.useState<string | null>(null);
	// Bumped after every successful save / on leaving edit mode; the form watches
	// it to clear itself (see WindingStockForm's formResetToken prop).
	const [formResetToken, setFormResetToken] = React.useState(0);

	// ---------------------------------------------------------------------
	// Setup (buckets, yarn items, areas) — reloads whenever company/branch changes.
	// ---------------------------------------------------------------------
	const [setup, setSetup] = React.useState<WindingStockSetup | null>(null);
	const [setupLoading, setSetupLoading] = React.useState(false);
	const [setupError, setSetupError] = React.useState<string | null>(null);

	React.useEffect(() => {
		if (!coId || branchId == null) {
			setSetup(null);
			return;
		}
		let cancelled = false;
		setSetupLoading(true);
		setSetupError(null);
		fetchWindingStockSetup({ coId, branchId })
			.then((data) => {
				if (cancelled) return;
				setSetup(data);
			})
			.catch((err: Error) => {
				if (cancelled) return;
				setSetupError(err.message);
				setSetup(null);
			})
			.finally(() => {
				if (!cancelled) setSetupLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [coId, branchId]);

	// ---------------------------------------------------------------------
	// Day (rows + locked flag + prev-entry date) for the selected date.
	// ---------------------------------------------------------------------
	const [day, setDay] = React.useState<WindingStockDay | null>(null);
	const [dayLoading, setDayLoading] = React.useState(false);
	const [dayError, setDayError] = React.useState<string | null>(null);
	const [dayVersion, setDayVersion] = React.useState(0);
	const refreshDay = React.useCallback(() => setDayVersion((v) => v + 1), []);

	React.useEffect(() => {
		if (!coId || branchId == null || !tranDate) {
			setDay(null);
			return;
		}
		let cancelled = false;
		setDayLoading(true);
		fetchWindingStockDay({ coId, branchId, tranDate })
			.then((data) => {
				if (cancelled) return;
				setDayError(null);
				setDay(data);
			})
			.catch((err: Error) => {
				if (cancelled) return;
				setDayError(err.message);
				setDay(null);
			})
			.finally(() => {
				if (!cancelled) setDayLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [coId, branchId, tranDate, dayVersion]);

	const rows = day?.rows ?? [];
	const locked = day?.locked ?? false;
	// Computed client-side from the loaded rows (mirrors the server formula) so
	// the footer stays in sync with whatever is on screen right now, the same
	// way the waste-entry footer sums its own rows rather than trusting a
	// separate aggregate.
	const totals = React.useMemo(() => bucketTotals(rows), [rows]);
	const grand = React.useMemo(() => grandTotal(rows), [rows]);
	const locTotals = React.useMemo(() => locationTotals(rows), [rows]);

	// ---------------------------------------------------------------------
	// Mutations
	// ---------------------------------------------------------------------
	const [saving, setSaving] = React.useState(false);
	const [deleting, setDeleting] = React.useState(false);
	const [copying, setCopying] = React.useState(false);
	const [locking, setLocking] = React.useState(false);

	const onEdit = React.useCallback((row: WindingStockRow) => {
		setSubmitError(null);
		setEditingEntry(row);
	}, []);

	const onCancelEdit = React.useCallback(() => {
		setSubmitError(null);
		setEditingEntry(null);
		setFormResetToken((t) => t + 1);
	}, []);

	const onDelete = React.useCallback(
		async (row: WindingStockRow) => {
			if (!coId) return;
			if (!window.confirm(`Delete winding stock line #${row.winding_stock_id}?`)) return;
			setDeleting(true);
			const result = await deleteWindingStockRow({
				id: row.winding_stock_id,
				coId: Number(coId),
			});
			setDeleting(false);
			if (!result.ok) {
				setSubmitError(result.error);
				return;
			}
			if (editingEntry?.winding_stock_id === row.winding_stock_id) setEditingEntry(null);
			setSnack(`Deleted line #${row.winding_stock_id}`);
			refreshDay();
		},
		[coId, editingEntry, refreshDay]
	);

	const onSubmit = React.useCallback(
		async (values: WindingStockFormValues) => {
			if (!coId || branchId == null) return;
			setSubmitError(null);

			if (editingEntry) {
				setSaving(true);
				const result = await editWindingStockRow({
					id: editingEntry.winding_stock_id,
					coId: Number(coId),
					payload: buildEditPayload(values),
				});
				setSaving(false);
				if (!result.ok) {
					setSubmitError(result.error);
					return;
				}
				setSnack(`Updated line #${editingEntry.winding_stock_id}`);
				setEditingEntry(null);
				setFormResetToken((t) => t + 1);
				refreshDay();
				return;
			}

			setSaving(true);
			const result = await createWindingStockRow(
				buildCreatePayload(values, Number(coId), branchId)
			);
			setSaving(false);
			if (!result.ok) {
				setSubmitError(result.error);
				return;
			}
			setSnack(result.id != null ? `Saved line #${result.id}` : "Winding stock line saved");
			// Keep the grid on the date that was just written to, then clear the
			// form for the next line.
			setTranDate(values.tran_date);
			setFormResetToken((t) => t + 1);
			refreshDay();
		},
		[coId, branchId, editingEntry, refreshDay]
	);

	const onCopyPreviousDay = React.useCallback(async () => {
		if (!coId || branchId == null) return;
		setActionError(null);
		setCopying(true);
		const result = await copyPreviousDay({
			co_id: Number(coId),
			branch_id: branchId,
			tran_date: tranDate,
		});
		setCopying(false);
		if (!result.ok) {
			setActionError(result.error);
			return;
		}
		setSnack(`Copied ${result.copied} lines from ${result.fromDate}`);
		refreshDay();
	}, [coId, branchId, tranDate, refreshDay]);

	const onToggleLock = React.useCallback(async () => {
		if (!coId || branchId == null) return;
		setActionError(null);
		setLocking(true);
		const result = await setWindingStockLock({
			coId: Number(coId),
			branchId,
			tranDate,
			locked: !locked,
		});
		setLocking(false);
		if (!result.ok) {
			setActionError(result.error);
			return;
		}
		setSnack(result.locked ? "Day locked" : "Day unlocked");
		refreshDay();
	}, [coId, branchId, tranDate, locked, refreshDay]);

	// Bound service call for the form's weight-prefill lookup — the form only
	// decides WHEN to ask, the page still owns the network call.
	const lookupWtDefault = React.useCallback(
		(itemId: number | null, packageLabel: string) => {
			if (!coId || branchId == null) return Promise.resolve(null);
			return fetchWtDefault({ coId, branchId, itemId, packageLabel });
		},
		[coId, branchId]
	);

	if (!mounted) return null;

	if (!coId) {
		return (
			<Alert severity="warning" sx={{ m: 2 }}>
				Select a company to continue.
			</Alert>
		);
	}

	if (sidebarBranchIds.length === 0) {
		return (
			<Alert severity="warning" sx={{ m: 2 }}>
				Select at least one branch in the sidebar to continue.
			</Alert>
		);
	}

	return (
		<Box sx={{ p: { xs: 1.5, md: 3 } }}>
			<Typography variant="h5" sx={{ fontWeight: 600 }}>
				Winding Stock
			</Typography>
			<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
				Record the daily counted yarn stock by bucket, package and area.
			</Typography>

			{sidebarBranchIds.length > 1 ? (
				<Autocomplete
					options={branchOptions}
					getOptionLabel={(b) => b.branch_name ?? ""}
					value={branchOptions.find((b) => Number(b.branch_id) === branchId) ?? null}
					onChange={(_, next) => setPageBranchId(next ? Number(next.branch_id) : "")}
					isOptionEqualToValue={(opt, val) => Number(opt.branch_id) === Number(val.branch_id)}
					renderOption={(props, b) => (
						<li {...props} key={b.branch_id}>
							{b.branch_name}
						</li>
					)}
					size="small"
					sx={{ mb: 2, minWidth: 240, maxWidth: 320 }}
					renderInput={(params) => <TextField {...params} label="Branch" />}
				/>
			) : selectedBranchName ? (
				<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
					Branch: {selectedBranchName}
				</Typography>
			) : null}

			{branchId == null ? (
				<Alert severity="info">Select a branch to load winding stock data.</Alert>
			) : (
				<Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
					{setupError ? <Alert severity="error">{setupError}</Alert> : null}
					{setupLoading || !setup ? (
						<Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
							<CircularProgress />
						</Box>
					) : (
						<WindingStockForm
							setup={setup}
							tranDate={tranDate}
							editingEntry={editingEntry}
							formResetToken={formResetToken}
							submitting={saving}
							submitError={submitError}
							onSubmit={(values) => {
								void onSubmit(values);
							}}
							onCancelEdit={onCancelEdit}
							fetchWtDefault={lookupWtDefault}
						/>
					)}
					<Box>
						<Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1, flexWrap: "wrap" }}>
							<Typography variant="subtitle2">Stock for date</Typography>
							<TextField
								type="date"
								size="small"
								value={tranDate}
								onChange={(e) => setTranDate(e.target.value)}
								InputLabelProps={{ shrink: true }}
							/>
							<Button
								size="small"
								variant="outlined"
								disabled={dayLoading || copying || rows.length > 0 || !day?.prev_entry_date}
								onClick={() => {
									void onCopyPreviousDay();
								}}
							>
								{copying ? "Copying…" : "Copy Previous Day"}
							</Button>
							<Button
								size="small"
								variant="outlined"
								color={locked ? "success" : "warning"}
								disabled={dayLoading || locking}
								onClick={() => {
									void onToggleLock();
								}}
							>
								{locking ? "…" : locked ? "Unlock Day" : "Lock Day"}
							</Button>
						</Box>

						{locked ? (
							<Alert severity="warning" sx={{ mb: 1 }}>
								This day is locked because its stock report has been taken. Editing needs Edit
								permission.
							</Alert>
						) : null}
						{actionError ? (
							<Alert severity="error" sx={{ mb: 1 }} onClose={() => setActionError(null)}>
								{actionError}
							</Alert>
						) : null}
						{dayError ? (
							<Alert severity="error" sx={{ mb: 1 }}>
								{dayError}
							</Alert>
						) : null}

						<WindingStockGrid
							rows={rows}
							loading={dayLoading}
							bucketTotals={totals}
							grandTotal={grand}
							locationTotals={locTotals}
							onEdit={onEdit}
							onDelete={(row) => {
								void onDelete(row);
							}}
							actionsDisabled={rowActionsDisabled({ saving, deleting, locked, canEdit })}
						/>
					</Box>
				</Box>
			)}

			<Snackbar
				open={!!snack}
				autoHideDuration={3000}
				onClose={() => setSnack(null)}
				message={snack ?? ""}
			/>
		</Box>
	);
}
