"use client";

import * as React from "react";
import { Alert, Button, Chip, CircularProgress, TextField, Typography } from "@mui/material";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import type { GridColDef, GridPaginationModel, GridRenderCellParams } from "@mui/x-data-grid";
import { saveAs } from "file-saver";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import IndexWrapper from "@/components/ui/IndexWrapper";
import { useRouter } from "next/navigation";
import useSelectedCompanyCoId from "@/hooks/use-selected-company-coid";
import { useSessionStorageState } from "@/hooks/useSessionStorageState";
import { createStatusBasedEditCheck } from "@/utils/editability";
import { mrDownloadSuffix } from "./utils/mrDownloadName";
import { fetchJuteMRDownload } from "./utils/mrService";

/**
 * @component JuteMRIndexPage
 * @description Index page displaying list of Jute Material Receipts (MR) with pagination and search.
 */

type JuteMRRow = {
	id: string | number;
	mr_no: string | null;
	mr_date: string;
	mr_date_raw?: string;
	branch_name: string;
	supplier_name: string;
	party_name: string | null;
	po_num: string | null;
	challan_no: string | null;
	gate_entry_no: string | null;
	gate_entry_date: string;
	gate_entry_date_raw?: string;
	mukam: string | null;
	vehicle_no: string | null;
	mr_weight: number | null;
	status: string;
};

const formatDate = (value?: string) => {
	if (!value) return "-";
	const trimmed = value.trim();
	let date: Date | null = null;
	const ymdMatch = trimmed.match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/);
	if (ymdMatch) {
		const [, year, month, day] = ymdMatch;
		date = new Date(Number(year), Number(month) - 1, Number(day));
	} else {
		const parsed = new Date(trimmed);
		if (!Number.isNaN(parsed.getTime())) {
			date = parsed;
		}
	}
	if (!date || Number.isNaN(date.getTime())) {
		return trimmed;
	}
	return new Intl.DateTimeFormat("en-GB", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	}).format(date);
};

/** Status filter option; `null` is the "All statuses" (no filter) sentinel. */
type MRStatusFilterOption = { value: number | null; label: string };

// MR status ids (see backend mr.py MR_STATUS_*). NULL status_id renders as "Open".
const MR_STATUS_FILTER_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
	{ value: 21, label: "Draft" },
	{ value: 1, label: "Open" },
	{ value: 13, label: "Pending" },
	{ value: 20, label: "Pending Approval" },
	{ value: 3, label: "Approved" },
	{ value: 4, label: "Rejected" },
	{ value: 6, label: "Cancelled" },
];

/**
 * Everything the list remembers between visits (TKT-000226): the user opens
 * an MR, comes back, and finds the same filters and the same page. Kept per
 * tab in sessionStorage; "Clear dates" / emptying a field is how it is reset.
 */
type MRListState = {
	paginationModel: GridPaginationModel;
	searchValue: string;
	/** MR date bounds (from_date / to_date). */
	fromDate: string;
	toDate: string;
	/** Gate entry date bounds (ge_from_date / ge_to_date) — combinable with the MR-date ones. */
	geFromDate: string;
	geToDate: string;
	statusFilter: number | null;
};

const MR_LIST_STATE_KEY = "jutePurchase.mr.list.v1";

const MR_LIST_STATE_DEFAULTS: MRListState = {
	paginationModel: { page: 0, pageSize: 10 },
	searchValue: "",
	fromDate: "",
	toDate: "",
	geFromDate: "",
	geToDate: "",
	statusFilter: null,
};

const getStatusColor = (status: string): "success" | "error" | "warning" | "info" | "default" => {
	const normalized = status?.toLowerCase() ?? "";
	if (normalized.includes("approved") || normalized.includes("closed")) return "success";
	if (normalized.includes("rejected") || normalized.includes("cancelled")) return "error";
	if (normalized.includes("pending") || normalized.includes("open")) return "warning";
	if (normalized.includes("draft")) return "info";
	return "default";
};

