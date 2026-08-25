"use client";

import * as React from "react";
import {
	fetchMachineHistoryReport,
	fetchMechMachineAttrTable,
	type MechMachineAttr,
} from "@/utils/juteMechanicalService";
import type { MachineHistoryPayload, MachineHistorySummary } from "../types/machineHistoryTypes";
import {
	EMPTY_MACHINE_HISTORY,
	buildMachineHistorySummary,
	parseMachineHistoryPayload,
} from "../types/machineHistoryTypes";

/** Date-range narrowing for the history panels; "" on both sides means all time. */
export interface MachineHistoryRange {
	dateFrom: string;
	dateTo: string;
}

export interface UseMachineHistoryResult {
	/** Machine picker options, with each machine's maintenance attributes attached. */
	machines: MechMachineAttr[];
	machinesLoading: boolean;
	machinesError: string | null;
	payload: MachineHistoryPayload;
	summary: MachineHistorySummary;
	loading: boolean;
	error: string | null;
	refresh: () => Promise<void>;
}

/** One page big enough to hold the mill's whole machine list in a single call. */
const ALL_MACHINES_LIMIT = 5000;

const EMPTY_MACHINES: ReadonlyArray<MechMachineAttr> = Object.freeze([]);

/**
 * One machine, everything.
 *
 * TWO SOURCES:
 *  - `/machine_attr_table` supplies the machine picker. It is driven FROM
 *    `machine_mst` with a LEFT JOIN, so it lists every active machine whether or
 *    not anyone has filled in its maintenance attributes — and it carries those
 *    attributes (criticality, intervals, last/next dates) in the same call, which
 *    the picker uses to annotate the options.
 *  - `/machine-history` supplies the four panels. `machine_id` is REQUIRED by that
 *    report, so the hook stays idle until a machine is chosen.
 *
 * SHAPE NOTE: `fetchMachineHistoryReport` is declared as returning a flat row list
 * but the endpoint actually returns `{machine, breakdowns, pm_executions, overhauls,
 * spares}` under `data`. The result is routed through `unknown` into
 * `parseMachineHistoryPayload`, which narrows it with real guards — see the header
 * of `types/machineHistoryTypes.ts`.
 */
export function useMachineHistory(
	coId: string | null | undefined,
	branchId: number | null,
	machineId: number | null,
	range: MachineHistoryRange,
): UseMachineHistoryResult {
	const [machines, setMachines] = React.useState<MechMachineAttr[]>([...EMPTY_MACHINES]);
	const [machinesLoading, setMachinesLoading] = React.useState(false);
	const [machinesError, setMachinesError] = React.useState<string | null>(null);

	const [payload, setPayload] = React.useState<MachineHistoryPayload>(EMPTY_MACHINE_HISTORY);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);

	const { dateFrom, dateTo } = range;

	// Guards against an older, slower response overwriting a newer machine choice.
	const requestRef = React.useRef(0);

	React.useEffect(() => {
		let cancelled = false;
		async function loadMachines() {
			if (!coId || branchId == null) {
				setMachines([...EMPTY_MACHINES]);
				return;
			}
			setMachinesLoading(true);
			setMachinesError(null);
			try {
				const result = await fetchMechMachineAttrTable({
					coId: Number(coId),
					branchId,
					page: 1,
					limit: ALL_MACHINES_LIMIT,
				});
				if (cancelled) return;
				setMachines(result.data);
			} catch (err) {
				if (cancelled) return;
				setMachines([...EMPTY_MACHINES]);
				setMachinesError(
					err instanceof Error ? err.message : "Failed to load the machine list",
				);
			} finally {
				if (!cancelled) setMachinesLoading(false);
			}
		}
		void loadMachines();
		return () => {
			cancelled = true;
		};
	}, [coId, branchId]);

	const refresh = React.useCallback(async () => {
		if (!coId || machineId == null) {
			setPayload(EMPTY_MACHINE_HISTORY);
			return;
		}
		const requestId = requestRef.current + 1;
		requestRef.current = requestId;
		setLoading(true);
		setError(null);
		try {
			const result = await fetchMachineHistoryReport({
				coId: Number(coId),
				branchId,
				machineId,
				dateFrom: dateFrom || undefined,
				dateTo: dateTo || undefined,
			});
			if (requestRef.current !== requestId) return;
			// The declared row-array type does not match the endpoint; narrow honestly.
			const raw: unknown = result.data;
			setPayload(parseMachineHistoryPayload(raw));
		} catch (err) {
			if (requestRef.current !== requestId) return;
			setPayload(EMPTY_MACHINE_HISTORY);
			setError(err instanceof Error ? err.message : "Failed to load the machine history");
		} finally {
			if (requestRef.current === requestId) setLoading(false);
		}
	}, [coId, branchId, machineId, dateFrom, dateTo]);

	React.useEffect(() => {
		void refresh();
	}, [refresh]);

	const summary = React.useMemo(() => buildMachineHistorySummary(payload), [payload]);

	return {
		machines,
		machinesLoading,
		machinesError,
		payload,
		summary,
		loading,
		error,
		refresh,
	};
}

export default useMachineHistory;
