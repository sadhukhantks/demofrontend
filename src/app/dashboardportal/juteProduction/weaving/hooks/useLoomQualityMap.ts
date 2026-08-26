"use client";

import * as React from "react";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import type { LoomQualityMapRow } from "../types/weavingTypes";

type MapResponse = { data: LoomQualityMapRow[]; last_updated: string | null };

// machine_mst.line_no is INT on dev3 but VARCHAR on some tenants (e.g. sls), so the API
// may deliver "4" instead of 4 — which breaks the grids' strict line-filter comparison.
// Coerce once here so every consumer sees the declared number | null.
function normalizeLineNo(rows: LoomQualityMapRow[]): LoomQualityMapRow[] {
	return rows.map((r) => {
		const n = r.line_no == null ? null : Number(r.line_no);
		return { ...r, line_no: n == null || Number.isNaN(n) ? null : n };
	});
}

// Loom → Quality map data, loaded in up to two phases:
//   Phase 1 (always): GET /quality_map_saved — the loom list + today's saved mapping. Cheap —
//     the grid renders from this immediately. prev_quality_* come back null.
//   Phase 2 (only while carryForward=true, i.e. the mapping editor tab is visible): GET
//     /quality_map_get — the carry-forward prev_quality_* prefill, merged into the rows by
//     machine_id. Fetched lazily AFTER phase 1 so it never blocks first paint, and at most
//     once per (params, version) key (TKT-000123: it is ~190KB the other tabs never read).
// carryForwardLoading flags phase 2 in flight; toggling carryForward back on after a filter
// change fetches the prefill for the new key on demand.
export function useLoomQualityMap(
	coId: string | null | undefined,
	branchId: number | null,
	tranDate: string,
	spellId: number | null,
	carryForward = true
) {
	const [rows, setRows] = React.useState<LoomQualityMapRow[]>([]);
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null);
	const [loading, setLoading] = React.useState(false);
	const [carryForwardLoading, setCarryForwardLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [version, setVersion] = React.useState(0);
	// Key of the (params, version) whose phase 1 rows are currently in state — phase 2 only
	// merges into matching rows. cfDoneRef remembers which key already has its prefill so
	// re-entering the mapping tab doesn't refetch it.
	const [phase1Key, setPhase1Key] = React.useState<string | null>(null);
	const cfDoneRef = React.useRef<string | null>(null);

	const refresh = React.useCallback(() => setVersion((v) => v + 1), []);

	const key = `${coId}|${branchId}|${tranDate}|${spellId}|${version}`;
	const qs = `?co_id=${coId}&branch_id=${branchId}&tran_date=${tranDate}&spell_id=${spellId}`;

	// Phase 1 — cheap saved-mapping read; renders the grid immediately.
	React.useEffect(() => {
		if (!coId || branchId == null || !tranDate || spellId == null) {
			setRows([]);
			setLastUpdated(null);
			setPhase1Key(null);
			return;
		}
		let cancelled = false;
		setLoading(true);
		void fetchWithCookie<MapResponse>(
			`${apiRoutesPortalMasters.WEAVING_QUALITY_MAP_SAVED}${qs}`,
			"GET"
		).then(({ data, error: err }) => {
			if (cancelled) return;
			if (err) {
				setError(err);
				setRows([]);
				setLastUpdated(null);
				setLoading(false);
				setPhase1Key(null);
				return;
			}
			setError(null);
			setRows(normalizeLineNo(data?.data ?? []));
			setLastUpdated(data?.last_updated ?? null);
			setLoading(false);
			setPhase1Key(key);
		});
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps -- key/qs derive from these deps
	}, [coId, branchId, tranDate, spellId, version]);

	// Phase 2 — lazy carry-forward prefill, best-effort: on failure the grid just has no
	// prefill. Runs only while wanted, after phase 1 of the SAME key, at most once per key.
	React.useEffect(() => {
		if (!carryForward || phase1Key == null || phase1Key !== key) return;
		if (cfDoneRef.current === key) return;
		cfDoneRef.current = key;
		let cancelled = false;
		let settled = false;
		setCarryForwardLoading(true);
		void fetchWithCookie<MapResponse>(
			`${apiRoutesPortalMasters.WEAVING_QUALITY_MAP_GET}${qs}`,
			"GET"
		).then(({ data: cf, error: cfErr }) => {
			settled = true;
			if (cancelled) return;
			setCarryForwardLoading(false);
			if (cfErr || !cf?.data) return;
			const prevByMachine = new Map(cf.data.map((r) => [r.machine_id, r]));
			setRows((curr) =>
				curr.map((r) => {
					const p = prevByMachine.get(r.machine_id);
					return p
						? {
								...r,
								prev_quality_id: p.prev_quality_id,
								prev_quality_code: p.prev_quality_code,
								prev_quality_name: p.prev_quality_name,
								prev_date: p.prev_date,
						  }
						: r;
				})
			);
		});
		return () => {
			cancelled = true;
			setCarryForwardLoading(false);
			// Cancelled mid-flight (tab switched away / params changed): forget the done-mark
			// so returning to the mapping tab fetches the prefill again.
			if (!settled && cfDoneRef.current === key) cfDoneRef.current = null;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps -- key/qs derive from the param deps
	}, [carryForward, phase1Key, key]);

	return { rows, lastUpdated, loading, carryForwardLoading, error, refresh };
}

// Shape returned by the hook — so the page can call it once and pass the result to both the
// Loom→Quality editor and the Production Entry grid (one fetch, shared across tab switches).
export type LoomQualityMapState = ReturnType<typeof useLoomQualityMap>;
