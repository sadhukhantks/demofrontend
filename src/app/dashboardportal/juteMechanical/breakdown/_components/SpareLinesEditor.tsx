"use client";

import * as React from "react";
import { Alert, Box, Button, IconButton, TextField, Tooltip, Typography } from "@mui/material";
import { Plus as PlusIcon, Trash2 as Trash2Icon } from "lucide-react";
import { Controller, useWatch, type Control, type FieldErrors } from "react-hook-form";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import type {
	BreakdownFormValues,
	SpareItemOption,
	UomOption,
} from "../types/breakdownTypes";
import { spareLineAmount, sumSpareAmounts } from "../utils/breakdownCalc";

export interface SpareLinesEditorProps {
	/** React Hook Form control of the parent breakdown form. */
	control: Control<BreakdownFormValues>;
	/** Field-array rows (stable `id` per row, supplied by `useFieldArray`). */
	fields: ReadonlyArray<{ id: string }>;
	/** Validation errors for the whole form; only `spares` is read here. */
	errors: FieldErrors<BreakdownFormValues>;
	/** Stores items offered as spares. */
	spareItems: ReadonlyArray<SpareItemOption>;
	/** Units a line can be booked in. */
	uoms: ReadonlyArray<UomOption>;
	/** Non-fatal item-load failure, surfaced inline. */
	itemsError: string | null;
	disabled?: boolean;
	/** Append a blank line. */
	onAddLine: () => void;
	/** Remove line `index`. */
	onRemoveLine: (index: number) => void;
	/**
	 * A line's item changed. The parent defaults the line's UOM from the item and
	 * keeps a trailing blank row available.
	 */
	onPickItem: (index: number, option: SpareItemOption | null) => void;
}

/**
 * Spare-parts consumed on an incident.
 *
 * Entirely optional — most breakdowns are logged with no spares at all, so the
 * editor never blocks a save: a blank line is dropped when the payload is built.
 * `amount` is shown read-only because it is always qty x rate (the same figure
 * the backend derives when `amount` is omitted), which keeps the operator from
 * having to key a third number under time pressure.
 */
export default function SpareLinesEditor({
	control,
	fields,
	errors,
	spareItems,
	uoms,
	itemsError,
	disabled = false,
	onAddLine,
	onRemoveLine,
	onPickItem,
}: SpareLinesEditorProps) {
	// Watched so the amount column and the footer total stay live while typing.
	const watchedLines = useWatch({ control, name: "spares" });

	const lines = React.useMemo(() => watchedLines ?? [], [watchedLines]);

	const itemOptions = React.useMemo(
		() => spareItems.map((item) => ({ value: item.item_id, label: item.label })),
		[spareItems]
	);

	const uomOptions = React.useMemo(
		() => uoms.map((uom) => ({ value: uom.uom_id, label: uom.uom_name })),
		[uoms]
	);

	const total = React.useMemo(
		() => sumSpareAmounts(lines.map((line) => ({ qty: line.qty, rate: line.rate }))),
		[lines]
	);

	return (
		<Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
			<Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
				<Typography variant="subtitle2">Spares consumed</Typography>
				<Typography variant="caption" color="text.secondary">
					Optional — leave empty if no parts were used.
				</Typography>
			</Box>

			{itemsError ? (
				<Alert severity="warning">
					{itemsError} — the downtime can still be saved without spare lines.
				</Alert>
			) : null}

			{fields.map((field, index) => {
				const line = lines[index];
				const amount = spareLineAmount(line?.qty ?? "", line?.rate ?? "");
				const lineErrors = errors.spares?.[index];

				return (
					<Box
						key={field.id}
						sx={{
							display: "grid",
							gap: 1.5,
							alignItems: "start",
							gridTemplateColumns: {
								xs: "1fr",
								sm: "repeat(2, minmax(0, 1fr))",
								md: "minmax(0, 3fr) minmax(0, 1fr) minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1fr) 48px",
							},
						}}
					>
						<Controller
							name={`spares.${index}.item_id` as const}
							control={control}
							render={({ field: itemField }) => (
								<SearchableOptionSelect
									label="Item"
									size="small"
									fullWidth
									disabled={disabled || itemOptions.length === 0}
									options={itemOptions}
									value={itemField.value === "" ? "" : Number(itemField.value)}
									onChange={(selectedValue) => {
										const next = selectedValue === "" ? "" : String(selectedValue);
										itemField.onChange(next);
										onPickItem(
											index,
											selectedValue === ""
												? null
												: (spareItems.find((i) => i.item_id === Number(selectedValue)) ??
														null)
										);
									}}
									error={!!lineErrors?.item_id}
									helperText={lineErrors?.item_id?.message}
									noOptionsText={
										itemOptions.length === 0 ? "No items loaded" : "No matching item"
									}
								/>
							)}
						/>

						<Controller
							name={`spares.${index}.qty` as const}
							control={control}
							render={({ field: qtyField }) => (
								<TextField
									{...qtyField}
									type="number"
									label="Qty"
									size="small"
									fullWidth
									disabled={disabled}
									inputProps={{ step: 0.001, min: 0 }}
									error={!!lineErrors?.qty}
									helperText={lineErrors?.qty?.message}
								/>
							)}
						/>

						<Controller
							name={`spares.${index}.uom_id` as const}
							control={control}
							render={({ field: uomField }) => (
								<SearchableOptionSelect
									label="UOM"
									size="small"
									fullWidth
									disabled={disabled}
									options={uomOptions}
									value={uomField.value === "" ? "" : Number(uomField.value)}
									onChange={(selectedValue) =>
										uomField.onChange(selectedValue === "" ? "" : String(selectedValue))
									}
									error={!!lineErrors?.uom_id}
									helperText={lineErrors?.uom_id?.message}
								/>
							)}
						/>

						<Controller
							name={`spares.${index}.rate` as const}
							control={control}
							render={({ field: rateField }) => (
								<TextField
									{...rateField}
									type="number"
									label="Rate"
									size="small"
									fullWidth
									disabled={disabled}
									inputProps={{ step: 0.01, min: 0 }}
									error={!!lineErrors?.rate}
									helperText={lineErrors?.rate?.message}
								/>
							)}
						/>

						<TextField
							label="Amount"
							size="small"
							fullWidth
							disabled
							value={amount == null ? "" : amount.toFixed(2)}
							helperText="Qty x Rate"
						/>

						<Box sx={{ display: "flex", justifyContent: "center", pt: 0.5 }}>
							<Tooltip title="Remove line">
								<span>
									<IconButton
										size="small"
										color="error"
										disabled={disabled || fields.length <= 1}
										onClick={() => onRemoveLine(index)}
										sx={{ minWidth: 40, minHeight: 40 }}
									>
										<Trash2Icon size={16} />
									</IconButton>
								</span>
							</Tooltip>
						</Box>
					</Box>
				);
			})}

			<Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
				<Button
					type="button"
					size="small"
					variant="outlined"
					startIcon={<PlusIcon size={16} />}
					onClick={onAddLine}
					disabled={disabled}
					sx={{ minHeight: 40 }}
				>
					Add spare
				</Button>
				<Typography variant="body2" color="text.secondary">
					Spare value: <strong>{total.toFixed(2)}</strong>
				</Typography>
			</Box>
		</Box>
	);
}
