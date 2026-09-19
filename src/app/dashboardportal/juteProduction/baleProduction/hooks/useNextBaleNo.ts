"use client";

import * as React from "react";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import type { NextBaleNoResponse } from "../types/baleTypes";

/**
 * GET /baleProd/next_bale_no?co_id&bale_series_id — `last_bale_no + 1` for the
 * selected series plus the last entry written against it (SPEC F9, §6.3).
 * Re-fetched whenever the series changes and, via `refresh`, after every save
 * so the pre-filled bale no advances. Same shape as useDoffMachinePrevState.
 */
export function useNextBaleNo(coId: string | null | undefined, seriesId: number | null) {
	const [state, setState] = React.useState<NextBaleNoResponse | null>(null);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [version, setVersion] = React.useState(0);

	const refresh = React.useCallback(() => setVersion((v) => v + 1), []);

	React.useEffect(() => {
		if (!coId || seriesId == null) {
			setState(null);
			return;
		}
		let cancelled = false;
		setLoading(true);
		const url = `${apiRoutesPortalMasters.BALE_PROD_NEXT_BALE_NO}?co_id=${coId}&bale_series_id=${seriesId}`;
		void fetchWithCookie<{ data: NextBaleNoResponse }>(url, "GET").then(({ data, error: err }) => {
			if (cancelled) return;
			if (err) {
				setError(err);
				setState(null);
			} else {
				setError(null);
				setState(data?.data ?? null);
			}
			setLoading(false);
		});
		return () => {
			cancelled = true;
		};
	}, [coId, seriesId, version]);

	return { state, loading, error, refresh };
}
