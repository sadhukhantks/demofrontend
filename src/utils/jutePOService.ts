/**
 * Service layer for Jute Purchase Order settlement (closing) actions.
 *
 * Backend: /api/jutePO (vowerp3be src/juteProcurement/jutePO.py), see
 * docs/claude/modules/jute-purchase/po-settlement-spec.md §4 and §7.
 *
 * Every function returns a parsed, zod-validated payload or throws an `Error`
 * with a user-facing message (the backend `detail`, or a generic fallback when
 * the endpoint is not deployed yet). Callers surface the message in a toast.
 */

import { z } from "zod";
import { apiRoutesPortalMasters } from "@/utils/api";
import { fetchWithCookie } from "@/utils/apiClient2";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

/** Why a PO is CLOSED (status 5). `null` on POs that are not closed. */
export const jutePOCloseTypeSchema = z.enum(["AUTO", "SHORT", "BULK", "MIGRATED"]);
export type JutePOCloseType = z.infer<typeof jutePOCloseTypeSchema>;

/** Tolerant close-type parser: unknown strings / null become null. */
const closeTypeOrNull = z.preprocess(
  (v) => (typeof v === "string" && jutePOCloseTypeSchema.options.includes(v as JutePOCloseType) ? v : null),
  jutePOCloseTypeSchema.nullable(),
);

const nullableString = z.string().nullable().optional().transform((v) => v ?? null);
const nullableNumber = z
  .union([z.number(), z.string()])
  .nullable()
  .optional()
  .transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  });

export const jutePOCloseResultSchema = z.object({
  jute_po_id: z.coerce.number(),
  status_id: z.coerce.number(),
  close_type: closeTypeOrNull,
  closed_date: nullableString,
});
export type JutePOCloseResult = z.infer<typeof jutePOCloseResultSchema>;

export const jutePOReopenResultSchema = z.object({
  jute_po_id: z.coerce.number().optional(),
  status_id: z.coerce.number().optional(),
});
export type JutePOReopenResult = z.infer<typeof jutePOReopenResultSchema>;

/** Built-in tolerance when the backend sends neither field (spec §11.1: half a lorry). */
export const DEFAULT_TOLERANCE_LORRY_FRACTION = 0.5;

/**
 * Settlement rule as returned by GET/PUT. Spec rev 2 (§11.1) replaced
 * `weight_tolerance_pct` with `tolerance_lorry_fraction`; both are accepted while the
 * backend switches, and the output always carries `tolerance_lorry_fraction`.
 */
export const jutePOSettleRuleSchema = z
  .object({
    lorry_rule_enabled: z.preprocess(
      (v) => (typeof v === "number" ? v !== 0 : typeof v === "string" ? v === "1" || v.toLowerCase() === "true" : v),
      z.boolean(),
    ),
    tolerance_lorry_fraction: z.coerce.number().optional(),
    /** @deprecated pre-rev-2 field; only read when `tolerance_lorry_fraction` is absent. */
    weight_tolerance_pct: z.coerce.number().optional(),
    stale_days: z.coerce.number(),
    is_default: z.boolean().optional().default(false),
  })
  .transform((r) => ({
    lorry_rule_enabled: r.lorry_rule_enabled,
    tolerance_lorry_fraction: r.tolerance_lorry_fraction ?? DEFAULT_TOLERANCE_LORRY_FRACTION,
    stale_days: r.stale_days,
    is_default: r.is_default,
    /** True when the server still speaks the old percentage contract. */
    legacy_pct_contract: r.tolerance_lorry_fraction === undefined && r.weight_tolerance_pct !== undefined,
  }));
export type JutePOSettleRule = z.infer<typeof jutePOSettleRuleSchema>;

export const jutePORecomputeCountsSchema = z.object({
  closed: z.coerce.number().default(0),
  reopened: z.coerce.number().default(0),
  unchanged: z.coerce.number().default(0),
});
export type JutePORecomputeCounts = z.infer<typeof jutePORecomputeCountsSchema>;

/** PUT response: flat `{...rule, is_default, counts:{closed,reopened,unchanged}}` (rev 2; `recompute` tolerated). */
export const jutePOSettleRuleSaveResultSchema = z
  .object({
    counts: jutePORecomputeCountsSchema.optional(),
    /** @deprecated rev-1 name for `counts`. */
    recompute: jutePORecomputeCountsSchema.optional(),
  })
  .passthrough()
  .transform((raw) => {
    const rule = jutePOSettleRuleSchema.parse(raw);
    return { ...rule, counts: raw.counts ?? raw.recompute ?? { closed: 0, reopened: 0, unchanged: 0 } };
  });
export type JutePOSettleRuleSaveResult = z.infer<typeof jutePOSettleRuleSaveResultSchema>;

