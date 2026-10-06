/**
 * Hands Norms master service (TKT-000202, v2 machine groups 2026-09-30).
 *
 * Backend: /api/handsNorms (vowerp3be src/juteProduction/hands_norms.py), which
 * maintains `jute_prod_hands_norms_mst` — the man-machine norms the Hands
 * Report takes its target hands from — and, since v2, the machine groups
 * (`jute_prod_machine_group_mst` / `_dtl`) a norm may be scoped to.
 *
 * A norm has a kind: F fixed (target hands per shift A/B/C/G), M machine-based
 * (units of the scoped machines that ran ÷ units per hand), P production-based
 * (production qty of the scope ÷ qty per hand), N no norm (blank target) or
 * A as actual (target = hands present). M/P are scoped to exactly one of a
 * machine group, a machine type or a department. Rows are effective-dated: a
 * change going forward is a new row with a later date.
 *
 * Pre-v2 backends return neither `norm_kind` nor the group fields; every field
 * added by v2 is optional here so the page renders either response.
 *
 * Kept next to the page: these types are used by this route only.
 */

import { apiRoutesPortalMasters } from "@/utils/api";
import { fetchWithCookie } from "@/utils/apiClient2";

export type NormKind = "F" | "M" | "P" | "N" | "A";
/** Legacy flag, mirrored by the API: V for M/P, F for F/N/A. */
export type NormType = "F" | "V";
export type DirectIndirect = "D" | "I";
export type ProdUom = "kg" | "cuts";

export const NORM_KINDS: ReadonlyArray<NormKind> = Object.freeze(["F", "M", "P", "N", "A"]);

export function isNormKind(v: unknown): v is NormKind {
	return typeof v === "string" && (NORM_KINDS as ReadonlyArray<string>).includes(v);
}

export interface HandsNormRow {
	hands_norm_id: number;
	co_id: number;
	/** null = a company-wide row (legacy); the page creates branch rows only. */
	branch_id: number | null;
	designation_id: number;
	designation: string | null;
	dept_id: number | null;
	dept: string | null;
	direct_indirect: string | null;
	variable_fixed: NormType | null;
	shift_a: number | null;
	shift_b: number | null;
	shift_c: number | null;
	shift_g: number | null;
	machine_type_id: number | null;
	machine_type_name: string | null;
	hands_per_machine: number | null;
	norms_text: string | null;
	effective_date: string;
	active: number;
	/** False for an M/P norm with no scope or rate: the report cannot compute it. */
	computable: boolean;
	/** The row the Hands Report uses today for this designation. */
	in_force: boolean;
	/** Another active row has the same designation, branch and effective date. */
	duplicate: boolean;

	// ---- v2 (absent on a pre-migration backend) ----
	/** F | M | P | N | A. Missing/blank on legacy rows: derive from variable_fixed / machine link. */
	norm_kind?: string | null;
	machine_group_id?: number | null;
	machine_group?: string | null;
	/** The group's unit label (machine / point / spindle ...). */
	unit_label?: string | null;
	scope_dept_id?: number | null;
	scope_dept?: string | null;
	/** M: group/type/department units one hand covers. */
	units_per_hand?: number | null;
	/** P: production per hand per shift, in qty_uom. */
	qty_per_hand?: number | null;
	qty_uom?: string | null;
}

export interface NormDesignation {
	designation_id: number;
	desig: string | null;
	dept_id: number | null;
	dept: string | null;
	direct_indirect: string | null;
	branch_id: number | null;
	branch_name: string | null;
}

export interface NormMachineType {
	machine_type_id: number;
	machine_type_name: string | null;
	/** Active machines of this type in the page's branch. */
	machine_count: number;
}

export interface NormDepartment {
	dept_id: number;
	dept_desc: string | null;
}

/** One candidate machine of the branch (every active machine of its departments). */
export interface NormMachine {
	machine_id: number;
	machine_name: string | null;
	mech_code: string | null;
	machine_type_id: number | null;
	machine_type_name: string | null;
	dept_id: number | null;
	dept: string | null;
}

/** A machine group as the groups list / setup return it. */
export interface MachineGroupRow {
	machine_group_id: number;
	co_id?: number;
	branch_id?: number;
	group_code: string;
	group_name: string;
	unit_label: string | null;
	remarks?: string | null;
	active: number;
	member_count: number;
	total_units: number;
	/** Active norms referencing the group (groups list only). */
	norms_using?: number;
}

export interface MachineGroupMember {
	machine_id: number;
	machine_name: string | null;
	mech_code: string | null;
	machine_type_id: number | null;
	machine_type_name: string | null;
	dept: string | null;
	units: number;
}

export interface MachineGroupDetail extends MachineGroupRow {
	members: MachineGroupMember[];
}

