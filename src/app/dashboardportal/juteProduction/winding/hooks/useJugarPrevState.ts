"use client";

import * as React from "react";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import type { WindingJugarPrevState } from "../types/windingTypes";

// WINDING_JUGAR_PREV_STATE — carry-forward weight + existing-row id for the
// chosen machine/date/spell/open-close. Passing the current `spell_id` lets the
// BE return winding_jugar_id when a row already exists, so the form toggles
// Save -> Update. No-ops while !coId / no machine / no date / no open-close.
export function useJugarPrevState(
	coId: string | null | undefined,
	machineId: number | null,
	tranDate: string,
	openClose: "O" | "C" | "",
	spellId: number | null,
) {
	const [state, setState] = React.useState<WindingJugarPrevState | null>(null);
	const [loading, setLoading] = React.useState(false);
	const [version, setVersion] = React.useState(0);

	const refresh = React.useCallback(() => setVersion((v) => v + 1), []);

	React.useEffect(() => {
		if (!coId || machineId == null || !tranDate || !openClose) {
			setState(null);
			return;
		}
		let cancelled = false;
		setLoading(true);
		let url = `${apiRoutesPortalMasters.WINDING_JUGAR_PREV_STATE}?co_id=${coId}&machine_id=${machineId}&tran_date=${tranDate}&open_close=${openClose}`;
		if (spellId != null) url += `&spell_id=${spellId}`;
		void fetchWithCookie<{ data: WindingJugarPrevState }>(url, "GET").then(({ data }) => {
			if (cancelled) return;
			setState(data?.data ?? null);
			setLoading(false);
		});
		return () => {
			cancelled = true;
		};
	}, [coId, machineId, tranDate, openClose, spellId, version]);

	return { state, loading, refresh };
}
