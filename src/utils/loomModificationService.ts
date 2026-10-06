/**
 * Loom Modification register + Loom Groups master — service layer.
 *
 * Wire contract of `src/juteProduction/loom_modification.py` (backend, mounted at
 * `/api/loomModification`). Every response is a `{ data: ... }` envelope; the
 * helpers below unwrap it and throw on transport or backend errors so pages can
 * `try / catch` a plain `Error` with the backend's 400 message.
 *
 * Request helpers copy `buildQuery` / `requestData` / `requestList` from
 * `juteMechanicalService.ts` so the two registers behave identically.
 */

import { apiRoutesPortalMasters } from "@/utils/api";
import { fetchWithCookie } from "@/utils/apiClient2";

// =============================================================================
// Internal request helpers
// =============================================================================

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

type QueryValue = string | number | boolean | null | undefined;

/** Build a query string, dropping null/undefined/empty values. */
function buildQuery(params: Record<string, QueryValue>): string {
	const qs = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (value === null || value === undefined || value === "") continue;
		qs.set(key, String(value));
	}
	return qs.toString();
}

/** Call the API, throwing on any transport or backend error. */
async function request<T>(url: string, method: HttpMethod = "GET", body?: unknown): Promise<T> {
	const { data, error } = await fetchWithCookie<T>(url, method, body);
	if (error) throw new Error(error);
	if (data === null || data === undefined) {
		throw new Error(`Empty response from ${url}`);
	}
	return data;
}

/** Unwrap a `{ data: T }` envelope. */
async function requestData<T>(url: string, method: HttpMethod = "GET", body?: unknown): Promise<T> {
	const envelope = await request<{ data: T }>(url, method, body);
	return envelope.data;
}

/** A paged list envelope. */
export interface LoomModListResult<T> {
	data: T[];
	total: number;
	page: number;
	page_size: number;
}

/** Unwrap a `{ data: T[], total, page, page_size }` envelope; tolerates missing paging. */
async function requestList<T>(url: string): Promise<LoomModListResult<T>> {
	const envelope = await request<Partial<LoomModListResult<T>>>(url);
	const rows = envelope.data ?? [];
	return {
		data: rows,
		total: envelope.total ?? rows.length,
		page: envelope.page ?? 1,
		page_size: envelope.page_size ?? rows.length,
	};
}

// =============================================================================
// Wire -> UI normalisers (exported so they can be unit-tested with wire-shaped rows)
// =============================================================================

/**
 * Copy the wire's `machine_active` into `active`. A row carrying neither key is
 * treated as active (the backend only lists retired looms with an explicit 0).
 */
export function normalizeMemberActive<T extends { machine_active?: number | boolean; active?: number | boolean }>(
	member: T,
): T & { active: number | boolean } {
	const raw = member.machine_active ?? member.active;
	const active = raw === undefined || raw === null ? 1 : raw;
	return { ...member, active };
}

/** Derive `has_children` / `stage_seq` from the wire's `children_count` / `stage_no`. */
export function normalizeModificationRow(row: ModificationRowWire): ModificationRow {
	const children = Number(row.children_count ?? 0);
	const stageNo = Number(row.stage_no ?? 1);
	return {
		...row,
		children_count: Number.isFinite(children) ? children : 0,
		stage_no: Number.isFinite(stageNo) && stageNo > 0 ? stageNo : 1,
		stage_count: Number(row.stage_count ?? 1) || 1,
		has_children: Number.isFinite(children) && children > 0,
		stage_seq: Number.isFinite(stageNo) && stageNo > 0 ? stageNo : 1,
	};
}

// =============================================================================
// Wire types — /setup
// =============================================================================

/** One active loom of the branch (`get_stoppage_machines_query` shape). */
export interface LoomOption {
	machine_id: number;
	machine_name: string;
	mech_code: string | null;
	/** INT on dev3, VARCHAR on sls — always compared as a string on this side. */
	line_no: string | number | null;
	dept_id: number | null;
	dept_desc: string | null;
	branch_id: number | null;
	/**
	 * Legacy sardar/helper "share" code (`machine_mst.mech_shr_code`). Two or more
	 * looms on one code are an existing grouping (a Hessian pair on EJM); optional
	 * so older setup payloads without the column still type-check.
	 */
	mech_shr_code?: string | null;
	/**
	 * NOT sent by `get_looms_query` (it already filters `m.active = 1`); kept optional
	 * so a caller that does carry it is honoured. Absent = active.
	 */
	active?: number | boolean;
}

/** `{code, label}` enum entry returned by the setup call. */
export interface ModEnumLike {
	code: string;
	label: string;
}

/** A loom group as listed by `/setup` and `/loom_group_list`. */
export interface LoomGroup {
	loom_group_id: number;
	group_code: string;
	group_name: string;
	group_purpose: string;
	branch_id: number | null;
	member_count: number;
	remarks?: string | null;
	active?: number | boolean;
}

