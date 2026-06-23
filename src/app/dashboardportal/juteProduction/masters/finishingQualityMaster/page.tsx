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
	MenuItem,
	TextField,
	Tooltip,
	Typography,
} from "@mui/material";
import { Pencil as EditIcon, Plus as AddIcon, Trash2 as DeleteIcon, Eye as ViewIcon } from "lucide-react";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { z } from "zod";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import useSelectedCompanyCoId from "@/hooks/use-selected-company-coid";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";

// =============================================================================
// Quality type discriminator (BE: quality_type 1=cloth, 2=bag)
// =============================================================================
const QUALITY_TYPE_CLOTH = 1;
const QUALITY_TYPE_BAG = 2;

type QualityType = typeof QUALITY_TYPE_CLOTH | typeof QUALITY_TYPE_BAG;

// =============================================================================
// Setup / list / detail contract types (match BE finishing_masters.py exactly)
// =============================================================================
type SetupItem = {
	item_id: number;
	item_code: string;
	item_name: string;
	item_grp_id: number;
	item_grp_name: string;
	item_type_id: number;
};

type ClothQualityOption = {
	finishing_quality_id: number;
	fin_quality_code: string;
	fin_quality_name: string | null;
	item_id: number | null;
	width_in: number | null;
	oz_per_yd: number | null;
	branch_id: number | null;
};

type FinishingQualityRow = {
	finishing_quality_id: number;
	co_id: number;
	branch_id: number | null;
	quality_type: number;
	item_id: number;
	item_code: string | null;
	item_name: string | null;
	fin_quality_code: string;
	fin_quality_name: string | null;
	width_in: number | null;
	ports: number | null;
	ends: number | null;
	shots: number | null;
	oz_per_yd: number | null;
	std_oz_per_yd: number | null;
	lead_length: number | null;
	finished_length: number | null;
	mc_teeth: number | null;
	cloth_quality_id: number | null;
	bag_length_in: number | null;
	bag_width_in: number | null;
	mouth_type: string | null;
	bags_per_bale: number | null;
	active: number;
};

// =============================================================================
// Zod schema — quality_type drives which spec fields are required.
// All numeric spec fields are strings in the form (text inputs) and parsed to
// numbers (or null) at submit. cloth_quality_id is required when type=bag (BE
// enforces this too).
// =============================================================================
const optionalNumber = z
	.string()
	.optional()
	.refine((v) => v === undefined || v === "" || Number.isFinite(Number(v)), {
		message: "Must be a number",
	});

const formSchema = z
	.object({
		quality_type: z.union([z.literal(QUALITY_TYPE_CLOTH), z.literal(QUALITY_TYPE_BAG)]),
		item_id: z.string().min(1, "Item is required"),
		fin_quality_code: z.string().min(1, "Quality code is required").max(50),
		fin_quality_name: z.string().max(100).optional(),
		// cloth structural specs (quality_type=1)
		width_in: optionalNumber,
		ports: optionalNumber,
		ends: optionalNumber,
		shots: optionalNumber,
		oz_per_yd: optionalNumber,
		std_oz_per_yd: optionalNumber,
		lead_length: optionalNumber,
		finished_length: optionalNumber,
		mc_teeth: optionalNumber,
		// bag structural specs (quality_type=2)
		cloth_quality_id: z.string().optional(),
		bag_length_in: optionalNumber,
		bag_width_in: optionalNumber,
		mouth_type: z.string().max(30).optional(),
		bags_per_bale: optionalNumber,
	})
	.superRefine((data, ctx) => {
		if (data.quality_type === QUALITY_TYPE_BAG && !data.cloth_quality_id) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Cloth quality is required for a bag quality",
				path: ["cloth_quality_id"],
			});
		}
	});

type FormData = z.infer<typeof formSchema>;

