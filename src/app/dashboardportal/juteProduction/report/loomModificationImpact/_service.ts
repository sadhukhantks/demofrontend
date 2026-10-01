/**
 * Loom Modification Impact report service.
 *
 * Backend: GET /api/juteProductionReports/loom_modification_impact and
 * /loom_modification_impact_options (vowerp3be
 * src/juteProduction/loom_modification_impact.py). One call returns every
 * section of the report — chain, windows, verdict, stage ladder, per loom,
 * day-wise, mechanical context, evidence and meta — because every figure is
 * derived server-side from the same loom-day set; fetching per tab would let
 * the tabs disagree.
 *
 * The report is an EFFICIENCY comparison only (owner, 2026-09-29): before vs
 * after each stage, vs control, plus a breakdown / mechanical-stoppage
 * context section. Types follow the trimmed response contract (spec
 * docs/superpowers/specs/2026-09-26-loom-modification-impact-design.md §7).
 * Optional figures arrive as null and are rendered as "—"; the page never
 * computes a figure of its own.
 *
 * Kept next to the page rather than in utils/juteProductionReportService.ts:
 * these types are used by this route only.
 */

import { apiRoutesPortalMasters } from "@/utils/api";
import { fetchWithCookie } from "@/utils/apiClient2";

// ---------------------------------------------------------------------------
// Wire types — report
// ---------------------------------------------------------------------------

export type ImpactControlMode = "speed_band" | "same_dept" | "control_group" | "none";

export type ImpactVerdictCode = "IMPROVED" | "WORSE" | "NO_CLEAR_CHANGE" | "NOT_ENOUGH_DATA";

/** Per-loom confounder flags (§7.2 C) — standard, hours, weaver, thin data, no standard. */
export type ImpactFlag = "S" | "H" | "W" | "D" | "N";

export interface ImpactLoomGroupRef {
  loom_group_id: number;
  group_code: string;
  group_name: string;
}

export interface ImpactStage {
  modification_id: number;
  seq: number;
  mod_kind: string;
  mod_kind_label: string;
  mod_date: string;
  mod_to_date: string | null;
  settle_days: number | null;
  title: string;
  mod_category: string | null;
  mod_category_label: string | null;
  done_by: string | null;
  done_by_label: string | null;
  loom_count: number;
  root_loom_count: number;
  control_description: string | null;
}

export interface ImpactChain {
  root_modification_id: number;
  title: string;
  loom_group: ImpactLoomGroupRef | null;
  stages: ImpactStage[];
}

export interface ImpactWindowSpan {
  date_from: string;
  date_to: string;
  days: number;
}

export interface ImpactBeforeWindow extends ImpactWindowSpan {
  extended: boolean;
}

export interface ImpactExcludedWindow {
  stage_seq: number;
  date_from: string;
  date_to: string;
}

export interface ImpactAfterWindow extends ImpactWindowSpan {
  stage_seq: number;
  cut_reason: "window" | "next_event" | "last_data_date";
}

export interface ImpactWindows {
  window_days: number;
  settle_days: number;
  last_data_date: string | null;
  before: ImpactBeforeWindow;
  excluded: ImpactExcludedWindow[];
  after: ImpactAfterWindow[];
}

/** Efficiency % before | after the judged stage, its change and the noise band. */
export interface ImpactEfficiency {
  before: number | null;
  after: number | null;
  delta_pts: number | null;
  delta_pct: number | null;
  net_delta_pct: number | null;
  se: number | null;
  within_noise: boolean;
}

/** Same pair re-rated at the baseline standard — sent only when a study loom carries S. */
export interface ImpactEfficiencyAtBaseline {
  before: number | null;
  after: number | null;
  delta_pts: number | null;
  delta_pct: number | null;
}

/** One side of the comparison block: this loom set, or the un-modified looms. */
export interface ImpactComparisonSide {
  looms_n: number | null;
  before: number | null;
  after: number | null;
  delta_pts: number | null;
  delta_pct: number | null;
}