/** Vendor party for `done_by = VENDOR`. */
export interface LoomModParty {
	party_id: number;
	party_name: string;
}

/** A stage offered by the "Follows" picker (`get_open_stages_query` + router label). */
export interface OpenEvent {
	modification_id: number;
	root_modification_id: number;
	mod_kind: string;
	mod_date: string;
	title: string;
	loom_group_id: number | null;
	/** Active snapshot rows of the stage — what the wire actually carries. */
	snapshot_count?: number;
	/** Snapshot rows not yet covered by a later REVERSAL of the chain. */
	unreverted_count?: number;
	/** Server-built "title — date (group)" text. */
	label?: string;
	/** Older alias of `snapshot_count`; never sent by the current backend. */
	loom_count?: number;
}

export interface ModificationSetup {
	looms: LoomOption[];
	lines: string[];
	groups: LoomGroup[];
	mod_kinds: ModEnumLike[];
	mod_categories: ModEnumLike[];
	done_by_options: ModEnumLike[];
	parties: LoomModParty[];
	/** Latest non-reversal stage per chain with un-reverted looms. */
	open_events: OpenEvent[];
	/** Every active non-reversal stage — the Follows list when Kind = Reversal. */
	all_stages: OpenEvent[];
}

// =============================================================================
// Wire types — loom groups
// =============================================================================

/**
 * One member row. The wire carries the loom's `machine_mst.active` as
 * `machine_active`; the service copies it into `active` so pages read one key.
 */
export interface LoomGroupMember {
	machine_id: number;
	machine_name: string;
	mech_code: string | null;
	line_no: string | number | null;
	/** `m.active AS machine_active` — the wire key. */
	machine_active?: number | boolean;
	/** Normalised by `normalizeMemberActive`; absent on a raw wire row. */
	active?: number | boolean;
}

export interface LoomGroupDetail extends LoomGroup {
	co_id: number;
	remarks: string | null;
	members: LoomGroupMember[];
	/** Active events that reference the group (delete is refused while > 0). */
	event_count: number;
}

export interface LoomGroupCreate {
	co_id: number;
	branch_id: number | null;
	group_code: string;
	group_name: string;
	group_purpose: string;
	remarks: string | null;
	machine_ids: number[];
}

export type LoomGroupPatch = Partial<Omit<LoomGroupCreate, "co_id">>;

// =============================================================================
// Wire types — modifications
// =============================================================================

export interface DataCheck {
	before_days: number;
	after_days: number;
}

/** One register row of `/modification_table` as the wire sends it. */
export interface ModificationRowWire {
	modification_id: number;
	root_modification_id: number;
	parent_modification_id: number | null;
	mod_kind: string;
	mod_kind_label: string;
	mod_date: string;
	mod_to_date: string | null;
	settle_days: number;
	title: string;
	mod_category: string;
	mod_category_label: string;
	done_by: string;
	party_name: string | null;
	total_cost: number | null;
	loom_group_id: number | null;
	group_name: string | null;
	loom_count: number;
	/** Active direct follow-ups of this stage (delete is refused while > 0). */
	children_count: number;
	/** 1-based position of this stage inside its chain (by date, then id). */
	stage_no: number;
	stage_count: number;
	/** "2 of 3", built by the router. */
	stage_label?: string;
	data_check: DataCheck | null;
}

/** A register row with the derived keys the grid reads. See `normalizeModificationRow`. */
export interface ModificationRow extends ModificationRowWire {
	has_children: boolean;
	/** Same as `stage_no`; kept for the grid's stage column. */
	stage_seq: number;
}

/** One snapshot row of an event (`get_snapshot_members_query`). */
export interface ModificationMember {
	machine_id: number;
	machine_name: string;
	mech_code: string | null;
	line_no: string | number | null;
	done_date: string | null;
	done_to_date: string | null;
	remarks: string | null;
	/** `m.active AS machine_active` — the wire key. */
	machine_active?: number | boolean;
	/** Normalised by `normalizeMemberActive`; absent on a raw wire row. */
	active?: number | boolean;
}

/** Summary of a related stage (parent / children) inside `/modification_by_id`. */
export interface ModificationStageSummary {
	modification_id: number;
	mod_kind: string;
	mod_date: string;
	mod_to_date?: string | null;
	title: string;
	loom_count?: number;
}

export interface ModificationDetail {
	modification_id: number;
	co_id: number;
	branch_id: number | null;
	root_modification_id: number;
	parent_modification_id: number | null;
	loom_group_id: number | null;
	group_name?: string | null;
	mod_kind: string;
	mod_date: string;
	mod_to_date: string | null;
	settle_days: number;
	mod_category: string;
	title: string;
	description: string | null;
	expected_effect: string | null;
	done_by: string;
	party_id: number | null;
	party_name?: string | null;
	total_cost: number | null;
	remarks: string | null;
	members: ModificationMember[];
	parent: ModificationStageSummary | null;
	children: ModificationStageSummary[];
}

