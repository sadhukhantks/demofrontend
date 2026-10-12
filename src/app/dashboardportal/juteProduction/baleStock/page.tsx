"use client";

import * as React from "react";
import { Alert, Box, CircularProgress, Snackbar, TextField, Typography } from "@mui/material";
import useSelectedCompanyCoId from "@/hooks/use-selected-company-coid";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import BaleRangeSelector from "@/components/juteProduction/baleStock/BaleRangeSelector";
import BaleStockGrid from "@/components/juteProduction/baleStock/BaleStockGrid";
import LinkInvoiceDialog, {
	type LinkInvoiceDialogResult,
} from "@/components/juteProduction/baleStock/LinkInvoiceDialog";
import MarkInspectedDialog from "@/components/juteProduction/baleStock/MarkInspectedDialog";
import {
	canInspect,
	canLink,
	canUninspect,
	canUnlink,
	despatchDoneMessage,
	SACKING_QUALITY_TYPE,
	todayISO,
} from "@/components/juteProduction/baleStock/baleStockCalc";
import {
	fetchBaleStockRows,
	fetchBaleStockSetup,
	fetchBaleStockSummary,
	unlinkBalesFromInvoice,
	unmarkBalesInspected,
	type BaleStockRowsResult,
	type BaleStockSetup,
	type BaleStockSummary,
} from "@/utils/baleStockService";
import BaleStockFilters, {
	DEFAULT_BALE_STOCK_FILTERS,
	toRowsQuery,
	type BaleStockFilterValues,
} from "./_components/BaleStockFilters";
import BaleSeriesSummaryTable from "./_components/BaleSeriesSummaryTable";
import BaleStockSummaryTable from "./_components/BaleStockSummaryTable";
import SelectionToolbar from "./_components/SelectionToolbar";

/**
 * Bale Stock & Inspection — bale-level stock derived from Bale Production as
 * on a date. Container component: it owns the company/branch scope, the as-on
 * date, the applied filters, the selection and every API call; everything
 * under `_components/` and `src/components/juteProduction/baleStock/` renders
 * from props. Spec: vowerp3be/docs/superpowers/specs/2026-10-12-bale-stock-inspection-design.md.
 */
