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
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import { effCodeSchema } from "./types";

type Props = {
	open: boolean;
	onClose: () => void;
	onSaved?: () => void;
	editId?: number;
};

export default function CreateEffCodePage({ open, onClose, onSaved, editId }: Props) {
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
			setInitialValues({ effocode: "", code_details: "", eff_pc: "" });
			setFormKey((prev) => prev + 1);
			return;
		}

		setLoading(true);
		try {
			const { data, error } = await fetchWithCookie(
				`${apiRoutesPortalMasters.EJM_EFF_CODE_TYPE_BY_ID}/${editId}`,
				"GET"
			);
			if (error || !data) throw new Error(error || "Failed to load efficiency code");

			const rec = data.data ?? data;
			setInitialValues({
				effocode: rec.effocode ?? "",
				code_details: rec.code_details ?? "",
				eff_pc: rec.eff_pc ?? "",
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
					name: "effocode",
					label: "Efficiency Code",
					type: "text",
					required: true,
					grid: { xs: 12, sm: 6 },
				},
				{
					name: "eff_pc",
					label: "Efficiency %",
					type: "number",
					grid: { xs: 12, sm: 6 },
				},
				{
					name: "code_details",
					label: "Code Details",
					type: "text",
					grid: { xs: 12 },
				},
			],
		}),
		[]
	);

	const handleSubmit = async (values: Record<string, unknown>) => {
		setSaving(true);
		try {
			const rawPc = values.eff_pc;
			const parsed = effCodeSchema.safeParse({
				effocode: String(values.effocode ?? ""),
				code_details: String(values.code_details ?? ""),
				eff_pc:
					rawPc === "" || rawPc === null || rawPc === undefined ? null : Number(rawPc),
			});
			if (!parsed.success) throw new Error(parsed.error.issues[0].message);

			const [url, method] =
				editId !== undefined
					? ([`${apiRoutesPortalMasters.EJM_EFF_CODE_TYPE_EDIT}/${editId}`, "PUT"] as const)
					: ([apiRoutesPortalMasters.EJM_EFF_CODE_TYPE_CREATE, "POST"] as const);

			const { error } = await fetchWithCookie(url, method, parsed.data);
			if (error) throw new Error(error);

			setSnackbar({
				open: true,
				message:
					editId !== undefined
						? "Efficiency code updated successfully"
						: "Efficiency code created successfully",
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

	const dialogTitle =
		editId !== undefined ? "Edit Efficiency Code" : "Create Efficiency Code";

	return (
		<>
			<Dialog
				open={open}
				onClose={onClose}
				fullWidth
				maxWidth="sm"
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
