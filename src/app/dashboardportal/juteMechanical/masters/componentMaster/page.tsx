"use client";

/**
 * Jute Mechanical & Maintenance — Component Master (list page).
 *
 * The cross-section list of failure components (gear, chain, bearing, roller,
 * motor …). Reason codes and breakdown entries point at these, so repeat-failure
 * analysis can group incidents by the part that actually failed.
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
	fetchMechComponentTable,
	fetchMechMastersSetup,
	type MechComponent,
	type MechMastersSetup,
} from "@/utils/juteMechanicalService";
import CreateComponentPage from "./CreateComponentPage";

/** Grid row — the API row plus the DataGrid `id` the grid keys on. */
type ComponentRow = MechComponent & { id: number };

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

export default function MechComponentMasterPage() {
	// HYDRATION RULE: sidebar company comes from localStorage — hold render until mount.
	const [mounted, setMounted] = useState(false);
	useEffect(() => {
		setMounted(true);
	}, []);

	const { coId } = useSelectedCompanyCoId();
	const { selectedCompany } = useSidebarContext();
	const coIdNum = useMemo(() => (coId ? Number(coId) : null), [coId]);

	const [rows, setRows] = useState<ComponentRow[]>([]);
	const [totalRows, setTotalRows] = useState(0);
	const [loading, setLoading] = useState(true);
	const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
		page: 0,
		pageSize: 25,
	});
	const [searchQuery, setSearchQuery] = useState("");
	const [groupFilter, setGroupFilter] = useState<string | "">("");
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

	// ── Dropdowns (only used for the component-group filter) ───────────────
	const loadSetup = useCallback(async () => {
		if (!coIdNum) return;
		try {
			const data = await fetchMechMastersSetup({ coId: coIdNum });
			setSetup(data);
		} catch (err: unknown) {
			notifyError(err instanceof Error ? err.message : "Error loading dropdowns");
		}
	}, [coIdNum, notifyError]);

	useEffect(() => {
		loadSetup();
	}, [loadSetup]);

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
			const result = await fetchMechComponentTable({
				coId: coIdNum,
				componentGroup: groupFilter === "" ? null : groupFilter,
				search: searchQuery || undefined,
				page: paginationModel.page + 1,
				limit: paginationModel.pageSize,
			});
			setRows(result.data.map((r) => ({ ...r, id: r.component_id })));
			setTotalRows(result.total);
		} catch (err: unknown) {
			setRows([]);
			setTotalRows(0);
			notifyError(err instanceof Error ? err.message : "Error fetching components");
		} finally {
			setLoading(false);
		}
	}, [
		coIdNum,
		groupFilter,
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

	const handleGroupFilter = useCallback((value: string | "") => {
		setGroupFilter(value);
		setPaginationModel((prev) => ({ ...prev, page: 0 }));
	}, []);

	const handleCreate = useCallback(() => {
		setSelectedId(undefined);
		setReadOnly(false);
		setDialogOpen(true);
	}, []);

	const handleEdit = useCallback((row: ComponentRow) => {
		setSelectedId(row.component_id);
		setReadOnly(false);
		setDialogOpen(true);
	}, []);

	const handleView = useCallback((row: ComponentRow) => {
		setSelectedId(row.component_id);
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
			// A new component (or a renamed group) has to reach the group filter too.
			loadSetup();
		},
		[fetchRows, loadSetup, notifySuccess],
	);

	// ── Columns ────────────────────────────────────────────────────────────
	const columns = useMemo<GridColDef<ComponentRow>[]>(
		() => [
			{ field: "component_name", headerName: "Component", flex: 2, minWidth: 220 },
			{
				field: "component_group",
				headerName: "Group",
				flex: 1,
				minWidth: 170,
				renderCell: (params) => params.row.component_group ?? "—",
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
		[],
	);

	/** Distinct, non-empty component groups already in use for this company. */
	const groupOptions = useMemo(() => {
		const groups = new Set<string>();
		for (const c of setup?.components ?? []) {
			if (c.component_group) groups.add(c.component_group);
		}
		return Array.from(groups)
			.sort((a, b) => a.localeCompare(b))
			.map((group) => ({ value: group, label: group }));
	}, [setup]);

	if (!mounted) return null;

	if (!coIdNum) {
		return (
			<Alert severity="warning" sx={{ m: 2 }}>
				Select a company to continue.
			</Alert>
		);
	}

	const subtitle = selectedCompany
		? `Failure components for ${selectedCompany.co_name}, shared across every machine section.`
		: "Failure components shared across every machine section.";

	return (
		<>
			{/*
			 * Two layouts, one data source. The grid does not reflow below ~900px, so
			 * it is hidden there and the card list takes over; both are fed by the same
			 * `rows` state, and which one is visible is decided by CSS breakpoints only.
			 */}
			<Box sx={DESKTOP_ONLY_SX}>
				<IndexWrapper
					title="Failure Component Master"
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
						placeholder: "Search component or group",
						debounceDelayMs: 500,
					}}
					toolbarContent={
						<SearchableOptionSelect<string>
							label="Component Group"
							placeholder="All groups"
							options={groupOptions}
							value={groupFilter}
							onChange={handleGroupFilter}
							sx={{ minWidth: 220 }}
						/>
					}
					createAction={{ label: "Create Component", onClick: handleCreate }}
					onEdit={handleEdit}
					onView={handleView}
				/>
			</Box>

			<Box sx={MOBILE_ONLY_SX}>
				<MasterMobileList
					title="Failure Component Master"
					subtitle={subtitle}
					search={{
						value: searchQuery,
						onChange: handleSearchChange,
						placeholder: "Search component or group",
						debounceDelayMs: 500,
					}}
					filters={
						<SearchableOptionSelect<string>
							label="Component Group"
							placeholder="All groups"
							options={groupOptions}
							value={groupFilter}
							onChange={handleGroupFilter}
						/>
					}
					createAction={{ label: "Create Component", onClick: handleCreate }}
					loading={loading}
					visibleCount={rows.length}
					rowCount={totalRows}
					paginationModel={paginationModel}
					onPaginationModelChange={setPaginationModel}
					emptyMessage="No components match the current filters."
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
										{row.component_name}
									</Typography>
									<Box sx={{ ml: "auto" }}>
										<MasterCardAction row={row} onEdit={handleEdit} onView={handleView} />
									</Box>
								</>
							}
						>
							<CardStat label="Group" value={row.component_group ?? "—"} />
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

			<CreateComponentPage
				open={dialogOpen}
				onClose={handleDialogClose}
				onSaved={handleSaved}
				editId={selectedId}
				coId={coIdNum}
				knownGroups={groupOptions.map((option) => option.value)}
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
