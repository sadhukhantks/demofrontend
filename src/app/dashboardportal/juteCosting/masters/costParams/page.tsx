"use client";

import * as React from "react";
import {
	Alert,
	Box,
	Button,
	Chip,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	IconButton,
	InputAdornment,
	Paper,
	Snackbar,
	Switch,
	TextField,
	Tooltip,
	Typography,
	useMediaQuery,
	useTheme,
} from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { Pencil as EditIcon, Plus as AddIcon, Trash2 as DeactivateIcon } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import useSelectedCompanyCoId from "@/hooks/use-selected-company-coid";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import {
	DIALOG_ACTIONS_SX,
	DIALOG_FORM_SCROLL_SX,
	MOBILE_FULL_BLEED_PAPER,
	TOUCH_ICON_BUTTON_SX,
} from "@/components/ui/responsiveEntry";
import { todayIso } from "@/components/reports/reportDates";
import {
	emptyForm,
	fmtParamValue,
	fromRow,
	isDateMoved,
	isFutureDated,
	isProductScoped,
	makeCostParamFormSchema,
	productScopedCodes,
	toPayload,
	toUpdatePayload,
	uomOf,
	type CostParamFormValues,
} from "./_schema";
import {
	createCostParam,
	deleteCostParam,
	EMPTY_ROWS,
	EMPTY_SETUP,
	fetchCostParamSetup,
	fetchCostParams,
	updateCostParam,
	type CostParamRow,
	type CostParamSetup,
} from "./_service";

type BranchOpt = { branch_id: number; branch_name: string };
type ShowFilter = "inforce" | "all" | "inactive";

const SHOW_OPTIONS = [
	{ value: "inforce", label: "In force only" },
	{ value: "all", label: "All rows" },
	{ value: "inactive", label: "Inactive" },
] as const;

const STATUS_OPTIONS = [
	{ value: "1", label: "Active" },
	{ value: "0", label: "Inactive" },
] as const;

function errText(e: unknown, fallback: string): string {
	return e instanceof Error && e.message ? e.message : fallback;
}

function scopeText(row: CostParamRow): string {
	return row.scope === "branch" ? (row.branch_name ?? `Branch ${row.branch_id}`) : "All branches";
}

function rowTitle(row: CostParamRow): string {
	return `${row.param_label}${row.product ? ` · ${row.product}` : ""}`;
}

const inForce = (row: CostParamRow) => row.active === 1 && row.in_force;

/**
 * Cost Parameters master (ITM-019) — the rates and norms the Daily P&L
 * prices with: realisation per tonne (per product), jute rate, wage per
 * hand-day, power rate, dust sale value, fixed cost per day, ...
 *
 * Rows are effective-dated. The report picks, per parameter (and product),
 * the active row with the latest effective date on or before the day, a
 * branch row beating an all-branch row — so a change going forward is a new
 * row with a later date, never an overwrite. Editing a row and changing its
 * date therefore FILES A NEW ROW (the backend keeps the old one); editing
 * without changing the date corrects the row in place. Deactivating takes a
 * row out of the resolution without deleting it.
 *
 * Branch-scoped the same way the Waste Rate master is: one sidebar branch is
 * adopted automatically, several means the operator picks one first.
 *
 * The grid opens on "In force only", so a row saved with a FUTURE effective
 * date (the normal "change going forward") would vanish right after the
 * success toast; the page then switches to "All rows" and the toast says so.
 */
