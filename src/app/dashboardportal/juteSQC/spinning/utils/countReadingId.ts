import type { SqcCountReadingRow } from "../types/sqcSpinningTypes";

/**
 * Server-side id of an R-08-16 count reading, or null when the row has not
 * been persisted with one. Used for delete — never as a grid key.
 *
 * The backend names the key `spinning_sqc_count_id` (jute_sqc_spinning_count's
 * primary key; `_count_row_out` in src/juteSQC/spinning_sqc.py). The older
 * aliases are kept so a row shaped by an earlier API still resolves.
 * TKT-000225: the grid only knew the aliases, so every reading reported
 * "cannot be deleted (no server id)".
 */
export function countReadingServerId(r: SqcCountReadingRow): number | null {
	return (
		r.spinning_sqc_count_id ??
		r.jute_sqc_spinning_count_id ??
		r.sqc_spinning_count_id ??
		r.id ??
		null
	);
}
