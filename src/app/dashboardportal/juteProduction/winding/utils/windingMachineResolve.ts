import type { WindingQualityRow } from "../types/windingTypes";

// The doff form's optional machine shortcut. Entry stays PERSON-keyed — the
// machine is never saved; it is only a lookup into the SAME person -> quality
// map the form already shows (Quality tab rows for this date + spell), so it
// can only ever fill in what the operator would have clicked by hand.
// Anything ambiguous is refused with a message naming the fix, and 2+ winders
// on one machine fills the quality only (picking people for the operator would
// silently split the weighing).
export type MachineResolution =
	| { kind: "ok"; itemId: number; ebIds: number[]; warn: string | null }
	| { kind: "error"; message: string };

export function resolveMachinePick(
	rows: WindingQualityRow[],
	machineId: number,
	machineLabel: string,
): MachineResolution {
	const hits = rows.filter((r) => r.machine_id === machineId);
	if (hits.length === 0) {
		return {
			kind: "error",
			message: `No winder mapped to machine ${machineLabel} for this date and spell. Set the EB no and machine in the Quality tab.`,
		};
	}

	// Insertion-ordered so the "different qualities" message reads in map order.
	const qualities = new Map<number, string>();
	hits.forEach((r) => {
		if (r.item_id == null || qualities.has(r.item_id)) return;
		qualities.set(r.item_id, r.item_code ?? String(r.item_id));
	});
	if (qualities.size === 0) {
		return {
			kind: "error",
			message: `Winder(s) on machine ${machineLabel} have no yarn quality mapped. Set the quality in the Quality tab.`,
		};
	}
	if (qualities.size > 1) {
		return {
			kind: "error",
			message: `Machine ${machineLabel} has winders on different qualities (${Array.from(qualities.values()).join(", ")}). Pick the quality manually.`,
		};
	}

	const itemId = qualities.keys().next().value as number;
	const ebIds = Array.from(
		new Set(
			hits
				.filter((r) => r.item_id === itemId && r.eb_id != null)
				.map((r) => r.eb_id as number),
		),
	);
	if (ebIds.length === 1) return { kind: "ok", itemId, ebIds, warn: null };
	return {
		kind: "ok",
		itemId,
		ebIds: [],
		warn:
			ebIds.length === 0
				? `No EB no on machine ${machineLabel}'s quality row — quality filled, pick the EB no.`
				: `${ebIds.length} winders mapped to machine ${machineLabel} — quality filled, pick the EB no.`,
	};
}
