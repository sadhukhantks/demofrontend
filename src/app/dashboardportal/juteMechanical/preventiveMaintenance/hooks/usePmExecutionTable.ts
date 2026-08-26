"use client";

import * as React from "react";
import {
	deletePmExecution,
	fetchPmExecutionTable,
	type MechPmExecution,
} from "@/utils/juteMechanicalService";

/** Filter state the execution grid is driven by. */
export interface PmExecutionTableFilters {
	dateFrom: string;
	dateTo: string;
	/** "" = every machine. */
	machineId: number | "";
}

export interface UsePmExecutionTableResult {
	rows: MechPmExecution[];
	total: number;
	loading: boolean;
	error: string | null;
	page: number;
	pageSize: number;
	setPage: (page: number) => void;
	setPageSize: (size: number) => void;
	refresh: () => Promise<void>;
	/** Soft-deletes one execution and reloads the page. Returns an error string, or null. */
	remove: (pmExecId: number) => Promise<string | null>;
}

const DEFAULT_PAGE_SIZE = 25;
const EMPTY_ROWS: ReadonlyArray<MechPmExecution> = Object.freeze([]);

/**
 * The paginated PM execution log. Idle until `co_id` and the branch are known — the
 * endpoint 400s without a company, and an execution is always booked to one branch.
 */
export function usePmExecutionTable(
	coId: string | null | undefined,
	branchId: number | null,
	filters: PmExecutionTableFilters,
): UsePmExecutionTableResult {
	const [rows, setRows] = React.useState<MechPmExecution[]>([...EMPTY_ROWS]);
	const [total, setTotal] = React.useState(0);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [page, setPage] = React.useState(1);
	const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE);

	const { dateFrom, dateTo, machineId } = filters;

	const refresh = React.useCallback(async () => {
		if (!coId || branchId == null) {
			setRows([...EMPTY_ROWS]);
			setTotal(0);
			return;
		}
		setLoading(true);
		setError(null);
		try {
			const result = await fetchPmExecutionTable({
				coId: Number(coId),
				branchId,
				dateFrom: dateFrom || undefined,
				dateTo: dateTo || undefined,
				machineId: machineId === "" ? null : machineId,
				page,
				limit: pageSize,
			});
			setRows(result.data);
			setTotal(result.total);
		} catch (err) {
			setRows([...EMPTY_ROWS]);
			setTotal(0);
			setError(err instanceof Error ? err.message : "Failed to load PM executions");
		} finally {
			setLoading(false);
		}
	}, [coId, branchId, dateFrom, dateTo, machineId, page, pageSize]);

	React.useEffect(() => {
		void refresh();
	}, [refresh]);

	React.useEffect(() => {
		setPage(1);
	}, [dateFrom, dateTo, machineId, branchId]);

	const remove = React.useCallback(
		async (pmExecId: number): Promise<string | null> => {
			if (!coId) return "Select a company first";
			try {
				await deletePmExecution(pmExecId, Number(coId));
				await refresh();
				return null;
			} catch (err) {
				return err instanceof Error ? err.message : "Failed to delete the PM execution";
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

export default usePmExecutionTable;
