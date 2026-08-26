"use client";

import * as React from "react";
import { fetchPmSetup, type MechPmSetup } from "@/utils/juteMechanicalService";

export interface UsePmSetupResult {
	setup: MechPmSetup | null;
	loading: boolean;
	error: string | null;
	refresh: () => Promise<void>;
}

/**
 * Dropdowns for the PM execution screen: machines, PM frequencies (each carrying
 * the `freq_days` it resolves to) and the three result codes.
 *
 * Stays idle until `co_id` and the branch are known — the endpoint 400s without a
 * company, and the machine list is branch-scoped through the machine's department.
 */
export function usePmSetup(
	coId: string | null | undefined,
	branchId: number | null,
): UsePmSetupResult {
	const [setup, setSetup] = React.useState<MechPmSetup | null>(null);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);

	const refresh = React.useCallback(async () => {
		if (!coId || branchId == null) {
			setSetup(null);
			return;
		}
		setLoading(true);
		setError(null);
		try {
			setSetup(await fetchPmSetup({ coId: Number(coId), branchId }));
		} catch (err) {
			setSetup(null);
			setError(err instanceof Error ? err.message : "Failed to load the PM setup");
		} finally {
			setLoading(false);
		}
	}, [coId, branchId]);

	React.useEffect(() => {
		void refresh();
	}, [refresh]);

	return { setup, loading, error, refresh };
}

export default usePmSetup;
