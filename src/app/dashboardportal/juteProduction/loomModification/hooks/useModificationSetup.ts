"use client";

import * as React from "react";
import {
	fetchLoomModificationSetup,
	type ModificationSetup,
} from "@/utils/loomModificationService";

export interface UseModificationSetupResult {
	setup: ModificationSetup | null;
	loading: boolean;
	error: string | null;
	refresh: () => Promise<void>;
}

/**
 * Dropdown data for the register: the branch's active looms and lines, its groups,
 * the three enums, vendor parties and the two "Follows" lists. One call; refreshed
 * after every save because a save changes the open-event list (and may create a
 * group via "Save these looms as a group").
 */
export function useModificationSetup(
	coId: string | null | undefined,
	branchId: number | null,
): UseModificationSetupResult {
	const [setup, setSetup] = React.useState<ModificationSetup | null>(null);
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
			const data = await fetchLoomModificationSetup({ coId: Number(coId), branchId });
			setSetup(data);
		} catch (err) {
			setSetup(null);
			setError(err instanceof Error ? err.message : "Failed to load the modification setup");
		} finally {
			setLoading(false);
		}
	}, [coId, branchId]);

	React.useEffect(() => {
		void refresh();
	}, [refresh]);

	return { setup, loading, error, refresh };
}

export default useModificationSetup;
