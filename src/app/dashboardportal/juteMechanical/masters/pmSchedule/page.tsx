"use client";

/**
 * Jute Mechanical & Maintenance — PM Schedule (list page).
 *
 * The preventive-maintenance checklist TEMPLATE: one row per task. Each task is
 * scoped either to a whole machine type (a section-wide template) or to a single
 * machine — never both, and never neither. The PM execution screen seeds its task
 * grid from the tasks matching the machine or its type, in seq. no. order.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Chip, Snackbar } from "@mui/material";
import type { GridColDef, GridPaginationModel } from "@mui/x-data-grid";
import IndexWrapper from "@/components/ui/IndexWrapper";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import useSelectedCompanyCoId from "@/hooks/use-selected-company-coid";
import {
	fetchMechMastersSetup,
	fetchMechPmScheduleTable,
	type MechMastersSetup,
	type MechPmSchedule,
} from "@/utils/juteMechanicalService";
import CreatePmSchedulePage from "./CreatePmSchedulePage";

/** Grid row — the API row plus the DataGrid `id` the grid keys on. */
type PmScheduleRow = MechPmSchedule & { id: number };

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

export default function MechPmSchedulePage() {
	// HYDRATION RULE: sidebar company/branches come from localStorage — hold render until mount.
	const [mounted, setMounted] = useState(false);
	useEffect(() => {
		setMounted(true);
	}, []);

	const { coId } = useSelectedCompanyCoId();
	const { selectedCompany, selectedBranches } = useSidebarContext();
	const coIdNum = useMemo(() => (coId ? Number(coId) : null), [coId]);

	/** Narrow the machine dropdown to the sidebar branch when exactly one is chosen. */
	const branchId = useMemo(
		() => (selectedBranches.length === 1 ? Number(selectedBranches[0]) : null),
		[selectedBranches],
	);

	const [rows, setRows] = useState<PmScheduleRow[]>([]);
	const [totalRows, setTotalRows] = useState(0);
	const [loading, setLoading] = useState(true);
	const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
		page: 0,
		pageSize: 25,
	});
	const [searchQuery, setSearchQuery] = useState("");
	const [machineTypeFilter, setMachineTypeFilter] = useState<number | "">("");
	const [frequencyFilter, setFrequencyFilter] = useState<string | "">("");
	const [setup, setSetup] = useState<MechMastersSetup | null>(null);
	const [snackbar, setSnackbar] = useState<SnackbarState>(CLOSED_SNACKBAR);

	const [dialogOpen, setDialogOpen] = useState(false);
	const [selectedId, setSelectedId] = useState<number | undefined>(undefined);
	const [readOnly, setReadOnly] = useState(false);

	const notifyError = useCallback((message: string) => {
		setSnackbar({ open: true, message, severity: "error" });
	}, []);

	const notifySuccess = useCallback((message: string) => {
		setSnackbar({ open: true, message, severity: "success" });
	}, []);

	// ── Dropdowns (prefetched once so the dialog opens instantly) ──────────
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
			const result = await fetchMechPmScheduleTable({
				coId: coIdNum,
				machineTypeId: machineTypeFilter === "" ? null : machineTypeFilter,
				frequency: frequencyFilter === "" ? null : frequencyFilter,
				search: searchQuery || undefined,
				page: paginationModel.page + 1,
				limit: paginationModel.pageSize,
			});
			setRows(result.data.map((r) => ({ ...r, id: r.pm_schedule_id })));
			setTotalRows(result.total);
		} catch (err: unknown) {
			setRows([]);
			setTotalRows(0);
			notifyError(err instanceof Error ? err.message : "Error fetching PM schedule tasks");
		} finally {
			setLoading(false);
		}
	}, [
		coIdNum,
		machineTypeFilter,
		frequencyFilter,
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

	const handleFrequencyFilter = useCallback((value: string | "") => {
		setFrequencyFilter(value);
		setPaginationModel((prev) => ({ ...prev, page: 0 }));
	}, []);

	const handleCreate = useCallback(() => {
		setSelectedId(undefined);
		setReadOnly(false);
		setDialogOpen(true);
	}, []);

	const handleEdit = useCallback((row: PmScheduleRow) => {
		setSelectedId(row.pm_schedule_id);
		setReadOnly(false);
		setDialogOpen(true);
	}, []);

	const handleView = useCallback((row: PmScheduleRow) => {
		setSelectedId(row.pm_schedule_id);
		setReadOnly(true);
		setDialogOpen(true);
	}, []);

	const handleDialogClose = useCallback(() => {
		setDialogOpen(false);
		setSelectedId(undefined);
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
	const frequencyLabels = useMemo(() => {
		const map = new Map<string, string>();
		for (const f of setup?.pm_frequencies ?? []) map.set(f.code, f.label);
		return map;
	}, [setup]);

	const columns = useMemo<GridColDef<PmScheduleRow>[]>(
		() => [
			{ field: "task_desc", headerName: "Task", flex: 2.2, minWidth: 260 },
			{
				field: "frequency",
				headerName: "Frequency",
				width: 150,
				renderCell: (params) => {
					const label =
						frequencyLabels.get(params.row.frequency) ?? params.row.frequency;
					return params.row.freq_days ? `${label} (${params.row.freq_days}d)` : label;
				},
			},
			{
				field: "machine_type_name",
				headerName: "Applies To",
				flex: 1.4,
				minWidth: 220,
				sortable: false,
				renderCell: (params) => {
					if (params.row.machine_id !== null) {
						return (
							<Chip
								label={`Machine: ${params.row.machine_name ?? params.row.machine_id}`}
								size="small"
								variant="outlined"
								color="secondary"
							/>
						);
					}
					if (params.row.machine_type_id !== null) {
						return (
							<Chip
								label={`Section: ${params.row.machine_type_name ?? params.row.machine_type_id}`}
								size="small"
								variant="outlined"
								color="primary"
							/>
						);
					}
					return (
						<Chip
							label="Unscoped — never picked up"
							size="small"
							variant="outlined"
							color="warning"
						/>
					);
				},
			},
			{
				field: "seq_no",
				headerName: "Seq. No.",
				width: 110,
				renderCell: (params) =>
					params.row.seq_no === null ? "—" : String(params.row.seq_no),
			},
			{
				field: "active",
				headerName: "Status",
				width: 110,
				renderCell: (params) => (
					<Chip
						label={params.row.active === 1 ? "Active" : "Inactive"}
						size="small"
						color={params.row.active === 1 ? "success" : "default"}
						variant={params.row.active === 1 ? "filled" : "outlined"}
					/>
				),
			},
		],
		[frequencyLabels],
	);

	const machineTypeOptions = useMemo(
		() =>
			(setup?.machine_types ?? []).map((t) => ({
				value: t.machine_type_id,
				label: t.machine_type_name,
			})),
		[setup],
	);

	const frequencyOptions = useMemo(
		() => (setup?.pm_frequencies ?? []).map((f) => ({ value: f.code, label: f.label })),
		[setup],
	);

	if (!mounted) return null;

	if (!coIdNum) {
		return (
			<Alert severity="warning" sx={{ m: 2 }}>
				Select a company to continue.
			</Alert>
		);
	}

	return (
		<IndexWrapper
			title="PM Schedule (Checklist Template)"
			subtitle={
				selectedCompany
					? `Preventive-maintenance tasks for ${selectedCompany.co_name}. Each task belongs either to a machine type or to one machine.`
					: "Each task belongs either to a machine type or to one machine."
			}
			rows={rows}
			columns={columns}
			rowCount={totalRows}
			paginationModel={paginationModel}
			onPaginationModelChange={setPaginationModel}
			loading={loading}
			showLoadingUntilLoaded
			search={{
				value: searchQuery,
				onChange: handleSearchChange,
				placeholder: "Search task description",
				debounceDelayMs: 500,
			}}
			toolbarContent={
				<>
					<SearchableOptionSelect<number>
						label="Machine Type"
						placeholder="All machine types"
						options={machineTypeOptions}
						value={machineTypeFilter}
						onChange={handleMachineTypeFilter}
						sx={{ minWidth: 220 }}
					/>
					<SearchableOptionSelect<string>
						label="Frequency"
						placeholder="All frequencies"
						options={frequencyOptions}
						value={frequencyFilter}
						onChange={handleFrequencyFilter}
						sx={{ minWidth: 200 }}
					/>
				</>
			}
			createAction={{ label: "Create PM Task", onClick: handleCreate }}
			onEdit={handleEdit}
			onView={handleView}
		>
			<CreatePmSchedulePage
				open={dialogOpen}
				onClose={handleDialogClose}
				onSaved={handleSaved}
				editId={selectedId}
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
