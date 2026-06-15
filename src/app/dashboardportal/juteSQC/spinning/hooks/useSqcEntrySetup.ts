"use client";

import * as React from "react";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import type { SqcEntrySetup } from "../types/sqcSpinningTypes";

export function useSqcEntrySetup(
	coId: string | null | undefined,
	branchId: number | null,
	entryDate: string
) {
	const [setup, setSetup] = React.useState<SqcEntrySetup | null>(null);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [version, setVersion] = React.useState(0);

	const refresh = React.useCallback(() => setVersion((v) => v + 1), []);

	React.useEffect(() => {
		if (!coId || branchId == null || !entryDate) {
			setSetup(null);
			return;
		}
		let cancelled = false;
		setLoading(true);
		const url = `${apiRoutesPortalMasters.SPINNING_SQC_ENTRY_SETUP}?co_id=${coId}&branch_id=${branchId}&entry_date=${entryDate}`;
		void fetchWithCookie<{ data: SqcEntrySetup }>(url, "GET").then(({ data, error: err }) => {
			if (cancelled) return;
			if (err) {
				setError(err);
				setSetup(null);
			} else {
				setError(null);
				setSetup(data?.data ?? null);
			}
			setLoading(false);
		});
		return () => {
			cancelled = true;
		};
	}, [coId, branchId, entryDate, version]);

	return { setup, loading, error, refresh };
}