/**
 * "This loom set vs looms not modified" (owner, 2026-09-29): the judged
 * stage's Before / After figures for the study looms and the control set side
 * by side, on the verdict basis, plus the net effect. Built server-side from
 * the same aggregates as the ladder rows of that stage.
 */
export interface ImpactComparison {
  basis: "efficiency" | "efficiency_at_baseline_std";
  stage_seq: number | null;
  /** The control description ("43 un-modified looms of the same dept …" or the group name). */
  description: string | null;
  study: ImpactComparisonSide;
  /** null when no control set was selected or eligible. */
  control: ImpactComparisonSide | null;
  /** study.delta_pts − control.delta_pts. */
  net_delta_pts: number | null;
  /** The existing net-vs-control figure (DiD per speed band in speed_band mode). */
  net_delta_pct: number | null;
}

export interface ImpactVerdict {
  verdict: ImpactVerdictCode;
  stage_seq: number | null;
  since_date: string | null;
  stage_label: string | null;
  efficiency: ImpactEfficiency | null;
  efficiency_at_baseline_std: ImpactEfficiencyAtBaseline | null;
  looms_improved: number | null;
  looms_total: number | null;
  /** Loom-days with a measurable efficiency on each side. */
  eff_days_before: number | null;
  eff_days_after: number | null;
  coverage_before_pct: number | null;
  coverage_after_pct: number | null;
  reason: string | null;
  other_stage_note: string | null;
  /** Side-by-side block under the verdict strip; absent from older payloads. */
  comparison?: ImpactComparison | null;
}

/** One row of the stage ladder — Before, After-k, or a shaded control twin. */
export interface ImpactSegment {
  /** 0 = Before. */
  seq: number;
  label: string;
  stage_seq: number | null;
  kind: string | null;
  date_from: string | null;
  date_to: string | null;
  days: number | null;
  looms_n: number | null;
  looms_total: number | null;
  loom_days: number | null;
  days_run: number | null;
  producing_days: number | null;
  eff_days: number | null;
  hours_run: number | null;
  std_coverage_pct: number | null;
  hours_coverage_pct: number | null;
  efficiency_pct: number | null;
  efficiency_at_baseline_std_pct: number | null;
  delta_vs_baseline_pts: number | null;
  delta_vs_baseline_pct: number | null;
  delta_vs_previous_pts: number | null;
  delta_vs_previous_pct: number | null;
  net_vs_control_pct: number | null;
  se: number | null;
  verdict: ImpactVerdictCode | null;
  is_control: boolean;
}

export type ImpactPerLoomRowKind = "loom" | "study_total" | "control_total";

export interface ImpactPerLoomRow {
  machine_id: number | null;
  loom: string | null;
  line_no: string | number | null;
  speed_band: string | null;
  since_date: string | null;
  producing_days_before: number | null;
  producing_days_after: number | null;
  eff_days_before: number | null;
  eff_days_after: number | null;
  eff_before: number | null;
  eff_after: number | null;
  delta_pts: number | null;
  delta_pct: number | null;
  eff_baseline_std_before: number | null;
  eff_baseline_std_after: number | null;
  std_speed_baseline: number | null;
  std_speed_latest: number | null;
  flags: ImpactFlag[];
  in_stage: boolean;
  row_kind: ImpactPerLoomRowKind;
}

export interface ImpactDayRow {
  tran_date: string;
  /** BEFORE | EXCLUDED | AFTER-1 | AFTER-2 … */
  phase: string;
  study_looms_run: number | null;
  study_eff: number | null;
  study_rolling7: number | null;
  control_eff: number | null;
  control_rolling7: number | null;
  gap: number | null;
  markers: string[];
}

export type ImpactMechanicalRowKind = "loom" | "total";

/** Breakdown & mechanical context per study loom, before | after. */
export interface ImpactMechanicalRow {
  machine_id: number | null;
  loom: string | null;
  side: "BEFORE" | "AFTER";
  mech_stoppage_hours: number | null;
  breakdown_count: number | null;
  breakdown_minutes: number | null;
  row_kind: ImpactMechanicalRowKind;
}

export interface ImpactEvidence {
  label: string;
  value: string | number | null;
}

