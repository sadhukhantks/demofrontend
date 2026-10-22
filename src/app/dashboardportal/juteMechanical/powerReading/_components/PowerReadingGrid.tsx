"use client";

import * as React from "react";
import {
	Alert,
	Box,
	Button,
	Chip,
	IconButton,
	Paper,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	TextField,
	Tooltip,
	Typography,
	useMediaQuery,
	useTheme,
} from "@mui/material";
import { Save as SaveIcon, Trash2 as Trash2Icon } from "lucide-react";
import { Controller, useFieldArray, useForm, useWatch, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
	FORM_GRID_SX,
	MobileCard,
	STICKY_ACTIONS_SX,
	TOUCH_ICON_BUTTON_SX,
} from "@/components/ui/responsiveEntry";
import type { MechPowerReadingRow, MechPowerReadingsDay } from "@/utils/juteMechanicalService";
import {
	readingsFormSchema,
	rowsFromDay,
	type PowerReadingFormValues,
	type ReadingRowValues,
} from "../types/powerTypes";
import { computeKwh, ddmm, dgWarning, fmtKwh, spikeWarning, toNumberOrNull } from "../utils/powerCalc";

export interface PowerReadingGridProps {
	/** One row per active meter (plus orphaned saved rows), from GET /readings. */
	rows: ReadonlyArray<MechPowerReadingRow>;
	/** The day the rows belong to — a new object on every fetch, which resets the form. */
	day: MechPowerReadingsDay;
	/** Locked date without an admin role, or no edit permission: inputs disabled, no Save. */
	readOnly: boolean;
	submitting: boolean;
	submitError: string | null;
	/** Validated values — the page builds the payload and calls the service. */
	onSubmit: (values: PowerReadingFormValues) => void;
	/** Soft-deletes one saved reading (only offered on rows with a power_reading_id). */
	onDelete: (row: MechPowerReadingRow) => void;
	deleting: boolean;
}

/** The numeric fields of a row — all strings in the form. */
type NumericKey = "opening_kwh" | "closing_kwh" | "kwh" | "dg_hours" | "dg_litres" | "max_demand_kva";

type RowFieldName = `rows.${number}.${NumericKey}` | `rows.${number}.remarks`;

/** Live derivations for one row, computed from the watched form strings. */
interface RowLive {
	kwh: number | null;
	source: "computed" | "typed" | "none";
	kwhError: string | null;
	spike: string | null;
	dg: string | null;
}

function liveOf(values: ReadingRowValues | undefined, meter: MechPowerReadingRow): RowLive {
	if (!values) return { kwh: null, source: "none", kwhError: null, spike: null, dg: null };
	const result = computeKwh(
		toNumberOrNull(values.opening_kwh),
		toNumberOrNull(values.closing_kwh),
		toNumberOrNull(values.kwh)
	);
	return {
		kwh: result.kwh,
		source: result.source,
		kwhError: result.error,
		spike: spikeWarning(meter.meter_code, result.kwh, meter.median30_kwh),
		dg: dgWarning(
			meter.meter_type,
			toNumberOrNull(values.dg_hours),
			toNumberOrNull(values.dg_litres)
		),
	};
}

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

interface NumFieldProps {
	control: Control<PowerReadingFormValues>;
	name: RowFieldName;
	/** Floating label on the phone cards; omitted in the table (column headers). */
	label?: string;
	ariaLabel: string;
	disabled?: boolean;
	error?: string;
	helper?: React.ReactNode;
	step?: string;
}

/**
 * A numeric reading input: `type="number"` with a decimal keypad on phones.
 * `min` is advisory only — the Zod contract carries the real rule.
 */
function NumField({ control, name, label, ariaLabel, disabled, error, helper, step = "0.01" }: NumFieldProps) {
	return (
		<Controller
			name={name}
			control={control}
			render={({ field }) => (
				<TextField
					{...field}
					value={field.value ?? ""}
					type="number"
					size="small"
					fullWidth
					label={label}
					disabled={disabled}
					slotProps={{
						htmlInput: { inputMode: "decimal", step, min: 0, "aria-label": ariaLabel },
						inputLabel: label ? { shrink: true } : undefined,
					}}
					error={!!error}
					helperText={error ?? helper}
				/>
			)}
		/>
	);
}

