"use client";

import * as React from "react";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import type { WeavingEntryRow } from "../types/weavingTypes";

// GET WEAVING_ENTRIES_BY_DATE?co_id&tran_date&branch_id&spell?&machine_id?
// -> { data: WeavingEntryRow[] }. Mirrors useDoffEntriesByDate / useBeamingEntriesByDate.
export function useWeavingEntriesByDate(
	coId: string | null | undefined,
	tranDate: string,
	branchId: number | null,
	spell?: string | null,
	machineId?: number | null,
	// Bump from the parent (e.g. after a save) to force a refetch.
	refreshKey: number = 0
) {
	const [rows, setRows] = React.useState<WeavingEntryRow[]>([]);
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
		let url = `${apiRoutesPortalMasters.WEAVING_ENTRIES_BY_DATE}?co_id=${coId}&tran_date=${tranDate}&branch_id=${branchId}`;
		if (spell) url += `&spell=${spell}`;
		if (machineId != null) url += `&machine_id=${machineId}`;
		void fetchWithCookie<{ data: WeavingEntryRow[] }>(url, "GET").then(({ data, error: err }) => {
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
	}, [coId, tranDate, branchId, spell, machineId, version, refreshKey]);

	return { rows, loading, error, refresh };
}
