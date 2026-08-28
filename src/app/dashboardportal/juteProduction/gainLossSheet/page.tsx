"use client";

import * as React from "react";
import {
	Alert,
	Autocomplete,
	Box,
	Button,
	Chip,
	CircularProgress,
	Paper,
	Snackbar,
	TextField,
	Typography,
} from "@mui/material";
import useSelectedCompanyCoId from "@/hooks/use-selected-company-coid";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import {
	fetchGainLossSetup,
	fetchGainLossSheet,
	saveGainLossSheet,
	lockGainLossSheet,
	unlockGainLossSheet,
	type GlProdStatement,
	type GlQualityType,
	type GlSetup,
	type GlSheet,
} from "@/utils/juteGainLossService";
import FigureSectionTable from "./_components/FigureSectionTable";
import ProductionSection from "./_components/ProductionSection";
import ProcessStockSection from "./_components/ProcessStockSection";
import {
	buildFigureDrafts,
	buildProdDrafts,
	buildSavePayload,
	buildStockDrafts,
	nextUid,
	previousMonthISO,
	type FigureDraft,
	type ProdDraft,
	type StockDraft,
} from "./utils/sheetState";

/**
 * Jute Gain/Loss Sheet — monthly manual ENTRY page. One sheet per
 * (company, branch, month), all values in MT, replacing the mill's Excel.
 * Container component: owns the company/branch scope, month selection, all
 * API calls and the draft state; the `_components/` render from props only.
 */
