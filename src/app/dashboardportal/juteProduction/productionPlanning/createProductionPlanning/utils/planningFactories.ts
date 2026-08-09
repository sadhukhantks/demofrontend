/**
 * Blank-line factories + default document builder for Production Planning.
 * Pure — no React, no fetch. Norm resolution happens through the passed
 * `resolveNorm` lookup (built by usePlanningSetup from planning_setup norms).
 */

import type {
  DeptLineUI,
  LoomLineUI,
  PlanningDocUI,
  ProductGroup,
  StageCode,
  YarnLineKind,
  YarnLineUI,
  YarnSection,
} from "../types/productionPlanningTypes";
import type { PlanningStageSetup } from "@/utils/juteProductionPlanningService";
import { STAGES } from "./planningConstants";
import { autoField } from "./planningCalc";

let uidCounter = 0;

/** Stable-enough unique row key for React lists (UI only, never persisted). */
export function makeUid(): string {
  uidCounter += 1;
  return `pl-${uidCounter}-${Date.now().toString(36)}`;
}

/** `(idType, refId, param) → norm value | null` resolved for the plan date. */
export type NormResolver = (idType: "qid" | "yid" | "stage", refId: number, param: string) => number | null;

export function createBlankLoomLine(productGroup: ProductGroup, uid: string = makeUid()): LoomLineUI {
  return {
    uid,
    planning_loom_id: null,
    product_group: productGroup,
    quality_item_id: null,
    quality_desc: "",
    looms_a: 0,
    looms_b: 0,
    looms_c: 0,
    kg_per_loom_100: 0,
    eff_pct: 0,
    kg_per_loom: autoField(0),
    prod_a: autoField(0),
    prod_b: autoField(0),
    prod_c: autoField(0),
    warp_yarn_item_id: null,
    weft_yarn_item_id: null,
    warp_pct: null,
    weft_pct: null,
    remarks: "",
  };
}

export function createBlankYarnLine(
  lineKind: YarnLineKind,
  section: YarnSection,
  uid: string = makeUid()
): YarnLineUI {
  return {
    uid,
    planning_yarn_id: null,
    line_kind: lineKind,
    section,
    yarn_item_id: null,
    yarn_desc: "",
    warp_weft: null,
    pct_of_prod: lineKind === "CLOTH" ? 0 : null,
    req_kg_a: autoField(0),
    req_kg_b: autoField(0),
    req_kg_c: autoField(0),
    req_kg_day: autoField(0),
    kg_per_frame_100: 0,
    eff_pct: 0,
    kg_per_frame: autoField(0),
    frames_required: autoField(0),
    frames_a: autoField(0),
    frames_b: autoField(0),
    frames_c: autoField(0),
    priority: null,
    order_mt: lineKind === "SALE" ? 0 : null,
    days_needed: autoField(0),
    delivery_date: null,
    remarks: "",
  };
}

export function createBlankDeptLine(
  stageSeq: number,
  stageCode: StageCode,
  stageLabel: string,
  uid: string = makeUid()
): DeptLineUI {
  return {
    uid,
    planning_dept_id: null,
    stage_seq: stageSeq,
    stage_code: stageCode,
    stage_label: stageLabel,
    output_kg_day: autoField(0),
    waste_pct: 0,
    input_kg_day: autoField(0),
    kg_per_machine: autoField(0),
    machines_required: autoField(0),
    machines_a: autoField(0),
    machines_b: autoField(0),
    machines_c: autoField(0),
    machines_installed: null,
    machines_maint: null,
    machines_ready: null,
    remarks: "",
  };
}

/**
 * Default dept rows: the 7 fixed stages, seeded with stage norms
 * (kg_per_machine, waste_pct) and machines_installed from planning_setup.
 */
export function buildDefaultDeptLines(
  stages: readonly PlanningStageSetup[],
  resolveNorm: NormResolver
): DeptLineUI[] {
  const source = stages.length > 0 ? stages : STAGES.map((s) => ({
    stage_seq: s.stage_seq,
    stage_code: s.stage_code,
    stage_label: s.stage_label,
    machines_installed: null,
  }));

  return source.map((stage) => {
    const def = STAGES.find((s) => s.stage_seq === stage.stage_seq);
    const line = createBlankDeptLine(
      stage.stage_seq,
      (stage.stage_code as StageCode) ?? def?.stage_code ?? "BATCHING",
      stage.stage_label || def?.stage_label || stage.stage_code
    );
    const kgPerMachine = resolveNorm("stage", stage.stage_seq, "kg_per_machine");
    const wastePct = resolveNorm("stage", stage.stage_seq, "waste_pct");
    if (kgPerMachine != null) line.kg_per_machine = autoField(kgPerMachine);
    if (wastePct != null) line.waste_pct = wastePct;
    line.machines_installed = stage.machines_installed ?? null;
    return line;
  });
}

/** Default (create-mode) document: empty line sections + the 7 stage rows. */
export function buildDefaultDoc(params: {
  coId: number;
  branchId: number | null;
  planDate: string;
  stages: readonly PlanningStageSetup[];
  resolveNorm: NormResolver;
}): PlanningDocUI {
  return {
    planning_id: null,
    plan_no: null,
    co_id: params.coId,
    branch_id: params.branchId,
    plan_date: params.planDate,
    plan_name: "",
    remarks: "",
    loom_lines: [],
    yarn_lines: [],
    dept_lines: buildDefaultDeptLines(params.stages, params.resolveNorm),
  };
}

/** Applies quality (qid) norms onto a loom line when a cloth quality is picked. */
export function applyQualityNorms(
  line: LoomLineUI,
  qualityItemId: number,
  qualityDesc: string,
  resolveNorm: NormResolver
): LoomLineUI {
  const kgPerLoom100 = resolveNorm("qid", qualityItemId, "kg_per_loom_100");
  const warpPct = resolveNorm("qid", qualityItemId, "warp_pct");
  const weftPct = resolveNorm("qid", qualityItemId, "weft_pct");
  const warpYarn = resolveNorm("qid", qualityItemId, "warp_yarn_item");
  const weftYarn = resolveNorm("qid", qualityItemId, "weft_yarn_item");
  const stdEff = resolveNorm("qid", qualityItemId, "std_eff");

  return {
    ...line,
    quality_item_id: qualityItemId,
    quality_desc: qualityDesc,
    kg_per_loom_100: kgPerLoom100 ?? line.kg_per_loom_100,
    eff_pct: stdEff ?? line.eff_pct,
    warp_pct: warpPct ?? line.warp_pct,
    weft_pct: weftPct ?? line.weft_pct,
    warp_yarn_item_id: warpYarn != null ? Math.trunc(warpYarn) : line.warp_yarn_item_id,
    weft_yarn_item_id: weftYarn != null ? Math.trunc(weftYarn) : line.weft_yarn_item_id,
  };
}

/** Applies yarn (yid) norms onto a yarn line when a yarn item is picked. */
export function applyYarnNorms(
  line: YarnLineUI,
  yarnItemId: number,
  yarnDesc: string,
  resolveNorm: NormResolver
): YarnLineUI {
  const kgPerFrame100 = resolveNorm("yid", yarnItemId, "kg_per_frame_100");
  const stdEff = resolveNorm("yid", yarnItemId, "std_eff");

  return {
    ...line,
    yarn_item_id: yarnItemId,
    yarn_desc: yarnDesc,
    kg_per_frame_100: kgPerFrame100 ?? line.kg_per_frame_100,
    eff_pct: stdEff ?? line.eff_pct,
  };
}
