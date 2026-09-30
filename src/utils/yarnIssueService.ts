/**
 * @file yarnIssueService.ts
 * @description Service layer for Yarn Issue / Return — moves purchased yarn from the
 * godown to a department floor (ISSUE) or back (RETURN), kilograms as the unit.
 * Backend: `/api/yarnIssue/*` (vowerp3be), lifecycle
 * 21 draft → 1 open → 20 pending → 3 approved / 4 rejected / 6 cancelled.
 *
 * Contract: vowerp3be/docs/superpowers/specs/2026-09-25-yarn-purchase-issue-consumption-design.md §3.2.
 * Every call goes through `fetchWithCookie`; errors surface as thrown `Error`s so
 * pages can show the backend `detail` message verbatim.
 */
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";

// ─── Shared ─────────────────────────────────────────────────────────────────

/** Direction of the movement: godown → floor (ISSUE) or floor → godown (RETURN). */
export type YarnIssueType = "ISSUE" | "RETURN";

// ─── Setup ──────────────────────────────────────────────────────────────────

/** Any department of the branch (`dept_mst`). */
export type YarnIssueDepartment = {
  dept_id: number;
  dept_desc: string;
  dept_code: string | null;
};

/** A yarn item (item_mst row that has a jute_yarn_mst entry). */
export type YarnIssueYarnItem = {
  item_id: number;
  item_code: string | null;
  item_name: string;
  quality_name: string | null;
  yarn_count: number | string | null;
};

export type YarnIssueSetup = {
  menu_id: number | null;
  departments: YarnIssueDepartment[];
  issue_types: YarnIssueType[];
  yarn_items: YarnIssueYarnItem[];
};

// ─── Lots ───────────────────────────────────────────────────────────────────

/**
 * One purchase lot = one line of an approved Yarn Purchase. Returned oldest first
 * (FIFO). `/godown_lots` carries the godown balance (`bal_kg`); `/dept_lots` adds
 * the department's floor balance (`floor_bal_kg`) for RETURN.
 */
export type YarnIssueLot = {
  yarn_purchase_li_id: number;
  yarn_purchase_id: number;
  purchase_no: string | null;
  tran_date: string;
  supp_name: string | null;
  item_id: number;
  item_name: string;
  item_code: string | null;
  package_type: string | null;
  received_kg: number;
  bal_kg: number;
  bal_pkgs: number | null;
  /** Only present on `/dept_lots`. */
  floor_bal_kg?: number | null;
  /** Only present on `/dept_lots`. */
  floor_bal_pkgs?: number | null;
};

// ─── List ───────────────────────────────────────────────────────────────────

export type YarnIssueListRow = {
  yarn_issue_id: number;
  issue_no: string | null;
  tran_date: string;
  issue_type: YarnIssueType;
  dept_id: number | null;
  dept_desc: string | null;
  status_id: number;
  status_name: string | null;
  approval_level: number | null;
  line_count: number;
  total_kg: number;
  updated_date_time: string | null;
};

// ─── Detail ─────────────────────────────────────────────────────────────────

export type YarnIssueHeader = {
  yarn_issue_id: number;
  co_id: number;
  branch_id: number;
  tran_date: string;
  issue_no: string | null;
  issue_type: YarnIssueType;
  dept_id: number | null;
  dept_desc: string | null;
  status_id: number;
  status_name: string | null;
  approval_level: number | null;
  remarks: string | null;
};

export type YarnIssueLine = {
  yarn_issue_li_id: number;
  item_id: number;
  item_name: string | null;
  item_code: string | null;
  /** The purchase lot the yarn physically comes from (mandatory). */
  yarn_purchase_li_id: number;
  purchase_no: string | null;
  lot_tran_date: string | null;
  lot_bal_kg: number | null;
  no_of_packages: number | null;
  /** Authoritative figure for stock; always in kilograms. */
  weight_kg: number;
  remarks: string | null;
};

/** Same shape as `ApprovalActionPermissions` from the shared approval bar. */
export type YarnIssuePermissions = {
  canApprove?: boolean;
  canReject?: boolean;
  canOpen?: boolean;
  canSendForApproval?: boolean;
  canCancelDraft?: boolean;
  canReopen?: boolean;
  canViewApprovalLog?: boolean;
  canClone?: boolean;
  canSave?: boolean;
};

export type YarnIssueDetail = {
  header: YarnIssueHeader;
  lines: YarnIssueLine[];
  permissions: YarnIssuePermissions;
};

// ─── Save ───────────────────────────────────────────────────────────────────

export type YarnIssueLinePayload = {
  item_id: number;
  yarn_purchase_li_id: number;
  no_of_packages?: number | null;
  weight_kg: number;
  remarks?: string | null;
};