/** The kWh cell: read-only computed figure when both bounds are keyed, editable otherwise. */
function KwhField({
	control,
	index,
	live,
	label,
	disabled,
	error,
}: {
	control: Control<PowerReadingFormValues>;
	index: number;
	live: RowLive;
	label?: string;
	disabled: boolean;
	error?: string;
}) {
	const helper = live.source === "computed" ? "closing − opening" : live.source === "typed" ? "typed" : "typed when a bound is missing";
	if (live.source === "computed") {
		return (
			<TextField
				value={live.kwh == null ? "" : String(live.kwh)}
				type="number"
				size="small"
				fullWidth
				label={label}
				disabled
				slotProps={{
					htmlInput: { "aria-label": "kWh (computed)", inputMode: "decimal" },
					inputLabel: label ? { shrink: true } : undefined,
				}}
				error={!!live.kwhError}
				helperText={live.kwhError ?? helper}
			/>
		);
	}
	return (
		<NumField
			control={control}
			name={`rows.${index}.kwh`}
			label={label}
			ariaLabel="kWh"
			disabled={disabled}
			error={error}
			helper={helper}
		/>
	);
}

/** Caption under a field that carries a warning — words, never colour alone. */
function Hint({ text, tone }: { text: string | null; tone: "warning" | "info" }) {
	if (!text) return null;
	return (
		<Typography
			variant="caption"
			component="div"
			sx={{ color: tone === "warning" ? "warning.main" : "text.secondary", mt: 0.25 }}
		>
			{text}
		</Typography>
	);
}

/**
 * The day's reading grid — one row per meter, desktop table or phone cards.
 *
 * Owns React Hook Form state only; the page owns the data and both writes.
 * Both bounds keyed → kWh is shown as closing − opening and cannot be typed
 * (the server recomputes it anyway); a bound missing (meter reset) → kWh is
 * typed. The spike and DG hints mirror the server's warnings so the electrician
 * sees them before pressing Save; they never block the save.
 *
 * ONE layout is rendered, picked with `useMediaQuery` rather than the usual
 * CSS-only DESKTOP/MOBILE pair: the inputs are RHF-controlled, and the same
 * field must not be registered twice. The page holds its first render behind a
 * `mounted` guard, so there is no hydration to protect.
 */
