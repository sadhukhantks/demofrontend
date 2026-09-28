"use client";

import * as React from "react";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import type {
	SelectionEntriesByDateResponse,
	SelectionQualityTotal,
	SelectionRow,
	SelectionTotals,
} from "../types/selectionTypes";
import { computeTotals, rollupByQuality } from "../utils/selectionCalc";

const EMPTY_ROWS: ReadonlyArray<SelectionRow> = Object.freeze([]);
const EMPTY_BY_QUALITY: ReadonlyArray<SelectionQualityTotal> = Object.freeze([]);
const EMPTY_TOTALS: SelectionTotals = Object.freeze({ trolleys: 0, gross_wt: 0, trolly_wt: 0, net_wt: 0 });

/**
 * GET /selectionProd/entries_by_date?co_id&branch_id&tran_date — every active
 * trolley weighed on the day (all spells — the spell column tells them apart)
 * plus the server's totals and by-quality roll-up (spec §3.1). When the server
 * omits the aggregates they are computed client-side from the rows.
 */
export function useSelectionEntriesByDate(coId: string | null | undefined, branchId: number | null, tranDate: string) {
	const [rows, setRows] = React.useState<ReadonlyArray<SelectionRow>>(EMPTY_ROWS);
	const [totals, setTotals] = React.useState<SelectionTotals>(EMPTY_TOTALS);
	const [byQuality, setByQuality] = React.useState<ReadonlyArray<SelectionQualityTotal>>(EMPTY_BY_QUALITY);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [version, setVersion] = React.useState(0);

	const refresh = React.useCallback(() => setVersion((v) => v + 1), []);

	React.useEffect(() => {
		if (!coId || branchId == null || !tranDate) {
			setRows(EMPTY_ROWS);
			setTotals(EMPTY_TOTALS);
			setByQuality(EMPTY_BY_QUALITY);
			return;
		}
		let cancelled = false;
		setLoading(true);
		const url = `${apiRoutesPortalMasters.SELECTION_TW_ENTRIES_BY_DATE}?co_id=${coId}&branch_id=${branchId}&tran_date=${tranDate}`;
		void fetchWithCookie<{ data: SelectionEntriesByDateResponse }>(url, "GET").then(({ data, error: err }) => {
			if (cancelled) return;
			if (err) {
				setError(err);
				setRows(EMPTY_ROWS);
				setTotals(EMPTY_TOTALS);
				setByQuality(EMPTY_BY_QUALITY);
			} else {
				const d = data?.data;
				const nextRows = d?.rows ?? EMPTY_ROWS;
				setError(null);
				setRows(nextRows);
				setTotals(d?.totals ?? computeTotals(nextRows));
				setByQuality(d?.by_quality ?? rollupByQuality(nextRows));
			}
			setLoading(false);
		});
		return () => {
			cancelled = true;
		};
	}, [coId, branchId, tranDate, version]);

	return { rows, totals, byQuality, loading, error, refresh };
}
