"use client";

import * as React from "react";
import {
	createBreakdown,
	deleteBreakdown,
	fetchBreakdownById,
	fetchBreakdownEntries,
	updateBreakdown,
	type MechBreakdown,
	type MechBreakdownCreate,
	type MechBreakdownDetail,
} from "@/utils/juteMechanicalService";

/** Stable empty list so consumers' memo dependencies never churn. */
const EMPTY_ROWS: ReadonlyArray<MechBreakdown> = Object.freeze([]);

/** One page of the grid. The backend caps `limit` at 1000. */
const PAGE_LIMIT = 500;

/** Result of a write, so callers can branch without try/catch at every site. */
export type BreakdownMutationResult =
	| { ok: true; breakdownId: number | null }
	| { ok: false; error: string };

export interface BreakdownEntriesParams {
	coId: string | null | undefined;
	branchId: number | null;
	dateFrom: string;
	dateTo: string;
	machineId: number | null;
	status: string | null;
	discipline: string | null;
}

export interface BreakdownEntriesState {
	rows: ReadonlyArray<MechBreakdown>;
	total: number;
	loading: boolean;
	error: string | null;
	refresh: () => void;
	/** Full record (header + spares) for lifting a grid row into the form. */
	loadEntry: (breakdownId: number) => Promise<MechBreakdownDetail | null>;
	/** Create when `breakdownId` is null, otherwise edit that incident. */
	saveEntry: (
		payload: MechBreakdownCreate,
		breakdownId: number | null
	) => Promise<BreakdownMutationResult>;
	removeEntry: (breakdownId: number) => Promise<BreakdownMutationResult>;
	saving: boolean;
	deleting: boolean;
}

function messageOf(err: unknown, fallback: string): string {
	return err instanceof Error && err.message ? err.message : fallback;
}

/**
 * The day/range incident grid plus its writes.
 *
 * There is NO approval workflow on this module — `saveEntry` persists directly,
 * because downtime logging has to be fast. `status` on the returned rows tracks
 * the REPAIR (OPEN / UNDER_REPAIR / CLOSED), not a document lifecycle, and is
 * derived by the backend from the incident's datetimes.
 */
export function useBreakdownEntries(params: BreakdownEntriesParams): BreakdownEntriesState {
	const { coId, branchId, dateFrom, dateTo, machineId, status, discipline } = params;

	const [rows, setRows] = React.useState<ReadonlyArray<MechBreakdown>>(EMPTY_ROWS);
	const [total, setTotal] = React.useState(0);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [saving, setSaving] = React.useState(false);
	const [deleting, setDeleting] = React.useState(false);
	const [version, setVersion] = React.useState(0);

	const refresh = React.useCallback(() => setVersion((v) => v + 1), []);

	React.useEffect(() => {
		if (!coId || !dateFrom || !dateTo) {
			setRows(EMPTY_ROWS);
			setTotal(0);
			return;
		}

		let cancelled = false;
		setLoading(true);
		setError(null);

		fetchBreakdownEntries({
			coId: Number(coId),
			branchId,
			dateFrom,
			dateTo,
			machineId,
			status,
			discipline,
			page: 1,
			limit: PAGE_LIMIT,
		})
			.then((result) => {
				if (cancelled) return;
				setRows(result.data);
				setTotal(result.total);
			})
			.catch((err: unknown) => {
				if (cancelled) return;
				setRows(EMPTY_ROWS);
				setTotal(0);
				setError(messageOf(err, "Failed to load breakdown entries"));
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [coId, branchId, dateFrom, dateTo, machineId, status, discipline, version]);

	const loadEntry = React.useCallback(
		async (breakdownId: number): Promise<MechBreakdownDetail | null> => {
			if (!coId) return null;
			try {
				return await fetchBreakdownById(breakdownId, Number(coId));
			} catch (err) {
				setError(messageOf(err, `Failed to load breakdown #${breakdownId}`));
				return null;
			}
		},
		[coId]
	);

	const saveEntry = React.useCallback(
		async (
			payload: MechBreakdownCreate,
			breakdownId: number | null
		): Promise<BreakdownMutationResult> => {
			setSaving(true);
			try {
				const result =
					breakdownId == null
						? await createBreakdown(payload)
						: await updateBreakdown(breakdownId, payload);
				return { ok: true, breakdownId: result.breakdown_id ?? breakdownId };
			} catch (err) {
				return { ok: false, error: messageOf(err, "Failed to save the breakdown entry") };
			} finally {
				setSaving(false);
			}
		},
		[]
	);

	const removeEntry = React.useCallback(
		async (breakdownId: number): Promise<BreakdownMutationResult> => {
			if (!coId) return { ok: false, error: "Select a company first" };
			setDeleting(true);
			try {
				await deleteBreakdown(breakdownId, Number(coId));
				return { ok: true, breakdownId };
			} catch (err) {
				return { ok: false, error: messageOf(err, "Failed to delete the breakdown entry") };
			} finally {
				setDeleting(false);
			}
		},
		[coId]
	);

	return {
		rows,
		total,
		loading,
		error,
		refresh,
		loadEntry,
		saveEntry,
		removeEntry,
		saving,
		deleting,
	};
}

export default useBreakdownEntries;
