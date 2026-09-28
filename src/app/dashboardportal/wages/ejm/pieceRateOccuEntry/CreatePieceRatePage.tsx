"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
	Alert,
	Box,
	CircularProgress,
	Dialog,
	DialogContent,
	DialogTitle,
	IconButton,
	Snackbar,
	Typography,
} from "@mui/material";
import { X } from "lucide-react";
import { MuiForm } from "@/components/ui/muiform";
import type { MuiFormMode, Schema } from "@/components/ui/muiform";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import { pieceRateSchema, type DesignationOption } from "./types";

type Props = {
	open: boolean;
	onClose: () => void;
	onSaved?: () => void;
	editId?: number;
	designations: DesignationOption[];
};

export default function CreatePieceRatePage({
	open,
	onClose,
	onSaved,
	editId,
	designations,
}: Props) {
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [mode, setMode] = useState<MuiFormMode>("create");
	const [snackbar, setSnackbar] = useState<{
		open: boolean;
		message: string;
		severity: "success" | "error";
	}>({ open: false, message: "", severity: "success" });
	const [initialValues, setInitialValues] = useState<Record<string, unknown>>({});
	const [formKey, setFormKey] = useState(0);

	const loadData = useCallback(async () => {
		if (editId === undefined) {
			setInitialValues({ desig_id: null, occu_code: "", f_b_rate: "" });
			setFormKey((prev) => prev + 1);
			return;
		}

		setLoading(true);
		try {
			const { data, error } = await fetchWithCookie(
				`${apiRoutesPortalMasters.EJM_PIECE_OCCU_RATE_BY_ID}/${editId}`,
				"GET"
			);
			if (error || !data) throw new Error(error || "Failed to load piece rate");

			const rec = data.data ?? data;
			setInitialValues({
				desig_id: rec.desig_id ?? null,
				occu_code: rec.occu_code ?? "",
				f_b_rate: rec.f_b_rate ?? "",
			});
			setFormKey((prev) => prev + 1);
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : "Error loading data";
			setSnackbar({ open: true, message, severity: "error" });
		} finally {
			setLoading(false);
		}
	}, [editId]);

	useEffect(() => {
		if (open) {
			setMode(editId !== undefined ? "edit" : "create");
			loadData();
		} else {
			setInitialValues({});
			setFormKey(0);
		}
	}, [open, editId, loadData]);

	const schema = useMemo<Schema>(
		() => ({
			fields: [
				{
					name: "desig_id",
					label: "Designation",
					type: "custom",
					required: true,
					grid: { xs: 12 },
					hideLabel: true,
					// Department and the legacy dept_code both follow the designation,
					// so there is nothing else to pick.
					render: ({ value, onChange, disabled }) => (
						<SearchableSelect
							variant="outlined"
							label="Designation"
							required
							disabled={disabled}
							options={designations}
							value={designations.find((d) => d.desig_id === value) ?? null}
							onChange={(opt) => onChange(opt?.desig_id ?? null)}
							getOptionLabel={(o) => `${o.dept_code} · ${o.dept_desc} — ${o.desig}`}
							isOptionEqualToValue={(o, v) => o.desig_id === v.desig_id}
							noOptionsText="No designations for this branch"
						/>
					),
				},
				{
					name: "dept_display",
					label: "Department",
					type: "custom",
					grid: { xs: 12, sm: 6 },
					render: ({ values }) => {
						const picked = designations.find((d) => d.desig_id === values.desig_id);
						return (
							<Typography variant="body2" color="text.secondary">
								{picked
									? `${picked.dept_desc} (dept code ${picked.dept_code})`
									: "Pick a designation to set the department"}
							</Typography>
						);
					},
				},
				{
					name: "occu_code",
					label: "Occupation Code",
					type: "text",
					required: true,
					helperText: "Legacy 2-character code, e.g. 01",
					grid: { xs: 12, sm: 3 },
				},
				{
					name: "f_b_rate",
					label: "F/B Rate",
					type: "number",
					required: true,
					grid: { xs: 12, sm: 3 },
				},
			],
		}),
		[designations]
	);

	const handleSubmit = async (values: Record<string, unknown>) => {
		setSaving(true);
		try {
			const rawRate = values.f_b_rate;
			const parsed = pieceRateSchema.safeParse({
				desig_id: Number(values.desig_id),
				occu_code: String(values.occu_code ?? ""),
				f_b_rate:
					rawRate === "" || rawRate === null || rawRate === undefined
						? NaN
						: Number(rawRate),
			});
			if (!parsed.success) throw new Error(parsed.error.issues[0].message);

			const [url, method] =
				editId !== undefined
					? ([`${apiRoutesPortalMasters.EJM_PIECE_OCCU_RATE_EDIT}/${editId}`, "PUT"] as const)
					: ([apiRoutesPortalMasters.EJM_PIECE_OCCU_RATE_CREATE, "POST"] as const);

			const { error } = await fetchWithCookie(url, method, parsed.data);
			if (error) throw new Error(error);

			setSnackbar({
				open: true,
				message:
					editId !== undefined
						? "Piece rate updated successfully"
						: "Piece rate created successfully",
				severity: "success",
			});
			onSaved?.();
			onClose();
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : "Save failed";
			setSnackbar({ open: true, message, severity: "error" });
		} finally {
			setSaving(false);
		}
	};

	const dialogTitle = editId !== undefined ? "Edit Piece Rate" : "Create Piece Rate";

	return (
		<>
			<Dialog
				open={open}
				onClose={onClose}
				fullWidth
				maxWidth="md"
				PaperProps={{ sx: { borderRadius: 2 } }}
			>
				<DialogTitle
					sx={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						pb: 1,
					}}
				>
					<Typography variant="h6" component="span">
						{dialogTitle}
					</Typography>
					<IconButton onClick={onClose} size="small" aria-label="Close dialog">
						<X size={20} />
					</IconButton>
				</DialogTitle>

				<DialogContent dividers>
					{loading ? (
						<Box
							sx={{
								display: "flex",
								justifyContent: "center",
								alignItems: "center",
								minHeight: 200,
							}}
						>
							<CircularProgress />
						</Box>
					) : (
						<Box sx={{ pt: 1 }}>
							<MuiForm
								key={formKey}
								schema={schema}
								mode={mode}
								initialValues={initialValues}
								onSubmit={handleSubmit}
								submitLabel={saving ? "Saving..." : "Save"}
								cancelLabel="Cancel"
								onCancel={onClose}
								hideModeToggle
							/>
						</Box>
					)}
				</DialogContent>
			</Dialog>

			<Snackbar
				open={snackbar.open}
				autoHideDuration={4000}
				onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
				anchorOrigin={{ vertical: "top", horizontal: "center" }}
			>
				<Alert
					severity={snackbar.severity}
					onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
					sx={{ width: "100%" }}
				>
					{snackbar.message}
				</Alert>
			</Snackbar>
		</>
	);
}
