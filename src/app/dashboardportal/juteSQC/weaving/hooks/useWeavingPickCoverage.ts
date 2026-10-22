"use client";

import * as React from "react";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";

// ITM-013 Picks Coverage: per (date, quality) how many pick readings equal the
// quality standard at 2 dp PPI, and the measured share. One row per
// (date, quality) that has >= 1 reading with picks (width-only readings are
// excluded). GET weaving_pick_coverage -> {"data": rows, "meta": {...}}.
export interface WeavingPickCoverageRow {
	date: string; // YYYY-MM-DD
	weaving_quality_id: number;
	weaving_quality_code: string | null;
	weaving_quality_name: string | null;
	quality: string;
	readings: number;
	equal_to_std: number;
	/** null when the quality has no standard on that date (never a fake 100). */
	measured_share_pct: number | null;
	std_picks_ppi: number | null;
	std_picks_dm: number | null;
	has_std: boolean;
}

export interface WeavingPickCoverageTotals {
	readings: number;
	readings_with_std: number;
	equal_to_std: number;
	/** Over readings_with_std only; null when none carry a standard. */
	measured_share_pct: number | null;
	days: number;
	qualities: number;
}

export interface WeavingPickCoverageMeta {
	co_id: number;
	branch_id: number | null;
	date_from: string;
	date_to: string;
	max_days: number;
	std_rule: string;
	totals: WeavingPickCoverageTotals;
}

export interface WeavingPickCoverageParams {
	coId: string;
	branchId: number | null;
	dateFrom: string;
	dateTo: string;
}

interface CoverageResponse {
	data: WeavingPickCoverageRow[];
	meta: WeavingPickCoverageMeta;
}

export const EMPTY_ROWS: WeavingPickCoverageRow[] = Object.freeze([]) as unknown as WeavingPickCoverageRow[];

export function useWeavingPickCoverage() {
	const [rows, setRows] = React.useState<WeavingPickCoverageRow[]>(EMPTY_ROWS);
	const [meta, setMeta] = React.useState<WeavingPickCoverageMeta | null>(null);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	// A newer Submit must never be overwritten by a slower earlier answer.
	const requestNo = React.useRef(0);

	const run = React.useCallback(async (params: WeavingPickCoverageParams): Promise<void> => {
		const mine = ++requestNo.current;
		setLoading(true);
		setError(null);
		const qs = new URLSearchParams({
			co_id: params.coId,
			date_from: params.dateFrom,
			date_to: params.dateTo,
		});
		if (params.branchId != null) qs.set("branch_id", String(params.branchId));
		const { data, error: err } = await fetchWithCookie<CoverageResponse>(
			`${apiRoutesPortalMasters.WEAVING_SQC_PICK_COVERAGE}?${qs.toString()}`,
			"GET"
		);
		if (mine !== requestNo.current) return;
		if (err) {
			// The server's 400 detail (range cap, reversed dates) is shown verbatim.
			setError(err);
			setRows(EMPTY_ROWS);
			setMeta(null);
		} else {
			setRows(data?.data ?? EMPTY_ROWS);
			setMeta(data?.meta ?? null);
		}
		setLoading(false);
	}, []);

	return { rows, meta, loading, error, run };
}
