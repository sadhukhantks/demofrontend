"use client";

import * as React from "react";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import type { BaleRow, BaleSearchResponse } from "../types/baleTypes";

/**
 * GET /baleProd/bale_search?co_id&branch_id&bale_no[&bale_series_id] — the
 * history of one bale number across PROD and REPACK rows (SPEC §6.3). Driven
 * on demand by the Find Bale dialog; nothing is fetched until `search` runs.
 */
export function useBaleSearch(coId: string | null | undefined, branchId: number | null) {
	const [rows, setRows] = React.useState<BaleRow[]>([]);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [searched, setSearched] = React.useState(false);

	const search = React.useCallback(
		async (baleNo: number, seriesId: number | null) => {
			if (!coId || branchId == null) return;
			setLoading(true);
			setError(null);
			const params = new URLSearchParams({
				co_id: String(coId),
				branch_id: String(branchId),
				bale_no: String(baleNo),
			});
			if (seriesId != null) params.set("bale_series_id", String(seriesId));
			const { data, error: err } = await fetchWithCookie<{ data: BaleSearchResponse }>(
				`${apiRoutesPortalMasters.BALE_PROD_BALE_SEARCH}?${params.toString()}`,
				"GET"
			);
			if (err) {
				setError(err);
				setRows([]);
			} else {
				setRows(data?.data?.rows ?? []);
			}
			setSearched(true);
			setLoading(false);
		},
		[coId, branchId]
	);

	const clear = React.useCallback(() => {
		setRows([]);
		setError(null);
		setSearched(false);
	}, []);

	return { rows, loading, error, searched, search, clear };
}
