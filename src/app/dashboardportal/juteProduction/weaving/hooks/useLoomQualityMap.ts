"use client";

import * as React from "react";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import type { LoomQualityMapRow } from "../types/weavingTypes";

// GET WEAVING_QUALITY_MAP_GET?co_id&branch_id&tran_date&spell
// -> { data: LoomQualityMapRow[], last_updated: string | null }.
// Mirrors useFrameMap (spinning frame → quality). Companion endpoints:
// WEAVING_QUALITY_MAP_SAVE (POST entries) and WEAVING_QUALITY_MAP_MAPPED (POST stamp).
export function useLoomQualityMap(
	coId: string | null | undefined,
	branchId: number | null,
	tranDate: string,
	spell: string | null
) {
	const [rows, setRows] = React.useState<LoomQualityMapRow[]>([]);
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [version, setVersion] = React.useState(0);

	const refresh = React.useCallback(() => setVersion((v) => v + 1), []);

	React.useEffect(() => {
		if (!coId || branchId == null || !tranDate || !spell) {
			setRows([]);
			return;
		}
		let cancelled = false;
		setLoading(true);
		const url = `${apiRoutesPortalMasters.WEAVING_QUALITY_MAP_GET}?co_id=${coId}&branch_id=${branchId}&tran_date=${tranDate}&spell=${spell}`;
		void fetchWithCookie<{ data: LoomQualityMapRow[]; last_updated: string | null }>(url, "GET").then(
			({ data, error: err }) => {
				if (cancelled) return;
				if (err) {
					setError(err);
					setRows([]);
					setLastUpdated(null);
				} else {
					setError(null);
					setRows(data?.data ?? []);
					setLastUpdated(data?.last_updated ?? null);
				}
				setLoading(false);
			}
		);
		return () => {
			cancelled = true;
		};
	}, [coId, branchId, tranDate, spell, version]);

	return { rows, lastUpdated, loading, error, refresh };
}