export const jutePOStatusLogEntrySchema = z.object({
  log_id: z.coerce.number(),
  created_at: nullableString,
  old_status_id: nullableNumber,
  old_status_name: nullableString,
  new_status_id: nullableNumber,
  new_status_name: nullableString,
  close_type: closeTypeOrNull,
  source: nullableString,
  trigger_ref: nullableString,
  remark: nullableString,
  user_id: nullableNumber,
  user_name: nullableString,
});
export type JutePOStatusLogEntry = z.infer<typeof jutePOStatusLogEntrySchema>;

/** Input for the settlement-rule dialog (PUT body). */
export const jutePOSettleRuleInputSchema = z.object({
  lorry_rule_enabled: z.boolean(),
  tolerance_lorry_fraction: z
    .number({ error: "Enter a number" })
    .min(0, "Must be 0 or more")
    .max(1, "Must be 1 or less (one whole lorry)"),
  stale_days: z
    .number({ error: "Enter a number" })
    .int("Whole days only")
    .min(1, "Must be at least 1")
    .max(365, "Must be 365 or less"),
});
export type JutePOSettleRuleInput = z.infer<typeof jutePOSettleRuleInputSchema>;

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const NOT_DEPLOYED_STATUSES = new Set([404, 405, 501]);

function unwrapData(payload: unknown): unknown {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data: unknown }).data;
  }
  return payload;
}

async function call<T>(
  url: string,
  method: "GET" | "POST" | "PUT",
  schema: z.ZodType<T>,
  body?: unknown,
  what = "request",
): Promise<T> {
  const res = await fetchWithCookie<unknown>(url, method, body);
  if (res.error || res.data === null) {
    // A bare 404/405/501 with no backend `detail` means the route is not deployed yet;
    // a 404 *with* a detail ("Jute PO not found") is a real answer and is passed through.
    const isGeneric = !res.error || /^Request failed with status/.test(res.error);
    if (isGeneric && NOT_DEPLOYED_STATUSES.has(res.status)) {
      throw new Error(`PO settlement ${what} is not available on this server yet (${res.status}).`);
    }
    throw new Error(res.error ?? `PO settlement ${what} failed`);
  }
  const parsed = schema.safeParse(unwrapData(res.data));
  if (!parsed.success) {
    throw new Error(`Unexpected response from PO settlement ${what}`);
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/** Short-close a live PO (status 1 or 3) with a mandatory remark. */
export async function closeJutePo(params: {
  jutePoId: number | string;
  coId: number | string;
  remark: string;
}): Promise<JutePOCloseResult> {
  return call(
    `${apiRoutesPortalMasters.JUTE_PO_CLOSE}/${params.jutePoId}?co_id=${params.coId}`,
    "POST",
    jutePOCloseResultSchema,
    { remark: params.remark },
    "close",
  );
}

/**
 * Reopen a PO. Rejected/cancelled → Draft (legacy behaviour); CLOSED → the
 * status it had before it was closed.
 */
export async function reopenJutePo(params: {
  jutePoId: number | string;
  coId: number | string;
}): Promise<JutePOReopenResult> {
  return call(
    `${apiRoutesPortalMasters.JUTE_PO_REOPEN}/${params.jutePoId}?co_id=${params.coId}`,
    "POST",
    jutePOReopenResultSchema,
    undefined,
    "reopen",
  );
}

/** Company settlement rule (defaults when no row exists: is_default = true). */
export async function fetchSettleRule(coId: number | string): Promise<JutePOSettleRule> {
  return call(
    `${apiRoutesPortalMasters.JUTE_PO_SETTLE_RULE}?co_id=${coId}`,
    "GET",
    jutePOSettleRuleSchema,
    undefined,
    "rule",
  );
}

/** Upsert the rule; the backend recomputes every branch and returns the counts. */
export async function saveSettleRule(
  coId: number | string,
  input: JutePOSettleRuleInput,
): Promise<JutePOSettleRuleSaveResult> {
  return call(
    `${apiRoutesPortalMasters.JUTE_PO_SETTLE_RULE}?co_id=${coId}`,
    "PUT",
    jutePOSettleRuleSaveResultSchema,
    jutePOSettleRuleInputSchema.parse(input),
    "rule save",
  );
}

/** Status change log for one PO, newest first (as returned by the backend). */
export async function fetchPoStatusLog(params: {
  jutePoId: number | string;
  coId: number | string;
}): Promise<JutePOStatusLogEntry[]> {
  return call(
    `${apiRoutesPortalMasters.JUTE_PO_STATUS_LOG}/${params.jutePoId}?co_id=${params.coId}`,
    "GET",
    z.array(jutePOStatusLogEntrySchema),
    undefined,
    "history",
  );
}
