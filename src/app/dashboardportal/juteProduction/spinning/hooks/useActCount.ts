"use client";

import * as React from "react";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import type { ActCountRow } from "../types/spinningTypes";

export function useActCount(
	coId: string | null | undefined,
	branchId: number | null,
	mappingDate: string
) {
	const [rows, setRows] = React.useState<ActCountRow[]>([]);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [version, setVersion] = React.useState(0);

	const refresh = React.useCallback(() => setVersion((v) => v + 1), []);

	React.useEffect(() => {
		if (!coId || branchId == null || !mappingDate) {
			setRows([]);
			return;
		}
		let cancelled = false;
		setLoading(true);
		const url = `${apiRoutesPortalMasters.SPINNING_ACT_COUNT_GET}?co_id=${coId}&branch_id=${branchId}&mapping_date=${mappingDate}`;
		void fetchWithCookie<{ data: ActCountRow[] }>(url, "GET").then(({ data, error: err }) => {
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
	}, [coId, branchId, mappingDate, version]);

	return { rows, loading, error, refresh };
}