export default function CostParamsPage() {
	const theme = useTheme();
	// One layout is MOUNTED, not CSS-hidden: a DataGrid inside a display:none box has 0 width and MUI X warns.
	const isPhone = useMediaQuery(theme.breakpoints.down("md"), { noSsr: true });
	const [mounted, setMounted] = React.useState(false);
	React.useEffect(() => {
		setMounted(true);
	}, []);

	const { coId } = useSelectedCompanyCoId();
	const coIdNum = coId ? Number(coId) : null;
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
			setPageBranchId((prev) => (prev !== "" && sidebarBranchIds.includes(prev) ? prev : ""));
		}
	}, [sidebarBranchIds]);
	const branchId = pageBranchId === "" ? null : pageBranchId;
	const branchOptions = React.useMemo<BranchOpt[]>(
		() =>
			(selectedCompany?.branches ?? [])
				.filter((b) => sidebarBranchIds.includes(Number(b.branch_id)))
				.map((b) => ({ branch_id: Number(b.branch_id), branch_name: b.branch_name ?? "" })),
		[selectedCompany, sidebarBranchIds]
	);
	const selectedBranch = branchOptions.find((b) => b.branch_id === branchId) ?? null;

	const [rows, setRows] = React.useState<ReadonlyArray<CostParamRow>>(EMPTY_ROWS);
	const [setup, setSetup] = React.useState<CostParamSetup>(EMPTY_SETUP);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [show, setShow] = React.useState<ShowFilter>("inforce");
	const [toast, setToast] = React.useState<string | null>(null);

	const [open, setOpen] = React.useState(false);
	const [saving, setSaving] = React.useState(false);
	const [editing, setEditing] = React.useState<CostParamRow | null>(null);
	const [saveError, setSaveError] = React.useState<string | null>(null);

	const today = todayIso();

	const refresh = React.useCallback(async () => {
		if (coIdNum == null || branchId == null) return;
		setLoading(true);
		setError(null);
		try {
			setRows(await fetchCostParams({ coId: coIdNum, branchId }));
		} catch (e: unknown) {
			setError(errText(e, "Failed to load cost parameters"));
			setRows(EMPTY_ROWS);
		} finally {
			setLoading(false);
		}
	}, [coIdNum, branchId]);

	React.useEffect(() => {
		void refresh();
	}, [refresh]);

	// The parameter catalogue (codes, labels, units, products) is fixed in the
	// backend; one load per company.
	React.useEffect(() => {
		if (coIdNum == null) return;
		let alive = true;
		void (async () => {
			try {
				const s = await fetchCostParamSetup(coIdNum);
				if (alive) setSetup(s);
			} catch (e: unknown) {
				if (alive) setError(errText(e, "Failed to load the parameter list"));
			}
		})();
		return () => {
			alive = false;
		};
	}, [coIdNum]);

	// Which codes take a product comes from the setup (backend PARAM_CODES);
	// the resolver is rebuilt when it loads (useForm re-reads its props).
	const scoped = React.useMemo(() => productScopedCodes(setup.param_codes), [setup.param_codes]);
	const resolver = React.useMemo(() => zodResolver(makeCostParamFormSchema(scoped)), [scoped]);
	const {
		control,
		handleSubmit,
		reset,
		setValue,
		watch,
		formState: { errors },
	} = useForm<CostParamFormValues>({
		resolver,
		defaultValues: emptyForm(today),
		mode: "onTouched",
	});
	const watchedCode = watch("param_code");
	const watchedDate = watch("effective_date");
	const productScoped = isProductScoped(watchedCode, scoped);
	const codeUom = uomOf(watchedCode, setup.param_codes);
	// A moved date files a NEW (active) row: Status cannot be set with it.
	const dateMoved = isDateMoved(watchedDate, editing);

	const codeOptions = React.useMemo(
		() => setup.param_codes.map((c) => ({ value: c.code, label: `${c.label} (${c.uom})` })),
		[setup.param_codes]
	);
	const productOptions = React.useMemo(
		() => setup.products.map((p) => ({ value: p, label: p })),
		[setup.products]
	);

	const visible = React.useMemo(
		() =>
			rows.filter((r) => {
				if (show === "all") return true;
				if (show === "inactive") return r.active !== 1;
				return inForce(r);
			}),
		[rows, show]
	);
	const inForceCount = React.useMemo(() => rows.filter(inForce).length, [rows]);

	const openCreate = React.useCallback(() => {
		setEditing(null);
		setSaveError(null);
		reset(emptyForm(today));
		setOpen(true);
	}, [reset, today]);

	const openEdit = React.useCallback(
		(row: CostParamRow) => {
			setEditing(row);
			setSaveError(null);
			reset(fromRow(row));
			setOpen(true);
		},
		[reset]
	);

	const closeDialog = React.useCallback(() => {
		if (!saving) setOpen(false);
	}, [saving]);

	const onSubmit = React.useCallback(
		async (values: CostParamFormValues) => {
			if (coIdNum == null || branchId == null) return;
			setSaving(true);
			setSaveError(null);
			try {
				// A future-dated row is not in force today and would be hidden by
				// the default filter — show it, and say where it went.
				const future = isFutureDated(values.effective_date, today);
				const where = future ? ` — effective from ${values.effective_date}, shown under All rows` : "";
				if (editing) {
					const res = await updateCostParam(editing.cost_param_id, coIdNum, toUpdatePayload(values, editing));
					setToast(
						res.created_new
							? `New effective-dated row filed; the earlier row is kept for history${where}`
							: "Saved"
					);
				} else {
					await createCostParam(toPayload(values, coIdNum, branchId, scoped));
					setToast(`Parameter added${where}`);
				}
				if (future) setShow("all");
				setOpen(false);
				setEditing(null);
				await refresh();
			} catch (e: unknown) {
				setSaveError(errText(e, "Save failed"));
			} finally {
				setSaving(false);
			}
		},
		[branchId, coIdNum, editing, refresh, scoped, today]
	);

	const deactivate = React.useCallback(
		async (row: CostParamRow) => {
			if (coIdNum == null) return;
			const ok = window.confirm(
				`Deactivate ${rowTitle(row)} (from ${row.effective_date})? The Daily P&L will stop using this row.`
			);
			if (!ok) return;
			try {
				await deleteCostParam(row.cost_param_id, coIdNum);
				setToast("Deactivated");
				await refresh();
			} catch (e: unknown) {
				setError(errText(e, "Deactivate failed"));
			}
		},
		[coIdNum, refresh]
	);

	const columns = React.useMemo<GridColDef<CostParamRow>[]>(
		() => [
			{
				field: "actions",
				headerName: "",
				width: 96,
				sortable: false,
				filterable: false,
				disableColumnMenu: true,
				renderCell: (params) => (
					<Box sx={{ display: "flex" }}>
						<Tooltip title="Edit">
							<IconButton
								size="small"
								aria-label={`Edit ${rowTitle(params.row)}`}
								onClick={() => openEdit(params.row)}
								sx={{ minWidth: 40, minHeight: 40 }}
							>
								<EditIcon size={16} />
							</IconButton>
						</Tooltip>
						{params.row.active === 1 ? (
							<Tooltip title="Deactivate">
								<IconButton
									size="small"
									aria-label={`Deactivate ${rowTitle(params.row)}`}
									onClick={() => void deactivate(params.row)}
									sx={{ minWidth: 40, minHeight: 40 }}
								>
									<DeactivateIcon size={16} />
								</IconButton>
							</Tooltip>
						) : null}
					</Box>
				),
			},
			{ field: "param_label", headerName: "Parameter", flex: 1, minWidth: 200 },
			{
				field: "product",
				headerName: "Product",
				width: 110,
				valueGetter: (value) => value ?? "All",
			},
			{ field: "effective_date", headerName: "Effective from", width: 130 },
			{
				field: "param_value",
				headerName: "Value",
				width: 150,
				type: "number",
				valueFormatter: (value) => fmtParamValue(Number(value)),
			},
			{ field: "uom", headerName: "UoM", width: 110, valueGetter: (value) => value ?? "" },
			{
				field: "branch_name",
				headerName: "Scope",
				width: 150,
				valueGetter: (_value, row) => scopeText(row),
			},
			{ field: "source", headerName: "Source", width: 180, valueGetter: (value) => value ?? "" },
			{
				field: "in_force",
				headerName: "In force",
				width: 110,
				sortable: false,
				renderCell: (params) =>
					inForce(params.row) ? (
						<Chip size="small" label="In force" color="success" variant="outlined" />
					) : null,
			},
			{
				field: "active",
				headerName: "Active",
				width: 90,
				valueGetter: (value) => (Number(value) === 1 ? "Yes" : "No"),
			},
		],
		[deactivate, openEdit]
	);

	if (!mounted) return null;

	if (coIdNum == null) {
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
			<Box sx={{ mb: 2 }}>
				<Typography variant="h5" sx={{ fontWeight: 600 }}>
					Cost Parameters
				</Typography>
				<Typography variant="body2" color="text.secondary">
					Rates and norms the Daily P&amp;L prices with. A change going forward is a new row
					with a later effective date; old rows stay for history.
				</Typography>
			</Box>

			{sidebarBranchIds.length > 1 ? (
				<Box sx={{ mb: 2, maxWidth: 320 }}>
					<SearchableSelect<BranchOpt>
						variant="outlined"
						label="Branch"
						options={branchOptions}
						value={selectedBranch}
						onChange={(opt) => setPageBranchId(opt ? opt.branch_id : "")}
						getOptionLabel={(o) => o.branch_name}
						getOptionKey={(o) => o.branch_id}
						isOptionEqualToValue={(o, v) => o.branch_id === v.branch_id}
						clearable={false}
					/>
				</Box>
			) : selectedBranch ? (
				<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
					Branch: {selectedBranch.branch_name}
				</Typography>
			) : null}

			<Box
				sx={{
					display: "flex",
					flexDirection: { xs: "column", sm: "row" },
					alignItems: { xs: "stretch", sm: "center" },
					gap: { xs: 1.5, sm: 2 },
					mb: 2,
					flexWrap: "wrap",
				}}
			>
				<Button
					variant="contained"
					startIcon={<AddIcon size={18} />}
					onClick={openCreate}
					disabled={branchId == null || setup.param_codes.length === 0}
					sx={{ minHeight: 44, width: { xs: "100%", sm: "auto" }, textTransform: "none" }}
				>
					New parameter
				</Button>
				<Box sx={{ minWidth: { xs: "100%", sm: 200 } }}>
					<SearchableOptionSelect
						label="Show"
						size="small"
						fullWidth
						clearable={false}
						options={SHOW_OPTIONS}
						value={show}
						onChange={(v) => {
							if (v !== "") setShow(v);
						}}
					/>
				</Box>
				<Typography variant="caption" color="text.secondary">
					In force on {today}: {inForceCount} parameter{inForceCount === 1 ? "" : "s"}
				</Typography>
			</Box>

			{error ? (
				<Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
					{error}
				</Alert>
			) : null}

			{branchId == null ? (
				<Alert severity="info">Select a branch to load the cost parameters.</Alert>
			) : (
				<>
					{/* Desktop: the grid (mounted only above md). */}
					{!isPhone ? (
					<Box>
						<DataGrid
							autoHeight
							rows={visible as CostParamRow[]}
							getRowId={(r) => r.cost_param_id}
							columns={columns}
							loading={loading}
							density="comfortable"
							disableRowSelectionOnClick
							pageSizeOptions={[10, 25, 50]}
							initialState={{ pagination: { paginationModel: { pageSize: 25, page: 0 } } }}
							localeText={{
								noRowsLabel:
									show === "inforce"
										? "No parameter in force — add one with New parameter"
										: "No rows",
							}}
							sx={{ width: "100%" }}
						/>
					</Box>
					) : null}

					{/* Phone: one card per row. */}
					{isPhone ? (
					<Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
						{visible.length === 0 && !loading ? (
							<Typography variant="body2" color="text.secondary">
								{show === "inforce"
									? "No parameter in force — add one with New parameter."
									: "No rows."}
							</Typography>
						) : null}
						{visible.map((row) => (
							<Paper key={row.cost_param_id} variant="outlined" sx={{ p: 1.5 }}>
								<Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
									<Box sx={{ flexGrow: 1, minWidth: 0 }}>
										<Typography variant="subtitle2" fontWeight={700}>
											{rowTitle(row)}
										</Typography>
										<Typography variant="h6" sx={{ lineHeight: 1.3 }}>
											{fmtParamValue(row.param_value)} {row.uom ?? ""}
										</Typography>
										<Typography variant="caption" color="text.secondary">
											from {row.effective_date} · {scopeText(row)}
											{inForce(row) ? " · in force" : ""}
											{row.active !== 1 ? " · inactive" : ""}
										</Typography>
									</Box>
									<IconButton
										size="small"
										aria-label={`Edit ${rowTitle(row)}`}
										onClick={() => openEdit(row)}
										sx={TOUCH_ICON_BUTTON_SX}
									>
										<EditIcon size={18} />
									</IconButton>
									{row.active === 1 ? (
										<IconButton
											size="small"
											aria-label={`Deactivate ${rowTitle(row)}`}
											onClick={() => void deactivate(row)}
											sx={TOUCH_ICON_BUTTON_SX}
										>
											<DeactivateIcon size={18} />
										</IconButton>
									) : null}
								</Box>
							</Paper>
						))}
					</Box>
					) : null}
				</>
			)}

			<Dialog
				open={open}
				onClose={closeDialog}
				maxWidth="sm"
				fullWidth
				PaperProps={MOBILE_FULL_BLEED_PAPER}
				sx={DIALOG_FORM_SCROLL_SX}
			>
				<Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
					<DialogTitle>{editing ? `Edit: ${rowTitle(editing)}` : "New parameter"}</DialogTitle>
					<DialogContent dividers>
						<Box sx={{ display: "grid", gap: 2, mt: 0.5 }}>
							<Controller
								name="param_code"
								control={control}
								render={({ field }) => (
									<SearchableOptionSelect
										label="Parameter"
										size="small"
										fullWidth
										required
										clearable={false}
										disabled={!!editing || saving}
										options={codeOptions}
										value={field.value}
										onChange={(v) => {
											const code = v === "" ? "" : String(v);
											field.onChange(code);
											if (!editing) {
												// The unit follows the parameter; a product only
												// belongs with a product-scoped code.
												setValue("uom", uomOf(code, setup.param_codes) || null);
												if (!isProductScoped(code, scoped)) setValue("product", null);
											}
										}}
										error={!!errors.param_code}
										helperText={
											errors.param_code?.message ??
											(editing ? "Cannot change on edit — add a new parameter instead" : undefined)
										}
									/>
								)}
							/>
							{productScoped ? (
								<Controller
									name="product"
									control={control}
									render={({ field }) => (
										<SearchableOptionSelect
											label="Product"
											size="small"
											fullWidth
											required
											clearable
											disabled={!!editing || saving}
											options={productOptions}
											value={field.value ?? ""}
											onChange={(v) => field.onChange(v === "" ? null : String(v))}
											error={!!errors.product}
											helperText={errors.product?.message ?? "One row per product"}
										/>
									)}
								/>
							) : null}
							<Controller
								name="effective_date"
								control={control}
								render={({ field }) => (
									<TextField
										{...field}
										label="Effective date"
										type="date"
										size="small"
										fullWidth
										required
										disabled={saving}
										slotProps={{ inputLabel: { shrink: true } }}
										error={!!errors.effective_date}
										helperText={
											errors.effective_date?.message ??
											(editing ? "A different date files a new row and keeps the old one" : undefined)
										}
									/>
								)}
							/>
							<Controller
								name="param_value"
								control={control}
								render={({ field }) => (
									<TextField
										label="Value"
										type="number"
										size="small"
										fullWidth
										required
										disabled={saving}
										name={field.name}
										inputRef={field.ref}
										onBlur={field.onBlur}
										value={Number.isNaN(field.value) ? "" : field.value}
										onChange={(e) =>
											field.onChange(e.target.value === "" ? Number.NaN : Number(e.target.value))
										}
										slotProps={{
											htmlInput: { inputMode: "decimal", step: "0.0001", min: 0 },
											input: codeUom
												? { endAdornment: <InputAdornment position="end">{codeUom}</InputAdornment> }
												: undefined,
										}}
										error={!!errors.param_value}
										helperText={errors.param_value?.message}
									/>
								)}
							/>
							<Controller
								name="source"
								control={control}
								render={({ field }) => (
									<TextField
										label="Source"
										size="small"
										fullWidth
										disabled={saving}
										name={field.name}
										inputRef={field.ref}
										onBlur={field.onBlur}
										value={field.value ?? ""}
										onChange={(e) => field.onChange(e.target.value)}
										slotProps={{ htmlInput: { maxLength: 120 } }}
										error={!!errors.source}
										helperText={
											errors.source?.message ?? "Where the figure comes from (owner ruling, contract, proxy)"
										}
									/>
								)}
							/>
							<Controller
								name="remarks"
								control={control}
								render={({ field }) => (
									<TextField
										label="Remarks"
										size="small"
										fullWidth
										multiline
										minRows={2}
										disabled={saving}
										name={field.name}
										inputRef={field.ref}
										onBlur={field.onBlur}
										value={field.value ?? ""}
										onChange={(e) => field.onChange(e.target.value)}
										slotProps={{ htmlInput: { maxLength: 255 } }}
										error={!!errors.remarks}
										helperText={errors.remarks?.message}
									/>
								)}
							/>
							<Controller
								name="scope_branch"
								control={control}
								render={({ field }) => (
									<Box>
										<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
											<Switch
												checked={field.value}
												onChange={(e) => field.onChange(e.target.checked)}
												disabled={!!editing || saving}
												inputProps={{ "aria-label": "Applies to this branch only" }}
											/>
											<Typography variant="body2">
												{field.value
													? `Applies to ${selectedBranch?.branch_name ?? "this branch"} only`
													: "Applies to all branches"}
											</Typography>
										</Box>
										{editing ? (
											<Typography variant="caption" color="text.secondary">
												Scope cannot change on edit — add a new parameter instead
											</Typography>
										) : null}
									</Box>
								)}
							/>
							{editing ? (
								<Controller
									name="active"
									control={control}
									render={({ field }) => (
										<SearchableOptionSelect
											label="Status"
											size="small"
											fullWidth
											clearable={false}
											disabled={saving || dateMoved}
											options={STATUS_OPTIONS}
											value={field.value ? "1" : "0"}
											onChange={(v) => {
												if (v !== "") field.onChange(v === "1");
											}}
											helperText={
												dateMoved
													? "A moved date files a new active row — change the status without moving the date"
													: "Inactive rows drop out of the resolution but stay listed under Inactive"
											}
										/>
									)}
								/>
							) : null}
						</Box>
						{saveError ? (
							<Alert severity="error" sx={{ mt: 1.5 }}>
								{saveError}
							</Alert>
						) : null}
					</DialogContent>
					<DialogActions sx={DIALOG_ACTIONS_SX}>
						<Button type="button" onClick={closeDialog} disabled={saving}>
							Cancel
						</Button>
						<Button type="submit" variant="contained" disabled={saving}>
							{saving ? "Saving…" : "Save"}
						</Button>
					</DialogActions>
				</Box>
			</Dialog>

			<Snackbar
				open={toast != null}
				autoHideDuration={4000}
				onClose={() => setToast(null)}
				anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
			>
				<Alert severity="success" variant="filled" onClose={() => setToast(null)}>
					{toast}
				</Alert>
			</Snackbar>
		</Box>
	);
}
