"use client";

import * as React from "react";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import type { WindingSpellReportRow } from "../types/windingTypes";

// WINDING_SPELL_REPORT — the day's reconciled production per winder/spell
// (doff sum MINUS opening jugar PLUS closing jugar, computed server-side). The
// endpoint is branch + date scoped and returns every spell; callers filter by
// spell client-side. No-ops while !coId / no date / branch unresolved.
export function useWindingSpellReport(
	coId: string | null | undefined,
	tranDate: string,
	branchId: number | null,
) {
	const [rows, setRows] = React.useState<WindingSpellReportRow[]>([]);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [version, setVersion] = React.useState(0);

	const refresh = React.useCallback(() => setVersion((v) => v + 1), []);

	React.useEffect(() => {
		if (!coId || !tranDate || branchId == null) {
			setRows([]);
			return;
		}
		let cancelled = false;
		setLoading(true);
		const url = `${apiRoutesPortalMasters.WINDING_SPELL_REPORT}?co_id=${coId}&report_date=${tranDate}&branch_id=${branchId}`;
		void fetchWithCookie<{ data: { rows: WindingSpellReportRow[] } }>(url, "GET").then(
			({ data, error: err }) => {
				if (cancelled) return;
				if (err) {
					setError(err);
					setRows([]);
				} else {
					setError(null);
					setRows(data?.data?.rows ?? []);
				}
				setLoading(false);
			},
		);
		return () => {
			cancelled = true;
		};
	}, [coId, tranDate, branchId, version]);

	return { rows, loading, error, refresh };
}
