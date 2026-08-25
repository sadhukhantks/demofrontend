"use client";

import * as React from "react";
import { fetchReasonsByMachine, type MechReason } from "@/utils/juteMechanicalService";

/** Stable empty list so consumers' memo dependencies never churn. */
const EMPTY_REASONS: ReadonlyArray<MechReason> = Object.freeze([]);

export interface ReasonsByMachineState {
	/** Codes for this machine's type PLUS every global code, ordered by code. */
	reasons: ReadonlyArray<MechReason>;
	loading: boolean;
	error: string | null;
}

/**
 * The screen's most important interaction: the reason dropdown is scoped to the
 * chosen machine.
 *
 * `/reasons_by_machine` returns the codes registered against that machine's
 * `machine_type_id` plus every global (`machine_type_id IS NULL`) code — the
 * read-side twin of the backend's save-time gate, which rejects a Spreader code
 * logged against a Draw Head. So the list MUST be refetched whenever the machine
 * changes, and the caller must reset the selected reason at the same time (a
 * code valid for the old machine may not exist for the new one).
 *
 * Passing `machineId = null` clears the list without a request.
 */
export function useReasonsByMachine(
	coId: string | null | undefined,
	machineId: number | null
): ReasonsByMachineState {
	const [reasons, setReasons] = React.useState<ReadonlyArray<MechReason>>(EMPTY_REASONS);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);

	React.useEffect(() => {
		if (!coId || machineId == null) {
			setReasons(EMPTY_REASONS);
			setError(null);
			setLoading(false);
			return;
		}

		let cancelled = false;
		setLoading(true);
		setError(null);

		fetchReasonsByMachine({ coId: Number(coId), machineId })
			.then((rows) => {
				if (cancelled) return;
				setReasons(rows ?? EMPTY_REASONS);
			})
			.catch((err: unknown) => {
				if (cancelled) return;
				setReasons(EMPTY_REASONS);
				setError(
					err instanceof Error && err.message ? err.message : "Failed to load reason codes"
				);
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [coId, machineId]);

	return { reasons, loading, error };
}

export default useReasonsByMachine;
