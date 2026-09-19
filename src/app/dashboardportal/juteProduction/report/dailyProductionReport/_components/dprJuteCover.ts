/**
 * Wording for the jute "days of cover" figure on the Daily Production Report.
 *
 * TKT-000172: cover = total closing stock ÷ the report date's spinning
 * production. When the report date was a holiday or a part day the divisor is
 * the average daily spinning production over the last producing days ending at
 * it (owner's rule). The divisor, its date(s) and the reason for an average are
 * always spelled out, so the figure can be checked by hand and a substitution
 * is never silent.
 *
 * Pure functions — page.tsx renders the strings (screen and print alike),
 * vitest covers them.
 */

import type { DprJuteCoverBasis, DprJuteSection } from "@/utils/juteProductionReportService";
import { fmt } from "./DprPieces";

/** "2026-09-18" → "18-09-2026"; anything else passes through untouched. */
export function isoToDdMmYyyy(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso;
}

/** "2026-09-07" → "07-09" — the short form used inside a date range. */
export function isoToDdMm(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}-${m[2]}` : iso;
}

const PART_DAY_NOTE = "report date was a holiday / part day";

function basisText(basis: DprJuteCoverBasis): string {
  if (basis.mode === "average") {
    return `${fmt(basis.production_kg, 0)} kg/day avg spinning, last ${basis.days} producing day${
      basis.days === 1 ? "" : "s"
    } (${isoToDdMm(basis.date_from)} to ${isoToDdMm(basis.date_to)})`;
  }
  return `${fmt(basis.production_kg, 0)} kg spinning on ${isoToDdMmYyyy(basis.date)}`;
}

/** Caption under the "Jute Closing Stock" KPI card. */
export function juteCoverKpiSub(jute: DprJuteSection | null): string {
  if (!jute) return "select a branch";
  if (jute.days_stock === null || !jute.cover_basis) return "no recent spinning production";
  return `${fmt(jute.days_stock, 1)} days cover · ÷ ${basisText(jute.cover_basis)}${
    jute.cover_basis.is_report_date ? "" : ` — ${PART_DAY_NOTE}`
  }`;
}

/** Subtitle of the "Jute Stock Position" section — the full hand calculation. */
export function juteCoverSubtitle(jute: DprJuteSection): string {
  const basis = jute.cover_basis;
  if (jute.days_stock === null || !basis) {
    return "Days of cover: — (no spinning production in the look-back window)";
  }
  const parts = [
    `Days of cover: ${fmt(jute.days_stock, 1)} = closing ${fmt(jute.totals.closing_weight, 0)} kg ÷ ${basisText(basis)}`,
  ];
  if (!basis.is_report_date) {
    parts.push(PART_DAY_NOTE);
  }
  if (jute.waste_closing_weight > 0 && jute.days_stock_raw_jute !== null) {
    parts.push(
      `raw jute alone (excl. ${fmt(jute.waste_closing_weight, 0)} kg process waste): ${fmt(jute.days_stock_raw_jute, 1)} days`,
    );
  }
  return parts.join(" · ");
}
