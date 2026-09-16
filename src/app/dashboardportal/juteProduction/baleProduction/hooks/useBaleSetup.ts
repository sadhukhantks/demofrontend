"use client";

import * as React from "react";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import type { BaleSetup } from "../types/baleTypes";

/**
 * GET /baleProd/entry_setup?co_id&branch_id — qualities (with standards),
 * series counters, Bale Press machines, trolleys and spells for the selected
 * company + branch (SPEC §6.3). `co_id`/`branch_id` come from SidebarContext.
 */
export function useBaleSetup(coId: string | null | undefined, branchId: number | null) {
	const [setup, setSetup] = React.useState<BaleSetup | null>(null);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);

	const refresh = React.useCallback(async () => {
		if (!coId || branchId == null) {
			setSetup(null);
			return;
		}
		setLoading(true);
		setError(null);
		const url = `${apiRoutesPortalMasters.BALE_PROD_ENTRY_SETUP}?co_id=${coId}&branch_id=${branchId}`;
		const { data, error: err } = await fetchWithCookie<{ data: BaleSetup }>(url, "GET");
		if (err) {
			setError(err);
			setSetup(null);
			setLoading(false);
			return;
		}
		const d = data?.data;
		// Defensive defaults so a partial payload never crashes a `.map`.
		setSetup(
			d
				? {
						qualities: d.qualities ?? [],
						series: d.series ?? [],
						machines: d.machines ?? [],
						trollies: d.trollies ?? [],
						spells: d.spells ?? [],
						entries_today_count: d.entries_today_count,
					}
				: null
		);
		setLoading(false);
	}, [coId, branchId]);

	React.useEffect(() => {
		void refresh();
	}, [refresh]);

	return { setup, loading, error, refresh };
}
