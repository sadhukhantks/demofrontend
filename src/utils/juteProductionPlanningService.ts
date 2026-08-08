import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";

/**
 * Service layer for the Jute Production — Production Planning feature
 * (backend router prefix /api/juteProdPlanning).
 *
 * Every backend response is wrapped `{ "data": ... }`; the helpers below unwrap
 * it and throw on transport errors / missing payloads (indentService.ts style).
 * No page or hook calls fetchWithCookie directly for this feature.
 */

// ─── Setup / lookup shapes ────────────────────────────────────────────────

export type ClothQualityOption = {
  item_id: number;
  item_name: string;
  grp_name?: string | null;
};

export type YarnItemOption = {
  item_id: number;
  item_name: string;
  yarn_count?: number | string | null;
};

export type PlanningStageSetup = {
  stage_seq: number;
  stage_code: string;
  stage_label: string;
  machine_type_name?: string | null;
  machines_installed?: number | null;
};

export type PlanningNormIdType = "qid" | "yid" | "stage";

export type PlanningNormValue = {
  id_type: PlanningNormIdType | string;
  ref_id: number;
  param: string;
  value: number | string;
};

export type PlanningSetupData = {
  cloth_qualities: ClothQualityOption[];
  yarn_items: YarnItemOption[];
  stages: PlanningStageSetup[];
  norms: PlanningNormValue[];
  latest_planning_id: number | null;
};

// ─── List / table shapes ──────────────────────────────────────────────────

export type PlanningTableRow = {
  planning_id: number;
  plan_no: string | null;
  plan_date: string;
  plan_name: string | null;
  branch_id: number | null;
  branch_name?: string | null;
  total_cloth_kg?: number | string | null;
  raw_jute_kg?: number | string | null;
  updated_by?: number | null;
  updated_by_name?: string | null;
  updated_date_time?: string | null;
};

// ─── Full-document shapes (planning_by_id / planning_latest) ──────────────

export type PlanningHeaderApi = {
  planning_id: number;
  co_id: number;
  branch_id: number | null;
  plan_date: string;
  plan_no: string | null;
  plan_name: string | null;
  remarks: string | null;
  status_id?: number;
  branch_name?: string | null;
  updated_by?: number | null;
  updated_date_time?: string | null;
};

/** DECIMAL columns may arrive as string over JSON — mappers coerce with Number(). */
export type ApiNumeric = number | string | null;

export type PlanningLoomLineApi = {
  planning_loom_id?: number | null;
  planning_id?: number | null;
  product_group: string;
  quality_item_id: number | null;
  quality_desc: string | null;
  looms_a: ApiNumeric;
  looms_b: ApiNumeric;
  looms_c: ApiNumeric;
  kg_per_loom_100: ApiNumeric;
  eff_pct: ApiNumeric;
  kg_per_loom: ApiNumeric;
  prod_a: ApiNumeric;
  prod_b: ApiNumeric;
  prod_c: ApiNumeric;
  warp_yarn_item_id: number | null;
  weft_yarn_item_id: number | null;
  warp_pct: ApiNumeric;
  weft_pct: ApiNumeric;
  line_order?: number | null;
  remarks: string | null;
};

export type PlanningYarnLineApi = {
  planning_yarn_id?: number | null;
  planning_id?: number | null;
  line_kind: string;
  section: string;
  yarn_item_id: number | null;
  yarn_desc: string | null;
  warp_weft: string | null;
  pct_of_prod: ApiNumeric;
  req_kg_a: ApiNumeric;
  req_kg_b: ApiNumeric;
  req_kg_c: ApiNumeric;
  req_kg_day: ApiNumeric;
  kg_per_frame_100: ApiNumeric;
  eff_pct: ApiNumeric;
  kg_per_frame: ApiNumeric;
  frames_required: ApiNumeric;
  frames_a: ApiNumeric;
  frames_b: ApiNumeric;
  frames_c: ApiNumeric;
  priority: number | null;
  order_mt: ApiNumeric;
  days_needed: ApiNumeric;
  delivery_date: string | null;
  line_order?: number | null;
  remarks: string | null;
};

export type PlanningDeptLineApi = {
  planning_dept_id?: number | null;
  planning_id?: number | null;
  stage_seq: number;
  stage_code: string;
  stage_label: string | null;
  output_kg_day: ApiNumeric;
  waste_pct: ApiNumeric;
  input_kg_day: ApiNumeric;
  kg_per_machine: ApiNumeric;
  machines_required: ApiNumeric;
  machines_a: ApiNumeric;
  machines_b: ApiNumeric;
  machines_c: ApiNumeric;
  machines_installed: number | null;
  machines_maint: number | null;
  machines_ready: number | null;
  line_order?: number | null;
  remarks: string | null;
};

