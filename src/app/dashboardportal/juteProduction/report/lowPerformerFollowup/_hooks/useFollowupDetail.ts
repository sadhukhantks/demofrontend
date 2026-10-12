"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchFollowup,
  fetchFollowupEvents,
  type FollowupEvent,
  type FollowupRow,
} from "@/utils/lowPerformerFollowupService";

/**
 * One follow-up (header + counts) and its timeline. `followup` / `events` are
 * only returned for the requested id, so a previous person never flashes up.
 */
export function useFollowupDetail(coId: number | null, followupId: number | null) {
  const [followup, setFollowup] = useState<FollowupRow | null>(null);
  const [events, setEvents] = useState<{ id: number; list: FollowupEvent[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const headerSeq = useRef(0);
  const eventsSeq = useRef(0);

  const reloadHeader = useCallback(async () => {
    if (coId == null || followupId == null) return;
    const mine = ++headerSeq.current;
    setLoading(true);
    setError(null);
    try {
      const row = await fetchFollowup(coId, followupId);
      if (mine === headerSeq.current) setFollowup(row);
    } catch (err: unknown) {
      if (mine === headerSeq.current) {
        setError(err instanceof Error ? err.message : "Failed to load the follow-up");
      }
    } finally {
      if (mine === headerSeq.current) setLoading(false);
    }
  }, [coId, followupId]);

  const reloadEvents = useCallback(async () => {
    if (coId == null || followupId == null) return;
    const mine = ++eventsSeq.current;
    setEventsError(null);
    try {
      const list = await fetchFollowupEvents(coId, followupId);
      if (mine === eventsSeq.current) setEvents({ id: followupId, list });
    } catch (err: unknown) {
      if (mine === eventsSeq.current) {
        setEventsError(err instanceof Error ? err.message : "Failed to load the timeline");
      }
    }
  }, [coId, followupId]);

  /** Header counts + timeline, after any change. */
  const reload = useCallback(async () => {
    await Promise.all([reloadHeader(), reloadEvents()]);
  }, [reloadHeader, reloadEvents]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const current = followup && followup.followup_id === followupId ? followup : null;
  return {
    followup: current,
    /** Accepts the row a create / update / close / reopen call returned. */
    setFollowup,
    events: events && events.id === followupId ? events.list : null,
    loading: loading && current == null,
    error,
    eventsError,
    reload,
  };
}
