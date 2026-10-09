/**
 * Codes shared by the Low Performer Follow-up page and the Add dialog the
 * Low Producer reports reuse.
 *
 * Labels come from GET /lowPerformerFollowup/setup. The only label list kept
 * on the frontend is DEFAULT_DEPT_LABELS, used while setup is still loading
 * (or failed) so the department filter is never empty.
 */

import type {
  CodeLabel,
  FollowupDeptCode,
  FollowupEventType,
  FollowupSpell,
} from "@/utils/lowPerformerFollowupService";

export const FOLLOWUP_DEPT_CODES = ["WEAVING", "SPINNING", "WINDING"] as const satisfies readonly FollowupDeptCode[];

export const FOLLOWUP_EVENT_TYPES = ["REMARK", "NOTICE", "HOURS_CUT"] as const satisfies readonly FollowupEventType[];

/** Fallback department labels until setup arrives. */
export const DEFAULT_DEPT_LABELS: ReadonlyArray<CodeLabel> = Object.freeze([
  { code: "WEAVING", label: "Weaving" },
  { code: "SPINNING", label: "Spinning" },
  { code: "WINDING", label: "Winding" },
]);

export const EMPTY_CODE_LABELS: ReadonlyArray<CodeLabel> = Object.freeze([]);

export function isFollowupDeptCode(value: unknown): value is FollowupDeptCode {
  return typeof value === "string" && (FOLLOWUP_DEPT_CODES as readonly string[]).includes(value);
}

/** Label of a code from a setup list; falls back to the code itself. */
export function labelOf(list: ReadonlyArray<CodeLabel> | null | undefined, code: string | null | undefined): string {
  if (!code) return "";
  return list?.find((c) => c.code === code)?.label ?? code;
}

/** Department options for a searchable select (setup list, else the fallback). */
export function deptOptions(
  depts: ReadonlyArray<CodeLabel> | null | undefined,
): { value: FollowupDeptCode; label: string }[] {
  const source = depts && depts.length ? depts : DEFAULT_DEPT_LABELS;
  return source.flatMap((d) => (isFollowupDeptCode(d.code) ? [{ value: d.code, label: d.label }] : []));
}

/** "A1 (5 h)" — spell code with its working hours when known. */
export function spellLabel(spell: Pick<FollowupSpell, "spell_code" | "working_hours">): string {
  return spell.working_hours != null ? `${spell.spell_code} (${spell.working_hours} h)` : spell.spell_code;
}