export default function JuteMRIndexPage() {
	const router = useRouter();
	const { coId } = useSelectedCompanyCoId();
	const [rows, setRows] = React.useState<JuteMRRow[]>([]);
	const [totalRows, setTotalRows] = React.useState(0);
	const [loading, setLoading] = React.useState(false);
	// Filters + page survive opening an MR and coming back (TKT-000226). The
	// first fetch waits for the restore so the list is not loaded twice.
	const [listState, setListState, listStateRestored] = useSessionStorageState<MRListState>(
		MR_LIST_STATE_KEY,
		MR_LIST_STATE_DEFAULTS,
	);
	const { paginationModel, searchValue, fromDate, toDate, geFromDate, geToDate, statusFilter } = listState;
	const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
	const [downloading, setDownloading] = React.useState(false);
	const [downloadError, setDownloadError] = React.useState<string | null>(null);
	const [mounted, setMounted] = React.useState(false);
	React.useEffect(() => {
		setMounted(true);
	}, []);

	const columns = React.useMemo<GridColDef<JuteMRRow>[]>(
		() => [
			{
				field: "mr_no",
				headerName: "MR No",
				flex: 0.8,
				minWidth: 90,
				renderCell: (params: GridRenderCellParams<JuteMRRow, string | null>) => (
					<Typography component="span" variant="body2" color="primary" sx={{ fontWeight: 600 }}>
						{params.value ?? "-"}
					</Typography>
				),
			},
			{
				field: "mr_date",
				headerName: "MR Date",
				flex: 0.7,
				minWidth: 90,
				renderCell: (params: GridRenderCellParams<JuteMRRow, string>) => (
					<Typography component="span" variant="body2">
						{params.value || formatDate(params.row.mr_date_raw) || "-"}
					</Typography>
				),
			},
			{
				field: "branch_name",
				headerName: "Branch",
				flex: 0.8,
				minWidth: 80,
			},
			{
				field: "supplier_name",
				headerName: "Supplier",
				flex: 1.2,
				minWidth: 110,
			},
			{
				field: "party_name",
				headerName: "Party",
				flex: 1,
				minWidth: 100,
				renderCell: (params: GridRenderCellParams<JuteMRRow, string | null>) => (
					<Typography component="span" variant="body2">
						{params.value || "-"}
					</Typography>
				),
			},
			{
				field: "po_num",
				headerName: "PO No",
				flex: 1,
				minWidth: 130,
				renderCell: (params: GridRenderCellParams<JuteMRRow, string | null>) => (
					<Typography component="span" variant="body2">
						{params.value || "-"}
					</Typography>
				),
			},
			{
				field: "challan_no",
				headerName: "Challan No",
				flex: 0.7,
				minWidth: 85,
				renderCell: (params: GridRenderCellParams<JuteMRRow, string | null>) => (
					<Typography component="span" variant="body2">
						{params.value || "-"}
					</Typography>
				),
			},
			{
				field: "gate_entry_no",
				headerName: "Gate Entry No",
				flex: 0.9,
				minWidth: 100,
				renderCell: (params: GridRenderCellParams<JuteMRRow, string | null>) => (
					<Typography component="span" variant="body2">
						{params.value || "-"}
					</Typography>
				),
			},
			{
				field: "gate_entry_date",
				headerName: "Gate Entry Date",
				flex: 0.8,
				minWidth: 95,
				renderCell: (params: GridRenderCellParams<JuteMRRow, string>) => (
					<Typography component="span" variant="body2">
						{params.value || formatDate(params.row.gate_entry_date_raw) || "-"}
					</Typography>
				),
			},
			{
				field: "mukam",
				headerName: "Mukam",
				flex: 0.7,
				minWidth: 80,
				renderCell: (params: GridRenderCellParams<JuteMRRow, string | null>) => (
					<Typography component="span" variant="body2">
						{params.value || "-"}
					</Typography>
				),
			},
			{
				field: "vehicle_no",
				headerName: "Vehicle No",
				flex: 0.7,
				minWidth: 85,
				renderCell: (params: GridRenderCellParams<JuteMRRow, string | null>) => (
					<Typography component="span" variant="body2">
						{params.value || "-"}
					</Typography>
				),
			},
			{
				field: "mr_weight",
				headerName: "MR Weight",
				flex: 0.6,
				minWidth: 80,
				type: "number",
				align: "right",
				headerAlign: "right",
				renderCell: (params: GridRenderCellParams<JuteMRRow, number | null>) => (
					<Typography component="span" variant="body2">
						{params.value != null ? params.value.toFixed(2) : "-"}
					</Typography>
				),
			},
			{
				field: "status",
				headerName: "Status",
				flex: 0.7,
				minWidth: 95,
				renderCell: (params: GridRenderCellParams<JuteMRRow, string>) => (
					<Chip size="small" color={getStatusColor(params.value ?? "")} label={params.value || "Open"} />
				),
			},
		],
		[]
	);

	const fetchJuteMRs = React.useCallback(async () => {
		if (!coId) {
			setErrorMessage("Company ID not available");
			return;
		}

		setLoading(true);
		setErrorMessage(null);

		try {
			const query = new URLSearchParams({
				co_id: coId,
				page: String(paginationModel.page + 1),
				limit: String(paginationModel.pageSize),
			});
			const trimmedSearch = searchValue.trim();
			if (trimmedSearch) query.set("search", trimmedSearch);
			if (fromDate) query.set("from_date", fromDate);
			if (toDate) query.set("to_date", toDate);
			if (geFromDate) query.set("ge_from_date", geFromDate);
			if (geToDate) query.set("ge_to_date", geToDate);
			if (statusFilter !== null) query.set("status_id", String(statusFilter));

			const url = `${apiRoutesPortalMasters.JUTE_MR_TABLE}?${query.toString()}`;
			const { data, error } = await fetchWithCookie(url, "GET");

			if (error) {
				throw new Error(error);
			}

			const response = data as {
				data?: Array<Record<string, unknown>>;
				total?: number;
			};

			const rawRows = Array.isArray(response?.data) ? response.data : [];

			const mappedRows: JuteMRRow[] = rawRows.map((r: Record<string, unknown>) => {
				const rawDate = (r.jute_mr_date ?? "") as string;
				const normalizedRaw = typeof rawDate === "string" ? rawDate : rawDate ? String(rawDate) : "";
				const rawGate = (r.jute_gate_entry_date ?? "") as string;
				const normalizedGate = typeof rawGate === "string" ? rawGate : rawGate ? String(rawGate) : "";

				return {
					id: (r.jute_mr_id ?? `jute-mr-${Math.random().toString(36).slice(2, 8)}`) as string | number,
					mr_no: ((r.mr_num ?? r.branch_mr_no ?? null) as string | null),
					mr_date_raw: normalizedRaw,
					mr_date: formatDate(normalizedRaw),
					branch_name: (r.branch_name ?? "") as string,
					supplier_name: (r.supplier_name ?? "") as string,
					party_name: (r.party_name ?? null) as string | null,
					po_num: (r.po_num ?? null) as string | null,
					challan_no: (r.challan_no ?? null) as string | null,
					gate_entry_no: (r.gate_entry_no ?? null) as string | null,
					gate_entry_date_raw: normalizedGate,
					gate_entry_date: formatDate(normalizedGate),
					mukam: (r.mukam ?? null) as string | null,
					vehicle_no: (r.vehicle_no ?? null) as string | null,
					mr_weight: (r.mr_weight ?? null) as number | null,
					status: (r.status ?? "Open") as string,
				};
			});

			setRows(mappedRows);
			const total = Number(response?.total ?? mappedRows.length ?? 0);
			setTotalRows(Number.isNaN(total) ? mappedRows.length : total);
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to load Jute Material Receipts";
			setErrorMessage(message);
			setRows([]);
			setTotalRows(0);
		} finally {
			setLoading(false);
		}
	}, [coId, paginationModel.page, paginationModel.pageSize, searchValue, fromDate, toDate, geFromDate, geToDate, statusFilter]);

	React.useEffect(() => {
		if (coId && listStateRestored) {
			fetchJuteMRs();
		}
	}, [fetchJuteMRs, coId, listStateRestored]);

	const handlePaginationModelChange = React.useCallback(
		(model: GridPaginationModel) => setListState((prev) => ({ ...prev, paginationModel: model })),
		[setListState],
	);

	/** Set one filter and go back to the first page. */
	const setFilter = React.useCallback(
		<K extends keyof MRListState>(field: K, value: MRListState[K]) =>
			setListState((prev) => ({
				...prev,
				[field]: value,
				paginationModel: { ...prev.paginationModel, page: 0 },
			})),
		[setListState],
	);

	const handleSearchChange = React.useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => setFilter("searchValue", event.target.value),
		[setFilter],
	);

	const handleFromDateChange = React.useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => setFilter("fromDate", event.target.value),
		[setFilter],
	);

	const handleToDateChange = React.useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => setFilter("toDate", event.target.value),
		[setFilter],
	);

	const handleGeFromDateChange = React.useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => setFilter("geFromDate", event.target.value),
		[setFilter],
	);

	const handleGeToDateChange = React.useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => setFilter("geToDate", event.target.value),
		[setFilter],
	);

	const statusFilterOptions = React.useMemo<MRStatusFilterOption[]>(
		() => [{ value: null, label: "All statuses" }, ...MR_STATUS_FILTER_OPTIONS],
		[],
	);

	const selectedStatusFilterOption = React.useMemo(
		() => statusFilterOptions.find((option) => option.value === statusFilter) ?? null,
		[statusFilterOptions, statusFilter],
	);

	const handleStatusFilterChange = React.useCallback(
		(option: MRStatusFilterOption | null) => setFilter("statusFilter", option?.value ?? null),
		[setFilter],
	);

	const handleClearDates = React.useCallback(
		() =>
			setListState((prev) => ({
				...prev,
				fromDate: "",
				toDate: "",
				geFromDate: "",
				geToDate: "",
				paginationModel: { ...prev.paginationModel, page: 0 },
			})),
		[setListState],
	);

	const handleDownload = React.useCallback(async () => {
		if (!coId) {
			setDownloadError("Company ID not available");
			return;
		}
		setDownloading(true);
		setDownloadError(null);
		try {
			const blob = await fetchJuteMRDownload({
				coId,
				search: searchValue,
				fromDate,
				toDate,
				geFromDate,
				geToDate,
				statusId: statusFilter,
			});
			if (!blob || blob.size === 0) {
				setDownloadError("No data for the selected filters.");
				return;
			}
			saveAs(blob, `jute_mr_${mrDownloadSuffix({ fromDate, toDate, geFromDate, geToDate })}.xlsx`);
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to download Excel";
			setDownloadError(message);
		} finally {
			setDownloading(false);
		}
	}, [coId, searchValue, fromDate, toDate, geFromDate, geToDate, statusFilter]);

	const handleView = React.useCallback(
		(row: JuteMRRow) => {
			const id = row.id;
			if (!id) return;
			router.push(`/dashboardportal/jutePurchase/mr/edit?mode=view&id=${encodeURIComponent(String(id))}`);
		},
		[router]
	);

	const handleEdit = React.useCallback(
		(row: JuteMRRow) => {
			const id = row.id;
			if (!id) return;
			router.push(`/dashboardportal/jutePurchase/mr/edit?mode=edit&id=${encodeURIComponent(String(id))}`);
		},
		[router]
	);

	// Row is editable only in Draft or Open status
	const isRowEditable = React.useMemo(
		() => createStatusBasedEditCheck<JuteMRRow>({
			statusField: "status",
			editableStatuses: ["Draft", "Open"],
			caseInsensitive: true,
		}),
		[]
	);

	return (
		<IndexWrapper
			title="Jute Material Receipts"
			subtitle="Review existing jute material receipts."
			rows={rows}
			columns={columns}
			rowCount={totalRows}
			paginationModel={paginationModel}
			onPaginationModelChange={handlePaginationModelChange}
			loading={loading}
			showLoadingUntilLoaded
			autoHeight
			search={{
				value: searchValue,
				onChange: handleSearchChange,
				placeholder: "Search by MR no, PO no, supplier, party, challan, vehicle, gate entry, mukam, or branch.",
				debounceDelayMs: 500,
			}}
			toolbarContent={
				<>
					<TextField
						size="small"
						type="date"
						label="MR From"
						value={fromDate}
						onChange={handleFromDateChange}
						InputLabelProps={{ shrink: true }}
					/>
					<TextField
						size="small"
						type="date"
						label="MR To"
						value={toDate}
						onChange={handleToDateChange}
						InputLabelProps={{ shrink: true }}
					/>
					{/* Gate entry date bounds (TKT-000226); work together with the MR dates */}
					<TextField
						size="small"
						type="date"
						label="Gate Entry From"
						value={geFromDate}
						onChange={handleGeFromDateChange}
						InputLabelProps={{ shrink: true }}
					/>
					<TextField
						size="small"
						type="date"
						label="Gate Entry To"
						value={geToDate}
						onChange={handleGeToDateChange}
						InputLabelProps={{ shrink: true }}
					/>
					<SearchableSelect<MRStatusFilterOption>
						variant="outlined"
						label="Status"
						className="min-w-45"
						fullWidth={false}
						clearable={false}
						options={statusFilterOptions}
						value={selectedStatusFilterOption}
						onChange={handleStatusFilterChange}
						getOptionLabel={(option) => option.label}
						getOptionKey={(option) => String(option.value ?? "all")}
						isOptionEqualToValue={(option, selected) => option.value === selected.value}
					/>
					{(fromDate || toDate || geFromDate || geToDate) ? (
						<Button size="small" variant="outlined" onClick={handleClearDates}>
							Clear dates
						</Button>
					) : null}
					{mounted ? (
						<Button
							size="small"
							variant="outlined"
							onClick={handleDownload}
							disabled={!coId || downloading || loading}
							startIcon={downloading ? <CircularProgress size={16} /> : undefined}
						>
							{downloading ? "Downloading..." : "Download Excel"}
						</Button>
					) : null}
				</>
			}
			onView={handleView}
			onEdit={handleEdit}
			isRowEditable={isRowEditable}
		>
			{errorMessage ? (
				<Alert severity="error" sx={{ mt: 2 }}>
					{errorMessage}
				</Alert>
			) : null}
			{downloadError ? (
				<Alert severity="error" sx={{ mt: 2 }} onClose={() => setDownloadError(null)}>
					{downloadError}
				</Alert>
			) : null}
		</IndexWrapper>
	);
}
