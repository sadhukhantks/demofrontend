"use client";

import * as React from "react";
import {
	fetchBreakdownSetup,
	type MechBreakdownSetup,
} from "@/utils/juteMechanicalService";
import { fetchItemSearch } from "@/utils/itemSearchService";
import {
	EMPTY_SPARE_ITEMS,
	EMPTY_UOMS,
	type SpareItemOption,
	type UomOption,
} from "../types/breakdownTypes";

/**
 * How many stores items to pull for the spares picker. `SearchableSelect` caps
 * what it RENDERS at 200 and filters by typed text, so a generous single fetch
 * keeps the line editor instant without a per-keystroke round trip.
 */
const SPARE_ITEM_LIMIT = 2000;

/** Everything the entry screen's dropdowns need. */
export interface BreakdownSetupState {
	/** Machines, spells, components, crews and the three enums. */
	setup: MechBreakdownSetup | null;
	/** Stores items offered on spare lines (from the shared item-search API). */
	spareItems: ReadonlyArray<SpareItemOption>;
	/** Distinct units of measure a spare line can be booked in. */
	uoms: ReadonlyArray<UomOption>;
	loading: boolean;
	/** Fatal — the form cannot render without its dropdowns. */
	error: string | null;
	/** Non-fatal — spares are optional, so the form still works without items. */
	itemsError: string | null;
	refresh: () => void;
}

function messageOf(err: unknown, fallback: string): string {
	return err instanceof Error && err.message ? err.message : fallback;
}

/**
 * Loads the breakdown entry screen's dropdown data.
 *
 * Reason codes are deliberately NOT here: they depend on the chosen machine's
 * type and are fetched per machine by `useReasonsByMachine`.
 *
 * The spare-item list is also not part of `entry_create_setup` — the backend's
 * setup payload carries no items — so it comes from the shared item-search
 * service and is treated as a soft dependency: a failure there disables the
 * spares picker but never blocks logging the downtime, which is the point of
 * the screen.
 */
export function useBreakdownSetup(
	coId: string | null | undefined,
	branchId: number | null
): BreakdownSetupState {
	const [setup, setSetup] = React.useState<MechBreakdownSetup | null>(null);
	const [spareItems, setSpareItems] =
		React.useState<ReadonlyArray<SpareItemOption>>(EMPTY_SPARE_ITEMS);
	const [uoms, setUoms] = React.useState<ReadonlyArray<UomOption>>(EMPTY_UOMS);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [itemsError, setItemsError] = React.useState<string | null>(null);
	const [version, setVersion] = React.useState(0);

	const refresh = React.useCallback(() => setVersion((v) => v + 1), []);

	React.useEffect(() => {
		if (!coId) {
			setSetup(null);
			setSpareItems(EMPTY_SPARE_ITEMS);
			setUoms(EMPTY_UOMS);
			return;
		}

		// Captured so the narrowing above survives into the async closure.
		const companyId: string = coId;
		let cancelled = false;
		setLoading(true);
		setError(null);
		setItemsError(null);

		const load = async () => {
			try {
				const data = await fetchBreakdownSetup({ coId: Number(companyId), branchId });
				if (cancelled) return;
				setSetup(data);
			} catch (err) {
				if (cancelled) return;
				setSetup(null);
				setError(messageOf(err, "Failed to load breakdown setup"));
			} finally {
				if (!cancelled) setLoading(false);
			}

			try {
				const items = await fetchItemSearch(companyId, {
					limit: SPARE_ITEM_LIMIT,
					filter: "purchaseable",
				});
				if (cancelled) return;

				const options: SpareItemOption[] = items.data.map((item) => ({
					item_id: item.item_id,
					label: item.item_code ? `${item.item_code} — ${item.item_name}` : item.item_name,
					uom_id: item.uom_id ?? null,
					uom_name: item.uom_name ?? null,
				}));

				// Distinct UOMs, gathered from both the items' base units and the
				// alternate-unit mappings the search endpoint returns alongside them.
				const uomMap = new Map<number, string>();
				items.data.forEach((item) => {
					if (item.uom_id != null && item.uom_name) uomMap.set(item.uom_id, item.uom_name);
				});
				items.uoms.forEach((mapping) => {
					if (mapping.map_to_id != null && mapping.uom_name) {
						uomMap.set(mapping.map_to_id, mapping.uom_name);
					}
				});

				setSpareItems(options);
				setUoms(
					Array.from(uomMap, ([uom_id, uom_name]) => ({ uom_id, uom_name })).sort((a, b) =>
						a.uom_name.localeCompare(b.uom_name)
					)
				);
			} catch (err) {
				if (cancelled) return;
				setSpareItems(EMPTY_SPARE_ITEMS);
				setUoms(EMPTY_UOMS);
				setItemsError(messageOf(err, "Failed to load spare items"));
			}
		};

		void load();
		return () => {
			cancelled = true;
		};
	}, [coId, branchId, version]);

	return { setup, spareItems, uoms, loading, error, itemsError, refresh };
}

export default useBreakdownSetup;