export type PlanningDocumentApi = {
  header: PlanningHeaderApi;
  loom_lines: PlanningLoomLineApi[];
  yarn_lines: PlanningYarnLineApi[];
  dept_lines: PlanningDeptLineApi[];
};

// ─── Save shapes ──────────────────────────────────────────────────────────

export type PlanningLoomLineSave = Omit<PlanningLoomLineApi, "planning_id">;
export type PlanningYarnLineSave = Omit<PlanningYarnLineApi, "planning_id">;
export type PlanningDeptLineSave = Omit<PlanningDeptLineApi, "planning_id">;

export type PlanningSaveRequest = {
  co_id: number;
  branch_id: number | null;
  planning_id?: number | null;
  plan_date: string;
  plan_name?: string | null;
  remarks?: string | null;
  loom_lines: PlanningLoomLineSave[];
  yarn_lines: PlanningYarnLineSave[];
  dept_lines: PlanningDeptLineSave[];
  update_norms?: boolean;
};

export type PlanningSaveResponse = {
  planning_id: number;
  plan_no: string | null;
};

export type PlanningDeleteResponse = {
  message?: string;
};

// ─── Norms master shapes ──────────────────────────────────────────────────

/** One resolved cell — same contract as the stage target_map_grid endpoints. */
export type NormsGridCell = {
  value: number | string;
  /** effective_date of the norm row that resolved this value. */
  source_date?: string | null;
  /** true when source_date equals the requested on_date (set here, not inherited). */
  is_exact?: boolean;
};

export type NormsGridRow = {
  ref_id: number;
  ref_code?: string | null;
  ref_name: string | null;
  ref_group?: string | null;
  /** param → resolved cell; a param with no resolving norm row is omitted. */
  cells: Record<string, NormsGridCell | undefined>;
};

export type NormsGridResponse = {
  id_type: PlanningNormIdType | string;
  on_date?: string;
  branch_id?: number | null;
  params: string[];
  rows: NormsGridRow[];
};

export type NormHistoryRow = {
  planning_norm_id: number;
  co_id: number;
  branch_id: number | null;
  effective_date: string;
  ref_id: number;
  id_type: PlanningNormIdType | string;
  value_role?: string;
  param: string;
  value: number | string;
  active: number;
  updated_by?: number | null;
  updated_date_time?: string | null;
};

export type NormsBulkSaveEntry = {
  id_type: PlanningNormIdType;
  ref_id: number;
  param: string;
  value: number;
};

export type NormsBulkSaveRequest = {
  co_id: number;
  branch_id: number | null;
  effective_date: string;
  entries: NormsBulkSaveEntry[];
};

export type NormsBulkSaveResponse = {
  inserted?: number;
  skipped?: number;
  message?: string;
};

// ─── Internal helpers ─────────────────────────────────────────────────────

/** Unwrap the standard `{ data: T }` envelope, throwing on error/missing data. */
async function requestData<T>(url: string, method: string, body?: unknown): Promise<T> {
  const { data, error } = await fetchWithCookie<{ data: T }>(url, method, body);

  if (error) {
    throw new Error(error);
  }

  if (!data || typeof data !== "object" || !("data" in data)) {
    throw new Error(`Empty response from ${url}`);
  }

  const payload = (data as { data: T }).data;
  if (payload == null) {
    throw new Error(`Empty response payload from ${url}`);
  }

  return payload;
}

/** Same as requestData but a null payload is a legitimate answer (planning_latest). */
async function requestDataOrNull<T>(url: string, method: string, body?: unknown): Promise<T | null> {
  const { data, error } = await fetchWithCookie<{ data: T | null }>(url, method, body);

  if (error) {
    throw new Error(error);
  }

  if (!data || typeof data !== "object" || !("data" in data)) {
    throw new Error(`Empty response from ${url}`);
  }

  return (data as { data: T | null }).data;
}

// ─── Plan endpoints ───────────────────────────────────────────────────────

export async function fetchPlanningTable(params: {
  coId: string | number;
  branchId?: number | string | null;
  fromDate?: string;
  toDate?: string;
}): Promise<PlanningTableRow[]> {
  const query = new URLSearchParams({ co_id: String(params.coId) });
  if (params.branchId != null && params.branchId !== "") {
    query.set("branch_id", String(params.branchId));
  }
  if (params.fromDate) {
    query.set("from_date", params.fromDate);
  }
  if (params.toDate) {
    query.set("to_date", params.toDate);
  }

  return requestData<PlanningTableRow[]>(
    `${apiRoutesPortalMasters.JUTE_PROD_PLANNING_TABLE}?${query.toString()}`,
    "GET"
  );
}

