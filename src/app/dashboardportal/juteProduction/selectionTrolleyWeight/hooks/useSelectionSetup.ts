"use client";

import * as React from "react";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import type { SelectionSetup } from "../types/selectionTypes";

/**
 * GET /selectionProd/entry_setup?co_id&branch_id&tran_date — qualities issued
 * to the branch in the 7 days up to `tranDate` (D4), the gate entries of those
 * issues (D7), trolleys tagged to Selection (D1) and spells (spec §3.1).
 * Re-fetched whenever the date moves because the quality window follows it.
 */
export function useSelectionSetup(coId: string | null | undefined, branchId: number | null, tranDate: string) {
	const [setup, setSetup] = React.useState<SelectionSetup | null>(null);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [version, setVersion] = React.useState(0);

	const refresh = React.useCallback(() => setVersion((v) => v + 1), []);

	React.useEffect(() => {
		if (!coId || branchId == null || !tranDate) {
			setSetup(null);
			return;
		}
		let cancelled = false;
		setLoading(true);
		setError(null);
		const url = `${apiRoutesPortalMasters.SELECTION_TW_ENTRY_SETUP}?co_id=${coId}&branch_id=${branchId}&tran_date=${tranDate}`;
		void fetchWithCookie<{ data: SelectionSetup }>(url, "GET").then(({ data, error: err }) => {
			if (cancelled) return;
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
							gate_entries: d.gate_entries ?? [],
							trollies: d.trollies ?? [],
							spells: d.spells ?? [],
							quality_window: d.quality_window ?? null,
						}
					: null
			);
			setLoading(false);
		});
		return () => {
			cancelled = true;
		};
	}, [coId, branchId, tranDate, version]);

	return { setup, loading, error, refresh };
}
