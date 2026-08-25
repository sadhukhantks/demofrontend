"use client";

/**
 * Jute Mechanical & Maintenance — Reason Master (list page).
 *
 * Breakdown reason codes. A code with no machine type is GLOBAL: it shows up on
 * every machine's reason dropdown. A code with a machine type is restricted to
 * that section's machines.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Box, Chip, Snackbar, Typography } from "@mui/material";
import type { GridColDef, GridPaginationModel } from "@mui/x-data-grid";
import IndexWrapper from "@/components/ui/IndexWrapper";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import {
	CardStat,
	DESKTOP_ONLY_SX,
	MOBILE_ONLY_SX,
	MobileCard,
} from "@/components/ui/responsiveEntry";
import {
	MasterCardAction,
	MasterMobileList,
} from "../_components/MasterMobileList";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import useSelectedCompanyCoId from "@/hooks/use-selected-company-coid";
import {
	fetchMechMastersSetup,
	fetchMechReasonTable,
	type MechMastersSetup,
	type MechReason,
} from "@/utils/juteMechanicalService";
import CreateReasonPage from "./CreateReasonPage";

/** Grid row — the API row plus the DataGrid `id` the grid keys on. */
type ReasonRow = MechReason & { id: number };

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

/** Shown in the Machine Type column when the code applies to every machine. */
const GLOBAL_MACHINE_TYPE_LABEL = "All machine types";

