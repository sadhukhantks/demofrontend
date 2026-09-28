"use client";

import * as React from "react";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import type { BaleEntriesByDateResponse, BaleQualityTotal, BaleRow } from "../types/baleTypes";

const EMPTY_ROWS: ReadonlyArray<BaleRow> = Object.freeze([]);
const EMPTY_TOTALS: ReadonlyArray<BaleQualityTotal> = Object.freeze([]);

/**
 * GET /baleProd/entries_by_date?co_id&branch_id&tran_date — every active bale
 * of the day (PROD and REPACK, all spells) plus the server's per-quality totals
 * (SPEC §6.3). The whole day is shown so the operator sees earlier spells too;
 * the spell column tells them apart.
 */
export function useBaleEntriesByDate(
	coId: string | null | undefined,
	branchId: number | null,
	tranDate: string
) {
	const [rows, setRows] = React.useState<ReadonlyArray<BaleRow>>(EMPTY_ROWS);
	const [totals, setTotals] = React.useState<ReadonlyArray<BaleQualityTotal>>(EMPTY_TOTALS);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [version, setVersion] = React.useState(0);

	const refresh = React.useCallback(() => setVersion((v) => v + 1), []);

	React.useEffect(() => {
		if (!coId || branchId == null || !tranDate) {
			setRows(EMPTY_ROWS);
			setTotals(EMPTY_TOTALS);
			return;
		}
		let cancelled = false;
		setLoading(true);
		const url = `${apiRoutesPortalMasters.BALE_PROD_ENTRIES_BY_DATE}?co_id=${coId}&branch_id=${branchId}&tran_date=${tranDate}`;
		void fetchWithCookie<{ data: BaleEntriesByDateResponse }>(url, "GET").then(
			({ data, error: err }) => {
				if (cancelled) return;
				if (err) {
					setError(err);
					setRows(EMPTY_ROWS);
					setTotals(EMPTY_TOTALS);
				} else {
					setError(null);
					setRows(data?.data?.rows ?? EMPTY_ROWS);
					setTotals(data?.data?.totals ?? EMPTY_TOTALS);
				}
				setLoading(false);
			}
		);
		return () => {
			cancelled = true;
		};
	}, [coId, branchId, tranDate, version]);

	return { rows, totals, loading, error, refresh };
}
