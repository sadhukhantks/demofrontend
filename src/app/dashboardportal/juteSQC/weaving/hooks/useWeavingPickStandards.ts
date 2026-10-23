"use client";

import * as React from "react";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";

// ITM-013: per-quality standard picks in force on the entry date, served by
// GET weaving_sqc_pick_standards (NOT part of the setup payload, so the entry
// screen can never prefill a standard). The target map stores PPI; the server
// adds the picks/dm equivalent for the hint. Company-wide — no branch_id.
export interface WeavingPickStandard {
	weaving_quality_id: number;
	std_picks_ppi: number;
	std_picks_dm: number;
	effective_date: string;
}

export interface WeavingPickStandardsResponse {
	entry_date: string;
	standards: WeavingPickStandard[];
}

/** Keyed by weaving_quality_id; a missing key means "no standard". */
export type WeavingPickStandardsMap = Record<number, WeavingPickStandard>;

export const EMPTY_STANDARDS: WeavingPickStandardsMap = Object.freeze({}) as WeavingPickStandardsMap;

function toMap(list: WeavingPickStandard[] | undefined): WeavingPickStandardsMap {
	if (!list || list.length === 0) return EMPTY_STANDARDS;
	const out: WeavingPickStandardsMap = {};
	for (const s of list) out[s.weaving_quality_id] = s;
	return out;
}

/** Standards are effective-dated, so the map reloads whenever the entry date
 * changes. */
export function useWeavingPickStandards(coId: string | null | undefined, entryDate: string) {
	const [standards, setStandards] = React.useState<WeavingPickStandardsMap>(EMPTY_STANDARDS);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [version, setVersion] = React.useState(0);

	const refresh = React.useCallback(() => setVersion((v) => v + 1), []);

	React.useEffect(() => {
		if (!coId || !entryDate) {
			setStandards(EMPTY_STANDARDS);
			return;
		}
		let cancelled = false;
		setLoading(true);
		const url = `${apiRoutesPortalMasters.WEAVING_SQC_PICK_STANDARDS}?co_id=${coId}&entry_date=${entryDate}`;
		void fetchWithCookie<{ data: WeavingPickStandardsResponse }>(url, "GET").then(({ data, error: err }) => {
			if (cancelled) return;
			if (err) {
				setError(err);
				setStandards(EMPTY_STANDARDS);
			} else {
				setError(null);
				setStandards(toMap(data?.data?.standards));
			}
			setLoading(false);
		});
		return () => {
			cancelled = true;
		};
	}, [coId, entryDate, version]);

	return { standards, loading, error, refresh };
}
