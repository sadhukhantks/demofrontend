/**
 * Weaving Loom -> Quality map bulk tools (TKT-000119) — service layer.
 *
 * Wire contract of `src/juteProduction/weaving_quality_map_bulk.py` (backend, mounted at
 * `/api/weavingProd`):
 *   - POST quality_map_carry_forward — fill looms that have no mapping in a date/spell
 *     range from their previous mapping. Existing mappings are never changed; processed
 *     (locked) spells are skipped. `dry_run: true` returns the same counts without writing.
 *   - GET  quality_map_groups — existing loom groupings of a branch (Hands Norms machine
 *     groups + Loom Groups master) for "select by group" on the map grid.
 *
 * Helpers unwrap the `{ data }` envelope and throw a plain `Error` carrying the backend's
 * message, so the caller can `try / catch`.
 */

import { z } from "zod";
import { apiRoutesPortalMasters } from "@/utils/api";
import { fetchWithCookie } from "@/utils/apiClient2";

/** Longest range one fill may cover (mirrors the backend MAX_FILL_DAYS). */
export const MAX_FILL_DAYS = 31;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");

/** Days between two ISO dates, inclusive (UTC maths — no DST drift). */
export function inclusiveDays(fromDate: string, toDate: string): number {
	const f = Date.parse(`${fromDate}T00:00:00Z`);
	const t = Date.parse(`${toDate}T00:00:00Z`);
	return Math.round((t - f) / 86_400_000) + 1;
}

/** Request schema — validated before the call (same rules the backend enforces). */
export const carryForwardRequestSchema = z
	.object({
		co_id: z.number().int().positive(),
		branch_id: z.number().int().positive(),
		from_date: isoDate,
		to_date: isoDate,
		spell_ids: z.array(z.number().int().positive()).min(1, "Pick at least one spell"),
		dry_run: z.boolean(),
		today: isoDate,
	})
	.refine((v) => v.from_date <= v.to_date, {
		message: "From date must be on or before To date",
		path: ["from_date"],
	})
	.refine((v) => v.to_date <= v.today, {
		message: "Future dates cannot be mapped",
		path: ["to_date"],
	})
	.refine((v) => inclusiveDays(v.from_date, v.to_date) <= MAX_FILL_DAYS, {
		message: `At most ${MAX_FILL_DAYS} days in one fill`,
		path: ["from_date"],
	});

export type CarryForwardRequest = z.infer<typeof carryForwardRequestSchema>;

/** Per (date, spell) counts returned by the backend. */
export type CarryForwardCell = {
	tran_date: string;
	spell_id: number;
	spell_code: string | null;
	locked: boolean;
	already_mapped: number;
	to_fill: number;
	no_previous: number;
	from_production: number;
	restamp: number;
	skipped_locked: number;
};

export type CarryForwardResult = {
	dry_run: boolean;
	filled: number;
	to_fill: number;
	restamped: number;
	cells: CarryForwardCell[];
};

/** One existing loom grouping, restricted to the branch's looms. */
export type LoomGrouping = {
	source: "machine_group" | "loom_group";
	group_id: number;
	group_code: string | null;
	group_name: string | null;
	machine_ids: number[];
};

/** First validation message, for a one-line alert. */
export function firstIssue(error: z.ZodError): string {
	return error.issues[0]?.message ?? "Invalid input";
}

/**
 * Preview (`dry_run: true`) or perform the fill. Throws on validation / backend error.
 * `today` is only used for validation and is not sent.
 */
export async function carryForwardQualityMap(input: CarryForwardRequest): Promise<CarryForwardResult> {
	const parsed = carryForwardRequestSchema.safeParse(input);
	if (!parsed.success) throw new Error(firstIssue(parsed.error));
	const { today: _today, ...body } = parsed.data;
	const { data, error } = await fetchWithCookie<{ data: CarryForwardResult }>(
		apiRoutesPortalMasters.WEAVING_QUALITY_MAP_CARRY_FORWARD,
		"POST",
		body
	);
	if (error || !data?.data) throw new Error(error ?? "Fill from previous failed");
	return data.data;
}

/** Existing loom groupings of a branch; [] when the tenant has none. */
export async function fetchLoomGroupings(coId: number, branchId: number): Promise<LoomGrouping[]> {
	const { data, error } = await fetchWithCookie<{ data: LoomGrouping[] }>(
		`${apiRoutesPortalMasters.WEAVING_QUALITY_MAP_GROUPS}?co_id=${coId}&branch_id=${branchId}`,
		"GET"
	);
	if (error) throw new Error(error);
	return data?.data ?? [];
}
