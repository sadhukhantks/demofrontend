"use client";

import * as React from "react";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import type { WasteEntryRow } from "../types/wasteTypes";

/**
 * GET /juteWasteProd/entries_by_date — all active waste rows for
 * (co_id, branch_id, tran_date), which is exactly what the day grid shows
 * (SPEC §3.1, §6).
 */
export function useWasteEntriesByDate(
	coId: string | null | undefined,
	tranDate: string,
	branchId: number | null
) {
	const [rows, setRows] = React.useState<WasteEntryRow[]>([]);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [version, setVersion] = React.useState(0);

	const refresh = React.useCallback(() => setVersion((v) => v + 1), []);

	React.useEffect(() => {
		if (!coId || !tranDate || branchId == null) {
			setRows([]);
			return;
		}
		let cancelled = false;
		setLoading(true);
		const url = `${apiRoutesPortalMasters.JUTE_WASTE_ENTRIES_BY_DATE}?co_id=${coId}&tran_date=${tranDate}&branch_id=${branchId}`;
		void fetchWithCookie<{ data: WasteEntryRow[] }>(url, "GET").then(({ data, error: err }) => {
			if (cancelled) return;
			if (err) {
				setError(err);
				setRows([]);
			} else {
				setError(null);
				setRows(data?.data ?? []);
			}
			setLoading(false);
		});
		return () => {
			cancelled = true;
		};
	}, [coId, tranDate, branchId, version]);

	return { rows, loading, error, refresh };
}