export interface HandsNormsSetup {
	designations: NormDesignation[];
	machine_types: NormMachineType[];
	/** v2 — absent on a pre-migration backend. */
	machine_groups?: MachineGroupRow[];
	machines?: NormMachine[];
	departments?: NormDepartment[];
}

export interface HandsNormPayload {
	effective_date: string;
	norm_kind: NormKind;
	/** Legacy mirror (V for M/P, F otherwise) so a pre-v2 backend still accepts the body. */
	variable_fixed: NormType;
	direct_indirect: DirectIndirect | null;
	shift_a: number;
	shift_b: number;
	shift_c: number;
	shift_g: number;
	machine_group_id: number | null;
	machine_type_id: number | null;
	scope_dept_id: number | null;
	units_per_hand: number | null;
	qty_per_hand: number | null;
	qty_uom: ProdUom | null;
	norms_text: string | null;
}

export interface HandsNormCreatePayload extends HandsNormPayload {
	co_id: number;
	branch_id: number;
	designation_id: number;
}

export interface HandsNormEditPayload extends HandsNormPayload {
	active: number;
}

export interface MachineGroupMemberPayload {
	machine_id: number;
	units: number;
}

export interface MachineGroupCreatePayload {
	co_id: number;
	branch_id: number;
	group_code: string;
	group_name: string;
	unit_label: string;
	remarks: string | null;
	members: MachineGroupMemberPayload[];
}

export interface MachineGroupEditPayload {
	group_name?: string;
	unit_label?: string;
	remarks?: string | null;
	active?: number;
	/** Full replacement of the member list. */
	members?: MachineGroupMemberPayload[];
}

type Result<T> = { data: T | null; error: string | null };

export async function fetchHandsNormsSetup(
	coId: string | number,
	branchId: number
): Promise<Result<HandsNormsSetup>> {
	const { data, error } = await fetchWithCookie<{ data: HandsNormsSetup }>(
		`${apiRoutesPortalMasters.HANDS_NORMS_SETUP}?co_id=${coId}&branch_id=${branchId}`,
		"GET"
	);
	return { data: data?.data ?? null, error: error ?? null };
}

export async function fetchHandsNorms(
	coId: string | number,
	branchId: number,
	includeInactive: boolean
): Promise<Result<HandsNormRow[]>> {
	const { data, error } = await fetchWithCookie<{ data: HandsNormRow[] }>(
		`${apiRoutesPortalMasters.HANDS_NORMS_LIST}?co_id=${coId}&branch_id=${branchId}` +
			(includeInactive ? "&include_inactive=1" : ""),
		"GET"
	);
	return { data: data?.data ?? null, error: error ?? null };
}

export async function createHandsNorm(payload: HandsNormCreatePayload): Promise<{ error: string | null }> {
	const { error } = await fetchWithCookie(apiRoutesPortalMasters.HANDS_NORMS_CREATE, "POST", payload);
	return { error: error ?? null };
}

export async function updateHandsNorm(
	coId: string | number,
	handsNormId: number,
	payload: HandsNormEditPayload
): Promise<{ error: string | null }> {
	const { error } = await fetchWithCookie(
		`${apiRoutesPortalMasters.HANDS_NORMS_EDIT}/${handsNormId}?co_id=${coId}`,
		"PUT",
		payload
	);
	return { error: error ?? null };
}

// ---- machine groups (v2) ----

export async function fetchMachineGroups(
	coId: string | number,
	branchId: number,
	includeInactive: boolean
): Promise<Result<MachineGroupRow[]>> {
	const { data, error } = await fetchWithCookie<{ data: MachineGroupRow[] }>(
		`${apiRoutesPortalMasters.HANDS_NORMS_GROUPS}?co_id=${coId}&branch_id=${branchId}` +
			(includeInactive ? "&include_inactive=1" : ""),
		"GET"
	);
	return { data: data?.data ?? null, error: error ?? null };
}

export async function fetchMachineGroup(
	coId: string | number,
	groupId: number
): Promise<Result<MachineGroupDetail>> {
	const { data, error } = await fetchWithCookie<{ data: MachineGroupDetail }>(
		`${apiRoutesPortalMasters.HANDS_NORMS_GROUP}/${groupId}?co_id=${coId}`,
		"GET"
	);
	return { data: data?.data ?? null, error: error ?? null };
}

export async function createMachineGroup(payload: MachineGroupCreatePayload): Promise<{ error: string | null }> {
	const { error } = await fetchWithCookie(apiRoutesPortalMasters.HANDS_NORMS_GROUP_CREATE, "POST", payload);
	return { error: error ?? null };
}

export async function updateMachineGroup(
	coId: string | number,
	groupId: number,
	payload: MachineGroupEditPayload
): Promise<{ error: string | null }> {
	const { error } = await fetchWithCookie(
		`${apiRoutesPortalMasters.HANDS_NORMS_GROUP_EDIT}/${groupId}?co_id=${coId}`,
		"PUT",
		payload
	);
	return { error: error ?? null };
}
