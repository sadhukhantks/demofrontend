"use client";

import * as React from "react";
import {
	Alert,
	Box,
	Button,
	TextField,
	ToggleButton,
	ToggleButtonGroup,
	Typography,
} from "@mui/material";
import { Save as SaveIcon, X as CancelIcon } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import SearchableOptionSelect from "@/components/ui/SearchableOptionSelect";
import type {
	FinishingStockBucket,
	FinishingStockRow,
	FinishingStockSetup,
} from "@/utils/finishingStockService";
import {
	BALE_QTY_UOM,
	buildDefaultFormValues,
	DEFAULT_LOOSE_UOM,
	finishingStockSchema,
	QTY_MAX,
	REMARKS_MAX,
	WT_MAX,
	type FinishingStockFormInput,
	type FinishingStockFormValues,
} from "../utils/stockSchema";
import {
	kgToMt,
	lineTotalKg,
	prefillWtKg,
	qualityTypeLabel,
	unitWtFor,
} from "../utils/stockCalc";

export interface FinishingStockFormProps {
	/** Dropdown data from GET /finishingStock/setup. */
	setup: FinishingStockSetup;
	/** Company doing the count — the Owner picker defaults to it. */
	coId: number;
	/** Date the day grid is showing — new lines default to it. */
	tranDate: string;
	/** Row lifted from the grid for editing, or null while creating. */
	editingEntry: FinishingStockRow | null;
	/** Monotonic counter the page bumps after a successful save or when leaving
	 * edit mode; any change clears the form (keeping the bucket so a run of
	 * same-kind lines is quick to book). */
	formResetToken: number;
	submitting: boolean;
	/** Server-side error surfaced by the parent, or null. */
	submitError: string | null;
	/** Validated values — the parent builds the payload and calls the API. */
	onSubmit: (values: FinishingStockFormValues) => void;
	onCancelEdit: () => void;
}

/**
 * Finishing Stock count form — one row per counted lot. The Bucket toggle
 * decides which half of the form applies: BALE (owner company, bales,
 * per-bale kg) or LOOSE (stage, dept/contract, count + UoM, weighed kg).
 * Presentational with respect to data: every option list arrives via props and
 * validated values are handed back to the page, which owns the API calls.
 */
