"use client";

import * as React from "react";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import type { WasteSetup } from "../types/wasteTypes";

/**
 * GET /juteWasteProd/entry_create_setup — spells, departments, machines and
 * waste types for the selected company + branch (SPEC §6).
 *
 * Machines come back for the WHOLE branch carrying their `dept_id`, so the
 * Department → Machine cascade is resolved client-side with no second round trip.
 */
export function useWasteSetup(coId: string | null | undefined, branchId: number | null) {
	const [setup, setSetup] = React.useState<WasteSetup | null>(null);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);

	const refresh = React.useCallback(async () => {
		if (!coId || branchId == null) {
			setSetup(null);
			return;
		}
		setLoading(true);
		setError(null);
		const url = `${apiRoutesPortalMasters.JUTE_WASTE_ENTRY_CREATE_SETUP}?co_id=${coId}&branch_id=${branchId}`;
		const { data, error: err } = await fetchWithCookie<{ data: WasteSetup }>(url, "GET");
		if (err) {
			setError(err);
			setSetup(null);
			setLoading(false);
			return;
		}
		setSetup(data?.data ?? null);
		setLoading(false);
	}, [coId, branchId]);

	React.useEffect(() => {
		void refresh();
	}, [refresh]);

	return { setup, loading, error, refresh };
}
