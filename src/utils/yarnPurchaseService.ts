/**
 * @file yarnPurchaseService.ts
 * @description Service layer for Yarn Purchase — receipt of purchased yarn at the
 * mill, kilograms as the unit. Backend: `/api/yarnPurchase/*` (vowerp3be), lifecycle
 * 21 draft → 1 open → 20 pending → 3 approved / 4 rejected / 6 cancelled.
 *
 * Contract: vowerp3be/docs/superpowers/specs/2026-09-25-yarn-purchase-issue-consumption-design.md §3.1.
 * Every call goes through `fetchWithCookie`; errors surface as thrown `Error`s so
 * pages can show the backend `detail` message verbatim.
 */
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";

// ─── Setup ──────────────────────────────────────────────────────────────────

/** A yarn item (item_mst row that has a jute_yarn_mst entry). */
export type YarnPurchaseYarnItem = {
  item_id: number;
  item_code: string | null;
  item_name: string;
  quality_name: string | null;
  yarn_count: number | string | null;
};

/** Supplier (party) the yarn was bought from. */
export type YarnPurchaseParty = {
  party_id: number;
  supp_name: string;
};

export type YarnPurchaseSetup = {
  menu_id: number | null;
  yarn_items: YarnPurchaseYarnItem[];
  parties: YarnPurchaseParty[];
  package_types: string[];
};

// ─── List ───────────────────────────────────────────────────────────────────

export type YarnPurchaseListRow = {
  yarn_purchase_id: number;
  purchase_no: string | null;
  tran_date: string;
  party_id: number | null;
  supp_name: string | null;
  challan_no: string | null;
  vehicle_no: string | null;
  status_id: number;
  status_name: string | null;
  approval_level: number | null;
  line_count: number;
  total_kg: number;
  updated_date_time: string | null;
};

// ─── Detail ─────────────────────────────────────────────────────────────────

export type YarnPurchaseHeader = {
  yarn_purchase_id: number;
  co_id: number;
  branch_id: number;
  tran_date: string;
  purchase_no: string | null;
  party_id: number | null;
  supp_name: string | null;
  challan_no: string | null;
  challan_date: string | null;
  vehicle_no: string | null;
  /** Optional link to the Stores receipt (`proc_inward.inward_id`). */
  inward_id: number | null;
  status_id: number;
  status_name: string | null;
  approval_level: number | null;
  remarks: string | null;
};

export type YarnPurchaseLine = {
  yarn_purchase_li_id: number;
  item_id: number;
  item_name: string | null;
  item_code: string | null;
  quality_name: string | null;
  package_type: string | null;
  no_of_packages: number | null;
  wt_per_package: number | null;
  /** Authoritative figure for stock; always in kilograms. */
  weight_kg: number;
  rate_per_kg: number | null;
  amount: number | null;
  remarks: string | null;
};

