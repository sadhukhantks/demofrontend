"use client";

import * as React from "react";
import {
	deleteOverhaul,
	fetchOverhaulTable,
	type MechOverhaul,
} from "@/utils/juteMechanicalService";

/** Filter state the register grid is driven by. All fields are optional narrowings. */
export interface OverhaulTableFilters {
	dateFrom: string;
	dateTo: string;
	/** "" = every machine. */
	machineId: number | "";
	/** "" = both MAJOR and MINOR. */
	overhaulType: string;
}

export interface UseOverhaulTableResult {
	rows: MechOverhaul[];
	total: number;
	loading: boolean;
	error: string | null;
	page: number;
	pageSize: number;
	setPage: (page: number) => void;
	setPageSize: (size: number) => void;
	refresh: () => Promise<void>;
	/** Soft-deletes one overhaul and reloads the page. Returns an error string, or null. */
	remove: (overhaulId: number) => Promise<string | null>;
}

const DEFAULT_PAGE_SIZE = 25;
const EMPTY_ROWS: ReadonlyArray<MechOverhaul> = Object.freeze([]);

/**
 * The paginated overhaul register. `co_id` is required by the endpoint and
 * `branch_id` scopes the rows to the branch picked in the sidebar; the hook simply
 * stays idle until both are known rather than firing a call the backend would 400.
 */
export function useOverhaulTable(
	coId: string | null | undefined,
	branchId: number | null,
	filters: OverhaulTableFilters,
): UseOverhaulTableResult {
	const [rows, setRows] = React.useState<MechOverhaul[]>([...EMPTY_ROWS]);
	const [total, setTotal] = React.useState(0);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [page, setPage] = React.useState(1);
	const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE);

	const { dateFrom, dateTo, machineId, overhaulType } = filters;

	const refresh = React.useCallback(async () => {
		if (!coId || branchId == null) {
			setRows([...EMPTY_ROWS]);
			setTotal(0);
			return;
		}
		setLoading(true);
		setError(null);
		try {
			const result = await fetchOverhaulTable({
				coId: Number(coId),
				branchId,
				dateFrom: dateFrom || undefined,
				dateTo: dateTo || undefined,
				machineId: machineId === "" ? null : machineId,
				overhaulType: overhaulType === "" ? null : overhaulType,
				page,
				limit: pageSize,
			});
			setRows(result.data);
			setTotal(result.total);
		} catch (err) {
			setRows([...EMPTY_ROWS]);
			setTotal(0);
			setError(err instanceof Error ? err.message : "Failed to load the overhaul register");
		} finally {
			setLoading(false);
		}
	}, [coId, branchId, dateFrom, dateTo, machineId, overhaulType, page, pageSize]);

	React.useEffect(() => {
		void refresh();
	}, [refresh]);

	// Any filter change invalidates the current page offset.
	React.useEffect(() => {
		setPage(1);
	}, [dateFrom, dateTo, machineId, overhaulType, branchId]);

	const remove = React.useCallback(
		async (overhaulId: number): Promise<string | null> => {
			if (!coId) return "Select a company first";
			try {
				await deleteOverhaul(overhaulId, Number(coId));
				await refresh();
				return null;
			} catch (err) {
				return err instanceof Error ? err.message : "Failed to delete the overhaul";
			}
		},
		[coId, refresh],
	);

	return {
		rows,
		total,
		loading,
		error,
		page,
		pageSize,
		setPage,
		setPageSize,
		refresh,
		remove,
	};
}

export default useOverhaulTable;
