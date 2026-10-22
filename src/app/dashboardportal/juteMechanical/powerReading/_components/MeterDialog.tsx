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
	Divider,
	IconButton,
	TextField,
	Tooltip,
	Typography,
	useMediaQuery,
	useTheme,
} from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { Pencil as EditIcon, Plus as PlusIcon, Save as SaveIcon } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import {
	DIALOG_ACTIONS_SX,
	DIALOG_FORM_SCROLL_SX,
	FORM_GRID_SX,
	MOBILE_FULL_BLEED_PAPER,
	MobileCard,
	TOUCH_ICON_BUTTON_SX,
} from "@/components/ui/responsiveEntry";
import type {
	MechEnumOption,
	MechPowerMeter,
	MechPowerMeterPayload,
} from "@/utils/juteMechanicalService";
import type { PowerMutationResult } from "../hooks/usePowerMeters";
import {
	buildMeterFormValues,
	buildMeterPayload,
	meterFormSchema,
	METER_TYPES,
	type MeterFormValues,
} from "../types/powerTypes";

export interface MeterDialogProps {
	open: boolean;
	onClose: () => void;
	coId: number;
	branchId: number;
	/** Every meter of the branch, inactive ones included. */
	meters: ReadonlyArray<MechPowerMeter>;
	/** GRID / DG / SOLAR from the backend; falls back to the fixed three. */
	meterTypes: ReadonlyArray<MechEnumOption>;
	/** Success message for the page's snackbar; the page also refreshes its lists. */
	onSaved: (message: string) => void;
	/** Without edit permission the list is shown but the form is disabled. */
	canEdit: boolean;
	create: (body: MechPowerMeterPayload) => Promise<PowerMutationResult>;
	update: (powerMeterId: number, body: MechPowerMeterPayload) => Promise<PowerMutationResult>;
	saving: boolean;
}

const ACTIVE_OPTIONS = [
	{ value: "1", label: "Active" },
	{ value: "0", label: "Inactive" },
] as const;

/** Chip colour per meter kind — palette keys, never hex. */
function typeColor(meterType: string): "primary" | "warning" | "success" | "default" {
	switch (meterType) {
		case "GRID":
			return "primary";
		case "DG":
			return "warning";
		case "SOLAR":
			return "success";
		default:
			return "default";
	}
}

/**
 * The branch's power meters, managed from the entry page (there is no separate
 * master menu for them): a list of the meters on top, the add / edit form below.
 *
 * No delete — a meter is deactivated (active = 0) so its readings keep their
 * meter_code; deactivated meters stay listed here so they can be reactivated.
 */
