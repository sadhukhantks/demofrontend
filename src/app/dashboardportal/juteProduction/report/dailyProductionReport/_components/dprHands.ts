/**
 * Wording for the hands-per-MT figures on the Daily Production Report.
 *
 * TKT-000185: hands/MT is stage-wise — yarn-stage hands ÷ spinning MT plus
 * cloth-stage hands ÷ weaving MT, common hands spread pro-rata — so purchased
 * yarn (woven here, never spun here) and surplus yarn (spun, not woven) each
 * land only in the denominator whose hands actually touched them. The KPI
 * card carries the two addends and the month-to-date figure; the hands
 * section lists which department fell in which stage and the day's yarn
 * balance (spun + purchased − woven), so an odd day explains itself.
 *
 * Pure functions — page.tsx renders the strings (screen and print alike),
 * vitest covers them.
 */

import type {
  DprHandsSection,
  DprHandsStage,
  DprHandsStages,
  DprKpi,
  DprYarnBalance,
} from "@/utils/juteProductionReportService";
import { fmt } from "./DprPieces";

/** KPI-card caption: the two addends, or the TKT-000117 fallback arithmetic. */
export function handsKpiSub(kpi: DprKpi): string {
  const mtd = `MTD ${fmt(kpi.hands_per_mt_mtd, 1)}`;
  if (kpi.hands_stage_basis) {
    return (
      `yarn ${fmt(kpi.hands_per_mt_yarn, 1)} + cloth ${fmt(kpi.hands_per_mt_cloth, 1)} · ${mtd} · ` +
      `all hands ÷ spinning ${fmt(kpi.hands_per_mt_spinning_basis, 1)}`
    );
  }
  return `${fmt(kpi.total_hands, 0)} hands ÷ ${fmt(kpi.spinning_mt, 3)} MT spinning · ${mtd}`;
}

function signed(v: number | null | undefined, digits: number): string {
  if (v === null || v === undefined || Number.isNaN(v)) return fmt(v, digits);
  return `${v >= 0 ? "+" : ""}${fmt(v, digits)}`;
}

/** "Yarn balance: spun … + purchased … − woven … = +x MT to yarn stock / sale (MTD …)". */
export function yarnBalanceText(balance: DprYarnBalance): string {
  const purchased = balance.purchased_available
    ? ` + purchased yarn issued ${fmt(balance.day.purchased_issued_mt, 3)} MT`
    : " (purchased yarn not tracked on this tenant)";
  return (
    `Yarn balance: spun ${fmt(balance.day.spun_mt, 3)} MT${purchased} − woven ` +
    `${fmt(balance.day.woven_mt, 3)} MT = ${signed(balance.day.surplus_mt, 3)} MT to ` +
    `yarn stock / sale (MTD ${signed(balance.mtd.surplus_mt, 1)} MT).`
  );
}

function deptList(stage: Pick<DprHandsStage, "label" | "depts">): string {
  return `${stage.label}: ${stage.depts.length ? stage.depts.join(", ") : "none"}`;
}

/** Which departments landed in which stage — the mapping is by name. */
export function stageDeptsText(stages: DprHandsStages): string {
  return `Departments — ${deptList(stages.yarn)}; ${deptList(stages.cloth)}; ${deptList(stages.common)}.`;
}

/** "Common hands, spread 42% yarn / 58% cloth". */
export function commonSplitLabel(stages: DprHandsStages): string {
  const yarn = stages.common.yarn_share_pct;
  return `${stages.common.label}: ${fmt(yarn, 0)}% yarn / ${fmt(100 - yarn, 0)}% cloth`;
}

/** The TKT-000117 sentence, shown only when no department could be resolved. */
export function fallbackHandsText(hands: DprHandsSection): string {
  return (
    `Overall labour productivity: ${fmt(hands.total.day_hands, 2)} hands ÷ ` +
    `${fmt(hands.spinning_basis.day_mt, 3)} MT (${hands.basis_label}) = ` +
    `${fmt(hands.hands_per_mt, 1)} hands per MT (MTD ${fmt(hands.mtd_hands_per_mt, 1)}).`
  );
}
