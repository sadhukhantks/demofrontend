"use client";

import { useEffect, useState } from "react";
import { fetchFollowupSetup, type FollowupSetup } from "@/utils/lowPerformerFollowupService";

/** Setup is a handful of code lists + the branch's spells; refetch after this long. */
const SETUP_TTL_MS = 10 * 60 * 1000;

const cache = new Map<string, { at: number; promise: Promise<FollowupSetup> }>();

/**
 * Shared, cached GET /lowPerformerFollowup/setup for a company + branch — the
 * page and every Add dialog opened from the Low Producer reports reuse one
 * request. A failed request is dropped from the cache so the next caller retries.
 */
export function loadFollowupSetup(coId: number, branchId: number): Promise<FollowupSetup> {
  const key = `${coId}:${branchId}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < SETUP_TTL_MS) return hit.promise;
  const promise = fetchFollowupSetup(coId, branchId);
  cache.set(key, { at: Date.now(), promise });
  promise.catch(() => {
    if (cache.get(key)?.promise === promise) cache.delete(key);
  });
  return promise;
}

interface SetupState {
  key: string | null;
  setup: FollowupSetup | null;
  error: string | null;
}

/**
 * Setup for the given company + branch. `setup` is null while loading, when
 * either id is missing, or on error (then `error` says why).
 */
export function useFollowupSetup(
  coId: number | null | undefined,
  branchId: number | null | undefined,
): { setup: FollowupSetup | null; error: string | null; loading: boolean } {
  const key = coId != null && branchId != null ? `${coId}:${branchId}` : null;
  const [state, setState] = useState<SetupState>({ key: null, setup: null, error: null });

  useEffect(() => {
    if (coId == null || branchId == null) return;
    const requestKey = `${coId}:${branchId}`;
    let alive = true;
    loadFollowupSetup(coId, branchId).then(
      (setup) => {
        if (alive) setState({ key: requestKey, setup, error: null });
      },
      (err: unknown) => {
        if (alive) {
          setState({
            key: requestKey,
            setup: null,
            error: err instanceof Error ? err.message : "Failed to load the follow-up setup",
          });
        }
      },
    );
    return () => {
      alive = false;
    };
  }, [coId, branchId]);

  // A result for another company/branch is stale — never show it.
  const current = state.key === key ? state : null;
  return {
    setup: current?.setup ?? null,
    error: current?.error ?? null,
    loading: key != null && current == null,
  };
}