export interface ModificationMemberInput {
	machine_id: number;
	done_date?: string | null;
	done_to_date?: string | null;
	remarks?: string | null;
}

export interface SaveAsGroupInput {
	group_code: string;
	group_name: string;
}

/** Body of `POST /modification_create` and `PUT /modification_edit/{id}`. */
export interface ModificationCreate {
	co_id: number;
	branch_id: number | null;
	loom_group_id: number | null;
	members: ModificationMemberInput[];
	mod_date: string;
	mod_to_date: string | null;
	settle_days: number;
	mod_kind: string;
	parent_modification_id: number | null;
	mod_category: string;
	title: string;
	description: string | null;
	expected_effect: string | null;
	done_by: string;
	party_id: number | null;
	total_cost: number | null;
	remarks: string | null;
	save_as_group: SaveAsGroupInput | null;
}

/** Body of `POST /modification_insert_earlier/{root_id}`. */
export interface ModificationInsertEarlier extends ModificationCreate {
	old_root_kind: string;
}

export interface ModificationSaveResult {
	modification_id: number;
	root_modification_id: number;
	data_check: DataCheck | null;
	message?: string;
}

export interface ModificationEditResult {
	message: string;
	data_check: DataCheck | null;
}

export interface ModificationAddMembers {
	co_id: number;
	members: ModificationMemberInput[];
}

/** One stage of `/modification_chain/{root_id}`. */
export interface ModificationChainStage extends ModificationStageSummary {
	root_modification_id: number;
	parent_modification_id: number | null;
	members: ModificationMember[];
}

/** One snapshot row of `/machine_timeline`. */
export interface MachineTimelineRow {
	modification_id: number;
	root_modification_id: number;
	mod_kind: string;
	title: string;
	mod_date: string;
	done_date: string | null;
	done_to_date: string | null;
}

// =============================================================================
// Setup
// =============================================================================

export interface SetupParams {
	coId: number;
	branchId: number;
}

/** GET /setup — looms, lines, groups, enums, parties and the Follows lists. */
export async function fetchLoomModificationSetup(params: SetupParams): Promise<ModificationSetup> {
	const qs = buildQuery({ co_id: params.coId, branch_id: params.branchId });
	return requestData<ModificationSetup>(`${apiRoutesPortalMasters.LOOM_MODIFICATION_SETUP}?${qs}`);
}

// =============================================================================
// Loom groups
// =============================================================================

export interface LoomGroupListParams {
	coId: number;
	branchId?: number | null;
	groupPurpose?: string | null;
	search?: string;
}

/** GET /loom_group_list */
export async function fetchLoomGroupList(params: LoomGroupListParams): Promise<LoomGroup[]> {
	const qs = buildQuery({
		co_id: params.coId,
		branch_id: params.branchId,
		group_purpose: params.groupPurpose,
		search: params.search,
	});
	return requestData<LoomGroup[]>(`${apiRoutesPortalMasters.LOOM_GROUP_LIST}?${qs}`);
}

/** POST /loom_group_create */
export async function createLoomGroup(body: LoomGroupCreate): Promise<{ loom_group_id: number }> {
	return requestData<{ loom_group_id: number }>(
		apiRoutesPortalMasters.LOOM_GROUP_CREATE,
		"POST",
		body,
	);
}

/** PUT /loom_group_edit/{id}?co_id= */
export async function updateLoomGroup(
	loomGroupId: number,
	coId: number,
	body: LoomGroupPatch,
): Promise<{ message: string }> {
	const qs = buildQuery({ co_id: coId });
	return requestData<{ message: string }>(
		`${apiRoutesPortalMasters.LOOM_GROUP_EDIT}/${loomGroupId}?${qs}`,
		"PUT",
		body,
	);
}

/** GET /loom_group_detail/{id}?co_id= */
export async function fetchLoomGroupDetail(
	loomGroupId: number,
	coId: number,
): Promise<LoomGroupDetail> {
	const qs = buildQuery({ co_id: coId });
	const detail = await requestData<LoomGroupDetail>(
		`${apiRoutesPortalMasters.LOOM_GROUP_DETAIL}/${loomGroupId}?${qs}`,
	);
	return { ...detail, members: (detail.members ?? []).map(normalizeMemberActive) };
}

/** DELETE /loom_group_delete/{id}?co_id= — 400 while an active event references it. */
export async function deleteLoomGroup(
	loomGroupId: number,
	coId: number,
): Promise<{ message: string }> {
	const qs = buildQuery({ co_id: coId });
	return requestData<{ message: string }>(
		`${apiRoutesPortalMasters.LOOM_GROUP_DELETE}/${loomGroupId}?${qs}`,
		"DELETE",
	);
}

