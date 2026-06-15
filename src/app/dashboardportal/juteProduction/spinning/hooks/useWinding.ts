"use client";

import * as React from "react";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import type { WindingRow, WindingSetup } from "../types/spinningTypes";

// GET WINDING_SETUP?co_id&branch_id? -> { data: { qualities, shifts:["A","B","C"] } }
export function useWindingSetup(coId: string | null | undefined, branchId: number | null) {
	const [setup, setSetup] = React.useState<WindingSetup | null>(null);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);

	React.useEffect(() => {
		if (!coId || branchId == null) {
			setSetup(null);
			return;
		}
		let cancelled = false;
		setLoading(true);
		const url = `${apiRoutesPortalMasters.WINDING_SETUP}?co_id=${coId}&branch_id=${branchId}`;
		void fetchWithCookie<{ data: WindingSetup }>(url, "GET").then(({ data, error: err }) => {
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
	}, [coId, branchId]);

	return { setup, loading, error };
}

// GET WINDING_BY_DATE?co_id&prod_date&shift?&branch_id? -> { data: WindingRow[] }
export function useWindingByDate(
	coId: string | null | undefined,
	branchId: number | null,
	prodDate: string,
	shift?: string | null
) {
	const [rows, setRows] = React.useState<WindingRow[]>([]);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [version, setVersion] = React.useState(0);

	const refresh = React.useCallback(() => setVersion((v) => v + 1), []);

	React.useEffect(() => {
		if (!coId || branchId == null || !prodDate) {
			setRows([]);
			return;
		}
		let cancelled = false;
		setLoading(true);
		let url = `${apiRoutesPortalMasters.WINDING_BY_DATE}?co_id=${coId}&prod_date=${prodDate}&branch_id=${branchId}`;
		if (shift) url += `&shift=${shift}`;
		void fetchWithCookie<{ data: WindingRow[] }>(url, "GET").then(({ data, error: err }) => {
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
	}, [coId, branchId, prodDate, shift, version]);

	return { rows, loading, error, refresh };
}