export interface ImpactMeta {
  source: string | null;
  /** Every constant in force plus n1, n2, s_p, se — keys vary, values are numbers or maps. */
  thresholds: Record<string, unknown>;
  notes: string[];
  server_ms: number | null;
  control: { mode: ImpactControlMode | string; looms_n: number | null; description: string | null } | null;
  flags_legend: Partial<Record<ImpactFlag, string>> | null;
}

export interface LoomModificationImpactReport {
  chain: ImpactChain;
  windows: ImpactWindows;
  verdict: ImpactVerdict;
  segments: ImpactSegment[];
  per_loom: ImpactPerLoomRow[];
  daywise: ImpactDayRow[];
  mechanical: ImpactMechanicalRow[];
  evidence: ImpactEvidence[];
  meta: ImpactMeta;
}

// ---------------------------------------------------------------------------
// Wire types — options
// ---------------------------------------------------------------------------

export interface ImpactModificationOption {
  /** Root modification id of the chain. */
  modification_id: number;
  label: string;
  mod_date: string;
  title: string;
  loom_group_name: string | null;
  loom_count: number;
  stage_count: number;
}

export interface ImpactControlGroupOption {
  loom_group_id: number;
  group_name: string;
}

export interface LoomModificationImpactOptions {
  modifications: ImpactModificationOption[];
  control_groups: ImpactControlGroupOption[];
  window_presets: number[];
  default_window_days: number;
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

/** Filter state as the page holds it — "" means "not applied / default". */
export interface LoomModificationImpactFilters {
  coId: number;
  branchId: number;
  modificationId: number;
  windowDays: number;
  /** "" = the event's own settle days. */
  settleDays?: number | "";
  control?: ImpactControlMode | "";
  controlGroupId?: number | "";
}

const OPTIONS_ERROR = "Failed to fetch the loom modification impact options";
const REPORT_ERROR = "Failed to fetch the loom modification impact report";

/** Query string of a report run — exported so the test can pin the wire names. */
export function buildImpactQuery(f: LoomModificationImpactFilters): string {
  const qs = new URLSearchParams();
  qs.set("co_id", String(f.coId));
  qs.set("branch_id", String(f.branchId));
  qs.set("modification_id", String(f.modificationId));
  qs.set("window_days", String(f.windowDays));
  // Blank settle days are omitted, not sent empty: the endpoint then takes the
  // event's own settle_days.
  if (f.settleDays !== undefined && f.settleDays !== "") {
    qs.set("settle_days", String(f.settleDays));
  }
  qs.set("control", f.control || "speed_band");
  if (f.control === "control_group" && f.controlGroupId !== undefined && f.controlGroupId !== "") {
    qs.set("control_group_id", String(f.controlGroupId));
  }
  return qs.toString();
}

/** The whole report for one chain and one set of filters. */
export async function fetchLoomModificationImpact(
  f: LoomModificationImpactFilters,
): Promise<LoomModificationImpactReport> {
  const url = `${apiRoutesPortalMasters.JP_LOOM_MODIFICATION_IMPACT}?${buildImpactQuery(f)}`;
  const res = await fetchWithCookie<{ data: LoomModificationImpactReport }>(url);
  if (res.error || !res.data) {
    throw new Error(res.error ?? REPORT_ERROR);
  }
  return res.data.data;
}

/** Root chains, CONTROL groups and the window presets of a branch. */
export async function fetchLoomModificationImpactOptions(params: {
  coId: number;
  branchId: number;
}): Promise<LoomModificationImpactOptions> {
  const qs = new URLSearchParams();
  qs.set("co_id", String(params.coId));
  qs.set("branch_id", String(params.branchId));
  const url = `${apiRoutesPortalMasters.JP_LOOM_MODIFICATION_IMPACT_OPTIONS}?${qs.toString()}`;
  const res = await fetchWithCookie<{ data: LoomModificationImpactOptions }>(url);
  if (res.error || !res.data) {
    throw new Error(res.error ?? OPTIONS_ERROR);
  }
  return res.data.data;
}