export default function FinishingStockForm({
	setup,
	coId,
	tranDate,
	editingEntry,
	formResetToken,
	submitting,
	submitError,
	onSubmit,
	onCancelEdit,
}: FinishingStockFormProps) {
	const editing = editingEntry != null;

	const defaults = React.useCallback(
		(date: string, bucket: FinishingStockBucket = "BALE"): FinishingStockFormValues => ({
			...buildDefaultFormValues(date, bucket),
			owner_co_id: String(coId),
		}),
		[coId]
	);

	const {
		control,
		handleSubmit,
		reset,
		setValue,
		getValues,
		formState: { errors },
	} = useForm<FinishingStockFormInput, unknown, FinishingStockFormValues>({
		resolver: zodResolver(finishingStockSchema),
		defaultValues: defaults(tranDate),
		mode: "onTouched",
	});

	const bucket = useWatch({ control, name: "bucket" });
	const qualityId = useWatch({ control, name: "finishing_quality_id" });
	const qty = useWatch({ control, name: "qty" });
	const qtyUom = useWatch({ control, name: "qty_uom" }) ?? "";
	const wtPerUnit = useWatch({ control, name: "wt_per_unit_kg" });
	const wtKg = useWatch({ control, name: "wt_kg" });

	// Hessian first, then Sacking — the order the mill's sheet prints.
	const qualityOptions = React.useMemo(
		() =>
			[...setup.qualities]
				.sort(
					(a, b) =>
						a.quality_type - b.quality_type ||
						(a.item_name ?? "").localeCompare(b.item_name ?? "")
				)
				.map((q) => ({
					value: String(q.finishing_quality_id),
					label: `${qualityTypeLabel(q.quality_type)} · ${q.item_name ?? `#${q.item_id}`}`,
				})),
		[setup.qualities]
	);

	const companyOptions = React.useMemo(
		() => setup.companies.map((c) => ({ value: String(c.co_id), label: c.co_name })),
		[setup.companies]
	);

	const stageOptions = React.useMemo(
		() => setup.stages.map((s) => ({ value: s.code, label: s.label })),
		[setup.stages]
	);

	const uomOptions = React.useMemo(
		() => setup.loose_qty_uoms.map((u) => ({ value: u, label: u })),
		[setup.loose_qty_uoms]
	);

	const selectedQuality = React.useMemo(
		() => setup.qualities.find((q) => String(q.finishing_quality_id) === qualityId),
		[setup.qualities, qualityId]
	);

	/** kg per counted unit for the picked quality + UoM, null when unresolvable. */
	const looseUnitWt = unitWtFor(selectedQuality, qtyUom);

	/** True once the operator types a weight — suppresses the prefill until the
	 * quality or the UoM changes, so a weighed figure is never overwritten. */
	const wtTouched = React.useRef(false);

	const previewKg = lineTotalKg({
		bucket,
		qty: Number(qty),
		wt_per_unit_kg: wtPerUnit === "" ? null : Number(wtPerUnit),
		wt_kg: wtKg === "" ? null : Number(wtKg),
	});

	// The effects below MUST stay in this order — React runs them in declaration
	// order and each later one refines the state an earlier one set.

	// 1. Lift a grid row into edit mode (the bucket follows the row).
	React.useEffect(() => {
		if (!editingEntry) return;
		// The saved weight is the operator's own figure — hold the prefill until
		// they change the quality or the UoM.
		wtTouched.current = true;
		reset({
			tran_date: editingEntry.tran_date,
			bucket: editingEntry.bucket,
			finishing_quality_id: String(editingEntry.finishing_quality_id),
			// NULL owner = own company; the payload builder maps it back to NULL.
			owner_co_id: String(editingEntry.owner_co_id ?? coId),
			stage: editingEntry.stage ?? "",
			work_by: String(editingEntry.work_by),
			qty: String(editingEntry.qty),
			qty_uom: editingEntry.qty_uom,
			wt_per_unit_kg:
				editingEntry.wt_per_unit_kg == null ? "" : String(editingEntry.wt_per_unit_kg),
			wt_kg: editingEntry.wt_kg == null ? "" : String(editingEntry.wt_kg),
			remarks: editingEntry.remarks ?? "",
		});
	}, [editingEntry, coId, reset]);

	// 2. Clear the form after a save / on leaving edit mode, keeping the bucket.
	const firstResetToken = React.useRef(true);
	React.useEffect(() => {
		if (firstResetToken.current) {
			firstResetToken.current = false;
			return;
		}
		const current = getValues();
		wtTouched.current = false;
		reset(defaults(current.tran_date, current.bucket));
	}, [formResetToken, defaults, getValues, reset]);

	// 3. Keep the form's date on the date the grid is showing (create mode only —
	//    an existing row's date is immutable).
	React.useEffect(() => {
		if (editingEntry) return;
		setValue("tran_date", tranDate, { shouldValidate: false });
	}, [tranDate, editingEntry, setValue]);

	// 4. LOOSE: prefill Weight kg = count x the quality's standard unit weight,
	//    until the operator types a weight of their own. With no standard for the
	//    picked UoM the field is cleared, not left holding the previous unit's
	//    prefill — 130 PCS = 75.4 kg must not stay put when the lot becomes CUTS.
	React.useEffect(() => {
		if (bucket !== "LOOSE" || wtTouched.current) return;
		setValue("wt_kg", prefillWtKg(qty ?? "", looseUnitWt), { shouldValidate: false });
	}, [bucket, qualityId, qtyUom, qty, looseUnitWt, setValue]);

	/** The quality's standard bale weight as a form string, "" when it has none. */
	const stdBaleWeight = (qualityValue: string) => {
		const quality = setup.qualities.find(
			(q) => String(q.finishing_quality_id) === qualityValue
		);
		return quality?.std_bale_weight == null ? "" : String(quality.std_bale_weight);
	};

	const onBucketChange = (next: FinishingStockBucket | null) => {
		if (!next || next === getValues("bucket")) return;
		wtTouched.current = false;
		const current = getValues();
		reset({
			...defaults(current.tran_date, next),
			finishing_quality_id: current.finishing_quality_id,
			// Switching back to BALE re-applies the standard, so the field is never
			// left blank under a quality that has one.
			wt_per_unit_kg: next === "BALE" ? stdBaleWeight(current.finishing_quality_id) : "",
			remarks: current.remarks,
		});
	};

	// Per-bale kg follows the quality's standard on every quality change (BALE
	// only); the operator can still type over it for an odd lot.
	const onQualityChange = (next: string) => {
		wtTouched.current = false;
		setValue("finishing_quality_id", next, { shouldValidate: true });
		if (getValues("bucket") !== "BALE") return;
		setValue("wt_per_unit_kg", stdBaleWeight(next), { shouldValidate: false });
	};

	return (
		<Box
			component="form"
			onSubmit={handleSubmit(onSubmit)}
			noValidate
			sx={{ display: "flex", flexDirection: "column", gap: 2 }}
		>
			<Controller
				name="bucket"
				control={control}
				render={({ field }) => (
					<ToggleButtonGroup
						exclusive
						size="small"
						color="primary"
						value={field.value}
						onChange={(_, next: FinishingStockBucket | null) => onBucketChange(next)}
						sx={{ alignSelf: "flex-start" }}
					>
						<ToggleButton value="BALE" sx={{ minHeight: 44, px: 2 }}>
							Pressed Bales
						</ToggleButton>
						<ToggleButton value="LOOSE" sx={{ minHeight: 44, px: 2 }}>
							Loose Stock
						</ToggleButton>
					</ToggleButtonGroup>
				)}
			/>

			<Box
				sx={{
					display: "grid",
					gap: 2,
					gridTemplateColumns: {
						xs: "1fr",
						sm: "repeat(2, minmax(0, 1fr))",
						md: "repeat(3, minmax(0, 1fr))",
					},
				}}
			>
				<Controller
					name="tran_date"
					control={control}
					render={({ field }) => (
						<TextField
							{...field}
							type="date"
							label="Date"
							size="small"
							fullWidth
							disabled={editing}
							InputLabelProps={{ shrink: true }}
							error={!!errors.tran_date}
							helperText={errors.tran_date?.message}
						/>
					)}
				/>

				<Controller
					name="finishing_quality_id"
					control={control}
					render={({ field }) => (
						<SearchableOptionSelect
							label="Quality"
							fullWidth
							required
							clearable={false}
							options={qualityOptions}
							value={field.value}
							onChange={(next) => onQualityChange(String(next))}
							error={!!errors.finishing_quality_id}
							helperText={errors.finishing_quality_id?.message}
						/>
					)}
				/>

				{bucket === "BALE" ? (
					<>
						<Controller
							name="owner_co_id"
							control={control}
							render={({ field }) => (
								<SearchableOptionSelect
									label="Owner Company"
									fullWidth
									clearable={false}
									options={companyOptions}
									value={field.value}
									onChange={(next) => field.onChange(String(next))}
									helperText="Whose bales these are — defaults to the counting company"
								/>
							)}
						/>

						<Controller
							name="qty"
							control={control}
							render={({ field }) => (
								<TextField
									{...field}
									type="number"
									label="Bales"
									size="small"
									fullWidth
									required
									inputProps={{ step: 1, min: 0, max: QTY_MAX }}
									error={!!errors.qty}
									helperText={errors.qty?.message ?? "Bales counted"}
								/>
							)}
						/>

						<Controller
							name="wt_per_unit_kg"
							control={control}
							render={({ field }) => (
								<TextField
									{...field}
									type="number"
									label="Kg / Bale"
									size="small"
									fullWidth
									required
									inputProps={{ step: 0.001, min: 0, max: WT_MAX }}
									error={!!errors.wt_per_unit_kg}
									helperText={
										errors.wt_per_unit_kg?.message ??
										(selectedQuality?.std_bale_weight == null
											? "No standard bale weight on this quality — enter it"
											: "Pre-filled from the quality's standard bale weight")
									}
								/>
							)}
						/>
					</>
				) : (
					<>
						<Controller
							name="stage"
							control={control}
							render={({ field }) => (
								<SearchableOptionSelect
									label="Stage"
									fullWidth
									options={stageOptions}
									value={field.value}
									onChange={(next) => field.onChange(String(next))}
									helperText="Optional — where on the floor the lot is lying"
								/>
							)}
						/>

						<Controller
							name="work_by"
							control={control}
							render={({ field }) => (
								<SearchableOptionSelect
									label="Work By"
									fullWidth
									clearable={false}
									options={[
										{ value: "0", label: "Dept" },
										{ value: "1", label: "Contract" },
									]}
									value={field.value}
									onChange={(next) => field.onChange(String(next))}
								/>
							)}
						/>

						<Controller
							name="qty"
							control={control}
							render={({ field }) => (
								<TextField
									{...field}
									type="number"
									label="Count"
									size="small"
									fullWidth
									inputProps={{ step: 1, min: 0, max: QTY_MAX }}
									error={!!errors.qty}
									helperText={errors.qty?.message ?? "Pieces counted — 0 when only weighed"}
								/>
							)}
						/>

						<Controller
							name="qty_uom"
							control={control}
							render={({ field }) => (
								<SearchableOptionSelect
									label="UoM"
									fullWidth
									required
									clearable={false}
									options={uomOptions}
									value={field.value}
									onChange={(next) => {
										wtTouched.current = false;
										field.onChange(String(next));
									}}
									error={!!errors.qty_uom}
									helperText={errors.qty_uom?.message}
								/>
							)}
						/>

						<Controller
							name="wt_kg"
							control={control}
							render={({ field }) => (
								<TextField
									{...field}
									type="number"
									label="Weight (kg)"
									size="small"
									fullWidth
									required
									inputProps={{ step: 0.001, min: 0, max: WT_MAX }}
									onChange={(e) => {
										wtTouched.current = true;
										field.onChange(e);
									}}
									error={!!errors.wt_kg}
									helperText={
										errors.wt_kg?.message ??
										(looseUnitWt == null
											? "Weighed total for this lot"
											: `std ${looseUnitWt.toFixed(3)} kg/${qtyUom.toLowerCase()}`)
									}
								/>
							)}
						/>
					</>
				)}

				<Controller
					name="remarks"
					control={control}
					render={({ field }) => (
						<TextField
							{...field}
							label="Remarks"
							size="small"
							fullWidth
							inputProps={{ maxLength: REMARKS_MAX }}
							error={!!errors.remarks}
							helperText={errors.remarks?.message}
						/>
					)}
				/>
			</Box>

			<Typography variant="body2" sx={{ fontWeight: 600 }}>
				Total: {previewKg.toFixed(3)} kg = {kgToMt(previewKg).toFixed(3)} MT
				{bucket === "BALE" ? ` (${BALE_QTY_UOM})` : ""}
			</Typography>

			{editing ? (
				<Typography variant="body2" color="text.secondary">
					Editing line #{editingEntry.finishing_stock_id}. Date is fixed for an existing line
					— delete and re-enter to move it.
				</Typography>
			) : null}

			{submitError ? <Alert severity="error">{submitError}</Alert> : null}

			<Box
				sx={{
					position: { xs: "sticky", md: "static" },
					bottom: 0,
					bgcolor: "background.paper",
					py: 1,
					display: "flex",
					gap: 1,
					justifyContent: { xs: "stretch", md: "flex-end" },
				}}
			>
				{editing ? (
					<Button
						type="button"
						variant="outlined"
						startIcon={<CancelIcon size={18} />}
						onClick={onCancelEdit}
						sx={{ minHeight: 44 }}
					>
						Cancel Edit
					</Button>
				) : null}
				<Button
					type="submit"
					variant="contained"
					startIcon={<SaveIcon size={18} />}
					disabled={submitting}
					sx={{ minHeight: 44, width: { xs: "100%", md: "auto" } }}
				>
					{submitting ? "Saving…" : editing ? "Update" : "Save Line"}
				</Button>
			</Box>
		</Box>
	);
}
