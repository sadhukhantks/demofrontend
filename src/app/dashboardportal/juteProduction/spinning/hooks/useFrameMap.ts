"use client";

import * as React from "react";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import type { FrameMapRow } from "../types/spinningTypes";

export function useFrameMap(
	coId: string | null | undefined,
	branchId: number | null,
	tranDate: string,
	spell: string | null
) {
	const [rows, setRows] = React.useState<FrameMapRow[]>([]);
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
		const url = `${apiRoutesPortalMasters.SPINNING_FRAME_MAP_GET}?co_id=${coId}&branch_id=${branchId}&tran_date=${tranDate}&spell=${spell}`;
		void fetchWithCookie<{ data: FrameMapRow[] }>(url, "GET").then(({ data, error: err }) => {
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
	}, [coId, branchId, tranDate, spell, version]);

	return { rows, loading, error, refresh };
}
