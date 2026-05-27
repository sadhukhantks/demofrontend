"use client";

import * as React from "react";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import type { SpreaderSetup } from "../types/spreaderTypes";

export function useSpreaderSetup(coId: string | null | undefined) {
	const [setup, setSetup] = React.useState<SpreaderSetup | null>(null);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);

	const refresh = React.useCallback(async () => {
		if (!coId) return;
		setLoading(true);
		setError(null);
		const url = `${apiRoutesPortalMasters.SPREADER_ENTRY_CREATE_SETUP}?co_id=${coId}`;
		const { data, error: err } = await fetchWithCookie<{ data: SpreaderSetup }>(url, "GET");
		if (err) {
			setError(err);
			setLoading(false);
			return;
		}
		setSetup(data?.data ?? null);
		setLoading(false);
	}, [coId]);

	React.useEffect(() => {
		if (coId) {
			void refresh();
		}
	}, [coId, refresh]);

	return { setup, loading, error, refresh };
}
