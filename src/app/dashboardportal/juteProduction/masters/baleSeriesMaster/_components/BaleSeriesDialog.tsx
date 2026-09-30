"use client";

import * as React from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from "@mui/material";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import {
	BALE_QUALITY_TYPE_HESSIAN,
	BALE_QUALITY_TYPE_SACKING,
	type BaleSeriesPayload,
	type BaleSeriesRow,
	type BaleSeriesSetup,
	type BaleSeriesSetupItem,
} from "../../../baleProduction/types/baleTypes";
import {
	baleSeriesSchema,
	buildBaleSeriesPayload,
	DEFAULT_BALE_SERIES_FORM_VALUES,
	type BaleSeriesFormValues,
} from "../../../baleProduction/utils/baleSchema";

export interface BaleSeriesDialogProps {
	open: boolean;
	/** Row being edited, or null when creating. */
	row: BaleSeriesRow | null;
	setup: BaleSeriesSetup | null;
	coId: number;
	branchId: number;
	branchName: string | undefined;
	submitting: boolean;
	error: string | null;
	onClose: () => void;
	onSubmit: (payload: BaleSeriesPayload) => void;
}

const QUALITY_TYPE_OPTIONS = [
	{ value: String(BALE_QUALITY_TYPE_HESSIAN), label: "Hessian" },
	{ value: String(BALE_QUALITY_TYPE_SACKING), label: "Sacking" },
];

const itemLabel = (i: BaleSeriesSetupItem) => `${i.item_code} — ${i.item_name}`;

function rowToForm(row: BaleSeriesRow): BaleSeriesFormValues {
	return {
		series_name: row.series_name,
		quality_type: String(row.quality_type === BALE_QUALITY_TYPE_HESSIAN ? BALE_QUALITY_TYPE_HESSIAN : BALE_QUALITY_TYPE_SACKING),
		item_id: row.item_id == null ? "" : String(row.item_id),
		last_bale_no: String(row.last_bale_no ?? 0),
	};
}

/**
 * Create / edit dialog for a bale series (SPEC §4.1, §8.2). `last_bale_no` is
 * the running counter: changing it on an existing series is a RESET (D3), so
 * the dialog asks for confirmation before submitting that change.
 */
export default function BaleSeriesDialog({
	open,
	row,
	setup,
	coId,
	branchId,
	branchName,
	submitting,
	error,
	onClose,
	onSubmit,
}: BaleSeriesDialogProps) {
	const editing = row != null;
	const {
		control,
		handleSubmit,
		reset,
		formState: { errors },
	} = useForm<BaleSeriesFormValues>({
		resolver: zodResolver(baleSeriesSchema),
		defaultValues: { ...DEFAULT_BALE_SERIES_FORM_VALUES },
		mode: "onTouched",
	});

	React.useEffect(() => {
		if (!open) return;
		reset(row ? rowToForm(row) : { ...DEFAULT_BALE_SERIES_FORM_VALUES });
	}, [open, row, reset]);

	const items = setup?.items ?? [];

	const itemId = useWatch({ control, name: "item_id" });
	const lastBaleNo = useWatch({ control, name: "last_bale_no" });
	const counterChanged = editing && Number(lastBaleNo) !== Number(row.last_bale_no);

	const submit = handleSubmit((values) => {
		if (editing && Number(values.last_bale_no) !== Number(row.last_bale_no)) {
			const ok = window.confirm(
				`Reset counter?\n\n"${row.series_name}" is at ${row.last_bale_no.toLocaleString()}. Setting it to ${Number(
					values.last_bale_no
				).toLocaleString()} means the next bale takes #${(Number(values.last_bale_no) + 1).toLocaleString()}.${
					Number(values.last_bale_no) < row.last_bale_no ? " Old numbers will be reused." : ""
				}`
			);
			if (!ok) return;
		}
		onSubmit(buildBaleSeriesPayload(values, coId, branchId));
	});

	return (
		<Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
			<DialogTitle>{editing ? "Edit Bale Series" : "New Bale Series"}</DialogTitle>
			<DialogContent>
				<Box component="form" noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }} sx={{ display: "grid", gap: 2, mt: 1 }}>
					<Typography variant="body2" color="text.secondary">
						Branch: {branchName ?? branchId} — counters run per mill.
					</Typography>

					<Controller
						name="series_name"
						control={control}
						render={({ field }) => (
							<TextField
								{...field}
								label="Series Name"
								size="small"
								required
								fullWidth
								autoFocus
								inputProps={{ maxLength: 60 }}
								error={!!errors.series_name}
								helperText={errors.series_name?.message ?? "e.g. PUNJAB, FCI, or the hessian quality's short name"}
							/>
						)}
					/>

					<Controller
						name="quality_type"
						control={control}
						render={({ field }) => (
							<SearchableOptionSelect
								label="Quality Type"
								size="small"
								required
								fullWidth
								clearable={false}
								options={QUALITY_TYPE_OPTIONS}
								value={field.value}
								onChange={(v) => field.onChange(v === "" ? "" : v)}
								error={!!errors.quality_type}
								helperText={errors.quality_type?.message}
							/>
						)}
					/>

					<Controller
						name="item_id"
						control={control}
						render={({ field }) => (
							<SearchableSelect<BaleSeriesSetupItem>
								variant="outlined"
								label="Bound Item (optional)"
								options={items}
								value={items.find((i) => String(i.item_id) === field.value) ?? null}
								onChange={(opt) => field.onChange(opt ? String(opt.item_id) : "")}
								getOptionLabel={itemLabel}
								getOptionKey={(i) => i.item_id}
								isOptionEqualToValue={(a, b) => a.item_id === b.item_id}
								loading={setup == null}
								helperText={
									itemId === ""
										? "Blank = any quality of this type may use the series (sacking / consignee pattern)"
										: "Only this quality may use the series (hessian pattern)"
								}
								textFieldProps={{ onBlur: field.onBlur }}
							/>
						)}
					/>

					<Controller
						name="last_bale_no"
						control={control}
						render={({ field }) => (
							<TextField
								{...field}
								type="number"
								label="Last Bale No"
								size="small"
								required
								fullWidth
								inputProps={{ step: 1, min: 0, inputMode: "numeric" }}
								error={!!errors.last_bale_no}
								helperText={
									errors.last_bale_no?.message
										?? (editing
											? counterChanged
												? "Changing this RESETS the counter — you will be asked to confirm"
												: `Next bale takes #${(Number(lastBaleNo) + 1).toLocaleString()}`
											: "Last bale number already pressed in this series (from the old register) — the first entry here takes last + 1. 0 for a brand-new series.")
								}
								color={counterChanged ? "warning" : undefined}
								focused={counterChanged || undefined}
							/>
						)}
					/>

					{error ? <Alert severity="error">{error}</Alert> : null}
				</Box>
			</DialogContent>
			<DialogActions>
				<Button onClick={onClose}>Cancel</Button>
				<Button variant="contained" onClick={() => void submit()} disabled={submitting}>
					{submitting ? "Saving…" : editing ? "Update" : "Create"}
				</Button>
			</DialogActions>
		</Dialog>
	);
}
