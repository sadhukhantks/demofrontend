"use client";

/**
 * @hook useJutePOSettleRule
 * @description Loads and saves the company's jute PO settlement rule for the
 * "Settlement rules" dialog on the PO list. Keeps the dialog presentational.
 */

import * as React from "react";
import { fetchSettleRule, saveSettleRule } from "@/utils/jutePOService";
import type { JutePOSettleRule, JutePOSettleRuleInput } from "../types/jutePOTypes";
import { formatRecomputeCounts } from "../utils/jutePOSettlement";

type UseJutePOSettleRuleReturn = {
  rule: JutePOSettleRule | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  /** "closed n, reopened n" after a successful save. */
  saveSummary: string | null;
  load: () => Promise<void>;
  save: (input: JutePOSettleRuleInput) => Promise<boolean>;
  reset: () => void;
};

export function useJutePOSettleRule(coId: string | number | null | undefined): UseJutePOSettleRuleReturn {
  const [rule, setRule] = React.useState<JutePOSettleRule | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saveSummary, setSaveSummary] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!coId) {
      setError("Select a company first");
      return;
    }
    setLoading(true);
    setError(null);
    setSaveSummary(null);
    try {
      setRule(await fetchSettleRule(coId));
    } catch (e) {
      setRule(null);
      setError(e instanceof Error ? e.message : "Failed to load settlement rules");
    } finally {
      setLoading(false);
    }
  }, [coId]);

  const save = React.useCallback(
    async (input: JutePOSettleRuleInput): Promise<boolean> => {
      if (!coId) return false;
      setSaving(true);
      setError(null);
      setSaveSummary(null);
      try {
        const result = await saveSettleRule(coId, input);
        setRule({
          lorry_rule_enabled: result.lorry_rule_enabled,
          tolerance_lorry_fraction: result.tolerance_lorry_fraction,
          stale_days: result.stale_days,
          is_default: result.is_default,
          legacy_pct_contract: result.legacy_pct_contract,
        });
        setSaveSummary(formatRecomputeCounts(result.counts));
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save settlement rules");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [coId],
  );

  const reset = React.useCallback(() => {
    setError(null);
    setSaveSummary(null);
  }, []);

  return { rule, loading, saving, error, saveSummary, load, save, reset };
}
