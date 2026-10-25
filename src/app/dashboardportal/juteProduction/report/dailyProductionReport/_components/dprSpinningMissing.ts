/**
 * TKT-000234 — explain blank Target/Frame-Shift and Eff % cells in the DPR's
 * "Spinning / Winder — Quality Wise" table. The backend names each missing
 * input per quality (`missing` codes) and rolls them up into `missing_summary`
 * (label + where to set it). The server-side PDF (dpr_pdf.spinning_missing_lines)
 * prints the same lines.
 */

import type {
  DprSpinningQualityRow,
  DprSpinningSection,
} from "@/utils/juteProductionReportService";

const NAME_LIMIT = 6;

function plural(n: number): string {
  return `${n} qualit${n === 1 ? "y" : "ies"}`;
}

function names(list: string[]): string {
  return `${list.slice(0, NAME_LIMIT).join(", ")}${list.length > NAME_LIMIT ? " …" : ""}`;
}

/** Headline, e.g. "Target not shown for 7 qualities; Eff % not shown for 7 qualities."
 * null when every cell has a figure. */
export function spinningMissingHeadline(sp: DprSpinningSection): string | null {
  const parts: string[] = [];
  const tgt = sp.targets_missing ?? [];
  if (tgt.length) parts.push(`Target not shown for ${plural(tgt.length)}`);
  if (sp.standards_missing.length) {
    parts.push(`Eff % not shown for ${plural(sp.standards_missing.length)}`);
  }
  return parts.length ? `${parts.join("; ")}.` : null;
}

/** One line per missing input: "<label> — <n>: <names>. Set in <where>." The
 * standard-Eff fallback reads "Target uses Standard Eff % for N qualities
 * (Target Eff % not set): <names> — set in <where>." */
export function spinningMissingLines(sp: DprSpinningSection): string[] {
  return (sp.missing_summary ?? []).map((m) =>
    m.code === "target_eff_fallback"
      ? `Target uses Standard Eff % for ${plural(m.qualities.length)} (Target Eff % not set): ${names(m.qualities)} — set in ${m.where}.`
      : `${m.label} — ${m.qualities.length}: ${names(m.qualities)}. Set in ${m.where}.`,
  );
}

/** Codes that concern only the Target column, never Eff %. */
const TARGET_ONLY: ReadonlySet<string> = new Set(["target_eff", "target_eff_fallback"]);

function fallbackText(q: DprSpinningQualityRow): string {
  const pct = q.target_std_eff_pct;
  return `Target Eff % not set — using Standard Eff %${pct != null ? ` (${pct}%)` : ""}`;
}

/** Tooltip text for one quality row's blank / partial / fallback cell: the
 * labels of its missing inputs (frames named for "machine_std"). `column`
 * "eff" leaves out the target-only reasons. Empty string = nothing to say. */
export function qualityMissingText(
  sp: DprSpinningSection,
  q: DprSpinningQualityRow,
  column: "target" | "eff" = "target",
): string {
  const labels = new Map((sp.missing_summary ?? []).map((m) => [m.code, m.label]));
  return (q.missing ?? [])
    .filter((code) => column === "target" || !TARGET_ONLY.has(code))
    .map((code) => {
      if (code === "target_eff_fallback") return fallbackText(q);
      const label = labels.get(code) ?? code;
      if (code === "machine_std" && q.missing_frames?.length) {
        return `${label} (${names(q.missing_frames)})`;
      }
      return label;
    })
    .join("; ");
}