const DEFAULT_VALUES: FormData = {
	quality_type: QUALITY_TYPE_CLOTH,
	item_id: "",
	fin_quality_code: "",
	fin_quality_name: "",
	width_in: "",
	ports: "",
	ends: "",
	shots: "",
	oz_per_yd: "",
	std_oz_per_yd: "",
	lead_length: "",
	finished_length: "",
	mc_teeth: "",
	cloth_quality_id: "",
	bag_length_in: "",
	bag_width_in: "",
	mouth_type: "",
	bags_per_bale: "",
};

// Parse a form string to number | null (empty -> null). Integer-typed fields use
// parseInt semantics via Number (they are still whole numbers from the input).
const toNum = (v: string | undefined): number | null => {
	if (v === undefined || v === "") return null;
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
};

const toInt = (v: string | undefined): number | null => {
	const n = toNum(v);
	return n === null ? null : Math.trunc(n);
};

const toStr = (v: number | null | undefined): string => (v === null || v === undefined ? "" : String(v));

const itemLabel = (i: Pick<SetupItem, "item_code" | "item_name">): string => `${i.item_code} — ${i.item_name}`;

type DialogMode = "create" | "edit" | "view";

export default function FinishingQualityMasterPage() {
	const [mounted, setMounted] = React.useState(false);
	React.useEffect(() => {
		setMounted(true);
	}, []);

	const { coId } = useSelectedCompanyCoId();
	const { selectedCompany, selectedBranches } = useSidebarContext();

	// Only branches the sidebar currently has selected, in company order.
	const branchOptions = React.useMemo(
		() => (selectedCompany?.branches ?? []).filter((b) => selectedBranches.includes(b.branch_id)),
		[selectedCompany, selectedBranches]
	);
	const singleBranchId = branchOptions.length === 1 ? branchOptions[0].branch_id : null;

	const [rows, setRows] = React.useState<FinishingQualityRow[]>([]);
	const [items, setItems] = React.useState<SetupItem[]>([]);
	const [clothQualities, setClothQualities] = React.useState<ClothQualityOption[]>([]);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [typeFilter, setTypeFilter] = React.useState<QualityType | "all">("all");

	const [open, setOpen] = React.useState(false);
	const [mode, setMode] = React.useState<DialogMode>("create");
	const [editingId, setEditingId] = React.useState<number | null>(null);

	const { control, handleSubmit, reset, watch, setValue, formState } = useForm<FormData>({
		resolver: zodResolver(formSchema),
		defaultValues: DEFAULT_VALUES,
	});

	const watchedType = watch("quality_type");
	const isView = mode === "view";

	const refresh = React.useCallback(async () => {
		if (!coId) return;
		setLoading(true);
		const params = new URLSearchParams({ co_id: String(coId) });
		if (typeFilter !== "all") params.set("quality_type", String(typeFilter));
		const { data, error: err } = await fetchWithCookie<{ data: FinishingQualityRow[] }>(
			`${apiRoutesPortalMasters.FINISHING_QUALITY_LIST}?${params.toString()}`,
			"GET"
		);
		if (err) setError(err);
		setRows(data?.data ?? []);
		setLoading(false);
	}, [coId, typeFilter]);

	React.useEffect(() => {
		void refresh();
	}, [refresh]);

	// Load create/edit setup (items + cloth qualities) once a company is selected.
	React.useEffect(() => {
		if (!coId) return;
		void (async () => {
			const params = new URLSearchParams({ co_id: String(coId) });
			if (singleBranchId != null) params.set("branch_id", String(singleBranchId));
			const { data } = await fetchWithCookie<{
				data: { items: SetupItem[]; cloth_qualities: ClothQualityOption[] };
			}>(`${apiRoutesPortalMasters.FINISHING_QUALITY_SETUP}?${params.toString()}`, "GET");
			setItems(data?.data?.items ?? []);
			setClothQualities(data?.data?.cloth_qualities ?? []);
		})();
	}, [coId, singleBranchId]);

	const openCreate = () => {
		setMode("create");
		setEditingId(null);
		reset(DEFAULT_VALUES);
		setError(null);
		setOpen(true);
	};

	const rowToForm = (row: FinishingQualityRow): FormData => ({
		quality_type: row.quality_type === QUALITY_TYPE_BAG ? QUALITY_TYPE_BAG : QUALITY_TYPE_CLOTH,
		item_id: String(row.item_id),
		fin_quality_code: row.fin_quality_code ?? "",
		fin_quality_name: row.fin_quality_name ?? "",
		width_in: toStr(row.width_in),
		ports: toStr(row.ports),
		ends: toStr(row.ends),
		shots: toStr(row.shots),
		oz_per_yd: toStr(row.oz_per_yd),
		std_oz_per_yd: toStr(row.std_oz_per_yd),
		lead_length: toStr(row.lead_length),
		finished_length: toStr(row.finished_length),
		mc_teeth: toStr(row.mc_teeth),
		cloth_quality_id: toStr(row.cloth_quality_id),
		bag_length_in: toStr(row.bag_length_in),
		bag_width_in: toStr(row.bag_width_in),
		mouth_type: row.mouth_type ?? "",
		bags_per_bale: toStr(row.bags_per_bale),
	});

	const openDetail = async (row: FinishingQualityRow, nextMode: DialogMode) => {
		if (!coId) return;
		setError(null);
		setMode(nextMode);
		setEditingId(row.finishing_quality_id);
		// Seed from the list row so the dialog opens immediately, then refine from detail.
		reset(rowToForm(row));
		setOpen(true);

		const { data, error: err } = await fetchWithCookie<{ data: FinishingQualityRow }>(
			`${apiRoutesPortalMasters.FINISHING_QUALITY_DETAIL}/${row.finishing_quality_id}?co_id=${coId}`,
			"GET"
		);
		if (err) {
			setError(err);
			return;
		}
		if (data?.data) reset(rowToForm(data.data));
	};

	const onSubmit = handleSubmit(async (values) => {
		if (!coId || isView) return;
		setError(null);

		const branchId = singleBranchId != null ? singleBranchId : branchOptions[0]?.branch_id ?? null;
		const isBag = values.quality_type === QUALITY_TYPE_BAG;

		// Build the type-specific spec payload; the unused branch's fields go null.
		const clothSpec = {
			width_in: toNum(values.width_in),
			ports: toInt(values.ports),
			ends: toInt(values.ends),
			shots: toNum(values.shots),
			oz_per_yd: toNum(values.oz_per_yd),
			std_oz_per_yd: toNum(values.std_oz_per_yd),
			lead_length: toNum(values.lead_length),
			finished_length: toNum(values.finished_length),
			mc_teeth: toInt(values.mc_teeth),
		};
		const bagSpec = {
			cloth_quality_id: values.cloth_quality_id ? Number(values.cloth_quality_id) : null,
			bag_length_in: toNum(values.bag_length_in),
			bag_width_in: toNum(values.bag_width_in),
			mouth_type: values.mouth_type?.trim() || null,
			bags_per_bale: toInt(values.bags_per_bale),
		};

		if (mode === "edit" && editingId != null) {
			const body = {
				fin_quality_code: values.fin_quality_code.trim(),
				fin_quality_name: values.fin_quality_name?.trim() || null,
				item_id: Number(values.item_id),
				...(isBag ? bagSpec : clothSpec),
				active: 1,
			};
			const { error: err } = await fetchWithCookie(
				`${apiRoutesPortalMasters.FINISHING_QUALITY_EDIT}/${editingId}?co_id=${coId}`,
				"PUT",
				body
			);
			if (err) {
				setError(err);
				return;
			}
		} else {
			const body = {
				co_id: Number(coId),
				branch_id: branchId,
				quality_type: values.quality_type,
				item_id: Number(values.item_id),
				fin_quality_code: values.fin_quality_code.trim(),
				fin_quality_name: values.fin_quality_name?.trim() || null,
				...(isBag ? bagSpec : clothSpec),
			};
			const { error: err } = await fetchWithCookie(
				apiRoutesPortalMasters.FINISHING_QUALITY_CREATE,
				"POST",
				body
			);
			if (err) {
				setError(err);
				return;
			}
		}
		setOpen(false);
		setEditingId(null);
		await refresh();
	});

	const handleDelete = async (r: FinishingQualityRow) => {
		if (!coId) return;
		const label = r.fin_quality_name ? `${r.fin_quality_code} (${r.fin_quality_name})` : r.fin_quality_code;
		if (!window.confirm(`Delete finishing quality "${label}"?`)) return;
		setError(null);
		const { error: err } = await fetchWithCookie(
			`${apiRoutesPortalMasters.FINISHING_QUALITY_DELETE}/${r.finishing_quality_id}?co_id=${coId}`,
			"DELETE"
		);
		if (err) {
			setError(err);
			return;
		}
		await refresh();
	};

	const columns: GridColDef<FinishingQualityRow>[] = [
		{
			field: "actions",
			headerName: "",
			width: 130,
			sortable: false,
			renderCell: (params) => (
				<Box>
					<Tooltip title="View">
						<IconButton size="small" onClick={() => void openDetail(params.row, "view")}>
							<ViewIcon size={16} />
						</IconButton>
					</Tooltip>
					<Tooltip title="Edit">
						<IconButton size="small" onClick={() => void openDetail(params.row, "edit")}>
							<EditIcon size={16} />
						</IconButton>
					</Tooltip>
					<Tooltip title="Delete">
						<IconButton size="small" color="error" onClick={() => void handleDelete(params.row)}>
							<DeleteIcon size={16} />
						</IconButton>
					</Tooltip>
				</Box>
			),
		},
		{
			field: "quality_type",
			headerName: "Type",
			width: 110,
			renderCell: (params) =>
				params.value === QUALITY_TYPE_BAG ? (
					<Chip label="Bag" size="small" color="secondary" variant="outlined" />
				) : (
					<Chip label="Cloth" size="small" variant="outlined" />
				),
		},
		{ field: "fin_quality_code", headerName: "Quality Code", width: 160 },
		{ field: "fin_quality_name", headerName: "Quality Name", flex: 1, minWidth: 160 },
		{
			field: "item",
			headerName: "Item",
			flex: 1,
			minWidth: 200,
			valueGetter: (_value, row) => {
				const code = row.item_code ?? "";
				const name = row.item_name ?? "";
				if (!code && !name) return String(row.item_id);
				return `${code} — ${name}`.trim();
			},
		},
		{
			field: "width_in",
			headerName: "Width (in)",
			width: 110,
			type: "number",
			valueFormatter: (value) => (value != null ? value : "—"),
		},
		{
			field: "oz_per_yd",
			headerName: "Oz / Yd",
			width: 100,
			type: "number",
			valueFormatter: (value) => (value != null ? value : "—"),
		},
		{
			field: "bags_per_bale",
			headerName: "Bags / Bale",
			width: 120,
			type: "number",
			valueFormatter: (value) => (value != null ? value : "—"),
		},
		{
			field: "active",
			headerName: "Active",
			width: 90,
			renderCell: (params) => (params.value ? "Yes" : "No"),
		},
	];

	if (!mounted) return null;

	if (!coId) {
		return (
			<Alert severity="warning" sx={{ m: 2 }}>
				Select a company to continue.
			</Alert>
		);
	}

	const isBagForm = watchedType === QUALITY_TYPE_BAG;
	const dialogTitle =
		mode === "create"
			? "New Finishing Quality"
			: mode === "edit"
				? "Edit Finishing Quality"
				: "Finishing Quality";

	return (
		<Box sx={{ p: { xs: 1.5, md: 3 } }}>
			<Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2, gap: 2, flexWrap: "wrap" }}>
				<Box>
					<Typography variant="h5" sx={{ fontWeight: 600 }}>
						Finishing Quality Master
					</Typography>
					<Typography variant="body2" color="text.secondary">
						Cloth (rolls) and bag finishing qualities with their fixed structural specs. Bag qualities
						reference the cloth quality they are made from.
					</Typography>
				</Box>
				<Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
					<TextField
						select
						size="small"
						label="Type"
						value={typeFilter === "all" ? "all" : String(typeFilter)}
						onChange={(e) =>
							setTypeFilter(e.target.value === "all" ? "all" : (Number(e.target.value) as QualityType))
						}
						sx={{ minWidth: 140 }}
					>
						<MenuItem value="all">All</MenuItem>
						<MenuItem value={String(QUALITY_TYPE_CLOTH)}>Cloth</MenuItem>
						<MenuItem value={String(QUALITY_TYPE_BAG)}>Bag</MenuItem>
					</TextField>
					<Button variant="contained" startIcon={<AddIcon size={18} />} onClick={openCreate}>
						New Quality
					</Button>
				</Box>
			</Box>

			{error ? (
				<Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
					{error}
				</Alert>
			) : null}

			<Box sx={{ width: "100%" }}>
				<DataGrid
					autoHeight
					rows={rows}
					getRowId={(r) => r.finishing_quality_id}
					columns={columns}
					loading={loading}
					density="comfortable"
					disableRowSelectionOnClick
					pageSizeOptions={[10, 25, 50]}
					initialState={{ pagination: { paginationModel: { pageSize: 25, page: 0 } } }}
					sx={{ width: "100%" }}
				/>
			</Box>

			<Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth>
				<DialogTitle>{dialogTitle}</DialogTitle>
				<DialogContent>
					<Box sx={{ display: "grid", gap: 2, mt: 1 }}>
						{/* Type toggle (locked once a row exists — quality_type is part of the key). */}
						<Controller
							control={control}
							name="quality_type"
							render={({ field }) => (
								<TextField
									select
									label="Quality Type"
									size="small"
									value={String(field.value)}
									onChange={(e) => field.onChange(Number(e.target.value) as QualityType)}
									disabled={mode !== "create"}
								>
									<MenuItem value={String(QUALITY_TYPE_CLOTH)}>Cloth (rolls)</MenuItem>
									<MenuItem value={String(QUALITY_TYPE_BAG)}>Bag (pieces / bales)</MenuItem>
								</TextField>
							)}
						/>

						<Controller
							control={control}
							name="item_id"
							render={({ field, fieldState }) => (
								<TextField
									select
									label="Item"
									size="small"
									required
									value={field.value}
									onChange={field.onChange}
									disabled={isView || items.length === 0}
									error={!!fieldState.error}
									helperText={
										fieldState.error?.message ?? (items.length === 0 ? "Loading items…" : undefined)
									}
								>
									{items.map((it) => (
										<MenuItem key={it.item_id} value={String(it.item_id)}>
											{itemLabel(it)}
										</MenuItem>
									))}
								</TextField>
							)}
						/>

						<Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
							<Controller
								control={control}
								name="fin_quality_code"
								render={({ field, fieldState }) => (
									<TextField
										label="Quality Code"
										size="small"
										required
										value={field.value}
										onChange={field.onChange}
										disabled={isView}
										inputProps={{ maxLength: 50 }}
										error={!!fieldState.error}
										helperText={fieldState.error?.message}
									/>
								)}
							/>
							<Controller
								control={control}
								name="fin_quality_name"
								render={({ field, fieldState }) => (
									<TextField
										label="Quality Name"
										size="small"
										value={field.value ?? ""}
										onChange={field.onChange}
										disabled={isView}
										inputProps={{ maxLength: 100 }}
										error={!!fieldState.error}
										helperText={fieldState.error?.message}
									/>
								)}
							/>
						</Box>

						{isBagForm ? (
							// BAG specs (quality_type=2): cloth_quality_id (required) + bag dims.
							<>
								<Controller
									control={control}
									name="cloth_quality_id"
									render={({ field, fieldState }) => (
										<TextField
											select
											label="Cloth Quality (made from)"
											size="small"
											required
											value={field.value ?? ""}
											onChange={field.onChange}
											disabled={isView || clothQualities.length === 0}
											error={!!fieldState.error}
											helperText={
												fieldState.error?.message ??
												(clothQualities.length === 0 ? "No cloth qualities yet" : undefined)
											}
										>
											<MenuItem value="">
												<em>None</em>
											</MenuItem>
											{clothQualities.map((q) => (
												<MenuItem key={q.finishing_quality_id} value={String(q.finishing_quality_id)}>
													{q.fin_quality_name
														? `${q.fin_quality_code} — ${q.fin_quality_name}`
														: q.fin_quality_code}
												</MenuItem>
											))}
										</TextField>
									)}
								/>
								<Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
									<NumField control={control} name="bag_length_in" label="Bag Length (in)" disabled={isView} />
									<NumField control={control} name="bag_width_in" label="Bag Width (in)" disabled={isView} />
									<Controller
										control={control}
										name="mouth_type"
										render={({ field, fieldState }) => (
											<TextField
												label="Mouth Type"
												size="small"
												value={field.value ?? ""}
												onChange={field.onChange}
												disabled={isView}
												inputProps={{ maxLength: 30 }}
												placeholder="open / hemmed / B.Twill"
												error={!!fieldState.error}
												helperText={fieldState.error?.message}
											/>
										)}
									/>
									<NumField control={control} name="bags_per_bale" label="Bags / Bale" disabled={isView} integer />
								</Box>
							</>
						) : (
							// CLOTH specs (quality_type=1): structural specs.
							<Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr 1fr" }, gap: 2 }}>
								<NumField control={control} name="width_in" label="Width (in)" disabled={isView} />
								<NumField control={control} name="ports" label="Ports" disabled={isView} integer />
								<NumField control={control} name="ends" label="Ends" disabled={isView} integer />
								<NumField control={control} name="shots" label="Shots" disabled={isView} />
								<NumField control={control} name="oz_per_yd" label="Oz / Yd" disabled={isView} />
								<NumField control={control} name="std_oz_per_yd" label="Std Oz / Yd" disabled={isView} />
								<NumField control={control} name="lead_length" label="Lead Length" disabled={isView} />
								<NumField control={control} name="finished_length" label="Finished Length" disabled={isView} />
								<NumField control={control} name="mc_teeth" label="M/C Teeth" disabled={isView} integer />
							</Box>
						)}
					</Box>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setOpen(false)}>{isView ? "Close" : "Cancel"}</Button>
					{!isView ? (
						<Button variant="contained" onClick={() => void onSubmit()} disabled={formState.isSubmitting}>
							Save
						</Button>
					) : null}
				</DialogActions>
			</Dialog>
		</Box>
	);
}

// =============================================================================
// Small numeric field bound to a string-typed RHF field (parsed at submit).
// =============================================================================
type NumFieldName = keyof FormData;

function NumField({
	control,
	name,
	label,
	disabled,
	integer = false,
}: {
	control: ReturnType<typeof useForm<FormData>>["control"];
	name: NumFieldName;
	label: string;
	disabled?: boolean;
	integer?: boolean;
}) {
	return (
		<Controller
			control={control}
			name={name}
			render={({ field, fieldState }) => (
				<TextField
					type="number"
					label={label}
					size="small"
					value={typeof field.value === "string" ? field.value : ""}
					onChange={field.onChange}
					disabled={disabled}
					inputProps={integer ? { step: 1 } : { step: 0.001 }}
					error={!!fieldState.error}
					helperText={fieldState.error?.message}
				/>
			)}
		/>
	);
}
