"use client";

import * as React from "react";
import {
	deleteModification,
	fetchModificationTable,
	type ModificationRow,
} from "@/utils/loomModificationService";

/** Filter state the register grid is driven by. All fields are optional narrowings. */
export interface ModificationTableFilters {
	dateFrom: string;
	dateTo: string;
	/** "" = every group. */
	loomGroupId: number | "";
	/** "" = every loom; otherwise rows whose snapshot holds the loom. */
	machineId: number | "";
	/** "" = every kind. */
	modKind: string;
}

export interface UseModificationTableResult {
	rows: ModificationRow[];
	total: number;
	loading: boolean;
	error: string | null;
	page: number;
	pageSize: number;
	setPage: (page: number) => void;
	setPageSize: (size: number) => void;
	refresh: () => Promise<void>;
	/** Soft-deletes one stage (or its whole chain) and reloads. Returns an error string, or null. */
	remove: (modificationId: number, chain?: boolean) => Promise<string | null>;
}

const DEFAULT_PAGE_SIZE = 25;
const EMPTY_ROWS: ReadonlyArray<ModificationRow> = Object.freeze([]);

/**
 * The paginated modification register. `co_id` is required by the endpoint and
 * `branch_id` scopes the rows to the branch picked in the sidebar; the hook stays
 * idle until both are known rather than firing a call the backend would 400.
 */
export function useModificationTable(
	coId: string | null | undefined,
	branchId: number | null,
	filters: ModificationTableFilters,
): UseModificationTableResult {
	const [rows, setRows] = React.useState<ModificationRow[]>([...EMPTY_ROWS]);
	const [total, setTotal] = React.useState(0);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [page, setPage] = React.useState(1);
	const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE);

	const { dateFrom, dateTo, loomGroupId, machineId, modKind } = filters;

	const refresh = React.useCallback(async () => {
		if (!coId || branchId == null) {
			setRows([...EMPTY_ROWS]);
			setTotal(0);
			return;
		}
		setLoading(true);
		setError(null);
		try {
			const result = await fetchModificationTable({
				coId: Number(coId),
				branchId,
				dateFrom: dateFrom || undefined,
				dateTo: dateTo || undefined,
				loomGroupId: loomGroupId === "" ? null : loomGroupId,
				machineId: machineId === "" ? null : machineId,
				modKind: modKind === "" ? null : modKind,
				page,
				limit: pageSize,
			});
			setRows(result.data);
			setTotal(result.total);
		} catch (err) {
			setRows([...EMPTY_ROWS]);
			setTotal(0);
			setError(err instanceof Error ? err.message : "Failed to load the modification register");
		} finally {
			setLoading(false);
		}
	}, [coId, branchId, dateFrom, dateTo, loomGroupId, machineId, modKind, page, pageSize]);

	// Any filter change invalidates the current page offset. Reset it BEFORE fetching
	// (and skip that render's fetch) so a filter change issues exactly one request
	// instead of one with the stale page and another after the reset.
	const filterKey = `${branchId ?? ""}|${dateFrom}|${dateTo}|${loomGroupId}|${machineId}|${modKind}`;
	const lastFilterKeyRef = React.useRef(filterKey);
	React.useEffect(() => {
		if (lastFilterKeyRef.current !== filterKey) {
			lastFilterKeyRef.current = filterKey;
			if (page !== 1) {
				setPage(1);
				return;
			}
		}
		void refresh();
	}, [refresh, filterKey, page]);

	const remove = React.useCallback(
		async (modificationId: number, chain = false): Promise<string | null> => {
			if (!coId) return "Select a company first";
			try {
				await deleteModification(modificationId, Number(coId), chain);
				await refresh();
				return null;
			} catch (err) {
				return err instanceof Error ? err.message : "Failed to delete the modification";
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

export default useModificationTable;
