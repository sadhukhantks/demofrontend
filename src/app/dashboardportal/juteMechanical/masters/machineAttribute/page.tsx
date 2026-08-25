"use client";

/**
 * Jute Mechanical & Maintenance — Machine Attributes (list page).
 *
 * This is the maintenance record for each machine. The backend table endpoint
 * LEFT JOINs FROM `machine_mst`, so every active machine is listed whether or not
 * anyone has filled its attributes in yet — rows with no attribute record come
 * back with `machine_attr_id` and every attribute column null.
 *
 * That is surfaced as a "Not configured" chip, because configuring the PM and
 * overhaul intervals is exactly what puts a machine on the maintenance-due
 * report. A machine left unconfigured is invisible to PM planning.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Chip, Snackbar, Tooltip } from "@mui/material";
import type { GridColDef, GridPaginationModel } from "@mui/x-data-grid";
import IndexWrapper from "@/components/ui/IndexWrapper";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import useSelectedCompanyCoId from "@/hooks/use-selected-company-coid";
import {
	fetchMechMachineAttrTable,
	fetchMechMastersSetup,
	type MechMachineAttr,
	type MechMastersSetup,
} from "@/utils/juteMechanicalService";
import CreateMachineAttributePage from "./CreateMachineAttributePage";

/**
 * Grid row. `machine_attr_id` is null for a machine that has never been
 * configured, so the grid is keyed on `machine_id`, which is always present.
 */
type MachineAttrRow = MechMachineAttr & { id: number };

type SnackbarState = {
	open: boolean;
	message: string;
	severity: "success" | "error";
};

const CLOSED_SNACKBAR: SnackbarState = {
	open: false,
	message: "",
	severity: "success",
};

const EM_DASH = "—";

/** Backend dates arrive as `YYYY-MM-DD` strings (or datetimes); show the date part. */
function displayDate(value: string | null): string {
	if (!value) return EM_DASH;
	return String(value).slice(0, 10);
}

function displayNumber(value: number | null): string {
	return value === null || value === undefined ? EM_DASH : String(value);
}

