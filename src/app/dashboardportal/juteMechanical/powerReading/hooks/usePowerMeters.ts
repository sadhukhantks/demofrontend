"use client";

import * as React from "react";
import {
	createPowerMeter,
	fetchPowerMeters,
	updatePowerMeter,
	type MechEnumOption,
	type MechPowerMeter,
	type MechPowerMeterPayload,
} from "@/utils/juteMechanicalService";

/** Stable empty lists so consumers' memo dependencies never churn. */
const EMPTY_METERS: ReadonlyArray<MechPowerMeter> = Object.freeze([]);
const EMPTY_TYPES: ReadonlyArray<MechEnumOption> = Object.freeze([]);

/** Result of a write, so callers can branch without try/catch at every site. */
export type PowerMutationResult = { ok: true; id: number | null } | { ok: false; error: string };

export interface PowerMetersState {
	/** Every meter of the branch, inactive ones included (the dialog manages them). */
	meters: ReadonlyArray<MechPowerMeter>;
	/** GRID / DG / SOLAR, as served by the backend. */
	meterTypes: ReadonlyArray<MechEnumOption>;
	loading: boolean;
	error: string | null;
	refresh: () => void;
	create: (body: MechPowerMeterPayload) => Promise<PowerMutationResult>;
	update: (powerMeterId: number, body: MechPowerMeterPayload) => Promise<PowerMutationResult>;
	saving: boolean;
}

function messageOf(err: unknown, fallback: string): string {
	return err instanceof Error && err.message ? err.message : fallback;
}

/**
 * The branch's power-meter master (`jute_power_meter_mst`) and its two writes.
 *
 * Inactive meters are loaded too: the dialog must be able to reactivate one,
 * and the entry grid needs the name of a meter that still has a saved reading
 * for the day. There is no delete — a meter is deactivated and its readings
 * keep their meter_code.
 */
export function usePowerMeters(
	coId: string | null | undefined,
	branchId: number | null
): PowerMetersState {
	const [meters, setMeters] = React.useState<ReadonlyArray<MechPowerMeter>>(EMPTY_METERS);
	const [meterTypes, setMeterTypes] = React.useState<ReadonlyArray<MechEnumOption>>(EMPTY_TYPES);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [saving, setSaving] = React.useState(false);
	const [version, setVersion] = React.useState(0);

	const refresh = React.useCallback(() => setVersion((v) => v + 1), []);

	React.useEffect(() => {
		if (!coId || branchId == null) {
			setMeters(EMPTY_METERS);
			setMeterTypes(EMPTY_TYPES);
			return;
		}

		let cancelled = false;
		setLoading(true);
		setError(null);

		fetchPowerMeters({ coId: Number(coId), branchId, includeInactive: true })
			.then((result) => {
				if (cancelled) return;
				setMeters(result.data);
				setMeterTypes(result.meter_types);
			})
			.catch((err: unknown) => {
				if (cancelled) return;
				setMeters(EMPTY_METERS);
				setError(messageOf(err, "Failed to load the power meters"));
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [coId, branchId, version]);

	const create = React.useCallback(
		async (body: MechPowerMeterPayload): Promise<PowerMutationResult> => {
			setSaving(true);
			try {
				const result = await createPowerMeter(body);
				return { ok: true, id: result.power_meter_id ?? null };
			} catch (err) {
				return { ok: false, error: messageOf(err, "Failed to save the meter") };
			} finally {
				setSaving(false);
			}
		},
		[]
	);

	const update = React.useCallback(
		async (powerMeterId: number, body: MechPowerMeterPayload): Promise<PowerMutationResult> => {
			setSaving(true);
			try {
				const result = await updatePowerMeter(powerMeterId, body);
				return { ok: true, id: result.power_meter_id ?? powerMeterId };
			} catch (err) {
				return { ok: false, error: messageOf(err, "Failed to update the meter") };
			} finally {
				setSaving(false);
			}
		},
		[]
	);

	return { meters, meterTypes, loading, error, refresh, create, update, saving };
}

export default usePowerMeters;