export default function PowerReadingGrid({
	rows,
	day,
	readOnly,
	submitting,
	submitError,
	onSubmit,
	onDelete,
	deleting,
}: PowerReadingGridProps) {
	const theme = useTheme();
	const isPhone = useMediaQuery(theme.breakpoints.down("md"), { noSsr: true });

	const {
		control,
		handleSubmit,
		reset,
		formState: { errors },
	} = useForm<PowerReadingFormValues>({
		resolver: zodResolver(readingsFormSchema),
		defaultValues: { rows: rowsFromDay(day) },
		mode: "onTouched",
	});

	const { fields } = useFieldArray({ control, name: "rows" });

	// A fresh `day` (date / spell change, refresh after a save) rewrites the form.
	React.useEffect(() => {
		reset({ rows: rowsFromDay(day) });
	}, [day, reset]);

	const watched = useWatch({ control, name: "rows" });

	const live = React.useMemo<RowLive[]>(
		() => rows.map((meter, i) => liveOf(watched?.[i], meter)),
		[rows, watched]
	);

	const disabled = readOnly || submitting;

	const rowError = (i: number, key: NumericKey | "remarks"): string | undefined =>
		errors.rows?.[i]?.[key]?.message;

	const prefillHint = (meter: MechPowerReadingRow): string | null =>
		meter.power_reading_id == null && meter.prefill_from_date
			? `from closing on ${ddmm(meter.prefill_from_date)}`
			: null;

	const medianHint = (meter: MechPowerReadingRow): string | null =>
		meter.median30_kwh != null ? `30-day median ${fmtKwh(meter.median30_kwh)} kWh` : null;

	const deleteButton = (meter: MechPowerReadingRow, size: "small" | "touch") =>
		meter.power_reading_id != null && !readOnly ? (
			<Tooltip title="Delete this reading">
				<span>
					<IconButton
						size="small"
						color="error"
						aria-label={`Delete ${meter.meter_code} reading`}
						disabled={deleting || submitting}
						onClick={() => onDelete(meter)}
						sx={size === "touch" ? TOUCH_ICON_BUTTON_SX : { minWidth: 40, minHeight: 40 }}
					>
						<Trash2Icon size={size === "touch" ? 18 : 16} />
					</IconButton>
				</span>
			</Tooltip>
		) : null;

	const meterHeader = (meter: MechPowerReadingRow) => (
		<Box sx={{ minWidth: 0 }}>
			<Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
				<Typography variant="subtitle2" fontWeight={700} noWrap>
					{meter.meter_name}
				</Typography>
				<Chip size="small" color={typeColor(meter.meter_type)} label={meter.meter_type} />
				{meter.meter_active === 0 ? (
					<Chip size="small" variant="outlined" label="inactive meter" />
				) : null}
			</Box>
			<Typography variant="caption" color="text.secondary" display="block">
				{meter.meter_code}
				{meter.power_reading_id != null ? ` · saved #${meter.power_reading_id}` : " · not saved"}
			</Typography>
		</Box>
	);

	const isDg = (meter: MechPowerReadingRow) => meter.meter_type === "DG";

	return (
		<Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
			{rows.length === 0 ? (
				<Typography variant="body2" color="text.secondary">
					No meters to key for this date.
				</Typography>
			) : null}

			{!isPhone && rows.length > 0 ? (
				<TableContainer component={Paper} variant="outlined" sx={{ overflowX: "auto" }}>
					<Table
						size="small"
						sx={{
							minWidth: 1100,
							"& th": { fontWeight: 700, whiteSpace: "nowrap", bgcolor: "action.hover" },
							"& td": { verticalAlign: "top", py: 1 },
						}}
					>
						<TableHead>
							<TableRow>
								<TableCell>Meter</TableCell>
								<TableCell>Opening kWh</TableCell>
								<TableCell>Closing kWh</TableCell>
								<TableCell>kWh</TableCell>
								<TableCell>DG hrs</TableCell>
								<TableCell>DG litres</TableCell>
								<TableCell>Max kVA</TableCell>
								<TableCell>Remarks</TableCell>
								<TableCell padding="checkbox" />
							</TableRow>
						</TableHead>
						<TableBody>
							{fields.map((field, i) => {
								const meter = rows[i];
								if (!meter) return null;
								const l = live[i];
								return (
									<TableRow key={field.id}>
										<TableCell sx={{ minWidth: 180 }}>{meterHeader(meter)}</TableCell>
										<TableCell sx={{ minWidth: 130 }}>
											<NumField
												control={control}
												name={`rows.${i}.opening_kwh`}
												ariaLabel={`${meter.meter_code} opening kWh`}
												disabled={disabled}
												error={rowError(i, "opening_kwh")}
												helper={prefillHint(meter)}
											/>
										</TableCell>
										<TableCell sx={{ minWidth: 130 }}>
											<NumField
												control={control}
												name={`rows.${i}.closing_kwh`}
												ariaLabel={`${meter.meter_code} closing kWh`}
												disabled={disabled}
												error={rowError(i, "closing_kwh") ?? l.kwhError ?? undefined}
											/>
										</TableCell>
										<TableCell sx={{ minWidth: 130 }}>
											<KwhField
												control={control}
												index={i}
												live={l}
												disabled={disabled}
												error={rowError(i, "kwh")}
											/>
											<Hint text={l.spike} tone="warning" />
											{!l.spike ? <Hint text={medianHint(meter)} tone="info" /> : null}
										</TableCell>
										<TableCell sx={{ minWidth: 100 }}>
											<NumField
												control={control}
												name={`rows.${i}.dg_hours`}
												ariaLabel={`${meter.meter_code} DG hours`}
												disabled={disabled || !isDg(meter)}
												error={rowError(i, "dg_hours")}
											/>
										</TableCell>
										<TableCell sx={{ minWidth: 110 }}>
											<NumField
												control={control}
												name={`rows.${i}.dg_litres`}
												ariaLabel={`${meter.meter_code} DG litres`}
												disabled={disabled || !isDg(meter)}
												error={rowError(i, "dg_litres")}
											/>
											<Hint text={l.dg} tone="warning" />
										</TableCell>
										<TableCell sx={{ minWidth: 110 }}>
											<NumField
												control={control}
												name={`rows.${i}.max_demand_kva`}
												ariaLabel={`${meter.meter_code} max demand kVA`}
												disabled={disabled}
												error={rowError(i, "max_demand_kva")}
											/>
										</TableCell>
										<TableCell sx={{ minWidth: 180 }}>
											<Controller
												name={`rows.${i}.remarks`}
												control={control}
												render={({ field: f }) => (
													<TextField
														{...f}
														value={f.value ?? ""}
														size="small"
														fullWidth
														disabled={disabled}
														slotProps={{
															htmlInput: { maxLength: 255, "aria-label": `${meter.meter_code} remarks` },
														}}
														error={!!rowError(i, "remarks")}
														helperText={rowError(i, "remarks")}
													/>
												)}
											/>
										</TableCell>
										<TableCell padding="checkbox">{deleteButton(meter, "small")}</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</TableContainer>
			) : null}

			{isPhone && rows.length > 0 ? (
				<Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
					{fields.map((field, i) => {
						const meter = rows[i];
						if (!meter) return null;
						const l = live[i];
						return (
							<MobileCard
								key={field.id}
								header={
									<>
										<Box sx={{ flexGrow: 1, minWidth: 0 }}>{meterHeader(meter)}</Box>
										{deleteButton(meter, "touch")}
									</>
								}
							>
								<Box sx={{ ...FORM_GRID_SX, gridColumn: "1 / -1" }}>
									<NumField
										control={control}
										name={`rows.${i}.opening_kwh`}
										label="Opening kWh"
										ariaLabel={`${meter.meter_code} opening kWh`}
										disabled={disabled}
										error={rowError(i, "opening_kwh")}
										helper={prefillHint(meter)}
									/>
									<NumField
										control={control}
										name={`rows.${i}.closing_kwh`}
										label="Closing kWh"
										ariaLabel={`${meter.meter_code} closing kWh`}
										disabled={disabled}
										error={rowError(i, "closing_kwh") ?? l.kwhError ?? undefined}
									/>
									<Box>
										<KwhField
											control={control}
											index={i}
											live={l}
											label="kWh"
											disabled={disabled}
											error={rowError(i, "kwh")}
										/>
										<Hint text={l.spike} tone="warning" />
										{!l.spike ? <Hint text={medianHint(meter)} tone="info" /> : null}
									</Box>
									{isDg(meter) ? (
										<>
											<NumField
												control={control}
												name={`rows.${i}.dg_hours`}
												label="DG hours"
												ariaLabel={`${meter.meter_code} DG hours`}
												disabled={disabled}
												error={rowError(i, "dg_hours")}
											/>
											<Box>
												<NumField
													control={control}
													name={`rows.${i}.dg_litres`}
													label="DG litres"
													ariaLabel={`${meter.meter_code} DG litres`}
													disabled={disabled}
													error={rowError(i, "dg_litres")}
												/>
												<Hint text={l.dg} tone="warning" />
											</Box>
										</>
									) : null}
									<NumField
										control={control}
										name={`rows.${i}.max_demand_kva`}
										label="Max demand kVA"
										ariaLabel={`${meter.meter_code} max demand kVA`}
										disabled={disabled}
										error={rowError(i, "max_demand_kva")}
									/>
									<Controller
										name={`rows.${i}.remarks`}
										control={control}
										render={({ field: f }) => (
											<TextField
												{...f}
												value={f.value ?? ""}
												label="Remarks"
												size="small"
												fullWidth
												disabled={disabled}
												slotProps={{ htmlInput: { maxLength: 255 } }}
												error={!!rowError(i, "remarks")}
												helperText={rowError(i, "remarks")}
											/>
										)}
									/>
								</Box>
							</MobileCard>
						);
					})}
				</Box>
			) : null}

			{submitError ? (
				<Alert severity="error" sx={{ mt: 1.5 }}>
					{submitError}
				</Alert>
			) : null}

			{!readOnly && rows.length > 0 ? (
				<Box sx={{ ...STICKY_ACTIONS_SX, mt: 2 }}>
					<Button
						type="submit"
						variant="contained"
						startIcon={<SaveIcon size={16} />}
						disabled={submitting || deleting}
						sx={{ minHeight: 44, width: { xs: "100%", sm: "auto" } }}
					>
						{submitting ? "Saving…" : "Save readings"}
					</Button>
				</Box>
			) : null}
		</Box>
	);
}