export default function MeterDialog({
	open,
	onClose,
	coId,
	branchId,
	meters,
	meterTypes,
	onSaved,
	canEdit,
	create,
	update,
	saving,
}: MeterDialogProps) {
	const theme = useTheme();
	// One layout is MOUNTED, not CSS-hidden: a DataGrid inside a display:none box has 0 width and MUI X warns.
	const isPhone = useMediaQuery(theme.breakpoints.down("md"), { noSsr: true });
	const [editing, setEditing] = React.useState<MechPowerMeter | null>(null);
	const [saveError, setSaveError] = React.useState<string | null>(null);

	const {
		control,
		handleSubmit,
		reset,
		setValue,
		formState: { errors },
	} = useForm<MeterFormValues>({
		resolver: zodResolver(meterFormSchema),
		defaultValues: buildMeterFormValues(null),
		mode: "onTouched",
	});

	// Each opening starts on a blank "new meter" form.
	React.useEffect(() => {
		if (!open) return;
		setEditing(null);
		setSaveError(null);
		reset(buildMeterFormValues(null));
	}, [open, reset]);

	const typeOptions = React.useMemo(
		() =>
			meterTypes.length > 0
				? meterTypes.map((t) => ({ value: t.code, label: t.label }))
				: METER_TYPES.map((code) => ({ value: code, label: code })),
		[meterTypes]
	);

	const startEdit = React.useCallback(
		(meter: MechPowerMeter) => {
			setEditing(meter);
			setSaveError(null);
			reset(buildMeterFormValues(meter));
		},
		[reset]
	);

	const startNew = React.useCallback(() => {
		setEditing(null);
		setSaveError(null);
		reset(buildMeterFormValues(null));
	}, [reset]);

	const onSubmit = React.useCallback(
		async (values: MeterFormValues) => {
			if (!canEdit) return;
			setSaveError(null);
			const payload = buildMeterPayload(values, coId, branchId);
			const result = editing
				? await update(editing.power_meter_id, payload)
				: await create(payload);
			if (!result.ok) {
				setSaveError(result.error);
				return;
			}
			onSaved(editing ? `Updated meter ${payload.meter_code}` : `Added meter ${payload.meter_code}`);
			startNew();
		},
		[branchId, canEdit, coId, create, editing, onSaved, startNew, update]
	);

	const columns = React.useMemo<GridColDef<MechPowerMeter>[]>(
		() => [
			{ field: "meter_code", headerName: "Code", width: 110 },
			{ field: "meter_name", headerName: "Name", flex: 1, minWidth: 160 },
			{
				field: "meter_type",
				headerName: "Type",
				width: 110,
				renderCell: (params) => (
					<Chip
						size="small"
						color={typeColor(String(params.value ?? ""))}
						label={params.row.meter_type_label ?? params.value}
					/>
				),
			},
			{
				field: "active",
				headerName: "Active",
				width: 110,
				renderCell: (params) => (
					<Chip
						size="small"
						variant="outlined"
						color={Number(params.value) === 1 ? "success" : "default"}
						label={Number(params.value) === 1 ? "Active" : "Inactive"}
					/>
				),
			},
			{
				field: "actions",
				headerName: "",
				width: 64,
				sortable: false,
				filterable: false,
				disableColumnMenu: true,
				renderCell: (params) =>
					canEdit ? (
						<Tooltip title="Edit meter">
							<IconButton
								size="small"
								color="primary"
								aria-label={`Edit ${params.row.meter_code}`}
								onClick={() => startEdit(params.row)}
								sx={{ minWidth: 40, minHeight: 40 }}
							>
								<EditIcon size={16} />
							</IconButton>
						</Tooltip>
					) : null,
			},
		],
		[canEdit, startEdit]
	);

	return (
		<Dialog
			open={open}
			onClose={saving ? undefined : onClose}
			fullWidth
			maxWidth="md"
			PaperProps={MOBILE_FULL_BLEED_PAPER}
			sx={DIALOG_FORM_SCROLL_SX}
		>
			<Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
				<DialogTitle>Power meters</DialogTitle>
				<DialogContent dividers>
					<Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
						One row per physical meter: the grid supply, each DG set and any solar
						feed, keyed separately. Deactivate a meter instead of deleting it — its
						readings keep the code.
					</Typography>

					{/* Desktop: the list as a grid (mounted only above md). */}
					{!isPhone ? (
					<Box>
						<DataGrid
							autoHeight
							rows={meters as MechPowerMeter[]}
							getRowId={(row) => row.power_meter_id}
							columns={columns}
							hideFooter
							disableRowSelectionOnClick
							density="compact"
							localeText={{ noRowsLabel: "No meters yet — add MAIN / DG meters below" }}
						/>
					</Box>
					) : null}

					{/* Phone: the same list as cards. */}
					{isPhone ? (
					<Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
						{meters.length === 0 ? (
							<Typography variant="body2" color="text.secondary">
								No meters yet — add MAIN / DG meters below.
							</Typography>
						) : null}
						{meters.map((meter) => (
							<MobileCard
								key={meter.power_meter_id}
								header={
									<>
										<Box sx={{ flexGrow: 1, minWidth: 0 }}>
											<Typography variant="subtitle2" fontWeight={700}>
												{meter.meter_code} — {meter.meter_name}
											</Typography>
										</Box>
										<Chip size="small" color={typeColor(meter.meter_type)} label={meter.meter_type_label} />
										<Chip
											size="small"
											variant="outlined"
											color={meter.active === 1 ? "success" : "default"}
											label={meter.active === 1 ? "Active" : "Inactive"}
										/>
										{canEdit ? (
											<IconButton
												size="small"
												color="primary"
												aria-label={`Edit ${meter.meter_code}`}
												onClick={() => startEdit(meter)}
												sx={TOUCH_ICON_BUTTON_SX}
											>
												<EditIcon size={18} />
											</IconButton>
										) : null}
									</>
								}
							>
								<span />
							</MobileCard>
						))}
					</Box>
					) : null}

					<Divider sx={{ my: 2 }} />

					<Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5, flexWrap: "wrap" }}>
						<Typography variant="subtitle2">
							{editing ? `Edit meter ${editing.meter_code}` : "New meter"}
						</Typography>
						{editing && canEdit ? (
							<Button size="small" startIcon={<PlusIcon size={14} />} onClick={startNew} disabled={saving}>
								New meter
							</Button>
						) : null}
					</Box>

					<Box sx={FORM_GRID_SX}>
						<Controller
							name="meter_code"
							control={control}
							render={({ field }) => (
								<TextField
									{...field}
									label="Meter code"
									size="small"
									fullWidth
									required
									disabled={!canEdit || saving}
									onBlur={() => {
										setValue("meter_code", field.value.trim().toUpperCase(), {
											shouldValidate: true,
										});
										field.onBlur();
									}}
									slotProps={{ htmlInput: { maxLength: 20, style: { textTransform: "uppercase" } } }}
									error={!!errors.meter_code}
									helperText={errors.meter_code?.message ?? "e.g. MAIN, DG1, SOLAR"}
								/>
							)}
						/>
						<Controller
							name="meter_name"
							control={control}
							render={({ field }) => (
								<TextField
									{...field}
									label="Meter name"
									size="small"
									fullWidth
									required
									disabled={!canEdit || saving}
									slotProps={{ htmlInput: { maxLength: 100 } }}
									error={!!errors.meter_name}
									helperText={errors.meter_name?.message}
								/>
							)}
						/>
						<Controller
							name="meter_type"
							control={control}
							render={({ field }) => (
								<SearchableOptionSelect
									label="Meter type"
									size="small"
									fullWidth
									required
									clearable={false}
									disabled={!canEdit || saving}
									options={typeOptions}
									value={field.value}
									onChange={(selectedValue) => {
										if (selectedValue !== "") field.onChange(selectedValue);
									}}
									error={!!errors.meter_type}
									helperText={errors.meter_type?.message}
								/>
							)}
						/>
						<Controller
							name="active"
							control={control}
							render={({ field }) => (
								<SearchableOptionSelect
									label="Active"
									size="small"
									fullWidth
									clearable={false}
									disabled={!canEdit || saving}
									options={ACTIVE_OPTIONS}
									value={field.value}
									onChange={(selectedValue) => {
										if (selectedValue !== "") field.onChange(selectedValue);
									}}
									error={!!errors.active}
									helperText={errors.active?.message}
								/>
							)}
						/>
					</Box>

					{saveError ? (
						<Alert severity="error" sx={{ mt: 1.5 }}>
							{saveError}
						</Alert>
					) : null}
					{!canEdit ? (
						<Alert severity="info" sx={{ mt: 1.5 }}>
							You can view the meters but not change them (edit permission needed).
						</Alert>
					) : null}
				</DialogContent>
				<DialogActions sx={DIALOG_ACTIONS_SX}>
					<Button type="button" onClick={onClose} disabled={saving}>
						{canEdit ? "Cancel" : "Close"}
					</Button>
					{canEdit ? (
						<Button
							type="submit"
							variant="contained"
							startIcon={<SaveIcon size={16} />}
							disabled={saving}
						>
							{saving ? "Saving…" : editing ? "Update meter" : "Add meter"}
						</Button>
					) : null}
				</DialogActions>
			</Box>
		</Dialog>
	);
}