export default function MechReasonMasterPage() {
	// HYDRATION RULE: this page reads the sidebar company from localStorage, so
	// nothing renders until mount or SSR and the first client render disagree.
	const [mounted, setMounted] = useState(false);
	useEffect(() => {
		setMounted(true);
	}, []);

	const { coId } = useSelectedCompanyCoId();
	const { selectedCompany } = useSidebarContext();
	const coIdNum = useMemo(() => (coId ? Number(coId) : null), [coId]);

	const [rows, setRows] = useState<ReasonRow[]>([]);
	const [totalRows, setTotalRows] = useState(0);
	const [loading, setLoading] = useState(true);
	const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
		page: 0,
		pageSize: 25,
	});
	const [searchQuery, setSearchQuery] = useState("");
	const [machineTypeFilter, setMachineTypeFilter] = useState<number | "">("");
	const [disciplineFilter, setDisciplineFilter] = useState<string | "">("");
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
				const data = await fetchMechMastersSetup({ coId: coIdNum });
				if (!cancelled) setSetup(data);
			} catch (err: unknown) {
				if (cancelled) return;
				notifyError(err instanceof Error ? err.message : "Error loading dropdowns");
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [coIdNum, notifyError]);

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
			const result = await fetchMechReasonTable({
				coId: coIdNum,
				machineTypeId: machineTypeFilter === "" ? null : machineTypeFilter,
				discipline: disciplineFilter === "" ? null : disciplineFilter,
				search: searchQuery || undefined,
				page: paginationModel.page + 1,
				limit: paginationModel.pageSize,
			});
			setRows(result.data.map((r) => ({ ...r, id: r.reason_id })));
			setTotalRows(result.total);
		} catch (err: unknown) {
			setRows([]);
			setTotalRows(0);
			notifyError(err instanceof Error ? err.message : "Error fetching reason codes");
		} finally {
			setLoading(false);
		}
	}, [
		coIdNum,
		machineTypeFilter,
		disciplineFilter,
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

	const handleDisciplineFilter = useCallback((value: string | "") => {
		setDisciplineFilter(value);
		setPaginationModel((prev) => ({ ...prev, page: 0 }));
	}, []);

	const handleCreate = useCallback(() => {
		setSelectedId(undefined);
		setReadOnly(false);
		setDialogOpen(true);
	}, []);

	const handleEdit = useCallback((row: ReasonRow) => {
		setSelectedId(row.reason_id);
		setReadOnly(false);
		setDialogOpen(true);
	}, []);

	const handleView = useCallback((row: ReasonRow) => {
		setSelectedId(row.reason_id);
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
	const disciplineLabels = useMemo(() => {
		const map = new Map<string, string>();
		for (const d of setup?.disciplines ?? []) map.set(d.code, d.label);
		return map;
	}, [setup]);

	const columns = useMemo<GridColDef<ReasonRow>[]>(
		() => [
			{ field: "reason_code", headerName: "Code", width: 110 },
			{ field: "reason_desc", headerName: "Description", flex: 2, minWidth: 240 },
			{
				field: "machine_type_name",
				headerName: "Machine Type",
				flex: 1,
				minWidth: 170,
				renderCell: (params) =>
					params.row.machine_type_id === null ? (
						<Chip
							label={GLOBAL_MACHINE_TYPE_LABEL}
							size="small"
							variant="outlined"
							sx={{ borderColor: "divider", color: "text.secondary" }}
						/>
					) : (
						(params.row.machine_type_name ?? "")
					),
			},
			{
				field: "discipline",
				headerName: "Discipline",
				width: 140,
				renderCell: (params) =>
					disciplineLabels.get(params.row.discipline) ?? params.row.discipline,
			},
			{
				field: "component_name",
				headerName: "Component",
				flex: 1,
				minWidth: 150,
				renderCell: (params) => params.row.component_name ?? "—",
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
		[disciplineLabels],
	);

	const machineTypeOptions = useMemo(
		() =>
			(setup?.machine_types ?? []).map((t) => ({
				value: t.machine_type_id,
				label: t.machine_type_name,
			})),
		[setup],
	);

	const disciplineOptions = useMemo(
		() => (setup?.disciplines ?? []).map((d) => ({ value: d.code, label: d.label })),
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

	const subtitle = selectedCompany
		? `Reason codes for ${selectedCompany.co_name}. A code with no machine type is available on every machine.`
		: "A code with no machine type is available on every machine.";

	return (
		<>
			{/*
			 * Two layouts, one data source. The grid does not reflow below ~900px, so
			 * it is hidden there and the card list takes over; both are fed by the same
			 * `rows` state, and which one is visible is decided by CSS breakpoints only.
			 */}
			<Box sx={DESKTOP_ONLY_SX}>
				<IndexWrapper
					title="Breakdown Reason Master"
					subtitle={subtitle}
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
						placeholder: "Search code or description",
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
								label="Discipline"
								placeholder="All disciplines"
								options={disciplineOptions}
								value={disciplineFilter}
								onChange={handleDisciplineFilter}
								sx={{ minWidth: 200 }}
							/>
						</>
					}
					createAction={{ label: "Create Reason Code", onClick: handleCreate }}
					onEdit={handleEdit}
					onView={handleView}
				/>
			</Box>

			<Box sx={MOBILE_ONLY_SX}>
				<MasterMobileList
					title="Breakdown Reason Master"
					subtitle={subtitle}
					search={{
						value: searchQuery,
						onChange: handleSearchChange,
						placeholder: "Search code or description",
						debounceDelayMs: 500,
					}}
					filters={
						<>
							<SearchableOptionSelect<number>
								label="Machine Type"
								placeholder="All machine types"
								options={machineTypeOptions}
								value={machineTypeFilter}
								onChange={handleMachineTypeFilter}
							/>
							<SearchableOptionSelect<string>
								label="Discipline"
								placeholder="All disciplines"
								options={disciplineOptions}
								value={disciplineFilter}
								onChange={handleDisciplineFilter}
							/>
						</>
					}
					createAction={{ label: "Create Reason Code", onClick: handleCreate }}
					loading={loading}
					visibleCount={rows.length}
					rowCount={totalRows}
					paginationModel={paginationModel}
					onPaginationModelChange={setPaginationModel}
					emptyMessage="No reason codes match the current filters."
				>
					{rows.map((row) => (
						<MobileCard
							key={row.id}
							header={
								<>
									<Typography
										variant="subtitle2"
										sx={{ fontWeight: 700, minWidth: 0, wordBreak: "break-word" }}
									>
										{row.reason_code}
									</Typography>
									<Chip
										label={disciplineLabels.get(row.discipline) ?? row.discipline}
										size="small"
										variant="outlined"
									/>
									<Box sx={{ ml: "auto" }}>
										<MasterCardAction row={row} onEdit={handleEdit} onView={handleView} />
									</Box>
								</>
							}
						>
							<Box sx={{ gridColumn: "1 / -1" }}>
								<CardStat label="Description" value={row.reason_desc} />
							</Box>
							<CardStat
								label="Machine Type"
								value={
									row.machine_type_id === null
										? GLOBAL_MACHINE_TYPE_LABEL
										: (row.machine_type_name ?? "—")
								}
							/>
							<CardStat label="Component" value={row.component_name ?? "—"} />
							<CardStat
								label="Status"
								value={
									<Chip
										component="span"
										label={row.active === 1 ? "Active" : "Inactive"}
										size="small"
										color={row.active === 1 ? "success" : "default"}
										variant={row.active === 1 ? "filled" : "outlined"}
									/>
								}
							/>
						</MobileCard>
					))}
				</MasterMobileList>
			</Box>

			<CreateReasonPage
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
		</>
	);
}
