"use client";

import * as React from "react";
import {
	closeBreakdown,
	fetchOpenBreakdowns,
	type MechOpenBreakdown,
} from "@/utils/juteMechanicalService";
import type { BreakdownCloseBody } from "../types/breakdownTypes";
import { elapsedMinutes } from "../utils/breakdownCalc";

/** Stable empty list so consumers' memo dependencies never churn. */
const EMPTY_OPEN: ReadonlyArray<OpenBreakdownRow> = Object.freeze([]);

/** How often the board re-pulls from the server. */
const REFETCH_MS = 60_000;

/** How often the elapsed counters tick between server pulls. */
const TICK_MS = 30_000;

/**
 * An open incident with a client-side elapsed counter.
 *
 * `elapsed_min` from the server is a snapshot taken at read time; `live_elapsed_min`
 * keeps counting between refreshes so the board stays honest on a screen that is
 * left open all shift.
 */
export interface OpenBreakdownRow extends MechOpenBreakdown {
	live_elapsed_min: number | null;
}

export type CloseResult = { ok: true } | { ok: false; error: string };

export interface OpenBreakdownsState {
	/** Currently-open incidents, longest-running first. */
	rows: ReadonlyArray<OpenBreakdownRow>;
	loading: boolean;
	error: string | null;
	refresh: () => void;
	/** Quick close from the board: restart datetime (+ optional action taken). */
	closeEntry: (breakdownId: number, body: BreakdownCloseBody) => Promise<CloseResult>;
	closing: boolean;
}

function messageOf(err: unknown, fallback: string): string {
	return err instanceof Error && err.message ? err.message : fallback;
}

/**
 * The live open-breakdown board.
 *
 * An incident is "open" purely because its `restart_datetime` is NULL — which is
 * why leaving Restart blank on the entry form is normal and meaningful rather
 * than an incomplete entry. The board polls so a machine that went down on
 * another terminal shows up without a manual reload.
 */
export function useOpenBreakdowns(
	coId: string | null | undefined,
	branchId: number | null
): OpenBreakdownsState {
	const [raw, setRaw] = React.useState<ReadonlyArray<MechOpenBreakdown>>(Object.freeze([]));
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [closing, setClosing] = React.useState(false);
	const [version, setVersion] = React.useState(0);
	const [now, setNow] = React.useState<Date>(() => new Date());

	const refresh = React.useCallback(() => setVersion((v) => v + 1), []);

	// Server pull: on mount, on every filter change, and on a slow poll.
	React.useEffect(() => {
		if (!coId) {
			setRaw(Object.freeze([]));
			return;
		}

		let cancelled = false;

		const load = (showSpinner: boolean) => {
			if (showSpinner) setLoading(true);
			fetchOpenBreakdowns({ coId: Number(coId), branchId })
				.then((result) => {
					if (cancelled) return;
					setRaw(result.data);
					setError(null);
				})
				.catch((err: unknown) => {
					if (cancelled) return;
					setRaw(Object.freeze([]));
					setError(messageOf(err, "Failed to load open breakdowns"));
				})
				.finally(() => {
					if (!cancelled && showSpinner) setLoading(false);
				});
		};

		load(true);
		const poll = window.setInterval(() => load(false), REFETCH_MS);
		return () => {
			cancelled = true;
			window.clearInterval(poll);
		};
	}, [coId, branchId, version]);

	// Local clock so the elapsed counters advance between server pulls.
	React.useEffect(() => {
		const tick = window.setInterval(() => setNow(new Date()), TICK_MS);
		return () => window.clearInterval(tick);
	}, []);

	const rows = React.useMemo<ReadonlyArray<OpenBreakdownRow>>(() => {
		if (raw.length === 0) return EMPTY_OPEN;
		return raw
			.map((row) => ({
				...row,
				// Prefer the locally recomputed figure; fall back to the server
				// snapshot when stop_datetime cannot be parsed.
				live_elapsed_min: elapsedMinutes(row.stop_datetime, now) ?? row.elapsed_min,
			}))
			.sort((a, b) => (b.live_elapsed_min ?? 0) - (a.live_elapsed_min ?? 0));
	}, [raw, now]);

	const closeEntry = React.useCallback(
		async (breakdownId: number, body: BreakdownCloseBody): Promise<CloseResult> => {
			setClosing(true);
			try {
				await closeBreakdown(breakdownId, body);
				return { ok: true };
			} catch (err) {
				return { ok: false, error: messageOf(err, "Failed to close the breakdown") };
			} finally {
				setClosing(false);
			}
		},
		[]
	);

	return { rows, loading, error, refresh, closeEntry, closing };
}

export default useOpenBreakdowns;
