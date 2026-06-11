"use client";

import * as React from "react";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import type { SpinningDailyRow } from "../types/spinningTypes";

export function useSpinningDaily(
	coId: string | null | undefined,
	branchId: number | null,
	tranDate: string
) {
	const [rows, setRows] = React.useState<SpinningDailyRow[]>([]);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [version, setVersion] = React.useState(0);

	const refresh = React.useCallback(() => setVersion((v) => v + 1), []);

	React.useEffect(() => {
		if (!coId || branchId == null || !tranDate) {
			setRows([]);
			return;
		}
		let cancelled = false;
		setLoading(true);
		const url = `${apiRoutesPortalMasters.SPINNING_DAILY_SETUP}?co_id=${coId}&branch_id=${branchId}&tran_date=${tranDate}`;
		void fetchWithCookie<{ data: SpinningDailyRow[] }>(url, "GET").then(({ data, error: err }) => {
			if (cancelled) return;
			if (err) {
				setError(err);
				setRows([]);
			} else {
				setError(null);
				setRows(data?.data ?? []);
			}
			setLoading(false);
		});
		return () => {
			cancelled = true;
		};
	}, [coId, branchId, tranDate, version]);

	return { rows, loading, error, refresh };
}
