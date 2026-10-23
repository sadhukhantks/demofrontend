"use client";

/**
 * The range at a glance: stat tiles with the period actual beside its
 * 30-day-median std, in rupees. Values stay in text ink; only the caption
 * is toned, and it always carries the words "above std" / "below std" /
 * "at std" (never colour alone). Cost lines (jute, wages) read the other
 * way round: good when at or below std. No achievement %.
 * ITM-027 adds "Operating profit per t" (vs its 30-day std) and
 * "Conversion cost per t" (stores + power + wages + overheads, against the
 * ₹10,000/t rule of thumb plus wages), both read from the statement.
 * Tiles are sized so a phone shows two per row (KpiCard flex 1 1 150px).
 */

import React from "react";
import { Box } from "@mui/material";
import {
  KpiCard,
  type KpiState,
} from "../../../../juteProduction/report/dailyProductionReport/_components/DprPieces";
import type { DailyPlPeriod, DailyPlStatement, DailyPlStd } from "../_service";
import { fmtMoney, fmtRupee, fmtT } from "../dayColumns";
import { conversionCostPerT } from "../statement";

/** Caption + tone of an actual against its std. */
export function vsStd(
  actual: number | null,
  std: number | null,
  lowerIsBetter = false,
): { state: KpiState; text: string } {
  if (std == null) return { state: undefined, text: "no std — no producing day in the 30-day window" };
  if (actual == null) return { state: undefined, text: `std ${fmtRupee(std)} · no actual` };
  const diff = actual - std;
  const word = diff > 0 ? "above std" : diff < 0 ? "below std" : "at std";
  const good = diff === 0 || (lowerIsBetter ? diff < 0 : diff > 0);
  return { state: good ? "good" : "warn", text: `std ${fmtRupee(std)} · ${word}` };
}

/** ₹ with the sign in front of the rupee ("−₹43"); "—" for null. */
const rupee = (v: number | null): string => fmtRupee(v);

/** The conversion-cost tile caption: the ₹10,000/t rule of thumb plus wages, then the verdict in words. */
export function conversionText(perT: number | null, benchmark: number | null, wagesPerT: number | null, missing: string[]): {
  state: KpiState;
  text: string;
} {
  const rule = wagesPerT == null ? "rule of thumb ₹10,000 + wages" : `rule of thumb ₹10,000 + wages ₹${fmtMoney(wagesPerT)}`;
  const left = missing.length >= 4 ? " · no head available" : missing.length > 0 ? ` · without ${missing.join(", ")}` : "";
  if (perT == null || benchmark == null) return { state: undefined, text: `${rule}${left}` };
  const diff = perT - benchmark;
  const word = Math.abs(diff) < 0.5 ? "at the rule of thumb" : diff < 0 ? `₹${fmtMoney(-diff)} below` : `₹${fmtMoney(diff)} above`;
  return { state: diff <= 0 ? "good" : "warn", text: `${rule} · ${word}${left}` };
}

export default function KpiStrip({
  mtd,
  std,
  statement = null,
}: {
  mtd: DailyPlPeriod;
  std: DailyPlStd;
  /** The six-head statement (ITM-027); null on a backend without it — the two new tiles then print "—". */
  statement?: DailyPlStatement | null;
}) {
  const perDay = vsStd(mtd.contribution_per_producing_day, std.contribution_per_day);
  const perT = vsStd(mtd.per_t_cloth.contribution, std.contribution_per_t);
  const opProfitPerT = statement?.operating_profit.per_t ?? mtd.per_t_cloth.operating_profit ?? null;
  const opProfit = vsStd(opProfitPerT, std.operating_profit_per_t ?? null);
  const conv = conversionCostPerT(statement);
  const convText = conversionText(conv.perT, conv.benchmarkPerT, conv.wagesPerT, conv.missing);
  const per100 = vsStd(
    mtd.per_100_spindles.contribution_per_100_spindle_hours,
    std.contribution_per_100_spindle_hours,
  );
  const realisation = vsStd(mtd.per_t_cloth.realisation, std.realisation_per_t);
  const jute = vsStd(mtd.per_t_cloth.jute_cost, std.jute_cost_per_t, true);
  const wages = vsStd(mtd.per_t_cloth.wages, std.wages_per_t, true);
  const bought = mtd.purchased_yarn_t != null ? ` + ${fmtT(mtd.purchased_yarn_t)} bought` : "";

  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
      <KpiCard
        label="Contribution per day"
        value={rupee(mtd.contribution_per_producing_day)}
        sub={`${perDay.text} · ${mtd.producing_days} of ${mtd.calendar_days} days producing`}
        state={perDay.state}
      />
      <KpiCard
        label="Contribution per t cloth"
        value={rupee(mtd.per_t_cloth.contribution)}
        sub={perT.text}
        state={perT.state}
      />
      <KpiCard label="Operating profit per t" value={rupee(opProfitPerT)} sub={opProfit.text} state={opProfit.state} />
      <KpiCard label="Conversion cost per t" value={rupee(conv.perT)} sub={convText.text} state={convText.state} />
      <KpiCard
        label="Contribution per 100 spindle-hours"
        value={rupee(mtd.per_100_spindles.contribution_per_100_spindle_hours)}
        sub={per100.text}
        state={per100.state}
      />
      <KpiCard
        label="Realisation per t"
        value={rupee(mtd.per_t_cloth.realisation)}
        sub={realisation.text}
        state={realisation.state}
      />
      <KpiCard
        label="Jute cost per t"
        value={rupee(mtd.per_t_cloth.jute_cost)}
        sub={jute.text}
        state={jute.state}
      />
      <KpiCard label="Wages per t" value={rupee(mtd.per_t_cloth.wages)} sub={wages.text} state={wages.state} />
      <KpiCard
        label={`Cloth t (${mtd.label})`}
        value={fmtT(mtd.cloth_t)}
        sub={`${fmtT(mtd.sacking_t)} sacking · ${fmtT(mtd.hessian_t)} hessian`}
      />
      <KpiCard
        label="Yarn surplus t"
        value={fmtT(mtd.yarn_surplus_t)}
        sub={`${fmtT(mtd.yarn_t)} spun${bought} − ${fmtT(mtd.cloth_t)} woven`}
      />
    </Box>
  );
}