export default function MechMachineAttributePage() {
	// HYDRATION RULE: sidebar company/branches come from localStorage — hold render until mount.
	const [mounted, setMounted] = useState(false);
	useEffect(() => {
		setMounted(true);
	}, []);

	const { coId } = useSelectedCompanyCoId();
	const { selectedCompany, selectedBranches } = useSidebarContext();
	const coIdNum = useMemo(() => (coId ? Number(coId) : null), [coId]);

	/**
	 * Machines carry no branch of their own — the backend derives it through
	 * `machine_mst -> dept_mst.branch_id`. Filter by the sidebar branch only when
	 * exactly one is selected; otherwise show every branch the company has.
	 */
	const branchId = useMemo(
		() => (selectedBranches.length === 1 ? Number(selectedBranches[0]) : null),
		[selectedBranches],
	);

	const [rows, setRows] = useState<MachineAttrRow[]>([]);
	const [totalRows, setTotalRows] = useState(0);
	const [loading, setLoading] = useState(true);
	const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
		page: 0,
		pageSize: 25,
	});
	const [searchQuery, setSearchQuery] = useState("");
	const [machineTypeFilter, setMachineTypeFilter] = useState<number | "">("");
	const [setup, setSetup] = useState<MechMastersSetup | null>(null);
	const [snackbar, setSnackbar] = useState<SnackbarState>(CLOSED_SNACKBAR);

	const [dialogOpen, setDialogOpen] = useState(false);
	const [dialogAttrId, setDialogAttrId] = useState<number | undefined>(undefined);
	const [dialogMachineId, setDialogMachineId] = useState<number | undefined>(undefined);
	const [readOnly, setReadOnly] = useState(false);

	const notifyError = useCallback((message: string) => {
		setSnackbar({ open: true, message, severity: "error" });
	}, []);

	const notifySuccess = useCallback((message: string) => {
		setSnackbar({ open: true, message, severity: "success" });
	}, []);

	// ── Dropdowns ──────────────────────────────────────────────────────────
	useEffect(() => {
		if (!coIdNum) return;
		let cancelled = false;
		(async () => {
			try {
				const data = await fetchMechMastersSetup({ coId: coIdNum, branchId });
				if (!cancelled) setSetup(data);
			} catch (err: unknown) {
				if (cancelled) return;
				notifyError(err instanceof Error ? err.message : "Error loading dropdowns");
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [coIdNum, branchId, notifyError]);

	// ── Table ──────────────────────────────────────────────────────────────
	const fetchRows = useCallback(async () => {
		if (!coIdNum) {
			setRows([]);
			setTotalRows(0);
			setLoading(false);
			return;
		}
		setLoading(true);
		try {
			const result = await fetchMechMachineAttrTable({
				coId: coIdNum,
				branchId,
				machineTypeId: machineTypeFilter === "" ? null : machineTypeFilter,
				search: searchQuery || undefined,
				page: paginationModel.page + 1,
				limit: paginationModel.pageSize,
			});
			setRows(result.data.map((r) => ({ ...r, id: r.machine_id })));
			setTotalRows(result.total);
		} catch (err: unknown) {
			setRows([]);
			setTotalRows(0);
			notifyError(
				err instanceof Error ? err.message : "Error fetching machine attributes",
			);
		} finally {
			setLoading(false);
		}
	}, [
		coIdNum,
		branchId,
		machineTypeFilter,
		searchQuery,
		paginationModel.page,
		paginationModel.pageSize,
		notifyError,
	]);

	useEffect(() => {
		fetchRows();
	}, [fetchRows]);

	// ── Handlers ───────────────────────────────────────────────────────────
	const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		setSearchQuery(e.target.value);
		setPaginationModel((prev) => ({ ...prev, page: 0 }));
	}, []);

	const handleMachineTypeFilter = useCallback((value: number | "") => {
		setMachineTypeFilter(value);
		setPaginationModel((prev) => ({ ...prev, page: 0 }));
	}, []);

	/** Toolbar action — the machine is chosen inside the dialog. */
	const handleCreate = useCallback(() => {
		setDialogAttrId(undefined);
		setDialogMachineId(undefined);
		setReadOnly(false);
		setDialogOpen(true);
	}, []);

	/**
	 * Row action. An unconfigured row has no `machine_attr_id`, so it opens the
	 * dialog in create mode with the machine locked to that row — the backend
	 * upserts on (co_id, machine_id).
	 */
	const handleEdit = useCallback((row: MachineAttrRow) => {
		setDialogAttrId(row.machine_attr_id ?? undefined);
		setDialogMachineId(row.machine_id);
		setReadOnly(false);
		setDialogOpen(true);
	}, []);

	const handleView = useCallback((row: MachineAttrRow) => {
		setDialogAttrId(row.machine_attr_id ?? undefined);
		setDialogMachineId(row.machine_id);
		setReadOnly(true);
		setDialogOpen(true);
	}, []);

	const handleDialogClose = useCallback(() => {
		setDialogOpen(false);
		setDialogAttrId(undefined);
		setDialogMachineId(undefined);
		setReadOnly(false);
	}, []);

	const handleSaved = useCallback(
		(message: string) => {
			notifySuccess(message);
			fetchRows();
		},
		[fetchRows, notifySuccess],
	);

	// ── Columns ────────────────────────────────────────────────────────────
	const criticalityLabels = useMemo(() => {
		const map = new Map<string, string>();
		for (const c of setup?.criticalities ?? []) map.set(c.code, c.label);
		return map;
	}, [setup]);

	const columns = useMemo<GridColDef<MachineAttrRow>[]>(
		() => [
			{
				field: "machine_name",
				headerName: "Machine",
				flex: 1.4,
				minWidth: 200,
				renderCell: (params) =>
					params.row.mech_code
						? `${params.row.machine_name} (${params.row.mech_code})`
						: params.row.machine_name,
			},
			{
				field: "machine_attr_id",
				headerName: "Setup",
				width: 150,
				sortable: false,
				renderCell: (params) =>
					params.row.machine_attr_id === null ? (
						<Tooltip title="No maintenance record yet — this machine never appears on the maintenance-due report.">
							<Chip label="Not configured" size="small" color="warning" variant="outlined" />
						</Tooltip>
					) : (
						<Chip label="Configured" size="small" color="success" variant="outlined" />
					),
			},
			{
				field: "machine_type_name",
				headerName: "Machine Type",
				flex: 1,
				minWidth: 150,
				renderCell: (params) => params.row.machine_type_name ?? EM_DASH,
			},
			{
				field: "dept_name",
				headerName: "Department",
				flex: 1,
				minWidth: 150,
				renderCell: (params) => params.row.dept_name ?? EM_DASH,
			},
			{
				field: "criticality",
				headerName: "Criticality",
				width: 130,
				renderCell: (params) =>
					params.row.criticality
						? (criticalityLabels.get(params.row.criticality) ?? params.row.criticality)
						: EM_DASH,
			},
			{
				field: "last_overhaul_date",
				headerName: "Last Overhaul",
				width: 130,
				renderCell: (params) => displayDate(params.row.last_overhaul_date),
			},
			{
				field: "overhaul_freq_months",
				headerName: "Overhaul Freq (months)",
				width: 180,
				renderCell: (params) => displayNumber(params.row.overhaul_freq_months),
			},
			{
				field: "next_overhaul_due",
				headerName: "Next Overhaul Due",
				width: 160,
				renderCell: (params) => displayDate(params.row.next_overhaul_due),
			},
			{
				field: "last_pm_date",
				headerName: "Last PM",
				width: 120,
				renderCell: (params) => displayDate(params.row.last_pm_date),
			},
			{
				field: "pm_freq_days",
				headerName: "PM Freq (days)",
				width: 140,
				renderCell: (params) => displayNumber(params.row.pm_freq_days),
			},
			{
				field: "next_pm_due",
				headerName: "Next PM Due",
				width: 130,
				renderCell: (params) => displayDate(params.row.next_pm_due),
			},
		],
		[criticalityLabels],
	);

	const machineTypeOptions = useMemo(
		() =>
			(setup?.machine_types ?? []).map((t) => ({
				value: t.machine_type_id,
				label: t.machine_type_name,
			})),
		[setup],
	);

	const unconfiguredOnPage = useMemo(
		() => rows.filter((r) => r.machine_attr_id === null).length,
		[rows],
	);

	if (!mounted) return null;

	if (!coIdNum) {
		return (
			<Alert severity="warning" sx={{ m: 2 }}>
				Select a company to continue.
			</Alert>
		);
	}

	const subtitle =
		unconfiguredOnPage > 0
			? `${unconfiguredOnPage} machine(s) on this page have no maintenance record yet. Set the PM and overhaul intervals to put them on the maintenance-due report.`
			: selectedCompany
				? `Maintenance record for every machine of ${selectedCompany.co_name}.`
				: "Maintenance record for every machine.";

	return (
		<IndexWrapper
			title="Machine Attributes"
			subtitle={subtitle}
			rows={rows}
			columns={columns}
			rowCount={totalRows}
			paginationModel={paginationModel}
			onPaginationModelChange={setPaginationModel}
			loading={loading}
			showLoadingUntilLoaded
			contentClassName="max-w-full"
			search={{
				value: searchQuery,
				onChange: handleSearchChange,
				placeholder: "Search machine, code, make or serial",
				debounceDelayMs: 500,
			}}
			toolbarContent={
				<SearchableOptionSelect<number>
					label="Machine Type"
					placeholder="All machine types"
					options={machineTypeOptions}
					value={machineTypeFilter}
					onChange={handleMachineTypeFilter}
					sx={{ minWidth: 220 }}
				/>
			}
			createAction={{ label: "Configure Machine", onClick: handleCreate }}
			onEdit={handleEdit}
			onView={handleView}
		>
			<CreateMachineAttributePage
				open={dialogOpen}
				onClose={handleDialogClose}
				onSaved={handleSaved}
				machineAttrId={dialogAttrId}
				machineId={dialogMachineId}
				coId={coIdNum}
				setup={setup}
				readOnly={readOnly}
			/>

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
		</IndexWrapper>
	);
}
