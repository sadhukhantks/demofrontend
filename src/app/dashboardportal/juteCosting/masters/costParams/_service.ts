/**
 * Cost Parameters master service (ITM-019).
 *
 * Backend: /api/juteCostParam (vowerp3be src/juteCosting/params.py), which
 * maintains `jute_cost_param` — the effective-dated rates and norms the
 * Daily P&L prices with (realisation per tonne, wage per hand-day, power
 * rate per kWh, ...). A row is scoped to one branch or to every branch of
 * the company, optionally to one product (SACKING / HESSIAN / YARN), and
 * dated: for each (code, product) the report picks the active row with the
 * latest effective date on or before the day, a branch row beating an
 * all-branch row. A change going forward is a NEW row with a later date;
 * the backend's edit files that row itself when the date is changed
 * (`created_new`), so the old row stays for history.
 *
 * Every call throws on failure (the page shows the message verbatim).
 * Kept beside the page: this route is the only consumer.
 */

import { apiRoutesPortalMasters } from "@/utils/api";
import { fetchWithCookie } from "@/utils/apiClient2";

export type CostParamScope = "branch" | "all";

export interface CostParamRow {
	cost_param_id: number;
	co_id: number;
	/** null = every branch of the company. */
	branch_id: number | null;
	branch_name: string | null;
	scope: CostParamScope;
	/** YYYY-MM-DD. */
	effective_date: string;
	param_code: string;
	param_label: string;
	param_value: number;
	uom: string | null;
	/** null = every product. */
	product: string | null;
	source: string | null;
	remarks: string | null;
	active: number;
	/** The row is today's pick for its (code, product) within its scope. */
	in_force: boolean;
}

export interface CostParamCodeOption {
	code: string;
	label: string;
	uom: string;
	/** The value differs per product (realisation per tonne). */
	product_scoped: boolean;
}

export interface CostParamSetup {
	param_codes: CostParamCodeOption[];
	products: string[];
}

/** POST body of cost_param_create. */
export interface CostParamPayload {
	co_id: number;
	branch_id: number | null;
	effective_date: string;
	param_code: string;
	param_value: number;
	uom: string | null;
	product: string | null;
	source: string | null;
	remarks: string | null;
}

/** PUT body of cost_param_edit — every field optional; an effective_date
 * different from the row's files a new effective-dated row. */
export interface CostParamUpdatePayload {
	effective_date?: string;
	param_value?: number;
	uom?: string | null;
	source?: string | null;
	remarks?: string | null;
	active?: number;
}

export interface CostParamSaveResult {
	cost_param_id: number;
	/** True when the edit filed a new effective-dated row (the old row is kept). */
	created_new: boolean;
	superseded_id?: number;
}

export interface CostParamPick {
	value: number;
	uom: string | null;
	effective_date: string;
	branch_id: number | null;
	scope: CostParamScope;
	product: string | null;
	source: string | null;
	cost_param_id: number;
}

export interface CostParamResolve {
	on_date: string;
	/** Keyed "<CODE>" or "<CODE>:<PRODUCT>". */
	params: Record<string, CostParamPick>;
	/** Codes with no pick at all, in the setup order. */
	not_keyed: string[];
}

export const EMPTY_ROWS: ReadonlyArray<CostParamRow> = Object.freeze([]);
export const EMPTY_SETUP: CostParamSetup = Object.freeze({ param_codes: [], products: [] });

/** One round trip; the backend answers {"data": ...} and errors as text. */
async function call<T>(url: string, method: string, body: unknown, fallback: string): Promise<T> {
	const { data, error } = await fetchWithCookie<{ data: T }>(url, method, body);
	if (error) throw new Error(error);
	const payload = data?.data;
	if (payload == null) throw new Error(fallback);
	return payload;
}

export async function fetchCostParamSetup(coId: number | string): Promise<CostParamSetup> {
	const s = await call<Partial<CostParamSetup>>(
		`${apiRoutesPortalMasters.JUTE_COST_PARAM_SETUP}?co_id=${coId}`,
		"GET",
		undefined,
		"Failed to load the parameter list"
	);
	return { param_codes: s.param_codes ?? [], products: s.products ?? [] };
}

export async function fetchCostParams(args: {
	coId: number | string;
	/** null = company-wide listing (every branch's rows); given = that branch's rows + all-branch rows. */
	branchId: number | null;
	/** 1 / 0; omitted = both. */
	active?: 0 | 1;
}): Promise<CostParamRow[]> {
	const qs = new URLSearchParams({ co_id: String(args.coId) });
	if (args.branchId != null) qs.set("branch_id", String(args.branchId));
	if (args.active != null) qs.set("active", String(args.active));
	return call<CostParamRow[]>(
		`${apiRoutesPortalMasters.JUTE_COST_PARAM_LIST}?${qs.toString()}`,
		"GET",
		undefined,
		"Failed to load cost parameters"
	);
}

export async function createCostParam(payload: CostParamPayload): Promise<CostParamSaveResult> {
	return call<CostParamSaveResult>(
		apiRoutesPortalMasters.JUTE_COST_PARAM_CREATE,
		"POST",
		payload,
		"Failed to add the parameter"
	);
}

export async function updateCostParam(
	costParamId: number,
	coId: number | string,
	payload: CostParamUpdatePayload
): Promise<CostParamSaveResult> {
	return call<CostParamSaveResult>(
		`${apiRoutesPortalMasters.JUTE_COST_PARAM_EDIT}/${costParamId}?co_id=${coId}`,
		"PUT",
		payload,
		"Failed to save the parameter"
	);
}

/** Soft delete: the row goes inactive and drops out of the resolution. */
export async function deleteCostParam(costParamId: number, coId: number | string): Promise<void> {
	await call<{ message: string }>(
		`${apiRoutesPortalMasters.JUTE_COST_PARAM_DELETE}/${costParamId}?co_id=${coId}`,
		"DELETE",
		undefined,
		"Failed to deactivate the parameter"
	);
}

export async function fetchCostParamResolve(args: {
	coId: number | string;
	branchId: number | null;
	/** YYYY-MM-DD; the backend defaults to today. */
	onDate?: string;
}): Promise<CostParamResolve> {
	const qs = new URLSearchParams({ co_id: String(args.coId) });
	if (args.branchId != null) qs.set("branch_id", String(args.branchId));
	if (args.onDate) qs.set("on_date", args.onDate);
	return call<CostParamResolve>(
		`${apiRoutesPortalMasters.JUTE_COST_PARAM_RESOLVE}?${qs.toString()}`,
		"GET",
		undefined,
		"Failed to resolve the parameters"
	);
}
