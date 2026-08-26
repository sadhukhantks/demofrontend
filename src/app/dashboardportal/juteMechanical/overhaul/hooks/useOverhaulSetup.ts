"use client";

import * as React from "react";
import {
	fetchMechMachineAttrTable,
	fetchOverhaulSetup,
	type MechMachineAttr,
	type MechOverhaulSetup,
} from "@/utils/juteMechanicalService";

/**
 * Dropdown data for the Overhaul Register, plus the maintenance-attribute row of
 * every machine.
 *
 * WHY TWO CALLS: `/overhaul_create_setup` returns machines, vendor parties and the
 * two enums — but NOT `overhaul_freq_months`, which lives on the machine-attribute
 * master and is what turns an overhaul into a `next_overhaul_due`. Without it the
 * screen cannot tell the user that the machine they just picked has no interval
 * configured, and the due date would silently save blank. `/machine_attr_table` is
 * driven FROM `machine_mst` with a LEFT JOIN, so one unpaginated call returns every
 * machine with its attributes where they exist (NULL where they do not), which is
 * exactly the lookup this screen needs.
 */
export interface UseOverhaulSetupResult {
	setup: MechOverhaulSetup | null;
	/** machine_id -> its maintenance attributes (absent when the machine has no attr row). */
	attrByMachine: ReadonlyMap<number, MechMachineAttr>;
	loading: boolean;
	error: string | null;
	refresh: () => Promise<void>;
}

/** One page big enough to hold the mill's whole machine list in a single call. */
const ALL_MACHINES_LIMIT = 5000;

const EMPTY_ATTR_MAP: ReadonlyMap<number, MechMachineAttr> = Object.freeze(
	new Map<number, MechMachineAttr>(),
);

export function useOverhaulSetup(
	coId: string | null | undefined,
	branchId: number | null,
): UseOverhaulSetupResult {
	const [setup, setSetup] = React.useState<MechOverhaulSetup | null>(null);
	const [attrByMachine, setAttrByMachine] =
		React.useState<ReadonlyMap<number, MechMachineAttr>>(EMPTY_ATTR_MAP);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);

	const refresh = React.useCallback(async () => {
		if (!coId || branchId == null) {
			setSetup(null);
			setAttrByMachine(EMPTY_ATTR_MAP);
			return;
		}
		setLoading(true);
		setError(null);
		try {
			const [setupData, attrPage] = await Promise.all([
				fetchOverhaulSetup({ coId: Number(coId), branchId }),
				fetchMechMachineAttrTable({
					coId: Number(coId),
					branchId,
					page: 1,
					limit: ALL_MACHINES_LIMIT,
				}),
			]);
			const map = new Map<number, MechMachineAttr>();
			attrPage.data.forEach((row) => map.set(row.machine_id, row));
			setSetup(setupData);
			setAttrByMachine(map);
		} catch (err) {
			setSetup(null);
			setAttrByMachine(EMPTY_ATTR_MAP);
			setError(err instanceof Error ? err.message : "Failed to load overhaul setup");
		} finally {
			setLoading(false);
		}
	}, [coId, branchId]);

	React.useEffect(() => {
		void refresh();
	}, [refresh]);

	return { setup, attrByMachine, loading, error, refresh };
}

export default useOverhaulSetup;