export async function fetchPlanningSetup(params: {
  coId: string | number;
  branchId?: number | string | null;
  planDate?: string;
}): Promise<PlanningSetupData> {
  const query = new URLSearchParams({ co_id: String(params.coId) });
  if (params.branchId != null && params.branchId !== "") {
    query.set("branch_id", String(params.branchId));
  }
  if (params.planDate) {
    query.set("plan_date", params.planDate);
  }

  return requestData<PlanningSetupData>(
    `${apiRoutesPortalMasters.JUTE_PROD_PLANNING_SETUP}?${query.toString()}`,
    "GET"
  );
}

export async function fetchPlanningById(
  planningId: number | string,
  coId: string | number
): Promise<PlanningDocumentApi> {
  const query = new URLSearchParams({ co_id: String(coId) });

  return requestData<PlanningDocumentApi>(
    `${apiRoutesPortalMasters.JUTE_PROD_PLANNING_BY_ID}/${planningId}?${query.toString()}`,
    "GET"
  );
}

export async function fetchPlanningLatest(params: {
  coId: string | number;
  branchId?: number | string | null;
  beforeDate?: string;
}): Promise<PlanningDocumentApi | null> {
  const query = new URLSearchParams({ co_id: String(params.coId) });
  if (params.branchId != null && params.branchId !== "") {
    query.set("branch_id", String(params.branchId));
  }
  if (params.beforeDate) {
    query.set("before_date", params.beforeDate);
  }

  return requestDataOrNull<PlanningDocumentApi>(
    `${apiRoutesPortalMasters.JUTE_PROD_PLANNING_LATEST}?${query.toString()}`,
    "GET"
  );
}

export async function savePlanning(payload: PlanningSaveRequest): Promise<PlanningSaveResponse> {
  return requestData<PlanningSaveResponse>(
    apiRoutesPortalMasters.JUTE_PROD_PLANNING_SAVE,
    "POST",
    payload
  );
}

export async function deletePlanning(params: {
  planningId: number;
  coId: string | number;
}): Promise<PlanningDeleteResponse> {
  return requestData<PlanningDeleteResponse>(
    apiRoutesPortalMasters.JUTE_PROD_PLANNING_DELETE,
    "POST",
    { planning_id: params.planningId, co_id: Number(params.coId) }
  );
}

// ─── Norms endpoints ──────────────────────────────────────────────────────

export async function fetchNormsGrid(params: {
  coId: string | number;
  branchId?: number | string | null;
  onDate: string;
  idType: PlanningNormIdType;
}): Promise<NormsGridResponse> {
  const query = new URLSearchParams({
    co_id: String(params.coId),
    on_date: params.onDate,
    id_type: params.idType,
  });
  if (params.branchId != null && params.branchId !== "") {
    query.set("branch_id", String(params.branchId));
  }

  return requestData<NormsGridResponse>(
    `${apiRoutesPortalMasters.JUTE_PROD_PLANNING_NORMS_GRID}?${query.toString()}`,
    "GET"
  );
}

export async function fetchNormsList(params: {
  coId: string | number;
  idType: PlanningNormIdType;
  refId: number;
}): Promise<NormHistoryRow[]> {
  const query = new URLSearchParams({
    co_id: String(params.coId),
    id_type: params.idType,
    ref_id: String(params.refId),
  });

  return requestData<NormHistoryRow[]>(
    `${apiRoutesPortalMasters.JUTE_PROD_PLANNING_NORMS_LIST}?${query.toString()}`,
    "GET"
  );
}

export async function bulkSaveNorms(payload: NormsBulkSaveRequest): Promise<NormsBulkSaveResponse> {
  return requestData<NormsBulkSaveResponse>(
    apiRoutesPortalMasters.JUTE_PROD_PLANNING_NORMS_BULK_SAVE,
    "POST",
    payload
  );
}

export async function deleteNorm(params: {
  planningNormId: number;
  coId: string | number;
}): Promise<PlanningDeleteResponse> {
  return requestData<PlanningDeleteResponse>(
    apiRoutesPortalMasters.JUTE_PROD_PLANNING_NORMS_DELETE,
    "POST",
    { planning_norm_id: params.planningNormId, co_id: Number(params.coId) }
  );
}