export type YarnIssueSavePayload = {
  co_id: number;
  branch_id: number;
  tran_date: string;
  issue_type: YarnIssueType;
  dept_id: number;
  remarks?: string | null;
  lines: YarnIssueLinePayload[];
};

/**
 * `warnings` are non-blocking notes from the backend (a skipped older lot, a
 * RETURN above the floor balance); the document is saved regardless.
 */
export type YarnIssueSaveResponse = {
  yarn_issue_id: number;
  status_id: number;
  warnings: string[];
};

/** Returned by every status-change endpoint (same shape as the indent endpoints). */
export type YarnIssueStatusChangeResponse = {
  status: string;
  new_status_id?: number;
  new_approval_level?: number;
  message: string;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

type DataEnvelope<T> = { data: T };

function unwrap<T>(result: { data: T | null; error: string | null }, emptyMessage: string): T {
  if (result.error) {
    throw new Error(result.error);
  }
  if (result.data == null) {
    throw new Error(emptyMessage);
  }
  return result.data;
}

const toId = (value: number | string): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid id: ${String(value)}`);
  }
  return parsed;
};

const isIssueType = (value: unknown): value is YarnIssueType => value === "ISSUE" || value === "RETURN";

// ─── Reads ──────────────────────────────────────────────────────────────────

export async function fetchYarnIssueSetup(params: {
  coId: number | string;
  branchId: number | string;
}): Promise<YarnIssueSetup> {
  const query = new URLSearchParams({ co_id: String(params.coId), branch_id: String(params.branchId) });
  const result = await fetchWithCookie<DataEnvelope<Partial<YarnIssueSetup>>>(
    `${apiRoutesPortalMasters.YARN_ISSUE_SETUP}?${query.toString()}`,
    "GET",
  );
  const { data } = unwrap(result, "Empty yarn issue setup response.");
  const issueTypes = Array.isArray(data?.issue_types) ? data.issue_types.filter(isIssueType) : [];
  return {
    menu_id: data?.menu_id ?? null,
    departments: Array.isArray(data?.departments) ? data.departments : [],
    issue_types: issueTypes.length > 0 ? issueTypes : ["ISSUE", "RETURN"],
    yarn_items: Array.isArray(data?.yarn_items) ? data.yarn_items : [],
  };
}

type LotQueryBase = {
  coId: number | string;
  branchId: number | string;
  itemId?: number | null;
  /** When editing a saved document, leave its own lines out of the balances. */
  excludeIssueId?: number | null;
};

const lotQuery = (params: LotQueryBase): URLSearchParams => {
  const query = new URLSearchParams({ co_id: String(params.coId), branch_id: String(params.branchId) });
  if (params.itemId != null) query.set("item_id", String(params.itemId));
  if (params.excludeIssueId != null) query.set("exclude_issue_id", String(params.excludeIssueId));
  return query;
};

/** Lots with godown balance, oldest first — the ISSUE picker. */
export async function fetchYarnIssueGodownLots(params: LotQueryBase): Promise<YarnIssueLot[]> {
  const result = await fetchWithCookie<DataEnvelope<YarnIssueLot[]>>(
    `${apiRoutesPortalMasters.YARN_ISSUE_GODOWN_LOTS}?${lotQuery(params).toString()}`,
    "GET",
  );
  const { data } = unwrap(result, "Empty godown lots response.");
  return Array.isArray(data) ? data : [];
}

/** Lots with a floor balance in one department, oldest first — the RETURN picker. */
export async function fetchYarnIssueDeptLots(params: LotQueryBase & { deptId: number | string }): Promise<YarnIssueLot[]> {
  const query = lotQuery(params);
  query.set("dept_id", String(params.deptId));
  const result = await fetchWithCookie<DataEnvelope<YarnIssueLot[]>>(
    `${apiRoutesPortalMasters.YARN_ISSUE_DEPT_LOTS}?${query.toString()}`,
    "GET",
  );
  const { data } = unwrap(result, "Empty department lots response.");
  return Array.isArray(data) ? data : [];
}

export async function fetchYarnIssueList(params: {
  coId: number | string;
  branchId: number | string;
  fromDate: string;
  toDate: string;
  statusId?: number | null;
  issueType?: YarnIssueType | null;
}): Promise<YarnIssueListRow[]> {
  const query = new URLSearchParams({
    co_id: String(params.coId),
    branch_id: String(params.branchId),
    from_date: params.fromDate,
    to_date: params.toDate,
  });
  if (params.statusId != null) {
    query.set("status_id", String(params.statusId));
  }
  if (params.issueType) {
    query.set("issue_type", params.issueType);
  }
  const result = await fetchWithCookie<DataEnvelope<YarnIssueListRow[]>>(
    `${apiRoutesPortalMasters.YARN_ISSUE_LIST}?${query.toString()}`,
    "GET",
  );
  const { data } = unwrap(result, "Empty yarn issue list response.");
  return Array.isArray(data) ? data : [];
}

export async function getYarnIssueById(id: number | string): Promise<YarnIssueDetail> {
  const result = await fetchWithCookie<DataEnvelope<YarnIssueDetail>>(
    `${apiRoutesPortalMasters.YARN_ISSUE_GET}/${toId(id)}`,
    "GET",
  );
  const { data } = unwrap(result, "Empty yarn issue response.");
  if (!data?.header) {
    throw new Error("Yarn issue response has no header.");
  }
  return {
    header: data.header,
    lines: Array.isArray(data.lines) ? data.lines : [],
    permissions: data.permissions ?? {},
  };
}

// ─── Writes ─────────────────────────────────────────────────────────────────

const normaliseSaveResponse = (data: Partial<YarnIssueSaveResponse> & { yarn_issue_id: number; status_id: number }): YarnIssueSaveResponse => ({
  yarn_issue_id: data.yarn_issue_id,
  status_id: data.status_id,
  warnings: Array.isArray(data.warnings) ? data.warnings.filter((w): w is string => typeof w === "string" && w.trim() !== "") : [],
});

export async function createYarnIssue(payload: YarnIssueSavePayload): Promise<YarnIssueSaveResponse> {
  const result = await fetchWithCookie<DataEnvelope<YarnIssueSaveResponse>>(
    apiRoutesPortalMasters.YARN_ISSUE_CREATE,
    "POST",
    payload,
  );
  const { data } = unwrap(result, "Empty response from create API.");
  return normaliseSaveResponse(data);
}

export async function updateYarnIssue(id: number | string, payload: YarnIssueSavePayload): Promise<YarnIssueSaveResponse> {
  const result = await fetchWithCookie<DataEnvelope<YarnIssueSaveResponse>>(
    `${apiRoutesPortalMasters.YARN_ISSUE_UPDATE}/${toId(id)}`,
    "PUT",
    payload,
  );
  const { data } = unwrap(result, "Empty response from update API.");
  return normaliseSaveResponse(data);
}

// ─── Status changes ─────────────────────────────────────────────────────────

const statusBody = (id: number | string, branchId: number | string, menuId: number | string) => ({
  yarn_issue_id: toId(id),
  branch_id: toId(branchId),
  menu_id: toId(menuId),
});

async function postStatusChange(
  url: string,
  body: Record<string, unknown>,
  emptyMessage: string,
): Promise<YarnIssueStatusChangeResponse> {
  const result = await fetchWithCookie<YarnIssueStatusChangeResponse>(url, "POST", body);
  return unwrap(result, emptyMessage);
}

/** 21 draft → 1 open; the backend generates the issue number here. */
export const openYarnIssue = (id: number | string, branchId: number | string, menuId: number | string) =>
  postStatusChange(apiRoutesPortalMasters.YARN_ISSUE_OPEN, statusBody(id, branchId, menuId), "Empty response from open API.");

/** 21 draft → 6 cancelled. */
export const cancelDraftYarnIssue = (id: number | string, branchId: number | string, menuId: number | string) =>
  postStatusChange(apiRoutesPortalMasters.YARN_ISSUE_CANCEL, statusBody(id, branchId, menuId), "Empty response from cancel API.");

/** 1 open → 20 pending approval (level 1). */
export const sendYarnIssueForApproval = (id: number | string, branchId: number | string, menuId: number | string) =>
  postStatusChange(
    apiRoutesPortalMasters.YARN_ISSUE_SEND_FOR_APPROVAL,
    statusBody(id, branchId, menuId),
    "Empty response from send for approval API.",
  );

/** 20 pending → next level (stays 20) or 3 approved on the final level. */
export const approveYarnIssue = (id: number | string, branchId: number | string, menuId: number | string) =>
  postStatusChange(apiRoutesPortalMasters.YARN_ISSUE_APPROVE, statusBody(id, branchId, menuId), "Empty response from approve API.");

/** 4 rejected / 6 cancelled → back to draft or open (backend decides). */
export const reopenYarnIssue = (id: number | string, branchId: number | string, menuId: number | string) =>
  postStatusChange(apiRoutesPortalMasters.YARN_ISSUE_REOPEN, statusBody(id, branchId, menuId), "Empty response from reopen API.");

/** 20 pending → 4 rejected. Note the body carries `co_id` instead of `branch_id`. */
export const rejectYarnIssue = (id: number | string, coId: number | string, menuId: number | string, reason: string) =>
  postStatusChange(
    apiRoutesPortalMasters.YARN_ISSUE_REJECT,
    { yarn_issue_id: toId(id), co_id: toId(coId), menu_id: toId(menuId), reason },
    "Empty response from reject API.",
  );
