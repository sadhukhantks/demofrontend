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
import useSelectedCompanyCoId from "@/hooks/use-selected-company-coid";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import {
	copyFinishingStockPreviousDay,
	createFinishingStockRow,
	deleteFinishingStockRow,
	editFinishingStockRow,
	fetchFinishingStockDay,
	fetchFinishingStockSetup,
	type FinishingStockDay,
	type FinishingStockRow,
	type FinishingStockSetup,
} from "@/utils/finishingStockService";
import FinishingStockForm from "./_components/FinishingStockForm";
import FinishingStockGrid from "./_components/FinishingStockGrid";
import { todayISO } from "./utils/stockCalc";
import {
	buildCreatePayload,
	buildEditPayload,
	type FinishingStockFormValues,
} from "./utils/stockSchema";

/**
 * Finishing Stock daily physical count — one row per counted lot of pressed
 * bales or loose finishing WIP. Container component: it owns all state, every
 * API call and the company/branch scope; the components under `_components/`
 * render from props only. There is no day lock for this feature.
 */
export default function FinishingStockPage() {
	const [mounted, setMounted] = React.useState(false);
	React.useEffect(() => {
		setMounted(true);
	}, []);

	const { coId } = useSelectedCompanyCoId();
	const { selectedBranches, selectedCompany } = useSidebarContext();

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
	const [editingEntry, setEditingEntry] = React.useState<FinishingStockRow | null>(null);
	const [submitError, setSubmitError] = React.useState<string | null>(null);
	const [actionError, setActionError] = React.useState<string | null>(null);
	const [snack, setSnack] = React.useState<string | null>(null);
	// Bumped after every successful save / on leaving edit mode; the form watches
	// it to clear itself (see FinishingStockForm's formResetToken prop).
	const [formResetToken, setFormResetToken] = React.useState(0);

	// ---------------------------------------------------------------------
	// Setup (qualities, stages, companies, loose UoMs) — reloads on company/branch change.
	// ---------------------------------------------------------------------
	const [setup, setSetup] = React.useState<FinishingStockSetup | null>(null);
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
		fetchFinishingStockSetup({ coId, branchId })
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
	// Day (rows + prev-entry date) for the selected date.
	// ---------------------------------------------------------------------
	const [day, setDay] = React.useState<FinishingStockDay | null>(null);
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
		fetchFinishingStockDay({ coId, branchId, tranDate })
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

	const rows = React.useMemo(() => day?.rows ?? [], [day]);

	// ---------------------------------------------------------------------
	// Mutations
	// ---------------------------------------------------------------------
	const [saving, setSaving] = React.useState(false);
	const [deleting, setDeleting] = React.useState(false);
	const [copying, setCopying] = React.useState(false);

	const onEdit = React.useCallback((row: FinishingStockRow) => {
		setSubmitError(null);
		setEditingEntry(row);
	}, []);

	const onCancelEdit = React.useCallback(() => {
		setSubmitError(null);
		setEditingEntry(null);
		setFormResetToken((t) => t + 1);
	}, []);

	const onDelete = React.useCallback(
		async (row: FinishingStockRow) => {
			if (!coId) return;
			if (!window.confirm(`Delete finishing stock line #${row.finishing_stock_id}?`)) return;
			setDeleting(true);
			const result = await deleteFinishingStockRow({
				id: row.finishing_stock_id,
				coId: Number(coId),
			});
			setDeleting(false);
			if (!result.ok) {
				setSubmitError(result.error);
				return;
			}
			if (editingEntry?.finishing_stock_id === row.finishing_stock_id) setEditingEntry(null);
			setSnack(`Deleted line #${row.finishing_stock_id}`);
			refreshDay();
		},
		[coId, editingEntry, refreshDay]
	);

	const onSubmit = React.useCallback(
		async (values: FinishingStockFormValues) => {
			if (!coId || branchId == null) return;
			setSubmitError(null);

			if (editingEntry) {
				setSaving(true);
				const result = await editFinishingStockRow({
					id: editingEntry.finishing_stock_id,
					coId: Number(coId),
					payload: buildEditPayload(values),
				});
				setSaving(false);
				if (!result.ok) {
					setSubmitError(result.error);
					return;
				}
				setSnack(`Updated line #${editingEntry.finishing_stock_id}`);
				setEditingEntry(null);
				setFormResetToken((t) => t + 1);
				refreshDay();
				return;
			}

			setSaving(true);
			const result = await createFinishingStockRow(
				buildCreatePayload(values, { coId: Number(coId), branchId })
			);
			setSaving(false);
			if (!result.ok) {
				setSubmitError(result.error);
				return;
			}
			setSnack(result.id != null ? `Saved line #${result.id}` : "Finishing stock line saved");
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
		const result = await copyFinishingStockPreviousDay({
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
				Finishing Stock
			</Typography>
			<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
				Record the daily physical count of pressed bales and loose finishing stock.
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
				<Alert severity="info">Select a branch to load finishing stock data.</Alert>
			) : (
				<Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
					{setupError ? <Alert severity="error">{setupError}</Alert> : null}
					{setupLoading || !setup ? (
						<Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
							<CircularProgress />
						</Box>
					) : (
						<FinishingStockForm
							setup={setup}
							coId={Number(coId)}
							tranDate={tranDate}
							editingEntry={editingEntry}
							formResetToken={formResetToken}
							submitting={saving}
							submitError={submitError}
							onSubmit={(values) => {
								void onSubmit(values);
							}}
							onCancelEdit={onCancelEdit}
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
								inputProps={{ max: todayISO() }}
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
							{day?.prev_entry_date ? (
								<Typography variant="caption" color="text.secondary">
									Last counted day: {day.prev_entry_date}
								</Typography>
							) : null}
						</Box>

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

						<FinishingStockGrid
							rows={rows}
							loading={dayLoading}
							onEdit={onEdit}
							onDelete={(row) => {
								void onDelete(row);
							}}
							actionsDisabled={saving || deleting}
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
