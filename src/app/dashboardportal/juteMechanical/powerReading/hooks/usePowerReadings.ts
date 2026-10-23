"use client";

import * as React from "react";
import {
	deletePowerReading,
	fetchPowerReadings,
	savePowerReadings,
	type MechPowerReadingsDay,
	type MechPowerReadingsSavePayload,
	type MechPowerReadingsSaveResult,
} from "@/utils/juteMechanicalService";

export interface PowerReadingsParams {
	coId: string | null | undefined;
	branchId: number | null;
	/** YYYY-MM-DD; blank while the date input is mid-edit — no fetch then. */
	tranDate: string;
	/** null = whole day. */
	spellId: number | null;
}

/** Result of the bulk save: the server's counts and warnings, or the failure text. */
export type PowerSaveResult =
	| { ok: true; result: MechPowerReadingsSaveResult }
	| { ok: false; error: string };

export type PowerDeleteResult = { ok: true } | { ok: false; error: string };

export interface PowerReadingsState {
	/** The day's grid (one row per active meter + orphaned saved rows), or null before load. */
	day: MechPowerReadingsDay | null;
	loading: boolean;
	error: string | null;
	refresh: () => void;
	save: (payload: MechPowerReadingsSavePayload) => Promise<PowerSaveResult>;
	remove: (powerReadingId: number) => Promise<PowerDeleteResult>;
	saving: boolean;
	deleting: boolean;
}

function messageOf(err: unknown, fallback: string): string {
	return err instanceof Error && err.message ? err.message : fallback;
}

/**
 * The readings of one date + spell and their writes.
 *
 * There is NO approval workflow — `save` persists directly (bulk upsert by
 * date + spell + meter) because readings must be fast to key. The server's
 * warnings (spike, DG consistency) come back with the result and never block.
 */
export function usePowerReadings(params: PowerReadingsParams): PowerReadingsState {
	const { coId, branchId, tranDate, spellId } = params;

	const [day, setDay] = React.useState<MechPowerReadingsDay | null>(null);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [saving, setSaving] = React.useState(false);
	const [deleting, setDeleting] = React.useState(false);
	const [version, setVersion] = React.useState(0);
	const requestNo = React.useRef(0);

	const refresh = React.useCallback(() => setVersion((v) => v + 1), []);

	React.useEffect(() => {
		if (!coId || branchId == null || !tranDate) {
			setDay(null);
			return;
		}

		let cancelled = false;
		const mine = ++requestNo.current;
		setLoading(true);
		setError(null);

		fetchPowerReadings({ coId: Number(coId), branchId, tranDate, spellId })
			.then((result) => {
				// A date change fires at once, so a slower earlier request must not
				// overwrite a newer answer.
				if (cancelled || mine !== requestNo.current) return;
				setDay(result);
			})
			.catch((err: unknown) => {
				if (cancelled || mine !== requestNo.current) return;
				setDay(null);
				setError(messageOf(err, "Failed to load the power readings"));
			})
			.finally(() => {
				if (!cancelled && mine === requestNo.current) setLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [coId, branchId, tranDate, spellId, version]);

	const save = React.useCallback(
		async (payload: MechPowerReadingsSavePayload): Promise<PowerSaveResult> => {
			setSaving(true);
			try {
				const result = await savePowerReadings(payload);
				return { ok: true, result };
			} catch (err) {
				return { ok: false, error: messageOf(err, "Failed to save the power readings") };
			} finally {
				setSaving(false);
			}
		},
		[]
	);

	const remove = React.useCallback(
		async (powerReadingId: number): Promise<PowerDeleteResult> => {
			if (!coId) return { ok: false, error: "Select a company first" };
			setDeleting(true);
			try {
				await deletePowerReading(powerReadingId, Number(coId));
				return { ok: true };
			} catch (err) {
				return { ok: false, error: messageOf(err, "Failed to delete the reading") };
			} finally {
				setDeleting(false);
			}
		},
		[coId]
	);

	return { day, loading, error, refresh, save, remove, saving, deleting };
}

export default usePowerReadings;
