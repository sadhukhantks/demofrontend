/**
 * ALL Production Planning UI types live in this single file (module convention —
 * prevents circular deps). API shapes live in the service file
 * (`@/utils/juteProductionPlanningService`); these are the in-page shapes.
 */

export type PlanningMode = "create" | "edit" | "view";

export type ProductGroup = "SACKING" | "HESSIAN" | "PACKSHEET" | "OTHER";

export type YarnSection = "SACKING" | "HESSIAN" | "PACKSHEET" | "TWINE" | "SALE" | "OTHER";

export type YarnLineKind = "CLOTH" | "SALE";

export type WarpWeft = "WP" | "WT";

export type StageCode =
  | "BATCHING"
  | "CARDING"
  | "DRAWING"
  | "SPINNING"
  | "WINDING"
  | "BEAMING"
  | "WEAVING";

/**
 * A derivable value with its auto/manual UI flag.
 * `auto === true` → recomputed on every upstream change.
 * `auto === false` → user override wins; only a per-section Recalculate resets it.
 * Persistence stores plain numbers — flags are UI state only, and a loaded plan
 * starts all-manual.
 */
export type CalcField = {
  value: number;
  auto: boolean;
};

// ─── Section 1: loom / weaving plan line ──────────────────────────────────

export type LoomLineUI = {
  uid: string;
  planning_loom_id: number | null;
  product_group: ProductGroup;
  /** NULL = group-level row (SACKING style). */
  quality_item_id: number | null;
  quality_desc: string;
  looms_a: number;
  looms_b: number;
  looms_c: number;
  /** Per loom per shift @100% eff. */
  kg_per_loom_100: number;
  eff_pct: number;
  /** Effective per loom per shift (derivable). */
  kg_per_loom: CalcField;
  prod_a: CalcField;
  prod_b: CalcField;
  prod_c: CalcField;
  warp_yarn_item_id: number | null;
  weft_yarn_item_id: number | null;
  warp_pct: number | null;
  weft_pct: number | null;
  remarks: string;
};

// ─── Section 2: yarn requirement + frame allocation line ──────────────────

export type YarnLineUI = {
  uid: string;
  planning_yarn_id: number | null;
  line_kind: YarnLineKind;
  section: YarnSection;
  yarn_item_id: number | null;
  yarn_desc: string;
  warp_weft: WarpWeft | null;
  /** CLOTH+SACKING style: % of the section's cloth production. */
  pct_of_prod: number | null;
  req_kg_a: CalcField;
  req_kg_b: CalcField;
  req_kg_c: CalcField;
  req_kg_day: CalcField;
  /** Per frame per shift @100% eff. */
  kg_per_frame_100: number;
  eff_pct: number;
  kg_per_frame: CalcField;
  /** Frame-shifts per day = req_kg_day / kg_per_frame. */
  frames_required: CalcField;
  frames_a: CalcField;
  frames_b: CalcField;
  frames_c: CalcField;
  priority: number | null;
  /** SALE lines: order quantity in MT. */
  order_mt: number | null;
  days_needed: CalcField;
  delivery_date: string | null;
  remarks: string;
};

// ─── Section 3: dept-wise breakup line ────────────────────────────────────

export type DeptLineUI = {
  uid: string;
  planning_dept_id: number | null;
  stage_seq: number;
  stage_code: StageCode;
  stage_label: string;
  /** Required output per day. */
  output_kg_day: CalcField;
  waste_pct: number;
  /** output × (1 + waste_pct/100). */
  input_kg_day: CalcField;
  /** Per machine per shift. */
  kg_per_machine: CalcField;
  /** Machine-shifts per day. */
  machines_required: CalcField;
  machines_a: CalcField;
  machines_b: CalcField;
  machines_c: CalcField;
  machines_installed: number | null;
  machines_maint: number | null;
  /** Derived: installed − maint when both present (always recomputed). */
  machines_ready: number | null;
  remarks: string;
};

// ─── Document ─────────────────────────────────────────────────────────────

export type PlanningDocUI = {
  planning_id: number | null;
  plan_no: string | null;
  co_id: number;
  branch_id: number | null;
  plan_date: string;
  plan_name: string;
  remarks: string;
  loom_lines: LoomLineUI[];
  yarn_lines: YarnLineUI[];
  dept_lines: DeptLineUI[];
};

// ─── Derived / helper shapes ──────────────────────────────────────────────

export type ShiftKey = "a" | "b" | "c";

export type ShiftTotals = {
  a: number;
  b: number;
  c: number;
  day: number;
};

export type LoomTotals = {
  byGroup: Partial<Record<ProductGroup, ShiftTotals>>;
  grand: ShiftTotals;
};

export type PlanningWarningCode =
  | "UNDER_ALLOC"
  | "OVER_READY"
  | "PCT_SUM"
  | "WARP_WEFT_SUM";

export type PlanningSection = "loom" | "yarn" | "dept";

export type PlanningWarning = {
  code: PlanningWarningCode;
  section: PlanningSection;
  /** Row uid when the warning anchors to a single row (for row highlight). */
  uid?: string;
  message: string;
};

export type PlanningSummary = {
  totalClothKgDay: number;
  totalYarnKgDay: number;
  framesRequired: number;
  framesAllocated: number;
  framesReady: number | null;
  rawJuteKgDay: number;
};

/** Resolves the effective rate norms for a yarn item (deriveYarnLines input). */
export type YarnRateResolver = (yarnItemId: number) => {
  kg_per_frame_100: number;
  eff_pct: number;
} | null;

/** Resolves a display label for a yarn item. */
export type YarnDescResolver = (yarnItemId: number) => string;

export type DeriveYarnLinesParams = {
  loomLines: readonly LoomLineUI[];
  yarnLines: readonly YarnLineUI[];
  resolveRate?: YarnRateResolver;
  resolveDesc?: YarnDescResolver;
  makeUid: () => string;
};

/** Norm lookup key: `${id_type}:${ref_id}:${param}` → value. */
export type NormLookup = ReadonlyMap<string, number>;

/** Keys of the derivable (CalcField) cells per line kind — used by the edit API. */
export type LoomCalcKey = "kg_per_loom" | "prod_a" | "prod_b" | "prod_c";

export type YarnCalcKey =
  | "req_kg_a"
  | "req_kg_b"
  | "req_kg_c"
  | "req_kg_day"
  | "kg_per_frame"
  | "frames_required"
  | "frames_a"
  | "frames_b"
  | "frames_c"
  | "days_needed";

export type DeptCalcKey =
  | "output_kg_day"
  | "input_kg_day"
  | "kg_per_machine"
  | "machines_required"
  | "machines_a"
  | "machines_b"
  | "machines_c";

export type StageDef = {
  stage_seq: number;
  stage_code: StageCode;
  stage_label: string;
  /** FE label for the machines count column ("Machines / Workers" for WINDING). */
  machine_label: string;
};
