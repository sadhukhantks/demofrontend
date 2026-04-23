"use client";

import * as React from "react";
import { Alert, Chip, Typography, Button } from "@mui/material";
import type { GridColDef, GridPaginationModel } from "@mui/x-data-grid";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import IndexWrapper from "@/components/ui/IndexWrapper";
import { useRouter } from "next/navigation";
import { useMenuId } from "@/hooks/useMenuId";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import {
	compareUrl,
	createResponseUrl,
	createUrl,
	editUrl,
	hubUrl,
} from "./createEnquiry/utils/enquiryRoutes";

type EnquiryRow = {
	id: string | number;
	enquiry_no: string;
	enquiry_date: string;
	enquiry_date_raw?: string;
	branch_name: string;
	expense_type: string;
	item_count: number;
	supplier_count: number;
	response_count: number;
	status: string;
	status_id: number;
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

const getStatusColor = (status: string): "success" | "error" | "warning" | "info" | "default" => {
	const s = status.toLowerCase().trim();
	if (s === "approved") return "success";
	if (s === "rejected") return "error";
	if (s === "pending approval") return "warning";
	if (s === "closed") return "info";
	return "default";
};

export default function PriceEnquiryIndexPage() {
	const router = useRouter();
	const { getMenuId } = useMenuId({ transactionType: "priceEnquiry" });
	const { selectedBranches } = useSidebarContext();
	const [mounted, setMounted] = React.useState(false);
	const [rows, setRows] = React.useState<EnquiryRow[]>([]);
	const [totalRows, setTotalRows] = React.useState(0);
	const [loading, setLoading] = React.useState(false);
	const [paginationModel, setPaginationModel] = React.useState<GridPaginationModel>({ page: 0, pageSize: 10 });
	const [searchValue, setSearchValue] = React.useState("");
	const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

	React.useEffect(() => {
		setMounted(true);
	}, []);

	const handleView = React.useCallback(
		(row: EnquiryRow) => {
			const id = row.id;
			if (!id) return;
			router.push(hubUrl(String(id), getMenuId()));
		},
		[router, getMenuId],
	);

	const handleEdit = React.useCallback(
		(row: EnquiryRow) => {
			const id = row.id;
			if (!id) return;
			router.push(editUrl(String(id), getMenuId()));
		},
		[router, getMenuId],
	);

	const isRowEditable = React.useCallback(
		(row: EnquiryRow) => {
			const s = String(row.status ?? "").toLowerCase().trim();
			return s !== "approved" && s !== "closed";
		},
		[],
	);

	const columns = React.useMemo<GridColDef[]>(() => [
		{
			field: "enquiry_no",
			headerName: "Enquiry No.",
			flex: 1,
			minWidth: 150,
			renderCell: (params) => (
				<Typography component="span" variant="body2" color="primary" sx={{ fontWeight: 600 }}>
					{params.value || "-"}
				</Typography>
			),
		},
		{
			field: "enquiry_date",
			headerName: "Enquiry Date",
			minWidth: 130,
			renderCell: (params) => (
				<Typography component="span" variant="body2">
					{params.value || formatDate(typeof params.row.enquiry_date_raw === "string" ? params.row.enquiry_date_raw : "") || "-"}
				</Typography>
			),
		},
		{
			field: "branch_name",
			headerName: "Branch",
			flex: 1,
			minWidth: 140,
		},
		{
			field: "expense_type",
			headerName: "Expense Type",
			flex: 1,
			minWidth: 130,
		},
		{
			field: "item_count",
			headerName: "Items",
			minWidth: 80,
			align: "center",
			headerAlign: "center",
		},
		{
			field: "supplier_count",
			headerName: "Suppliers",
			minWidth: 90,
			align: "center",
			headerAlign: "center",
		},
		{
			field: "response_count",
			headerName: "Responses",
			minWidth: 100,
			align: "center",
			headerAlign: "center",
		},
		{
			field: "status",
			headerName: "Status",
			minWidth: 140,
			renderCell: (params) => (
				<Chip
					size="small"
					color={getStatusColor(params.value ?? "")}
					label={params.value || "Draft"}
				/>
			),
		},
		{
			field: "actions_extra",
			headerName: "",
			minWidth: 180,
			sortable: false,
			filterable: false,
			renderCell: (params) => {
				const row = params.row as EnquiryRow;
				const statusLower = String(row.status ?? "").toLowerCase().trim();
				const isApproved = statusLower === "approved" || statusLower === "closed";
				return (
					<div className="flex gap-1">
						{isApproved && (
							<>
								<Button
									size="small"
									variant="outlined"
									onClick={(e) => {
										e.stopPropagation();
										router.push(createResponseUrl(String(row.id), null, getMenuId()));
									}}
								>
									Add Quote
								</Button>
								{Number(row.response_count) > 0 && (
									<Button
										size="small"
										variant="outlined"
										color="secondary"
										onClick={(e) => {
											e.stopPropagation();
											router.push(compareUrl(String(row.id), getMenuId()));
										}}
									>
										Compare
									</Button>
								)}
							</>
						)}
					</div>
				);
			},
		},
	], [router, getMenuId]);

	const fetchEnquiries = React.useCallback(async () => {
		if (selectedBranches.length === 0) {
			setRows([]);
			setTotalRows(0);
			setErrorMessage(null);
			setLoading(false);
			return;
		}

		setLoading(true);
		setErrorMessage(null);

		try {
			const query = new URLSearchParams({
				page: String(paginationModel.page + 1),
				page_size: String(paginationModel.pageSize),
				branch_ids: selectedBranches.join(","),
			});
			const trimmedSearch = searchValue.trim();
			if (trimmedSearch) query.set("search", trimmedSearch);

			const url = `${apiRoutesPortalMasters.ENQUIRY_TABLE}?${query.toString()}`;
			const { data, error } = await fetchWithCookie(url, "GET");

			if (error) {
				throw new Error(error);
			}

			const responseData = data as Record<string, unknown> | undefined;
			const rawRows = Array.isArray(responseData?.data)
				? (responseData.data as Record<string, unknown>[])
				: Array.isArray(data)
					? (data as Record<string, unknown>[])
					: [];

			const mappedRows: EnquiryRow[] = rawRows.map((row) => {
				const rawDate = (row.price_enquiry_date ?? row.enquiry_date ?? "") as string;
				return {
					id: (row.enquiry_id ?? row.id ?? `enq-${Math.random().toString(36).slice(2, 8)}`) as string | number,
					enquiry_no: (row.price_enquiry_squence_no ?? row.enquiry_no ?? "") as string,
					enquiry_date_raw: rawDate,
					enquiry_date: formatDate(rawDate),
					branch_name: (row.branch_name ?? "") as string,
					expense_type: (row.expense_type_name ?? "") as string,
					item_count: Number(row.item_count ?? 0),
					supplier_count: Number(row.supplier_count ?? 0),
					response_count: Number(row.response_count ?? 0),
					status: (row.status_name ?? row.status ?? "Draft") as string,
					status_id: Number(row.status_id ?? 21),
				};
			});

			setRows(mappedRows);
			const total = Number(responseData?.totalCount ?? responseData?.total ?? mappedRows.length ?? 0);
			setTotalRows(Number.isNaN(total) ? mappedRows.length : total);
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to load price enquiries";
			setErrorMessage(message);
			setRows([]);
			setTotalRows(0);
		} finally {
			setLoading(false);
		}
	}, [paginationModel.page, paginationModel.pageSize, searchValue, selectedBranches]);

	React.useEffect(() => {
		if (!mounted) return;
		fetchEnquiries();
	}, [fetchEnquiries, mounted]);

	const handlePaginationModelChange = (model: GridPaginationModel) => {
		setPaginationModel(model);
	};

	const handleSearchChange = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
		const value = event.target.value;
		setPaginationModel((prev) => ({ ...prev, page: 0 }));
		setSearchValue(value);
	}, []);

	const handleCreateEnquiry = React.useCallback(() => {
		router.push(createUrl(getMenuId()));
	}, [router, getMenuId]);

	if (!mounted) return null;

	return (
		<IndexWrapper
			title="Price Enquiries"
			subtitle="Send price enquiries to suppliers, compare quotes, and create purchase orders."
			rows={rows}
			columns={columns}
			rowCount={totalRows}
			paginationModel={paginationModel}
			onPaginationModelChange={handlePaginationModelChange}
			loading={loading}
			showLoadingUntilLoaded
			search={{ value: searchValue, onChange: handleSearchChange, placeholder: "Search by enquiry no., branch, or supplier", debounceDelayMs: 1000 }}
			createAction={{ onClick: handleCreateEnquiry, label: "Create Enquiry" }}
			onView={handleView}
			onEdit={handleEdit}
			isRowEditable={isRowEditable}
		>
			{errorMessage ? (
				<Alert severity="error" sx={{ mt: 2 }}>
					{errorMessage}
				</Alert>
			) : null}
		</IndexWrapper>
	);
}