export default function GainLossSheetPage() {
	const [mounted, setMounted] = React.useState(false);
	React.useEffect(() => {
		setMounted(true);
	}, []);

	const { coId } = useSelectedCompanyCoId();
	const { selectedBranches, selectedCompany } = useSidebarContext();

	// Branch resolution: 1 sidebar branch → auto-use it; several → user picks one.
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

	const [month, setMonth] = React.useState<string>(() => previousMonthISO());

	// ---------------------------------------------------------------------
	// Load setup (masters) + sheet together; rehydrate drafts on every load.
	// ---------------------------------------------------------------------
	const [setup, setSetup] = React.useState<GlSetup | null>(null);
	const [sheet, setSheet] = React.useState<GlSheet | null>(null);
	const [loading, setLoading] = React.useState(false);
	const [loadError, setLoadError] = React.useState<string | null>(null);
	const [version, setVersion] = React.useState(0);
	const refresh = React.useCallback(() => setVersion((v) => v + 1), []);

	// Draft state (all numeric cells kept as strings — see utils/sheetState.ts).
	const [figures, setFigures] = React.useState<FigureDraft[]>([]);
	const [productions, setProductions] = React.useState<ProdDraft[]>([]);
	const [processStock, setProcessStock] = React.useState<StockDraft[]>([]);
	const [remarks, setRemarks] = React.useState("");
	const [validationErrors, setValidationErrors] = React.useState<string[]>([]);

	React.useEffect(() => {
		// Reset everything when the scope is incomplete (e.g. company changed
		// and the branch list is repopulating) so no stale drafts survive.
		if (!coId || branchId == null || !month) {
			setSetup(null);
			setSheet(null);
			setFigures([]);
			setProductions([]);
			setProcessStock([]);
			setRemarks("");
			setValidationErrors([]);
			return;
		}
		let cancelled = false;
		setLoading(true);
		setLoadError(null);
		const coIdNum = Number(coId);
		Promise.all([
			fetchGainLossSetup({ coId: coIdNum, branchId }),
			fetchGainLossSheet({ coId: coIdNum, branchId, month }),
		])
			.then(([setupData, sheetData]) => {
				if (cancelled) return;
				setSetup(setupData);
				setSheet(sheetData);
				setFigures(buildFigureDrafts(setupData.figure_rows, sheetData));
				setProductions(buildProdDrafts(sheetData));
				setProcessStock(buildStockDrafts(setupData.departments, sheetData));
				setRemarks(sheetData.header?.remarks ?? "");
				setValidationErrors([]);
			})
			.catch((err: Error) => {
				if (cancelled) return;
				setLoadError(err.message);
				setSetup(null);
				setSheet(null);
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [coId, branchId, month, version]);

	const locked = sheet?.header?.is_locked === 1;
	const saved = sheet?.header != null;

	// ---------------------------------------------------------------------
	// Draft change handlers
	// ---------------------------------------------------------------------
	const figureMap = React.useMemo(
		() => new Map(figures.map((f) => [f.gl_row_id, f] as const)),
		[figures]
	);
	const stockMap = React.useMemo(
		() => new Map(processStock.map((s) => [s.gl_dept_id, s] as const)),
		[processStock]
	);

	const onFigureChange = React.useCallback(
		(glRowId: number, field: "hess" | "sack", value: string) => {
			setFigures((prev) =>
				prev.map((f) => (f.gl_row_id === glRowId ? { ...f, [field]: value } : f))
			);
		},
		[]
	);

	const onProdAdd = React.useCallback(
		(statement: GlProdStatement, qualityType: GlQualityType) => {
			setProductions((prev) => [
				...prev,
				{ uid: nextUid(), statement, quality_type: qualityType, quality_name: "", qty: "0" },
			]);
		},
		[]
	);

	const onProdRemove = React.useCallback((uid: number) => {
		setProductions((prev) => prev.filter((p) => p.uid !== uid));
	}, []);

	const onProdChange = React.useCallback(
		(uid: number, field: "quality_name" | "qty", value: string) => {
			setProductions((prev) =>
				prev.map((p) => (p.uid === uid ? { ...p, [field]: value } : p))
			);
		},
		[]
	);

	const onStockChange = React.useCallback(
		(
			glDeptId: number,
			field: "opening_hess" | "opening_sack" | "closing_hess" | "closing_sack",
			value: string
		) => {
			setProcessStock((prev) =>
				prev.map((s) => (s.gl_dept_id === glDeptId ? { ...s, [field]: value } : s))
			);
		},
		[]
	);

	// ---------------------------------------------------------------------
	// Save / Lock / Unlock
	// ---------------------------------------------------------------------
	const [saving, setSaving] = React.useState(false);
	const [lockBusy, setLockBusy] = React.useState(false);
	const [actionError, setActionError] = React.useState<string | null>(null);
	const [snack, setSnack] = React.useState<string | null>(null);

	const onSave = React.useCallback(async () => {
		if (!coId || branchId == null || !setup) return;
		setActionError(null);
		const { errors, payload } = buildSavePayload({
			coId: Number(coId),
			branchId,
			month,
			drafts: { figures, productions, processStock, remarks },
			figureRows: setup.figure_rows,
		});
		setValidationErrors(errors);
		if (!payload) return;
		setSaving(true);
		try {
			const result = await saveGainLossSheet(payload);
			setSnack(`Gain/Loss sheet saved (#${result.gain_loss_id})`);
			refresh();
		} catch (err) {
			setActionError(err instanceof Error ? err.message : "Failed to save the gain/loss sheet");
		} finally {
			setSaving(false);
		}
	}, [coId, branchId, month, setup, figures, productions, processStock, remarks, refresh]);

	const onToggleLock = React.useCallback(async () => {
		if (!coId || branchId == null) return;
		setActionError(null);
		setLockBusy(true);
		try {
			const params = { coId: Number(coId), branchId, month };
			const result = locked
				? await unlockGainLossSheet(params)
				: await lockGainLossSheet(params);
			setSnack(result.is_locked ? "Month locked" : "Month unlocked");
			refresh();
		} catch (err) {
			setActionError(err instanceof Error ? err.message : "Failed to change the month lock");
		} finally {
			setLockBusy(false);
		}
	}, [coId, branchId, month, locked, refresh]);

	// ---------------------------------------------------------------------
	// Derived render data
	// ---------------------------------------------------------------------
	const inputRows = React.useMemo(
		() =>
			(setup?.figure_rows ?? [])
				.filter((r) => r.section === "INPUT")
				.sort((a, b) => a.display_order - b.display_order),
		[setup]
	);
	const outputRows = React.useMemo(
		() =>
			(setup?.figure_rows ?? [])
				.filter((r) => r.section === "OUTPUT")
				.sort((a, b) => a.display_order - b.display_order),
		[setup]
	);
	const qualitySuggestions = React.useMemo<Record<GlQualityType, string[]>>(() => {
		const bucket: Record<GlQualityType, string[]> = { 1: [], 2: [] };
		for (const q of setup?.quality_suggestions ?? []) {
			if (q.quality_type === 1 || q.quality_type === 2) {
				bucket[q.quality_type].push(q.quality_name);
			}
		}
		return bucket;
	}, [setup]);

	const inputsDisabled = locked || loading || saving;

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
				Jute Gain/Loss Sheet
			</Typography>
			<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
				Monthly manual statement (all figures in MT) — one sheet per company, branch and month.
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
				<Alert severity="info">Select a branch to load the gain/loss sheet.</Alert>
			) : (
				<Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
					<Paper
						variant="outlined"
						sx={{
							p: 1.5,
							display: "flex",
							alignItems: "center",
							gap: 2,
							flexWrap: "wrap",
						}}
					>
						<TextField
							type="month"
							size="small"
							label="Month"
							value={month}
							onChange={(e) => setMonth(e.target.value)}
							InputLabelProps={{ shrink: true }}
						/>
						{locked ? <Chip label="Locked" color="warning" size="small" /> : null}
						<Box sx={{ flexGrow: 1 }} />
						<Button
							variant="contained"
							size="small"
							disabled={inputsDisabled || !setup}
							onClick={() => {
								void onSave();
							}}
						>
							{saving ? "Saving…" : "Save"}
						</Button>
						{saved ? (
							<Button
								variant="outlined"
								size="small"
								color={locked ? "success" : "warning"}
								disabled={loading || lockBusy}
								onClick={() => {
									void onToggleLock();
								}}
							>
								{lockBusy ? "…" : locked ? "Unlock" : "Lock"}
							</Button>
						) : null}
					</Paper>

					{locked ? (
						<Alert severity="warning">
							This month is locked — unlock it to make changes.
						</Alert>
					) : null}
					{loadError ? <Alert severity="error">{loadError}</Alert> : null}
					{actionError ? (
						<Alert severity="error" onClose={() => setActionError(null)}>
							{actionError}
						</Alert>
					) : null}
					{validationErrors.length > 0 ? (
						<Alert severity="error" onClose={() => setValidationErrors([])}>
							{validationErrors.map((e) => (
								<Typography key={e} variant="body2">
									{e}
								</Typography>
							))}
						</Alert>
					) : null}

					{loading || !setup ? (
						!loadError ? (
							<Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
								<CircularProgress />
							</Box>
						) : null
					) : (
						<>
							<Typography variant="h6" sx={{ mt: 1 }}>
								Input &amp; Output Figures
							</Typography>
							<FigureSectionTable
								title="Input Figures"
								rows={inputRows}
								drafts={figureMap}
								disabled={inputsDisabled}
								onChange={onFigureChange}
							/>
							<FigureSectionTable
								title="Output Figures"
								rows={outputRows}
								drafts={figureMap}
								disabled={inputsDisabled}
								onChange={onFigureChange}
							/>

							<ProductionSection
								title="Packed Production (FNG) — Quality wise"
								statement="FNG"
								drafts={productions}
								suggestions={qualitySuggestions}
								disabled={inputsDisabled}
								onAdd={onProdAdd}
								onRemove={onProdRemove}
								onChange={onProdChange}
							/>
							<ProductionSection
								title="Weaving Production (WVG) — Quality wise"
								statement="WVG"
								drafts={productions}
								suggestions={qualitySuggestions}
								disabled={inputsDisabled}
								onAdd={onProdAdd}
								onRemove={onProdRemove}
								onChange={onProdChange}
							/>

							<ProcessStockSection
								departments={setup.departments}
								drafts={stockMap}
								openingFromPrev={sheet?.prev_month_exists ?? false}
								disabled={inputsDisabled}
								onChange={onStockChange}
							/>

							<TextField
								label="Remarks"
								multiline
								minRows={3}
								value={remarks}
								disabled={inputsDisabled}
								onChange={(e) => setRemarks(e.target.value)}
								inputProps={{ maxLength: 1000 }}
								helperText={`${remarks.length}/1000 — monthly note (dust sale, caddies sale, moisture %, dhalta, …)`}
								fullWidth
							/>
						</>
					)}
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
