// Auto-fill for the Jute Market Rate page: rate(item) = rate(base item) + diff, chained
// (TD-7 from TD-6 from TD-5). Items the user typed a rate for ("manual") are never overwritten.

export type DiffItem = { item_id: number; base_item_id: number | null; diff_amount: number | null };

const round3 = (n: number) => Math.round(n * 1000) / 1000;

const toNum = (s: string | undefined): number | null => {
	if (s == null || s.trim() === "") return null;
	const n = Number(s);
	return Number.isFinite(n) ? n : null;
};

/** Returns the full rate map with every non-manual derived item recomputed. */
export function deriveRates(items: DiffItem[], rates: Record<number, string>, manual: Set<number>): Record<number, string> {
	const byId = new Map(items.map((i) => [i.item_id, i]));
	const memo = new Map<number, number | null>();

	const resolve = (id: number, path: Set<number>): number | null => {
		if (memo.has(id)) return memo.get(id)!;
		const it = byId.get(id);
		let val: number | null;
		if (!it || it.base_item_id == null || it.diff_amount == null || manual.has(id) || path.has(id)) {
			val = toNum(rates[id]);
		} else {
			path.add(id);
			const base = resolve(it.base_item_id, path);
			path.delete(id);
			val = base == null ? null : round3(base + it.diff_amount);
		}
		memo.set(id, val);
		return val;
	};

	const out = { ...rates };
	for (const it of items) {
		if (it.base_item_id == null || manual.has(it.item_id)) continue;
		const v = resolve(it.item_id, new Set());
		out[it.item_id] = v == null ? "" : String(v);
	}
	return out;
}

/** On load: a saved rate counts as manual unless it equals saved(base) + diff. */
export function initialManual(items: DiffItem[], saved: Record<number, number | null>): Set<number> {
	const manual = new Set<number>();
	for (const it of items) {
		const v = saved[it.item_id];
		if (v == null) continue;
		const base = it.base_item_id != null ? saved[it.base_item_id] : null;
		if (base == null || it.diff_amount == null || round3(base + it.diff_amount) !== round3(v)) manual.add(it.item_id);
	}
	return manual;
}