export default function BaleStockPage() {
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
			(selectedCompany?.branches ?? [])
				.filter((b) => sidebarBranchIds.includes(Number(b.branch_id)))
				.map((b) => ({ value: Number(b.branch_id), label: b.branch_name ?? `Branch #${b.branch_id}` })),
		[selectedCompany, sidebarBranchIds]
	);
	const selectedBranchName = branchOptions.find((b) => b.value === branchId)?.label;

	const today = todayISO();
	const [asOn, setAsOn] = React.useState<string>(today);
	const [draft, setDraft] = React.useState<BaleStockFilterValues>({ ...DEFAULT_BALE_STOCK_FILTERS });
	const [applied, setApplied] = React.useState<BaleStockFilterValues>({ ...DEFAULT_BALE_STOCK_FILTERS });
	const [selectedIds, setSelectedIds] = React.useState<number[]>([]);
	const [snack, setSnack] = React.useState<string | null>(null);
	const [actionError, setActionError] = React.useState<string | null>(null);
	// Bumped after every mutation; rows and summary both watch it.
	const [version, setVersion] = React.useState(0);
	const refresh = React.useCallback(() => setVersion((v) => v + 1), []);

	// ---------------------------------------------------------------------
	// Setup (qualities, series, status options, bale_source) — per company/branch.
	// ---------------------------------------------------------------------
	const [setup, setSetup] = React.useState<BaleStockSetup | null>(null);
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
		fetchBaleStockSetup({ coId, branchId })
			.then((data) => {
				if (!cancelled) setSetup(data);
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
	// Summary — as on the date (not filtered).
	// ---------------------------------------------------------------------
	const [summary, setSummary] = React.useState<BaleStockSummary | null>(null);
	const [summaryLoading, setSummaryLoading] = React.useState(false);
	const [summaryError, setSummaryError] = React.useState<string | null>(null);

	React.useEffect(() => {
		if (!coId || branchId == null || !asOn) {
			setSummary(null);
			return;
		}
		let cancelled = false;
		setSummaryLoading(true);
		fetchBaleStockSummary({ coId, branchId, asOn })
			.then((data) => {
				if (cancelled) return;
				setSummaryError(null);
				setSummary(data);
			})
			.catch((err: Error) => {
				if (cancelled) return;
				setSummaryError(err.message);
				setSummary(null);
			})
			.finally(() => {
				if (!cancelled) setSummaryLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [coId, branchId, asOn, version]);

	// ---------------------------------------------------------------------
	// Rows — as on the date with the applied filters.
	// ---------------------------------------------------------------------
	const [result, setResult] = React.useState<BaleStockRowsResult | null>(null);
	const [rowsLoading, setRowsLoading] = React.useState(false);
	const [rowsError, setRowsError] = React.useState<string | null>(null);

	React.useEffect(() => {
		if (!coId || branchId == null || !asOn) {
			setResult(null);
			return;
		}
		let cancelled = false;
		setRowsLoading(true);
		fetchBaleStockRows({ coId, branchId, asOn, ...toRowsQuery(applied) })
			.then((data) => {
				if (cancelled) return;
				setRowsError(null);
				setResult(data);
				// A selection can only ever point at bales that are on screen.
				const present = new Set(data.rows.map((r) => r.bale_entry_id));
				setSelectedIds((prev) => prev.filter((id) => present.has(id)));
			})
			.catch((err: Error) => {
				if (cancelled) return;
				setRowsError(err.message);
				setResult(null);
				setSelectedIds([]);
			})
			.finally(() => {
				if (!cancelled) setRowsLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [coId, branchId, asOn, applied, version]);

	const rows = React.useMemo(() => result?.rows ?? [], [result]);
	const selectedRows = React.useMemo(() => {
		const wanted = new Set(selectedIds);
		return rows.filter((r) => wanted.has(r.bale_entry_id));
	}, [rows, selectedIds]);

	const inspectCheck = React.useMemo(() => canInspect(selectedRows), [selectedRows]);
	const uninspectCheck = React.useMemo(() => canUninspect(selectedRows), [selectedRows]);
	const linkCheck = React.useMemo(() => canLink(selectedRows), [selectedRows]);
	const unlinkCheck = React.useMemo(() => canUnlink(selectedRows), [selectedRows]);

	const seriesOptions = React.useMemo(
		() => (setup?.series ?? []).map((s) => ({ bale_series_id: s.bale_series_id, series_name: s.series_name })),
		[setup]
	);

	// ---------------------------------------------------------------------
	// Actions
	// ---------------------------------------------------------------------
	const [inspectOpen, setInspectOpen] = React.useState(false);
	const [linkOpen, setLinkOpen] = React.useState(false);
	const [busy, setBusy] = React.useState(false);

	const afterMutation = React.useCallback(
		(message: string) => {
			setSnack(message);
			setSelectedIds([]);
			refresh();
		},
		[refresh]
	);

	const addIds = React.useCallback((ids: number[]) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			ids.forEach((id) => next.add(id));
			return [...next];
		});
	}, []);

	const onUndoInspection = React.useCallback(async () => {
		if (!coId || !uninspectCheck.ok) return;
		const n = selectedIds.length;
		if (!window.confirm(`Undo the inspection marking on ${n} ${n === 1 ? "bale" : "bales"}?`)) return;
		setActionError(null);
		setBusy(true);
		const res = await unmarkBalesInspected({ co_id: Number(coId), bale_entry_ids: selectedIds });
		setBusy(false);
		if (!res.ok) {
			setActionError(res.error ?? "Could not undo the inspection");
			return;
		}
		afterMutation(`Undid inspection on ${res.unmarked} ${res.unmarked === 1 ? "bale" : "bales"}`);
	}, [coId, uninspectCheck.ok, selectedIds, afterMutation]);

	const onUnlinkInvoice = React.useCallback(async () => {
		if (!coId || !unlinkCheck.ok) return;
		const n = selectedIds.length;
		if (
			!window.confirm(
				`Undo the despatch of ${n} ${n === 1 ? "bale" : "bales"} (unlink ${n === 1 ? "its" : "their"} invoice, if any)? ${
					n === 1 ? "It" : "They"
				} will be back in stock.`
			)
		)
			return;
		setActionError(null);
		setBusy(true);
		const res = await unlinkBalesFromInvoice({ co_id: Number(coId), bale_entry_ids: selectedIds });
		setBusy(false);
		if (!res.ok) {
			setActionError(res.error ?? "Could not unlink the bales");
			return;
		}
		afterMutation(`Undid the despatch of ${res.unlinked} ${res.unlinked === 1 ? "bale" : "bales"} — back in stock`);
	}, [coId, unlinkCheck.ok, selectedIds, afterMutation]);

	const onInspected = React.useCallback(
		(marked: number) => afterMutation(`Marked ${marked} ${marked === 1 ? "bale" : "bales"} inspected`),
		[afterMutation]
	);

	const onLinked = React.useCallback(
		(r: LinkInvoiceDialogResult) => afterMutation(despatchDoneMessage(r)),
		[afterMutation]
	);

	const onApplyFilters = React.useCallback(() => setApplied({ ...draft }), [draft]);
	// A series row in the breakup table: like picking the series in the filter
	// bar and pressing Apply. Every other filter stays, except a Hessian quality
	// type / quality, which would hide every sacking bale of the series.
	const onSelectSeries = React.useCallback(
		(baleSeriesId: number) => {
			const quality = setup?.qualities.find((q) => q.finishing_quality_id === draft.finishingQualityId);
			const hessianQuality = quality != null && quality.quality_type !== SACKING_QUALITY_TYPE;
			const next: BaleStockFilterValues = {
				...draft,
				baleSeriesId,
				qualityType: draft.qualityType === "1" ? "" : draft.qualityType,
				finishingQualityId: hessianQuality ? "" : draft.finishingQualityId,
			};
			setDraft(next);
			setApplied(next);
		},
		[draft, setup]
	);
	const onResetFilters = React.useCallback(() => {
		setDraft({ ...DEFAULT_BALE_STOCK_FILTERS });
		setApplied({ ...DEFAULT_BALE_STOCK_FILTERS });
	}, []);

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
				Bale Stock &amp; Inspection
			</Typography>
			<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
				Pressed bales from Bale Production, as on a date — mark sacking bales inspected, mark bales despatched
				(against an invoice, or on a challan / DO with the invoice linked later).
			</Typography>

			<Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "flex-start", mb: 2 }}>
				{sidebarBranchIds.length > 1 ? (
					<SearchableOptionSelect<number>
						label="Branch"
						options={branchOptions}
						value={pageBranchId}
						onChange={(v) => setPageBranchId(v === "" ? "" : Number(v))}
						clearable={false}
						sx={{ minWidth: 240, maxWidth: 320 }}
					/>
				) : selectedBranchName ? (
					<Typography variant="body2" color="text.secondary" sx={{ alignSelf: "center" }}>
						Branch: {selectedBranchName}
					</Typography>
				) : null}
				<TextField
					type="date"
					label="As on"
					size="small"
					value={asOn}
					onChange={(e) => {
						if (e.target.value) setAsOn(e.target.value);
					}}
					slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today } }}
				/>
			</Box>

			{branchId == null ? (
				<Alert severity="info">Select a branch to load bale stock.</Alert>
			) : (
				<Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
					{setupError ? <Alert severity="error">{setupError}</Alert> : null}
					{setup?.bale_source === "MANUAL" ? (
						<Alert severity="info">
							No Bale Production entries for this branch yet — stock appears here once bales are weighed on
							the Bale Production page.
						</Alert>
					) : null}

					<Box>
						<Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
							Stock as on {asOn}
						</Typography>
						{summaryError ? (
							<Alert severity="error" sx={{ mb: 1 }}>
								{summaryError}
							</Alert>
						) : null}
						<BaleStockSummaryTable summary={summary} loading={summaryLoading} />
						<BaleSeriesSummaryTable
							lines={summary?.series_lines ?? []}
							loading={summaryLoading}
							selectedSeriesId={applied.baleSeriesId}
							onSelectSeries={onSelectSeries}
						/>
					</Box>

					{setupLoading || !setup ? (
						<Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
							<CircularProgress />
						</Box>
					) : (
						<>
							<Box>
								<Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
									Bales
								</Typography>
								<BaleStockFilters
									setup={setup}
									value={draft}
									onChange={setDraft}
									onApply={onApplyFilters}
									onReset={onResetFilters}
									disabled={rowsLoading || busy}
									maxDate={asOn}
								/>
							</Box>

							{actionError ? (
								<Alert severity="error" onClose={() => setActionError(null)}>
									{actionError}
								</Alert>
							) : null}
							{rowsError ? <Alert severity="error">{rowsError}</Alert> : null}
							{result?.truncated ? (
								<Alert severity="warning">
									Showing first {rows.length} rows — narrow the filters to see every bale.
								</Alert>
							) : null}

							<SelectionToolbar
								count={selectedIds.length}
								inspect={inspectCheck}
								uninspect={uninspectCheck}
								link={linkCheck}
								unlink={unlinkCheck}
								busy={busy || rowsLoading}
								onMarkInspected={() => setInspectOpen(true)}
								onUndoInspection={() => {
									void onUndoInspection();
								}}
								onLinkInvoice={() => setLinkOpen(true)}
								onUnlinkInvoice={() => {
									void onUnlinkInvoice();
								}}
							/>

							<BaleRangeSelector
								series={seriesOptions}
								rows={rows}
								selectedCount={selectedIds.length}
								onAddIds={addIds}
								onClearSelection={() => setSelectedIds([])}
								disabled={rowsLoading || busy}
							/>

							<BaleStockGrid
								rows={rows}
								loading={rowsLoading}
								selectedIds={selectedIds}
								onSelectionChange={setSelectedIds}
							/>
						</>
					)}
				</Box>
			)}

			{branchId != null ? (
				<>
					<MarkInspectedDialog
						open={inspectOpen}
						onClose={() => setInspectOpen(false)}
						coId={Number(coId)}
						branchId={branchId}
						rows={selectedRows}
						onDone={onInspected}
					/>
					<LinkInvoiceDialog
						open={linkOpen}
						onClose={() => setLinkOpen(false)}
						coId={Number(coId)}
						branchId={branchId}
						asOn={asOn}
						rows={selectedRows}
						onDone={onLinked}
					/>
				</>
			) : null}

			<Snackbar
				open={!!snack}
				autoHideDuration={4000}
				onClose={() => setSnack(null)}
				message={snack ?? ""}
			/>
		</Box>
	);
}
