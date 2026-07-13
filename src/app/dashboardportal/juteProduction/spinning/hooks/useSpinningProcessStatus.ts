"use client";

import * as React from "react";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";

// GET SPINNING_PROCESS_STATUS?co_id&branch_id&tran_date&spell
//   -> { data: { locked: boolean; reprocess_needed: boolean } }
// A locked (date,spell) unit serves the frozen log and requires Edit to mutate;
// reprocess_needed is raised when doff/winding entries changed after processing.
export type SpinningProcessStatus = { locked: boolean; reprocess_needed: boolean };

export function useSpinningProcessStatus(
	coId: string | null | undefined,
	branchId: number | null,
	date: string,
	spell: string | null | undefined,
	refreshKey = 0
) {
	const [status, setStatus] = React.useState<SpinningProcessStatus>({
		locked: false,
		reprocess_needed: false,
	});
	const [loading, setLoading] = React.useState(false);
	const [version, setVersion] = React.useState(0);
	const refresh = React.useCallback(() => setVersion((v) => v + 1), []);

	React.useEffect(() => {
		if (!coId || !date || branchId == null || !spell) {
			setStatus({ locked: false, reprocess_needed: false });
			return;
		}
		let cancelled = false;
		setLoading(true);
		const url =
			`${apiRoutesPortalMasters.SPINNING_PROCESS_STATUS}?co_id=${coId}` +
			`&branch_id=${branchId}&tran_date=${date}&spell=${spell}`;
		void fetchWithCookie<{ data: SpinningProcessStatus }>(url, "GET").then(({ data }) => {
			if (cancelled) return;
			setStatus(data?.data ?? { locked: false, reprocess_needed: false });
			setLoading(false);
		});
		return () => {
			cancelled = true;
		};
	}, [coId, branchId, date, spell, version, refreshKey]);

	return { status, loading, refresh };
}
