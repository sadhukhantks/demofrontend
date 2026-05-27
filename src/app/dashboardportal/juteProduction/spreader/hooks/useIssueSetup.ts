"use client";

import * as React from "react";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import type { IssueSetup, IssueAvailableWeightsResponse, SpreaderIssueRow } from "../types/spreaderTypes";

export function useIssueSetup(coId: string | null | undefined) {
	const [setup, setSetup] = React.useState<IssueSetup | null>(null);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [version, setVersion] = React.useState(0);

	const refresh = React.useCallback(() => setVersion((v) => v + 1), []);

	React.useEffect(() => {
		if (!coId) return;
		let cancelled = false;
		setLoading(true);
		const url = `${apiRoutesPortalMasters.SPREADER_ISSUE_CREATE_SETUP}?co_id=${coId}`;
		void fetchWithCookie<{ data: IssueSetup }>(url, "GET").then(({ data, error: err }) => {
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
	}, [coId, version]);

	return { setup, loading, error, refresh };
}

export function useAvailableWeights(coId: string | null | undefined, entryIdGrp: number | null) {
	const [data, setData] = React.useState<IssueAvailableWeightsResponse | null>(null);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);

	React.useEffect(() => {
		if (!coId || !entryIdGrp) {
			setData(null);
			return;
		}
		let cancelled = false;
		setLoading(true);
		const url = `${apiRoutesPortalMasters.SPREADER_ISSUE_AVAILABLE_WEIGHTS}?co_id=${coId}&entry_id_grp=${entryIdGrp}`;
		void fetchWithCookie<{ data: IssueAvailableWeightsResponse }>(url, "GET").then(({ data: resp, error: err }) => {
			if (cancelled) return;
			if (err) {
				setError(err);
				setData(null);
			} else {
				setError(null);
				setData(resp?.data ?? null);
			}
			setLoading(false);
		});
		return () => {
			cancelled = true;
		};
	}, [coId, entryIdGrp]);

	return { data, loading, error };
}

export function useIssuesByDate(coId: string | null | undefined, issueDate: string) {
	const [rows, setRows] = React.useState<SpreaderIssueRow[]>([]);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [version, setVersion] = React.useState(0);
	const refresh = React.useCallback(() => setVersion((v) => v + 1), []);

	React.useEffect(() => {
		if (!coId || !issueDate) {
			setRows([]);
			return;
		}
		let cancelled = false;
		setLoading(true);
		const url = `${apiRoutesPortalMasters.SPREADER_ISSUES_BY_DATE}?co_id=${coId}&issue_date=${issueDate}`;
		void fetchWithCookie<{ data: SpreaderIssueRow[] }>(url, "GET").then(({ data, error: err }) => {
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
	}, [coId, issueDate, version]);

	return { rows, loading, error, refresh };
}