/** Same shape as `ApprovalActionPermissions` from the shared approval bar. */
export type YarnPurchasePermissions = {
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

export type YarnPurchaseDetail = {
  header: YarnPurchaseHeader;
  lines: YarnPurchaseLine[];
  permissions: YarnPurchasePermissions;
};

// ─── Save ───────────────────────────────────────────────────────────────────

export type YarnPurchaseLinePayload = {
  item_id: number;
  package_type?: string | null;
  no_of_packages?: number | null;
  wt_per_package?: number | null;
  weight_kg: number;
  rate_per_kg?: number | null;
  remarks?: string | null;
};

export type YarnPurchaseSavePayload = {
  co_id: number;
  branch_id: number;
  tran_date: string;
  party_id?: number | null;
  challan_no?: string | null;
  challan_date?: string | null;
  vehicle_no?: string | null;
  remarks?: string | null;
  lines: YarnPurchaseLinePayload[];
};

export type YarnPurchaseSaveResponse = {
  yarn_purchase_id: number;
  status_id: number;
};

/** Returned by every status-change endpoint (same shape as the indent endpoints). */
export type YarnPurchaseStatusChangeResponse = {
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

// ─── Reads ──────────────────────────────────────────────────────────────────

export async function fetchYarnPurchaseSetup(params: {
  coId: number | string;
  branchId: number | string;
}): Promise<YarnPurchaseSetup> {
  const query = new URLSearchParams({ co_id: String(params.coId), branch_id: String(params.branchId) });
  const result = await fetchWithCookie<DataEnvelope<Partial<YarnPurchaseSetup>>>(
    `${apiRoutesPortalMasters.YARN_PURCHASE_SETUP}?${query.toString()}`,
    "GET",
  );
  const { data } = unwrap(result, "Empty yarn purchase setup response.");
  return {
    menu_id: data?.menu_id ?? null,
    yarn_items: Array.isArray(data?.yarn_items) ? data.yarn_items : [],
    parties: Array.isArray(data?.parties) ? data.parties : [],
    package_types: Array.isArray(data?.package_types) ? data.package_types : [],
  };
}

export async function fetchYarnPurchaseList(params: {
  coId: number | string;
  branchId: number | string;
  fromDate: string;
  toDate: string;
  statusId?: number | null;
}): Promise<YarnPurchaseListRow[]> {
  const query = new URLSearchParams({
    co_id: String(params.coId),
    branch_id: String(params.branchId),
    from_date: params.fromDate,
    to_date: params.toDate,
  });
  if (params.statusId != null) {
    query.set("status_id", String(params.statusId));
  }
  const result = await fetchWithCookie<DataEnvelope<YarnPurchaseListRow[]>>(
    `${apiRoutesPortalMasters.YARN_PURCHASE_LIST}?${query.toString()}`,
    "GET",
  );
  const { data } = unwrap(result, "Empty yarn purchase list response.");
  return Array.isArray(data) ? data : [];
}

export async function getYarnPurchaseById(id: number | string): Promise<YarnPurchaseDetail> {
  const result = await fetchWithCookie<DataEnvelope<YarnPurchaseDetail>>(
    `${apiRoutesPortalMasters.YARN_PURCHASE_GET}/${toId(id)}`,
    "GET",
  );
  const { data } = unwrap(result, "Empty yarn purchase response.");
  if (!data?.header) {
    throw new Error("Yarn purchase response has no header.");
  }
  return {
    header: data.header,
    lines: Array.isArray(data.lines) ? data.lines : [],
    permissions: data.permissions ?? {},
  };
}

// ─── Writes ─────────────────────────────────────────────────────────────────

export async function createYarnPurchase(payload: YarnPurchaseSavePayload): Promise<YarnPurchaseSaveResponse> {
  const result = await fetchWithCookie<DataEnvelope<YarnPurchaseSaveResponse>>(
    apiRoutesPortalMasters.YARN_PURCHASE_CREATE,
    "POST",
    payload,
  );
  const { data } = unwrap(result, "Empty response from create API.");
  return data;
}

export async function updateYarnPurchase(
  id: number | string,
  payload: YarnPurchaseSavePayload,
): Promise<YarnPurchaseSaveResponse> {
  const result = await fetchWithCookie<DataEnvelope<YarnPurchaseSaveResponse>>(
    `${apiRoutesPortalMasters.YARN_PURCHASE_UPDATE}/${toId(id)}`,
    "PUT",
    payload,
  );
  const { data } = unwrap(result, "Empty response from update API.");
  return data;
}

// ─── Status changes ─────────────────────────────────────────────────────────

const statusBody = (id: number | string, branchId: number | string, menuId: number | string) => ({
  yarn_purchase_id: toId(id),
  branch_id: toId(branchId),
  menu_id: toId(menuId),
});

async function postStatusChange(
  url: string,
  body: Record<string, unknown>,
  emptyMessage: string,
): Promise<YarnPurchaseStatusChangeResponse> {
  const result = await fetchWithCookie<YarnPurchaseStatusChangeResponse>(url, "POST", body);
  return unwrap(result, emptyMessage);
}

/** 21 draft → 1 open; the backend generates the purchase number here. */
export const openYarnPurchase = (id: number | string, branchId: number | string, menuId: number | string) =>
  postStatusChange(apiRoutesPortalMasters.YARN_PURCHASE_OPEN, statusBody(id, branchId, menuId), "Empty response from open API.");

/** 21 draft → 6 cancelled. */
export const cancelDraftYarnPurchase = (id: number | string, branchId: number | string, menuId: number | string) =>
  postStatusChange(apiRoutesPortalMasters.YARN_PURCHASE_CANCEL, statusBody(id, branchId, menuId), "Empty response from cancel API.");

/** 1 open → 20 pending approval (level 1). */
export const sendYarnPurchaseForApproval = (id: number | string, branchId: number | string, menuId: number | string) =>
  postStatusChange(
    apiRoutesPortalMasters.YARN_PURCHASE_SEND_FOR_APPROVAL,
    statusBody(id, branchId, menuId),
    "Empty response from send for approval API.",
  );

/** 20 pending → next level (stays 20) or 3 approved on the final level. */
export const approveYarnPurchase = (id: number | string, branchId: number | string, menuId: number | string) =>
  postStatusChange(apiRoutesPortalMasters.YARN_PURCHASE_APPROVE, statusBody(id, branchId, menuId), "Empty response from approve API.");

/** 4 rejected / 6 cancelled → back to draft or open (backend decides). */
export const reopenYarnPurchase = (id: number | string, branchId: number | string, menuId: number | string) =>
  postStatusChange(apiRoutesPortalMasters.YARN_PURCHASE_REOPEN, statusBody(id, branchId, menuId), "Empty response from reopen API.");

/** 20 pending → 4 rejected. Note the body carries `co_id` instead of `branch_id`. */
export const rejectYarnPurchase = (id: number | string, coId: number | string, menuId: number | string, reason: string) =>
  postStatusChange(
    apiRoutesPortalMasters.YARN_PURCHASE_REJECT,
    { yarn_purchase_id: toId(id), co_id: toId(coId), menu_id: toId(menuId), reason },
    "Empty response from reject API.",
  );
