"use client";

import * as React from "react";
import {
	Alert,
	Box,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogContentText,
	DialogTitle,
	Snackbar,
	Typography,
} from "@mui/material";
import { Plus as AddIcon } from "lucide-react";
import useSelectedCompanyCoId from "@/hooks/use-selected-company-coid";
import {
	createWasteReportMap,
	deactivateWasteReportMap,
	fetchWasteReportMapList,
	fetchWasteReportMapSetup,
	updateWasteReportMap,
	type WasteReportMapRow,
	type WasteReportMapSaveResult,
	type WasteReportMapSetup,
} from "@/utils/wasteReportMapService";
import WasteReportMapDialog from "./_components/WasteReportMapDialog";
import WasteReportMapGrid from "./_components/WasteReportMapGrid";
import {
	buildWasteReportMapPayload,
	departmentLabel,
	type WasteReportMapFormValues,
} from "./utils/wasteReportMapSchema";

const EMPTY_SETUP: WasteReportMapSetup = Object.freeze({
	waste_items: [],
	departments: [],
	denominators: [],
	groups: [],
}) as WasteReportMapSetup;

const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Wastage Report Mapping master (TKT-000183).
 *
 * The daily Wastage Report bands each waste item into a group using these rows;
 * a waste item with no row lands in "Other / Unmapped" with no %. Company-scoped
 * (sidebar co_id) like the other jute-production map masters — a row may still
 * name one department of any branch, or leave it blank for "any department".
 */
export default function WasteReportMapPage() {
	const [mounted, setMounted] = React.useState(false);
	React.useEffect(() => {
		setMounted(true);
	}, []);

	const { coId } = useSelectedCompanyCoId();

	const [rows, setRows] = React.useState<WasteReportMapRow[]>([]);
	const [setup, setSetup] = React.useState<WasteReportMapSetup>(EMPTY_SETUP);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [snack, setSnack] = React.useState<string | null>(null);

	const [dialogOpen, setDialogOpen] = React.useState(false);
	const [editingRow, setEditingRow] = React.useState<WasteReportMapRow | null>(null);
	const [saving, setSaving] = React.useState(false);
	const [submitError, setSubmitError] = React.useState<string | null>(null);

	const [pendingDeactivate, setPendingDeactivate] = React.useState<WasteReportMapRow | null>(null);
	const [deactivating, setDeactivating] = React.useState(false);

	// Rows and pickers reload together: a save can create a new group, which the
	// next dialog's Group list must offer.
	const refresh = React.useCallback(async () => {
		if (!coId) return;
		setLoading(true);
		setError(null);
		try {
			const [list, nextSetup] = await Promise.all([
				fetchWasteReportMapList(coId),
				fetchWasteReportMapSetup(coId),
			]);
			setRows(list);
			setSetup(nextSetup);
		} catch (e) {
			setError(errorMessage(e));
			setRows([]);
		} finally {
			setLoading(false);
		}
	}, [coId]);

	React.useEffect(() => {
		void refresh();
	}, [refresh]);

	const denomLabels = React.useMemo<Record<string, string>>(
		() => Object.fromEntries(setup.denominators.map((d) => [d.code, d.label])),
		[setup.denominators],
	);

	const openCreate = React.useCallback(() => {
		setEditingRow(null);
		setSubmitError(null);
		setDialogOpen(true);
	}, []);

	const openEdit = React.useCallback((row: WasteReportMapRow) => {
		setEditingRow(row);
		setSubmitError(null);
		setDialogOpen(true);
	}, []);

	const askDeactivate = React.useCallback((row: WasteReportMapRow) => {
		setPendingDeactivate(row);
	}, []);

	const handleSave = async (values: WasteReportMapFormValues) => {
		if (!coId) return;
		setSaving(true);
		setSubmitError(null);
		try {
			const payload = buildWasteReportMapPayload(values, Number(coId));
			const result: WasteReportMapSaveResult = editingRow
				? await updateWasteReportMap({ ...payload, waste_report_map_id: editingRow.waste_report_map_id })
				: await createWasteReportMap(payload);
			setDialogOpen(false);
			setEditingRow(null);
			const others = result.group_rows_updated;
			setSnack(
				`Mapping saved${
					others > 0 ? ` — ${others} other row${others === 1 ? "" : "s"} of group ${result.group_code} updated` : ""
				}.`,
			);
			await refresh();
		} catch (e) {
			setSubmitError(errorMessage(e));
		} finally {
			setSaving(false);
		}
	};

	const handleDeactivate = async () => {
		if (!coId || !pendingDeactivate) return;
		setDeactivating(true);
		setError(null);
		try {
			await deactivateWasteReportMap(coId, pendingDeactivate.waste_report_map_id);
			setPendingDeactivate(null);
			setSnack("Mapping deactivated.");
			await refresh();
		} catch (e) {
			setPendingDeactivate(null);
			setError(errorMessage(e));
		} finally {
			setDeactivating(false);
		}
	};

	if (!mounted) return null;

	if (!coId) {
		return (
			<Alert severity="warning" sx={{ m: 2 }}>
				Select a company to continue.
			</Alert>
		);
	}

	return (
		<Box sx={{ p: { xs: 1.5, md: 3 } }}>
			<Box
				sx={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: 2,
					mb: 2,
					flexWrap: "wrap",
				}}
			>
				<Box sx={{ flex: 1, minWidth: 260 }}>
					<Typography variant="h5" sx={{ fontWeight: 600 }}>
						Wastage Report Mapping
					</Typography>
					<Typography variant="body2" color="text.secondary">
						Which band of the daily Wastage Report each waste item falls in, and which production
						figure its daily and monthly % divide by. A waste item with no mapping shows under
						Other / Unmapped with no %.
					</Typography>
				</Box>
				<Button variant="contained" startIcon={<AddIcon size={18} />} onClick={openCreate} disabled={loading}>
					New Mapping
				</Button>
			</Box>

			{error ? (
				<Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
					{error}
				</Alert>
			) : null}

			<WasteReportMapGrid
				rows={rows}
				loading={loading}
				denomLabels={denomLabels}
				onEdit={openEdit}
				onDeactivate={askDeactivate}
			/>

			{dialogOpen ? (
				<WasteReportMapDialog
					setup={setup}
					editingRow={editingRow}
					saving={saving}
					submitError={submitError}
					onSubmit={(values) => void handleSave(values)}
					onClose={() => {
						setDialogOpen(false);
						setEditingRow(null);
					}}
				/>
			) : null}

			<Dialog
				open={pendingDeactivate != null}
				onClose={deactivating ? undefined : () => setPendingDeactivate(null)}
				maxWidth="xs"
				fullWidth
			>
				<DialogTitle>Deactivate mapping?</DialogTitle>
				<DialogContent>
					<DialogContentText>
						{pendingDeactivate
							? `${pendingDeactivate.item_name ?? `Item ${pendingDeactivate.item_id}`} (${departmentLabel(
									pendingDeactivate,
								)}) will no longer count under ${pendingDeactivate.group_name}. Unless another row maps it, its waste will show under Other / Unmapped.`
							: null}
					</DialogContentText>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setPendingDeactivate(null)} disabled={deactivating}>
						Cancel
					</Button>
					<Button color="error" variant="contained" onClick={() => void handleDeactivate()} disabled={deactivating}>
						{deactivating ? "Deactivating…" : "Deactivate"}
					</Button>
				</DialogActions>
			</Dialog>

			<Snackbar open={!!snack} autoHideDuration={4000} onClose={() => setSnack(null)} message={snack ?? ""} />
		</Box>
	);
}
