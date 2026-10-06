/**
 * Wastage Report Mapping master — service layer (TKT-000183).
 *
 * Wire contract of `src/juteProduction/waste_report_map.py` (backend, mounted at
 * `/api/wasteReportMap`). Each row of `jute_waste_report_map` says which waste
 * item (optionally only from one department) lands in which Wastage Report
 * group, and which production figure the group's daily / monthly % divides by.
 * Waste with no row falls into the report's "Other / Unmapped" band.
 *
 * Every response is a `{ data: ... }` envelope; the helpers below unwrap it and
 * throw a plain `Error` carrying the backend's message (400s are user-facing),
 * so the page can `try / catch`.
 */

import { apiRoutesPortalMasters } from "@/utils/api";
import { fetchWithCookie } from "@/utils/apiClient2";

// =============================================================================
// Wire types
// =============================================================================

/** A denominator code (WEAVING, SPINNING, BREAKER_FEED, SELECTION, WINDING, NONE). */
export interface WasteDenominatorOption {
	code: string;
	label: string;
}

export interface WasteItemOption {
	item_id: number;
	item_code: string | null;
	item_name: string;
}

export interface WasteDeptOption {
	dept_id: number;
	dept_desc: string;
	dept_code: string | null;
	branch_id: number;
	branch_name: string | null;
}

/** An existing group, as the report would define it (first row by display order). */
export interface WasteReportGroup {
	group_code: string;
	group_name: string;
	day_denom: string;
	total_denom: string;
	display_order: number;
	item_count: number;
}

export interface WasteReportMapSetup {
	waste_items: WasteItemOption[];
	departments: WasteDeptOption[];
	denominators: WasteDenominatorOption[];
	groups: WasteReportGroup[];
}

export interface WasteReportMapRow {
	waste_report_map_id: number;
	co_id: number;
	group_code: string;
	group_name: string;
	day_denom: string;
	day_denom_label: string | null;
	total_denom: string;
	total_denom_label: string | null;
	item_id: number;
	item_code: string | null;
	item_name: string | null;
	/** null = the item maps from any department. */
	dept_id: number | null;
	dept_desc: string | null;
	branch_id: number | null;
	branch_name: string | null;
	col_label: string | null;
	display_order: number;
	active: number;
	updated_by: number | null;
	updated_date_time: string | null;
}

/** Body of POST /create (and, with `waste_report_map_id`, POST /update). */
export interface WasteReportMapPayload {
	co_id: number;
	group_code: string;
	group_name: string;
	day_denom: string;
	total_denom: string;
	item_id: number;
	dept_id: number | null;
	col_label: string | null;
	display_order: number;
}

export interface WasteReportMapUpdatePayload extends WasteReportMapPayload {
	waste_report_map_id: number;
}

export interface WasteReportMapSaveResult {
	waste_report_map_id: number;
	group_code: string;
	/** Other rows of the group whose name / % bases / order were brought in line. */
	group_rows_updated: number;
}

const EMPTY_SETUP: WasteReportMapSetup = Object.freeze({
	waste_items: [],
	departments: [],
	denominators: [],
	groups: [],
}) as WasteReportMapSetup;

// =============================================================================
// Internal request helper
// =============================================================================

/** Call the API and unwrap `{ data: T }`, throwing on any transport or backend error. */
async function requestData<T>(url: string, method: "GET" | "POST" = "GET", body?: unknown): Promise<T> {
	const { data, error } = await fetchWithCookie<{ data: T }>(url, method, body);
	if (error) throw new Error(error);
	if (data === null || data === undefined || data.data === undefined) {
		throw new Error(`Empty response from ${url}`);
	}
	return data.data;
}

function coIdQuery(coId: number | string): string {
	return new URLSearchParams({ co_id: String(coId) }).toString();
}

// =============================================================================
// Public API
// =============================================================================

/** Pickers for the add / edit dialog: waste items, departments, % bases, existing groups. */
export async function fetchWasteReportMapSetup(coId: number | string): Promise<WasteReportMapSetup> {
	const data = await requestData<Partial<WasteReportMapSetup>>(
		`${apiRoutesPortalMasters.WASTE_REPORT_MAP_SETUP}?${coIdQuery(coId)}`,
	);
	return {
		waste_items: data.waste_items ?? EMPTY_SETUP.waste_items,
		departments: data.departments ?? EMPTY_SETUP.departments,
		denominators: data.denominators ?? EMPTY_SETUP.denominators,
		groups: data.groups ?? EMPTY_SETUP.groups,
	};
}

/** Active mapping rows of the company, ordered by display order, group, item. */
export async function fetchWasteReportMapList(coId: number | string): Promise<WasteReportMapRow[]> {
	const rows = await requestData<WasteReportMapRow[]>(
		`${apiRoutesPortalMasters.WASTE_REPORT_MAP_LIST}?${coIdQuery(coId)}`,
	);
	return Array.isArray(rows) ? rows : [];
}

export function createWasteReportMap(payload: WasteReportMapPayload): Promise<WasteReportMapSaveResult> {
	return requestData<WasteReportMapSaveResult>(apiRoutesPortalMasters.WASTE_REPORT_MAP_CREATE, "POST", payload);
}

export function updateWasteReportMap(payload: WasteReportMapUpdatePayload): Promise<WasteReportMapSaveResult> {
	return requestData<WasteReportMapSaveResult>(apiRoutesPortalMasters.WASTE_REPORT_MAP_UPDATE, "POST", payload);
}

/** Soft-delete one row (active = 0). */
export function deactivateWasteReportMap(
	coId: number | string,
	wasteReportMapId: number,
): Promise<{ waste_report_map_id: number; active: number }> {
	return requestData(apiRoutesPortalMasters.WASTE_REPORT_MAP_DEACTIVATE, "POST", {
		co_id: Number(coId),
		waste_report_map_id: wasteReportMapId,
	});
}