// =============================================================================
// Modification register
// =============================================================================

export interface ModificationTableParams {
	coId: number;
	branchId?: number | null;
	loomGroupId?: number | null;
	machineId?: number | null;
	dateFrom?: string;
	dateTo?: string;
	modKind?: string | null;
	page?: number;
	limit?: number;
}

/** GET /modification_table — server paged, `limit` capped at 200 by the backend. */
export async function fetchModificationTable(
	params: ModificationTableParams,
): Promise<LoomModListResult<ModificationRow>> {
	const qs = buildQuery({
		co_id: params.coId,
		branch_id: params.branchId,
		loom_group_id: params.loomGroupId,
		machine_id: params.machineId,
		date_from: params.dateFrom,
		date_to: params.dateTo,
		mod_kind: params.modKind,
		page: params.page,
		limit: params.limit,
	});
	const result = await requestList<ModificationRowWire>(
		`${apiRoutesPortalMasters.LOOM_MODIFICATION_TABLE}?${qs}`,
	);
	return { ...result, data: result.data.map(normalizeModificationRow) };
}

/** GET /modification_by_id/{id}?co_id= */
export async function fetchModificationById(
	modificationId: number,
	coId: number,
): Promise<ModificationDetail> {
	const qs = buildQuery({ co_id: coId });
	const detail = await requestData<ModificationDetail>(
		`${apiRoutesPortalMasters.LOOM_MODIFICATION_BY_ID}/${modificationId}?${qs}`,
	);
	return { ...detail, members: (detail.members ?? []).map(normalizeMemberActive) };
}

/** GET /modification_chain/{root_id}?co_id= */
export async function fetchModificationChain(
	rootId: number,
	coId: number,
): Promise<ModificationChainStage[]> {
	const qs = buildQuery({ co_id: coId });
	// The wire wraps the stages: `{ root_modification_id, events: [...] }`.
	const payload = await requestData<
		ModificationChainStage[] | { root_modification_id: number; events: ModificationChainStage[] }
	>(`${apiRoutesPortalMasters.LOOM_MODIFICATION_CHAIN}/${rootId}?${qs}`);
	const stages = Array.isArray(payload) ? payload : (payload.events ?? []);
	return stages.map((stage) => ({
		...stage,
		members: (stage.members ?? []).map(normalizeMemberActive),
	}));
}

/** GET /machine_timeline?co_id=&machine_id= */
export async function fetchMachineTimeline(
	coId: number,
	machineId: number,
): Promise<MachineTimelineRow[]> {
	const qs = buildQuery({ co_id: coId, machine_id: machineId });
	return requestData<MachineTimelineRow[]>(
		`${apiRoutesPortalMasters.LOOM_MODIFICATION_TIMELINE}?${qs}`,
	);
}

/** POST /modification_create */
export async function createModification(body: ModificationCreate): Promise<ModificationSaveResult> {
	return requestData<ModificationSaveResult>(
		apiRoutesPortalMasters.LOOM_MODIFICATION_CREATE,
		"POST",
		body,
	);
}

/** PUT /modification_edit/{id} — `co_id` travels in the body. */
export async function updateModification(
	modificationId: number,
	body: ModificationCreate,
): Promise<ModificationEditResult> {
	return requestData<ModificationEditResult>(
		`${apiRoutesPortalMasters.LOOM_MODIFICATION_EDIT}/${modificationId}`,
		"PUT",
		body,
	);
}

/** POST /modification_add_members/{id} — "Add looms to this stage". */
export async function addModificationMembers(
	modificationId: number,
	body: ModificationAddMembers,
): Promise<{ message: string }> {
	return requestData<{ message: string }>(
		`${apiRoutesPortalMasters.LOOM_MODIFICATION_ADD_MEMBERS}/${modificationId}`,
		"POST",
		body,
	);
}

/** POST /modification_insert_earlier/{root_id} — re-parents the old root. */
export async function insertEarlierStage(
	rootId: number,
	body: ModificationInsertEarlier,
): Promise<ModificationSaveResult> {
	return requestData<ModificationSaveResult>(
		`${apiRoutesPortalMasters.LOOM_MODIFICATION_INSERT_EARLIER}/${rootId}`,
		"POST",
		body,
	);
}

/** DELETE /modification_delete/{id}?co_id=&chain=0|1 */
export async function deleteModification(
	modificationId: number,
	coId: number,
	chain = false,
): Promise<{ message: string }> {
	const qs = buildQuery({ co_id: coId, chain: chain ? 1 : 0 });
	return requestData<{ message: string }>(
		`${apiRoutesPortalMasters.LOOM_MODIFICATION_DELETE}/${modificationId}?${qs}`,
		"DELETE",
	);
}
